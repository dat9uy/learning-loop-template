#!/usr/bin/env node
'use strict';

// gate-integration script-style gate test — vitest migration.
//
// Original (pre-migration): script-style with top-level setup + a sync section
// of integration tests + an IIFE-wrapped async section that exercises the
// real MCP server. Ends with `process.exit(failed > 0 ? 1 : 0)`.
//
// Migration: keep all require()s and helpers (CJS), wrap the sync section in
// `test()` and convert the IIFE-wrapped async section to `test(..., async () => {...})`.
// The custom `assert()` helper preserves the script's PASS/FAIL counter
// behavior; we collect failures and throw at the end if any failed (the
// vitest-equivalent of `process.exit(failed > 0 ? 1 : 0)`).
//
// R13 semantic preservation: every original assertion is preserved verbatim.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const INBOUND_HOOK = path.join(__dirname, '..', 'hooks', 'inbound-state-gate.cjs');
const OUTBOUND_HOOK = path.join(__dirname, '..', 'hooks', 'bash-coordination-gate.cjs');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
    failures.push(msg);
  }
}

function runInboundHook(prompt, envOverrides = {}) {
  const result = spawnSync('node', [INBOUND_HOOK], {
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, ...envOverrides },
  });
  return {
    exitCode: result.status ?? 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function runOutboundGate(command, envOverrides = {}) {
  const result = spawnSync('node', [OUTBOUND_HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, ...envOverrides },
  });
  return {
    exitCode: result.status ?? 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-integration-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function copyRealObservations(tmpDir) {
  const realRuntimeState = path.join(__dirname, '..', '..', '..', 'runtime-state.jsonl');
  if (fs.existsSync(realRuntimeState)) {
    fs.copyFileSync(realRuntimeState, path.join(tmpDir, 'runtime-state.jsonl'));
    return ['runtime-state.jsonl'];
  }
  return [];
}

function removeBudgetFiles(tmpDir) {
  const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
  if (!fs.existsSync(runtimeStatePath)) return;
  const lines = fs.readFileSync(runtimeStatePath, 'utf8').split('\n').filter(l => l.trim());
  const filtered = lines.filter(line => {
    try {
      const entry = JSON.parse(line);
      return entry.kind !== 'budget-state';
    } catch { return true; }
  });
  fs.writeFileSync(runtimeStatePath, filtered.join('\n') + '\n');
}

function updateTimestamp(tmpDir, filename, newTimestamp) {
  const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
  if (!fs.existsSync(runtimeStatePath)) return;
  const lines = fs.readFileSync(runtimeStatePath, 'utf8').split('\n').filter(l => l.trim());
  const updated = lines.map(line => {
    try {
      const entry = JSON.parse(line);
      entry.timestamp = newTimestamp;
      return JSON.stringify(entry);
    } catch { return line; }
  });
  fs.writeFileSync(runtimeStatePath, updated.join('\n') + '\n');
}

function updateStatus(tmpDir, filename, newStatus) {
  const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
  if (!fs.existsSync(runtimeStatePath)) return;
  const lines = fs.readFileSync(runtimeStatePath, 'utf8').split('\n').filter(l => l.trim());
  const updated = lines.map(line => {
    try {
      const entry = JSON.parse(line);
      entry.status = newStatus;
      return JSON.stringify(entry);
    } catch { return line; }
  });
  fs.writeFileSync(runtimeStatePath, updated.join('\n') + '\n');
}

function clearMarker(tmpDir) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  try { fs.unlinkSync(markerPath); } catch {}
}

function markerExists(tmpDir) {
  return fs.existsSync(path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'));
}

function contextWasInjected(result) {
  if (!result.stdout) return false;
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.hookSpecificOutput?.additionalContext != null;
  } catch {
    return false;
  }
}

function parseOutbound(result) {
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext) {
      return JSON.parse(parsed.hookSpecificOutput.additionalContext);
    }
    return parsed;
  } catch {
    return null;
  }
}

function runWriteGate(filePath, envOverrides = {}) {
  const WRITE_HOOK = path.join(__dirname, '..', 'hooks', 'write-coordination-gate.cjs');
  const result = spawnSync('node', [WRITE_HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, ...envOverrides },
  });
  return {
    exitCode: result.status ?? 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

async function startMcpServer(root) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const serverPath = path.join(__dirname, '..', '..', '..', 'tools', 'learning-loop-mastra', 'mastra', 'server.js');
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: { ...process.env, GATE_ROOT: root },
  });
  const client = new Client({ name: "integration-test-client", version: "0.0.1" });
  await client.connect(transport);
  return { client, transport };
}

// --- Integration: Inbound Gate with Real Observations ---
test('gate-integration: inbound gate with real observations', () => {
  console.log('\n=== Integration: Inbound Gate with Real Observations ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const files = copyRealObservations(tmpDir);
    assert(files.length >= 1, 'copied real observation files to temp dir');

    for (const f of files) {
      updateStatus(tmpDir, f, 'active');
    }

    const t1 = runInboundHook('I cleared the device', env);
    assert(markerExists(tmpDir), 'real stale obs + state-change → marker written');
    assert(contextWasInjected(t1), 'real stale obs + state-change → context injected');
    clearMarker(tmpDir);

    for (const f of files) {
      updateTimestamp(tmpDir, f, new Date(Date.now() - 5 * 60 * 1000).toISOString());
    }
    const t2 = runInboundHook('the container is running', env);
    assert(!markerExists(tmpDir), 'real fresh obs + state-change → marker NOT written (F1)');
    assert(!contextWasInjected(t2), 'real fresh obs + state-change → no context');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Integration: Outbound Gate with Real Observations (no budget) ---
  console.log('\n=== Integration: Outbound Gate with Real Observations ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const files = copyRealObservations(tmpDir);
    removeBudgetFiles(tmpDir);
    const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
    const vnstockEntry = {
      kind: 'ledger-event',
      affected_system: 'vnstock',
      id: 'obs-vnstock',
      value: 0,
      delta: 0,
      source_ref: 'local:meta-state:test',
      fingerprint: 'sha256:test',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      metadata: { notes: 'test' },
    };
    const existing = fs.existsSync(runtimeStatePath)
      ? fs.readFileSync(runtimeStatePath, 'utf8').split('\n').filter(l => l.trim())
      : [];
    existing.push(JSON.stringify(vnstockEntry));
    fs.writeFileSync(runtimeStatePath, existing.join('\n') + '\n');

    const now = new Date();
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: now.toISOString(), prompt_snippet: 'I cleared the device' }, null, 2)
    );
    const t1 = runOutboundGate('curl https://api.vnstock.com/data', env);
    const out1 = parseOutbound(t1);
    assert(out1 && out1.decision === 'escalate', 'real stale obs + fresh marker → escalate');
    assert(out1 && out1.inbound_gate === true, 'inbound_gate flag true with real obs');
    clearMarker(tmpDir);

    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: new Date(now - 31 * 60 * 1000).toISOString(), prompt_snippet: 'old' }, null, 2)
    );
    const t2 = runOutboundGate('curl https://api.vnstock.com/data', env);
    assert(t2.exitCode === 0, 'expired marker + real obs → exit 0 (F8 TTL)');
    clearMarker(tmpDir);

    const t3 = runOutboundGate('curl https://api.vnstock.com/data', env);
    assert(t3.exitCode === 0, 'no marker + real obs → exit 0');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Integration: records/** always blocked, MCP tools for CRUD ---
  {
    console.log('\n=== Integration: records/** always blocked ===');
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };

    const w1 = runWriteGate('records/evidence/foo.md', env);
    assert(w1.exitCode === 2, 'write gate blocks records/evidence unconditionally');
    const outW1 = parseOutbound(w1);
    assert(outW1 && outW1.decision === 'block', 'write gate → decision: block');
    assert(outW1 && outW1.matched_rule === 'records/**', 'write gate → matched_rule: records/**');

    const w2 = runWriteGate('records/observations/obs-test.yaml', env);
    assert(w2.exitCode === 2, 'write gate blocks records/observations unconditionally');

    const b1 = runOutboundGate("cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF", env);
    assert(b1.exitCode === 2, 'bash gate blocks heredoc to records/evidence');
    const outB1 = parseOutbound(b1);
    assert(outB1 && outB1.hard_block === true, 'bash gate → hard_block');

    const b2 = runOutboundGate('echo x > records/decisions/test.yaml', env);
    assert(b2.exitCode === 2, 'bash gate blocks redirect to records/decisions');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Integration: Preflight Gate ---
  {
    console.log('\n=== Integration: Preflight Gate ===');
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const coordDir = path.join(tmpDir, '.claude', 'coordination');

    const w1 = runWriteGate(`${tmpDir}/product/api/src/index.ts`, env);
    assert(w1.exitCode === 2, 'product/** blocked without preflight marker');
    const outW1 = parseOutbound(w1) || (() => { try { return JSON.parse(w1.stdout); } catch { return null; } })();
    assert(outW1 && outW1.decision === 'block', 'preflight block → decision: block');
    assert(outW1 && outW1.surface === 'product', 'preflight block → surface: product');
    assert(outW1 && Array.isArray(outW1.preflight_checklist), 'preflight block → includes preflight_checklist');

    fs.writeFileSync(
      path.join(coordDir, '.loop-preflight-product'),
      JSON.stringify({ surface: 'product', completed_at: new Date().toISOString() })
    );
    const w2 = runWriteGate(`${tmpDir}/product/api/src/index.ts`, env);
    assert(w2.exitCode === 0, 'product/** allowed with valid preflight marker');

    fs.writeFileSync(
      path.join(coordDir, '.loop-preflight-product'),
      JSON.stringify({ surface: 'product', completed_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() })
    );
    const w3 = runWriteGate(`${tmpDir}/product/web/src/app.tsx`, env);
    assert(w3.exitCode === 2, 'product/** blocked with expired preflight marker');

    const b1 = runOutboundGate(`echo '{}' > .claude/coordination/.loop-preflight-product`, env);
    assert(b1.exitCode === 2, 'bash gate blocks redirect to .loop-preflight-*');

    const w4 = runWriteGate(`${tmpDir}/.claude/coordination/.loop-preflight-product`, env);
    assert(w4.exitCode === 2, 'write gate blocks direct write to .loop-preflight-*');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (failed > 0) {
    throw new Error(`gate-integration: ${failed} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
});

// --- Integration: MCP Server with Real Budget + Observations ---
test('gate-integration: MCP server with real budget + observations', async () => {
  console.log('\n=== Integration: MCP Server with Real Budget + Observations ===');
  const tmpDir = createTempProject();
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const files = copyRealObservations(tmpDir);

  updateStatus(tmpDir, 'runtime-state.jsonl', 'active');

  const { client, transport } = await startMcpServer(tmpDir);
  try {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: 'I cleared the device' }, null, 2)
    );
    const r1 = await client.callTool({
      name: "mastra_gate_check",
      arguments: { command: "docker run ubuntu" },
    });
    const parsed1 = JSON.parse(r1.content[0].text);
    assert(parsed1.decision === 'block', 'MCP: no docker observation + stale marker → block');

    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), prompt_snippet: 'old' }, null, 2)
    );
    const r2 = await client.callTool({
      name: "mastra_gate_check",
      arguments: { command: "docker run ubuntu" },
    });
    const parsed2 = JSON.parse(r2.content[0].text);
    assert(parsed2.decision === 'block', 'MCP: no docker observation + fresh marker → block');
    assert(parsed2.inbound_gate === true, 'MCP: inbound_gate true with stale obs (gate-tool behavior)');
  } finally {
    await transport.close();
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    throw new Error(`gate-integration: ${failed} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
});
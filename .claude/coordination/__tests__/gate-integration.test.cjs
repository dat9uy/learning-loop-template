#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const INBOUND_HOOK = path.join(__dirname, '..', 'hooks', 'inbound-state-gate.cjs');
const OUTBOUND_HOOK = path.join(__dirname, '..', 'hooks', 'bash-coordination-gate.cjs');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
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
  fs.mkdirSync(path.join(tmpDir, 'records', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function copyRealObservations(tmpDir) {
  const realObsDir = path.join(__dirname, '..', '..', '..', 'records', 'observations');
  const files = fs.readdirSync(realObsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    fs.copyFileSync(path.join(realObsDir, file), path.join(tmpDir, 'records', 'observations', file));
  }
  return files;
}

function removeBudgetFiles(tmpDir) {
  const obsDir = path.join(tmpDir, 'records', 'observations');
  for (const f of fs.readdirSync(obsDir)) {
    if (f.endsWith('-resource-budget.yaml')) {
      fs.unlinkSync(path.join(obsDir, f));
    }
  }
}

function updateTimestamp(tmpDir, filename, newTimestamp) {
  const p = path.join(tmpDir, 'records', 'observations', filename);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(
    /^updated_at: .*/m,
    `updated_at: "${newTimestamp}"`
  );
  fs.writeFileSync(p, content);
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
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function startMcpServer(root) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const serverPath = path.join(__dirname, '..', '..', '..', 'tools', 'constraint-gate', 'server.js');
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
console.log('\n=== Integration: Inbound Gate with Real Observations ===');
{
  const tmpDir = createTempProject();
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const files = copyRealObservations(tmpDir);
  assert(files.length >= 1, 'copied real observation files to temp dir');

  // All real observations are stale (hours old) → marker written + context injected
  const t1 = runInboundHook('I cleared the device', env);
  assert(markerExists(tmpDir), 'real stale obs + state-change → marker written');
  assert(contextWasInjected(t1), 'real stale obs + state-change → context injected');
  clearMarker(tmpDir);

  // Make all observations fresh (< 30 min) → no marker, no context
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
  removeBudgetFiles(tmpDir); // Remove budget files so budget escalation doesn't short-circuit
  // Add a docker observation so the gate doesn't block for missing observation
  fs.writeFileSync(
    path.join(tmpDir, 'records', 'observations', 'observation-docker.yaml'),
    `id: obs-docker\nconstraint_type: docker\nstatus: active\nupdated_at: ${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}\nnotes: test`
  );

  // Fresh marker + stale real obs + constrained cmd → escalate with inbound_gate
  const now = new Date();
  fs.writeFileSync(
    path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
    JSON.stringify({ timestamp: now.toISOString(), prompt_snippet: 'I cleared the device' }, null, 2)
  );
  const t1 = runOutboundGate('docker run ubuntu', env);
  const out1 = parseOutbound(t1);
  assert(out1 && out1.decision === 'escalate', 'real stale obs + fresh marker → escalate');
  assert(out1 && out1.inbound_gate === true, 'inbound_gate flag true with real obs');
  clearMarker(tmpDir);

  // Expired marker (TTL) + stale real obs → ok (marker treated as null, F8)
  fs.writeFileSync(
    path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
    JSON.stringify({ timestamp: new Date(now - 31 * 60 * 1000).toISOString(), prompt_snippet: 'old' }, null, 2)
  );
  const t2 = runOutboundGate('docker run ubuntu', env);
  assert(t2.exitCode === 0, 'expired marker + real obs → exit 0 (F8 TTL)');
  clearMarker(tmpDir);

  // No marker + stale real obs → ok (not stale relative to marker)
  const t3 = runOutboundGate('docker run ubuntu', env);
  assert(t3.exitCode === 0, 'no marker + real obs → exit 0');

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// --- Integration: MCP Server with Real Budget + Observations ---
(async () => {
  console.log('\n=== Integration: MCP Server with Real Budget + Observations ===');
  const tmpDir = createTempProject();
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  copyRealObservations(tmpDir);

  const { client, transport } = await startMcpServer(tmpDir);
  try {
    // Budget exhausted + stale marker → escalate with inbound_gate: true (F3)
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: 'I cleared the device' }, null, 2)
    );
    const r1 = await client.callTool({
      name: "check_gate",
      arguments: { command: "docker run ubuntu" },
    });
    const parsed1 = JSON.parse(r1.content[0].text);
    assert(parsed1.decision === 'escalate', 'MCP: budget exhausted + stale marker → escalate');
    assert(parsed1.inbound_gate === true, 'MCP: inbound_gate true with stale marker (F3)');

    // Budget exhausted + fresh marker → escalate without inbound_gate
    // Make ALL observations (including budget file) fresh so marker is not newer than obs
    const obsFiles = fs.readdirSync(path.join(tmpDir, 'records', 'observations'))
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const f of obsFiles) {
      updateTimestamp(tmpDir, f, new Date().toISOString());
    }
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'),
      JSON.stringify({ timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), prompt_snippet: 'old' }, null, 2)
    );
    const r2 = await client.callTool({
      name: "check_gate",
      arguments: { command: "docker run ubuntu" },
    });
    const parsed2 = JSON.parse(r2.content[0].text);
    assert(parsed2.decision === 'escalate', 'MCP: budget exhausted + fresh marker → escalate');
    assert(parsed2.inbound_gate === undefined, 'MCP: no inbound_gate with fresh marker');
  } finally {
    await transport.close();
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();

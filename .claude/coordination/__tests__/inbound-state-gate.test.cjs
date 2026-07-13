#!/usr/bin/env node
'use strict';

// inbound-state-gate script-style gate test — vitest migration.
//
// Original (pre-migration): top-level script-style test that walks 11
// categories of state-change detection + observation staleness + context
// injection + marker file flow + outbound gate + false-positive rate + MCP
// server divergence + test isolation + observation schema + meta-state-first
// ordering + emission collapse. Ends with `process.exit(failed > 0 ? 1 : 0)`.
//
// Migration: keep all require()s and helpers (CJS), wrap the entire
// script body in a single `test()` call. The custom `assert()` helper
// preserves the script's PASS/FAIL counter behavior; we collect failure
// messages and throw at the end if any failed (the vitest-equivalent of
// `process.exit(failed > 0 ? 1 : 0)`).
//
// R13 semantic preservation: every original assertion is preserved verbatim
// across all 11 categories.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbound-gate-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function writeObservation(tmpDir, data) {
  const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
  const entry = {
    kind: 'ledger-event',
    affected_system: data.affected_system || 'vnstock',
    id: data.id,
    value: 0,
    delta: 0,
    source_ref: 'local:meta-state:test',
    fingerprint: 'sha256:test',
    status: data.status || 'active',
    metadata: data.metadata || { constraint_type: data.constraint_type, constraint: data.constraint },
  };
  if (data.updated_at) {
    entry.timestamp = data.updated_at;
  }
  const existing = fs.existsSync(runtimeStatePath)
    ? fs.readFileSync(runtimeStatePath, 'utf8').split('\n').filter(l => l.trim())
    : [];
  existing.push(JSON.stringify(entry));
  fs.writeFileSync(runtimeStatePath, existing.join('\n') + '\n');
}

function clearObservations(tmpDir) {
  const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
  try { fs.unlinkSync(runtimeStatePath); } catch {}
}

function writeMarker(tmpDir, timestamp, snippet = 'test') {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  fs.writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: snippet }, null, 2));
}

function clearMarker(tmpDir) {
  const legacyPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  try { fs.unlinkSync(legacyPath); } catch {}
  const coordDir = path.join(tmpDir, '.claude', 'coordination');
  if (fs.existsSync(coordDir)) {
    for (const f of fs.readdirSync(coordDir)) {
      if (f.startsWith('.last-operator-message-')) {
        try { fs.unlinkSync(path.join(coordDir, f)); } catch {}
      }
    }
  }
}

function markerExists(tmpDir) {
  const coordDir = path.join(tmpDir, '.claude', 'coordination');
  if (!fs.existsSync(coordDir)) return false;
  for (const f of fs.readdirSync(coordDir)) {
    if (f.startsWith('.last-operator-message')) return true;
  }
  return false;
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

test('inbound-state-gate: 11 categories of state-change / staleness / context / marker / outbound / false-positive / MCP divergence / isolation / schema / ordering / emission-collapse assertions', () => {
  // --- Category 1: State-Change Detection ---
  console.log('\n=== Category 1: State-Change Detection ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const staleObs = { id: 'obs-stale', status: 'active', constraint_type: 'docker', updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t1 = runInboundHook('I cleared the device', env);
    assert(markerExists(tmpDir), 'device clearance → marker written');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t2 = runInboundHook('the container is running', env);
    assert(markerExists(tmpDir), 'container state → marker written');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t3 = runInboundHook('I installed vnstock', env);
    assert(markerExists(tmpDir), 'action report → marker written');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t4 = runInboundHook('the slot is free', env);
    assert(markerExists(tmpDir), 'state assertion → marker written');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    const t5 = runInboundHook("what should we do next?", env);
    assert(!markerExists(tmpDir), 'normal message → no marker');

    const t6 = runInboundHook('ok', env);
    assert(!markerExists(tmpDir), 'short message → no marker');

    const t7 = runInboundHook('', env);
    assert(!markerExists(tmpDir), 'empty message → no marker');

    const t8 = runInboundHook('is the device cleared?', env);
    assert(!markerExists(tmpDir), 'question ending with ? → no marker (F11)');

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t9 = runInboundHook("I didn't clear the device", env);
    assert(markerExists(tmpDir), 'negated state → marker written');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    const t10 = runInboundHook('is the test suite done?', env);
    assert(!markerExists(tmpDir), 'question filter (F11) → no marker');

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const t11 = runInboundHook('the build is broken', env);
    assert(markerExists(tmpDir), 'broad pattern match → marker written (documented false positive)');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 2: Observation Staleness ---
  console.log('\n=== Category 2: Observation Staleness ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-fresh', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 5 * 60 * 1000).toISOString() });
    const t1 = runInboundHook('I cleared the device', env);
    assert(!contextWasInjected(t1), 'fresh observation → no context injection');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-stale', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t2 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t2), 'stale observation → context injected');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-no-time', status: 'active', constraint_type: 'docker' });
    const t3 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t3), 'missing updated_at → context injected');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-bad-time', status: 'active', constraint_type: 'docker', updated_at: 'not-a-date' });
    const t4 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t4), 'invalid updated_at → context injected');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-diverge', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 10 * 60 * 1000).toISOString() });
    const t5 = runInboundHook('I cleared the device', env);
    assert(!contextWasInjected(t5), 'divergence case: 10min old → inbound NOT stale (<30min)');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 3: Context Injection Format ---
  console.log('\n=== Category 3: Context Injection Format ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-fmt', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t1 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t1), 'state-change + stale obs → context injected');

    let parsed;
    try { parsed = JSON.parse(t1.stdout); } catch { parsed = null; }
    assert(parsed && parsed.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'output has hookEventName');
    assert(parsed && parsed.hookSpecificOutput?.additionalContext?.includes('surfaces:'), 'additionalContext uses surface-grouped pointer (not raw id dump)');
    assert(parsed && parsed.hookSpecificOutput?.additionalContext?.includes('vnstock'), 'additionalContext names the affected surface');
    assert(parsed && parsed.hookSpecificOutput?.additionalContext?.includes('INBOUND STATE GATE'), 'additionalContext has gate header');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-fresh2', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 5 * 60 * 1000).toISOString() });
    const t2 = runInboundHook('I cleared the device', env);
    assert(t2.exitCode === 0 && !contextWasInjected(t2), 'state-change + fresh obs → no context');
    clearMarker(tmpDir);

    const t3 = runInboundHook('what should we do next?', env);
    assert(t3.exitCode === 0 && !contextWasInjected(t3), 'no state-change → no context');

    clearObservations(tmpDir);
    const t4 = runInboundHook('I cleared the device', env);
    assert(t4.exitCode === 0 && !contextWasInjected(t4), 'state-change + no obs → no context');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 4: Marker File Flow ---
  console.log('\n=== Category 4: Marker File Flow ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-m1', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    runInboundHook('I cleared the device', env);
    assert(markerExists(tmpDir), 'stale + state-change → marker exists');
    let marker = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'coordination', '.last-operator-message'), 'utf8'));
    assert(marker.timestamp != null, 'marker has timestamp');
    assert(marker.prompt_snippet.includes('cleared'), 'marker contains prompt snippet');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-m2', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 5 * 60 * 1000).toISOString() });
    runInboundHook('the container is running', env);
    assert(!markerExists(tmpDir), 'fresh + state-change → marker NOT written (F1 fix)');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    runInboundHook('I cleared the device', env);
    assert(!markerExists(tmpDir), 'no obs + state-change → marker NOT written');
    clearMarker(tmpDir);

    runInboundHook('what should we do next?', env);
    assert(!markerExists(tmpDir), 'normal message → no marker');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 5: Outbound Gate Integration ---
  console.log('\n=== Category 5: Outbound Gate Integration ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-out1', status: 'active', constraint_type: 'vendor-api', affected_system: 'vnstock', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    writeMarker(tmpDir, new Date(now - 1 * 60 * 1000).toISOString(), 'I cleared the device');
    const t1 = runOutboundGate('curl https://api.vnstock.com/data', env);
    const out1 = parseOutbound(t1);
    assert(t1.exitCode === 2, 'stale obs + constrained → exit 2');
    assert(out1 && out1.decision === 'escalate', 'decision is escalate');
    assert(out1 && out1.inbound_gate === true, 'inbound_gate flag is true');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-out2', status: 'active', constraint_type: 'vendor-api', affected_system: 'vnstock', updated_at: new Date(now - 1 * 60 * 1000).toISOString() });
    writeMarker(tmpDir, new Date(now - 2 * 60 * 60 * 1000).toISOString(), 'old message');
    const t2 = runOutboundGate('curl https://api.vnstock.com/data', env);
    assert(t2.exitCode === 0, 'fresh obs + old marker → exit 0 (no escalation)');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-out3', status: 'active', constraint_type: 'vendor-api', affected_system: 'vnstock', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    clearMarker(tmpDir);
    const t3 = runOutboundGate('curl https://api.vnstock.com/data', env);
    assert(t3.exitCode === 0, 'no marker → exit 0 (no escalation)');

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-out4', status: 'active', constraint_type: 'vendor-api', affected_system: 'vnstock', updated_at: new Date(now - 5 * 60 * 1000).toISOString() });
    writeMarker(tmpDir, new Date().toISOString(), 'the container is running');
    const t4 = runOutboundGate('curl https://api.vnstock.com/data', env);
    const out4 = parseOutbound(t4);
    assert(out4 && out4.inbound_gate === true, 'F1 phantom escalation: fresh obs + new marker → inbound_gate true');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-out5', status: 'active', constraint_type: 'vendor-api', affected_system: 'vnstock', updated_at: new Date(now - 10 * 60 * 1000).toISOString() });
    writeMarker(tmpDir, new Date().toISOString(), 'I cleared the device');
    const t5 = runOutboundGate('curl https://api.vnstock.com/data', env);
    const out5 = parseOutbound(t5);
    assert(out5 && out5.inbound_gate === true, 'F2 divergence: 10min obs + new marker → outbound escalates');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 6: False Positive Rate ---
  console.log('\n=== Category 6: False Positive Rate ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };

    const t1 = runInboundHook('I think we should clear the board', env);
    assert(!markerExists(tmpDir), 'casual conversation → correctly not detected');

    const t2 = runInboundHook('the docker container needs to be running', env);
    assert(!markerExists(tmpDir), 'code discussion → correctly not detected');

    const t3 = runInboundHook('what is the device limit?', env);
    assert(!markerExists(tmpDir), 'pure question → not detected');

    const t4 = runInboundHook("let's implement the auth system", env);
    assert(!markerExists(tmpDir), 'unrelated topic → not detected');

    const t5 = runInboundHook('is the device cleared?', env);
    assert(!markerExists(tmpDir), 'question with state → not detected (F11)');

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-fp', status: 'active', constraint_type: 'docker', updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
    const t6 = runInboundHook('the build is broken', env);
    assert(markerExists(tmpDir), 'broad pattern → detected (documented false positive)');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 7: MCP Server Divergence (Code Inspection) ---
  console.log('\n=== Category 7: MCP Server Divergence (Code Inspection) ===');
  {
    const serverPath = path.join(__dirname, '..', '..', '..', 'tools', 'learning-loop-mastra', 'mastra', 'server.js');
    const inboundStatePath = path.join(__dirname, '..', '..', '..', 'tools', 'learning-loop-mastra', 'core', 'inbound-state.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const inboundStateCode = fs.readFileSync(inboundStatePath, 'utf8');
    const hasStalenessCheck = serverCode.includes('checkObservationStaleness') || inboundStateCode.includes('checkObservationStaleness');
    const gateToolPath = path.join(__dirname, '..', '..', '..', 'tools', 'learning-loop-mastra', 'tools', 'handlers', 'gate-tool.js');
    const gateToolCode = fs.readFileSync(gateToolPath, 'utf8');
    const evaluatorPath = path.join(__dirname, '..', '..', '..', 'tools', 'learning-loop-mastra', 'core', 'evaluate-bash-gate.js');
    const evaluatorCode = fs.readFileSync(evaluatorPath, 'utf8');
    const checksRegardless = gateToolCode.includes('evaluateBashGate') && evaluatorCode.includes('checkObservationStaleness');
    assert(hasStalenessCheck, 'MCP server has staleness check function');
    assert(checksRegardless, 'MCP server delegates to evaluator which checks staleness regardless of decision (F3 fix)');
  }

  // --- Category 8: Test Isolation ---
  console.log('\n=== Category 8: Test Isolation ===');
  {
    const tmpDir = createTempProject();
    const customMarker = path.join(tmpDir, 'custom-marker.json');
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: customMarker };
    const staleObs = { id: 'obs-stale', status: 'active', constraint_type: 'docker', updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };

    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    runInboundHook('I cleared the device', env);
    assert(fs.existsSync(customMarker), 'GATE_MARKER_PATH override → marker written to custom path');

    const defaultCoordDir = path.join(tmpDir, '.claude', 'coordination');
    const legacyMarkerPath = path.join(defaultCoordDir, '.last-operator-message');
    assert(!fs.existsSync(legacyMarkerPath), 'GATE_MARKER_PATH override → default path NOT used');

    clearMarker(tmpDir);
    try { fs.unlinkSync(customMarker); } catch {}
    clearObservations(tmpDir);
    writeObservation(tmpDir, staleObs);
    const env2 = { GATE_ROOT: tmpDir };
    runInboundHook('I cleared the device', env2);
    assert(markerExists(tmpDir), 'default path → some .last-operator-message* file written');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 9: Observation Schema ---
  console.log('\n=== Category 9: Observation Schema ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-by-id', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t1 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t1), 'observation with id → context injected');
    assert(t1.stdout.includes('vnstock') && t1.stdout.includes('surfaces:'), 'context surfaces affected system via pointer (not raw id)');
    assert(!t1.stdout.includes('obs-by-id'), 'context does not inline the raw observation id');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { constraint: 'docker-cleanup', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t2 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t2), 'observation without id → context injected');
    assert(t2.stdout.includes('vnstock'), 'context names the affected surface');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t3 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t3), 'observation with neither → context injected');
    assert(t3.stdout.includes('vnstock'), 'context names the affected surface');
    clearMarker(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 10: Meta-State-First Ordering ---
  console.log('\n=== Category 10: Meta-State-First Ordering ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-meta-test', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t1 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t1), 'gate fires → context injected');
    let parsed1;
    try { parsed1 = JSON.parse(t1.stdout); } catch { parsed1 = null; }
    const ctx1 = parsed1?.hookSpecificOutput?.additionalContext || '';
    const metaStateIdx1 = ctx1.indexOf('meta-state.jsonl');
    const obsIdIdx1 = ctx1.indexOf('obs-meta-test');
    assert(metaStateIdx1 > 0, 'context contains meta-state.jsonl hint');
    assert(obsIdIdx1 === -1, 'context does not inline the raw observation id (pointer form)');
    assert(ctx1.includes('surfaces:'), 'context uses surface-grouped pointer');
    assert(ctx1.includes('READ'), 'context includes READ directive (call to action)');
    assert(ctx1.includes('last 20 lines'), 'context specifies reading window (last 20 lines)');
    assert(ctx1.includes('change-log'), 'context mentions change-log entry kind (entry-type hint)');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-multi-a', status: 'active', constraint_type: 'docker', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    writeObservation(tmpDir, { id: 'obs-multi-b', status: 'active', constraint_type: 'vnstock', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    writeObservation(tmpDir, { id: 'obs-multi-c', status: 'active', constraint_type: 'budget', updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
    const t2 = runInboundHook('the container is running', env);
    let parsed2;
    try { parsed2 = JSON.parse(t2.stdout); } catch { parsed2 = null; }
    const ctx2 = parsed2?.hookSpecificOutput?.additionalContext || '';
    const metaStateIdx2 = ctx2.indexOf('meta-state.jsonl');
    const firstObsIdx2 = ctx2.indexOf('obs-multi-a');
    assert(metaStateIdx2 > 0 && firstObsIdx2 === -1, 'multi-obs: hint present, raw ids not inlined');
    assert(ctx2.includes('surfaces:'), 'multi-obs: surface-grouped pointer used');
    assert(ctx2.includes('vnstock (3)'), 'multi-obs: surface count reflects all 3 stale observations (deduped by id)');
    clearMarker(tmpDir);

    assert(!ctx1.includes('Active observations may be stale'), 'legacy leading phrase removed (anchoring defense)');
    assert(ctx1.includes('stale active observation'), 'new pointer phrasing present (surface-grouped)');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- Category 11: Emission Collapse ---
  console.log('\n=== Category 11: Emission Collapse ===');
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const now = new Date();
    const staleTs = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const tokenPath = path.join(tmpDir, '.claude', 'coordination', '.inbound-stale-surfaced');

    function writeSuppressToken(signature, ts) {
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, JSON.stringify({ signature, ts }));
    }
    function clearSuppressToken() { try { fs.unlinkSync(tokenPath); } catch {} }
    function ctxOf(result) {
      try { return JSON.parse(result.stdout)?.hookSpecificOutput?.additionalContext || ''; } catch { return ''; }
    }

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-dedup', status: 'active', constraint_type: 'docker', updated_at: staleTs });
    clearSuppressToken();
    const t1 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t1), 'dedup: gate fires');
    const c1 = ctxOf(t1);
    assert(c1.includes('1 stale active observation') && c1.includes('vnstock (1)'), 'dedup: single record counted once (vnstock (1)), not twice');
    assert(!c1.includes('already surfaced'), 'dedup: first emission is the full pointer, not the suppress line');
    clearMarker(tmpDir);

    clearSuppressToken();
    writeSuppressToken('obs-dedup', new Date(now - 1 * 60 * 1000).toISOString());
    const t2 = runInboundHook('I cleared the device', env);
    assert(contextWasInjected(t2), 'suppress: gate still fires (warn)');
    const c2 = ctxOf(t2);
    assert(c2.includes('already surfaced this session'), 'suppress: repeat same-signature within window → already-surfaced pointer');
    assert(c2.includes('Inline list suppressed'), 'suppress: inline list suppressed message present');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-changed', status: 'active', constraint_type: 'docker', updated_at: staleTs });
    clearSuppressToken();
    writeSuppressToken('obs-dedup', new Date(now - 1 * 60 * 1000).toISOString());
    const t3 = runInboundHook('I cleared the device', env);
    const c3 = ctxOf(t3);
    assert(c3.includes('detected') && !c3.includes('already surfaced this session'), 're-emit: changed signature → full pointer (not suppressed)');
    clearMarker(tmpDir);

    clearObservations(tmpDir);
    writeObservation(tmpDir, { id: 'obs-dedup', status: 'active', constraint_type: 'docker', updated_at: staleTs });
    clearSuppressToken();
    writeSuppressToken('obs-dedup', new Date(now - 45 * 60 * 1000).toISOString());
    const t4 = runInboundHook('I cleared the device', env);
    const c4 = ctxOf(t4);
    assert(c4.includes('detected') && !c4.includes('already surfaced this session'), 'expired window: same signature after 30 min → full pointer re-emits');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    throw new Error(`inbound-state-gate: ${failed} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
});
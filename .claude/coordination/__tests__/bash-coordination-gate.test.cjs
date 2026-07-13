#!/usr/bin/env node
'use strict';

// bash-coordination-gate script-style gate test — vitest migration.
//
// Original (pre-migration): top-level script that uses require() + spawnSync
// + a custom `assert(condition, msg)` helper that increments passed/failed
// counters and ends with `process.exit(failed > 0 ? 1 : 0)`. Vitest cannot
// run a script-style test directly; it expects `test()`/`it()` calls.
//
// Migration: keep the script's PASS/FAIL counters and the require()s (CJS),
// add a thin `test("bash-coordination-gate: ...", () => { ... })` wrapper
// that runs the entire script body and throws if `failed > 0` at the end.
// With `globals: true` in vitest.config.mjs, `test`/`expect` are available
// to CJS files (verified by the cjs-globals-probe scratch test).
//
// The R13 semantic-preservation contract: every assertion that the script
// version makes must also be asserted by the vitest version. The wrapper
// below is byte-for-byte identical to the original except for the
// `test(...)` wrap and `process.exit` → `throw` substitution.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'bash-coordination-gate.cjs');

function runHook(input, envOverrides = {}) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, ...envOverrides }
  });
  return {
    exitCode: result.status || 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
}

// In vitest mode, `assert` is a failing-by-default stub that records the
// failure message; the wrapper below throws if any failed. The original
// script version used this `assert` purely for human-readable PASS/FAIL
// output — vitest's own assertion library (expect) is NOT mixed in here
// because the script uses `parseDecision` + custom check semantics that
// don't map cleanly to expect(). The wrapper preserves the original
// "throw on any failed assertion" exit semantic.
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

function parseDecision(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext) {
      return JSON.parse(parsed.hookSpecificOutput.additionalContext);
    }
    return parsed;
  } catch {
    return null;
  }
}

test('bash-coordination-gate: 20 end-to-end hook invocations assert identical gate outcomes to the script version', () => {
  console.log('\n--- bash-coordination-gate.cjs ---');

  // Test 1: Non-Bash tool → exit 0
  {
    const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'test.py' } });
    assert(r.exitCode === 0, 'non-Bash tool → exit 0 (allow)');
  }

  // Test 2: ls -la → exit 0 (not constrained)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls -la' } });
    assert(r.exitCode === 0, 'ls -la → exit 0 (not constrained)');
  }

  // Test 3: git status → exit 0 (not constrained)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    assert(r.exitCode === 0, 'git status → exit 0 (not constrained)');
  }

  // Test 4: docker run → exit 2 (constrained, no docker observation → block)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
    assert(r.exitCode === 2, 'docker run → exit 2 (constrained)');
    const output = parseDecision(r.stdout);
    assert(output && output.decision === 'block', 'docker run output has decision: block (no docker obs, budget mismatch: vendor-api vs docker)');
  }

  // Test 5: sudo → exit 2 (constrained)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'sudo chown root file' } });
    assert(r.exitCode === 2, 'sudo → exit 2 (constrained)');
  }

  // Test 6: pip install in temp project without runtime-state → exit 2 (constrained)
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'pip install requests' } }, env);
    assert(r.exitCode === 2, 'pip install → exit 2 (constrained, no runtime-state)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 7: cat docker-compose.yml → exit 0 (word boundary: no match)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'cat docker-compose.yml' } });
    assert(r.exitCode === 0, 'cat docker-compose.yml → exit 0 (word boundary)');
  }

  // Test 8: echo "undocumented" → exit 0 (word boundary: no match)
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo "see undocumented feature"' } });
    assert(r.exitCode === 0, 'echo undocumented → exit 0 (word boundary)');
  }

  // Test 9: Split on semicolon — both constrained
  {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu ; sudo apt install' } });
    assert(r.exitCode === 2, 'docker ; sudo → exit 2 (both constrained)');
  }

  // Test 10: Performance < 100ms (threshold 500ms for WSL2 load variability)
  {
    const start = Date.now();
    runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
    const elapsed = Date.now() - start;
    assert(elapsed < 500, `execution under 500ms (actual: ${elapsed}ms)`);
  }

  // --- Path-write detection tests (temp project) ---
  function createTempProject() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-gate-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
    return tmpDir;
  }

  function writeObservation(tmpDir, id, constraint, timestamp) {
    const runtimeStatePath = path.join(tmpDir, 'runtime-state.jsonl');
    const entry = {
      kind: 'ledger-event',
      affected_system: 'vnstock',
      id: id,
      value: 0,
      delta: 0,
      source_ref: 'local:meta-state:test',
      fingerprint: 'sha256:test',
      timestamp: timestamp,
      status: 'active',
      metadata: { constraint_type: 'write-path', constraint: constraint },
    };
    fs.writeFileSync(runtimeStatePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  function setMarker(tmpDir, timestamp) {
    const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
    fs.writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: 'test' }, null, 2));
  }

  function clearMarker(tmpDir) {
    const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
    try { fs.unlinkSync(markerPath); } catch {}
  }

  // Test 11: heredoc to records/evidence → block unconditionally
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
    assert(r.exitCode === 2, 'heredoc to records/evidence → exit 2 (unconditional block)');
    const output = parseDecision(r.stdout);
    assert(output && output.hard_block === true, 'records/evidence → hard_block');
  }

  // Test 12: heredoc to records/evidence with observation → still block
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
    assert(r.exitCode === 2, 'heredoc to records/evidence with observation → still exit 2 (MCP only)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 13: heredoc to records/evidence with stale observation → block (not escalate)
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    setMarker(tmpDir, new Date().toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
    assert(r.exitCode === 2, 'heredoc to records/evidence stale obs → exit 2 (unconditional)');
    const output = parseDecision(r.stdout);
    assert(output && output.hard_block === true, 'stale obs → hard_block (not escalate)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 14: tee to records/evidence → block unconditionally
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x | tee records/evidence/foo.md' } }, env);
    assert(r.exitCode === 2, 'tee to records/evidence → exit 2 (MCP only)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 15: redirect with quotes to records/evidence → block unconditionally
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > "./records/evidence/foo.md"' } }, env);
    assert(r.exitCode === 2, 'redirect with quotes to records/evidence → exit 2 (MCP only)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 16: redirect to records/observations → block unconditionally
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date().toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > records/observations/foo.yaml' } }, env);
    assert(r.exitCode === 2, 'redirect to records/observations → exit 2 (unconditional)');
    const output = parseDecision(r.stdout);
    assert(output && output.hard_block === true, 'observations → hard_block');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 17: heredoc to docs/foo.md → allow (non-records unaffected)
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > docs/foo.md\ncontent\nEOF" } }, env);
    assert(r.exitCode === 0, 'heredoc to docs/foo.md → exit 0');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 18: heredoc to records/claims/foo.yaml → block (ALL records/** blocked)
  {
    const tmpDir = createTempProject();
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/claims/foo.yaml\ncontent\nEOF" } }, env);
    assert(r.exitCode === 2, 'heredoc to records/claims/foo.yaml → exit 2 (MCP only)');
    const output = parseDecision(r.stdout);
    assert(output && output.hard_block === true, 'records/claims → hard_block');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 19: tee -a to records/evidence → block unconditionally
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x | tee -a records/evidence/foo.md' } }, env);
    assert(r.exitCode === 2, 'tee -a to records/evidence → exit 2 (MCP only)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Test 20: path traversal to records/observations → block (all records/** blocked)
  {
    const tmpDir = createTempProject();
    writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date().toISOString());
    const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > records/evidence/../observations/foo.yaml' } }, env);
    assert(r.exitCode === 2, 'path traversal to records/** → exit 2');
    const output = parseDecision(r.stdout);
    assert(output && output.hard_block === true, 'traversal → hard_block');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // R13: throw if any assertion failed. Replaces `process.exit(failed > 0 ? 1 : 0)`
  // from the script version — vitest needs the throw to fail the test.
  if (failed > 0) {
    throw new Error(`bash-coordination-gate: ${failed} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
});
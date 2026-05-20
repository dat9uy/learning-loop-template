#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'bash-coordination-gate.cjs');
const COORD_DIR = path.join(__dirname, '..');
const OBS_DIR = path.join(__dirname, '..', '..', '..', 'records', 'observations');

let passed = 0;
let failed = 0;

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

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

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

// Test 4: docker run → exit 2 (constrained, budget exhausted → escalate)
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
  assert(r.exitCode === 2, 'docker run → exit 2 (constrained)');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'escalate', 'docker run output has decision: escalate (budget exhausted)');
}

// Test 5: sudo → exit 2 (constrained)
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'sudo chown root file' } });
  assert(r.exitCode === 2, 'sudo → exit 2 (constrained)');
}

// Test 6: pip install → exit 2 (constrained)
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'pip install requests' } });
  assert(r.exitCode === 2, 'pip install → exit 2 (constrained)');
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

// Test 10: Performance < 100ms
{
  const start = Date.now();
  runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
  const elapsed = Date.now() - start;
  assert(elapsed < 100, `execution under 100ms (actual: ${elapsed}ms)`);
}

// --- Path-write detection tests (temp project) ---
const os = require('os');

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-gate-test-'));
  fs.mkdirSync(path.join(tmpDir, 'records', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function writeObservation(tmpDir, id, constraint, timestamp) {
  const content = `id: ${id}\nconstraint_type: write-path\nconstraint: ${constraint}\nstatus: active\nupdated_at: "${timestamp}"\ndescription: test`;
  fs.writeFileSync(path.join(tmpDir, 'records', 'observations', `${id}.yaml`), content);
}

function setMarker(tmpDir, timestamp) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  fs.writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: 'test' }, null, 2));
}

function clearMarker(tmpDir) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  try { fs.unlinkSync(markerPath); } catch {}
}

// Test 11: heredoc to records/evidence with no observation → block
{
  const tmpDir = createTempProject();
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
  assert(r.exitCode === 2, 'heredoc to records/evidence with no observation → exit 2');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.observation_required === true, 'heredoc no obs → observation_required');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 12: heredoc to records/evidence with fresh observation → allow
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
  assert(r.exitCode === 0, 'heredoc to records/evidence with fresh observation → exit 0');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 13: heredoc to records/evidence with stale observation → escalate
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 10 * 60 * 1000).toISOString());
  setMarker(tmpDir, new Date().toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/evidence/foo.md\ncontent\nEOF" } }, env);
  assert(r.exitCode === 2, 'heredoc to records/evidence with stale observation → exit 2');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'escalate', 'stale observation → escalate');
  assert(output && output.inbound_gate === true, 'stale observation → inbound_gate: true');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 14: tee to records/evidence with fresh observation → allow
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x | tee records/evidence/foo.md' } }, env);
  assert(r.exitCode === 0, 'tee to records/evidence with fresh observation → exit 0');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 15: redirect with quotes to records/evidence with fresh observation → allow
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > "./records/evidence/foo.md"' } }, env);
  assert(r.exitCode === 0, 'redirect with quotes to records/evidence with fresh observation → exit 0');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 16: redirect to records/observations with fresh observation → block unconditionally
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date().toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > records/observations/foo.yaml' } }, env);
  assert(r.exitCode === 2, 'redirect to records/observations with fresh observation → exit 2 (unconditional)');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
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

// Test 18: heredoc to records/claims/foo.yaml → allow (other records/**)
{
  const tmpDir = createTempProject();
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: "cat <<'EOF' > records/claims/foo.yaml\ncontent\nEOF" } }, env);
  assert(r.exitCode === 0, 'heredoc to records/claims/foo.yaml → exit 0');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 19: tee -a to records/evidence with fresh observation → allow
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x | tee -a records/evidence/foo.md' } }, env);
  assert(r.exitCode === 0, 'tee -a to records/evidence with fresh observation → exit 0');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 20: path traversal to records/observations via evidence → blocked unconditionally
{
  const tmpDir = createTempProject();
  writeObservation(tmpDir, 'obs-evidence-001', 'records-evidence', new Date().toISOString());
  const env = { GATE_ROOT: tmpDir, GATE_MARKER_PATH: path.join(tmpDir, '.claude', 'coordination', '.last-operator-message') };
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'echo x > records/evidence/../observations/foo.yaml' } }, env);
  assert(r.exitCode === 2, 'path traversal to observations via evidence → exit 2');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.hard_block === true, 'traversal → hard_block');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Cleanup

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

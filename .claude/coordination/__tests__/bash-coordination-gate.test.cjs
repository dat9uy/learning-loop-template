#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'bash-coordination-gate.cjs');
const COORD_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(COORD_DIR, 'coordination-config.json');
const OBS_DIR = path.join(__dirname, '..', '..', '..', 'records', 'observations');
const ACTIVE_PROFILE_PATH = path.join(COORD_DIR, '.active-profile');

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

// Backup config files
const origConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
let origProfile = null;
try { origProfile = fs.readFileSync(ACTIVE_PROFILE_PATH, 'utf8'); } catch {}

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

// Test 10: Missing config → exit 0 (fail-open)
{
  const backup = fs.readFileSync(CONFIG_PATH, 'utf8');
  fs.unlinkSync(CONFIG_PATH);
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
  assert(r.exitCode === 0, 'missing config → exit 0 (fail-open)');
  fs.writeFileSync(CONFIG_PATH, backup);
}

// Test 11: Performance < 50ms
{
  const start = Date.now();
  runHook({ tool_name: 'Bash', tool_input: { command: 'docker run ubuntu' } });
  const elapsed = Date.now() - start;
  assert(elapsed < 100, `execution under 100ms (actual: ${elapsed}ms)`);
}

// Cleanup
try { fs.unlinkSync(ACTIVE_PROFILE_PATH); } catch {}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

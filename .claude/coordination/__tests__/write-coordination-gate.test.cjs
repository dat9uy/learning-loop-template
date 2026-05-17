#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'write-coordination-gate.cjs');
const COORD_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(COORD_DIR, 'coordination-config.json');
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

console.log('\n--- write-coordination-gate.cjs ---');

// Test 1: Non-Edit/Write tool → exit 0
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert(r.exitCode === 0, 'non-Edit/Write tool → exit 0 (allow)');
}

// Test 2: Edit with allowed path (code-generation profile)
{
  try { fs.unlinkSync(ACTIVE_PROFILE_PATH); } catch {}
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'product/api/main.py' } });
  assert(r.exitCode === 0, 'Edit with allowed path → exit 0');
}

// Test 3: Edit with forbidden path (records/** in code-generation)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/claims/foo.yaml' } });
  assert(r.exitCode === 2, 'Edit with forbidden path → exit 2');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'block', 'forbidden Edit has decision: block');
}

// Test 4: Write with forbidden path (schemas/** in code-generation)
{
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'schemas/observation.schema.json' } });
  assert(r.exitCode === 2, 'Write with forbidden schemas path → exit 2');
}

// Test 5: Write with allowed path (tools/** in code-generation)
{
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'tools/constraint-gate/server.js' } });
  assert(r.exitCode === 0, 'Write with allowed tools path → exit 0');
}

// Test 6: Missing coordination config → exit 0 (fail-open)
{
  const backup = fs.readFileSync(CONFIG_PATH, 'utf8');
  fs.unlinkSync(CONFIG_PATH);
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/claims/foo.yaml' } });
  assert(r.exitCode === 0, 'missing config → exit 0 (fail-open)');
  fs.writeFileSync(CONFIG_PATH, backup);
}

// Test 7: plan-execution profile allows records/**
{
  fs.writeFileSync(ACTIVE_PROFILE_PATH, 'plan-execution');
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/claims/foo.yaml' } });
  assert(r.exitCode === 0, 'plan-execution profile allows records/** → exit 0');
  try { fs.unlinkSync(ACTIVE_PROFILE_PATH); } catch {}
}

// Test 8: Performance < 50ms
{
  const start = Date.now();
  runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/claims/foo.yaml' } });
  const elapsed = Date.now() - start;
  assert(elapsed < 50, `execution under 50ms (actual: ${elapsed}ms)`);
}

// Cleanup
try { fs.unlinkSync(ACTIVE_PROFILE_PATH); } catch {}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

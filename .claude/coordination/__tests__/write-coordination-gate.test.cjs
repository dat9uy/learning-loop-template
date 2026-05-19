#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'write-coordination-gate.cjs');

let passed = 0;
let failed = 0;

function runHook(input) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env }
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

console.log('\n--- write-coordination-gate.cjs ---');

// Test 1: Non-Edit/Write tool → exit 0
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert(r.exitCode === 0, 'non-Edit/Write tool → exit 0');
}

// Test 2: Edit docs/** → exit 0
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'docs/journals/foo.md' } });
  assert(r.exitCode === 0, 'Edit docs/journals/foo.md → exit 0');
}

// Test 3: Write plans/** → exit 0
{
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'plans/260520/foo.md' } });
  assert(r.exitCode === 0, 'Write plans/260520/foo.md → exit 0');
}

// Test 4: Edit .claude/** → exit 0
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json' } });
  assert(r.exitCode === 0, 'Edit .claude/settings.json → exit 0');
}

// Test 5: Edit records/observations/** → exit 2 (blocked)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/observations/foo.yaml' } });
  assert(r.exitCode === 2, 'Edit records/observations/foo.yaml → exit 2');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'block', 'observations blocked with decision: block');
  assert(output && output.matched_rule === 'records/observations/**', 'observations matched correct rule');
}

// Test 6: Edit records/evidence/** → exit 2 (blocked)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/evidence/foo.md' } });
  assert(r.exitCode === 2, 'Edit records/evidence/foo.md → exit 2');
}

// Test 7: Edit records/claims/** → exit 0 (general records allowed)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'records/claims/foo.yaml' } });
  assert(r.exitCode === 0, 'Edit records/claims/foo.yaml → exit 0');
}

// Test 8: Edit evidence/** → exit 0
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'evidence/audit/foo.md' } });
  assert(r.exitCode === 0, 'Edit evidence/audit/foo.md → exit 0');
}

// Test 9: Edit product/** → exit 0
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'product/api/main.py' } });
  assert(r.exitCode === 0, 'Edit product/api/main.py → exit 0');
}

// Test 10: Edit product/web/node_modules/** → exit 2 (blocked)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'product/web/node_modules/foo/bar.js' } });
  assert(r.exitCode === 2, 'Edit product/web/node_modules/foo/bar.js → exit 2');
}

// Test 11: Edit schemas/** → exit 2 (blocked)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'schemas/observation.schema.json' } });
  assert(r.exitCode === 2, 'Edit schemas/observation.schema.json → exit 2');
}

// Test 12: Edit README.md (root file) → exit 0
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'README.md' } });
  assert(r.exitCode === 0, 'Edit README.md → exit 0');
}

// Test 13: Edit unknown/path → exit 2 (blocked by catch-all)
{
  const r = runHook({ tool_name: 'Edit', tool_input: { file_path: 'unknown/path/file.txt' } });
  assert(r.exitCode === 2, 'Edit unknown/path/file.txt → exit 2');
}

// Test 14: Performance < 50ms
{
  const start = Date.now();
  runHook({ tool_name: 'Edit', tool_input: { file_path: 'docs/journals/foo.md' } });
  const elapsed = Date.now() - start;
  assert(elapsed < 50, `execution under 50ms (actual: ${elapsed}ms)`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

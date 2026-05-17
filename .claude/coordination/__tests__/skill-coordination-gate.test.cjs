#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'skill-coordination-gate.cjs');
const COORD_DIR = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(COORD_DIR, 'skill-registry.json');
const BYPASS_PATH = path.join(COORD_DIR, '.bypass-next');

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

// Ensure real registry exists for tests
const origRegistry = fs.readFileSync(REGISTRY_PATH, 'utf8');

console.log('\n--- skill-coordination-gate.cjs ---');

// Test 1: Non-Skill tool call → exit 0
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert(r.exitCode === 0, 'non-Skill tool call → exit 0 (allow)');
}

// Test 2: Skill tool call with unregistered skill → exit 0
{
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'test', args: 'run tests' } });
  assert(r.exitCode === 0, 'unregistered skill → exit 0 (allow)');
}

// Test 3: Skill tool call with registered skill → exit 2 + JSON
{
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  assert(r.exitCode === 2, 'registered skill → exit 2 (block)');
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'block', 'blocked output has decision: block');
  assert(output && output.coordinator === 'learning-loop', 'blocked output has coordinator');
  assert(output && output.target_skill === 'backend-development', 'blocked output has target_skill');
  assert(output && output.profile === 'code-generation', 'blocked output has profile');
}

// Test 4: Registry doesn't exist → exit 0 (fail-open)
{
  const backup = fs.readFileSync(REGISTRY_PATH, 'utf8');
  fs.unlinkSync(REGISTRY_PATH);
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  assert(r.exitCode === 0, 'missing registry → exit 0 (fail-open)');
  fs.writeFileSync(REGISTRY_PATH, backup);
}

// Test 5: Malformed registry → exit 0 (fail-open) + stderr warning
{
  const backup = fs.readFileSync(REGISTRY_PATH, 'utf8');
  fs.writeFileSync(REGISTRY_PATH, 'NOT JSON');
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  assert(r.exitCode === 0, 'malformed registry → exit 0 (fail-open)');
  assert(r.stderr.includes('malformed'), 'malformed registry → stderr warning');
  fs.writeFileSync(REGISTRY_PATH, backup);
}

// Test 6: Empty skill name → exit 0
{
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: '', args: 'build API' } });
  assert(r.exitCode === 0, 'empty skill name → exit 0 (allow)');
}

// Test 7: Blocked output JSON shape
{
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'cook', args: 'execute plan' } });
  let output;
  try { output = JSON.parse(r.stdout); } catch { output = null; }
  assert(output && output.decision === 'block', 'blocked output has decision');
  assert(output && output.reason && output.reason.length > 0, 'blocked output has reason');
  assert(output && output.coordinator, 'blocked output has coordinator');
  assert(output && output.target_skill === 'cook', 'blocked output has target_skill');
  assert(output && output.profile === 'plan-execution', 'blocked output has profile');
}

// Test 8: Multiple registered skills all get blocked
{
  const skills = ['backend-development', 'frontend-development', 'tanstack', 'cook', 'fix', 'mcp-builder', 'web-frameworks', 'mobile-development'];
  let allBlocked = true;
  for (const skill of skills) {
    const r = runHook({ tool_name: 'Skill', tool_input: { skill, args: 'test' } });
    if (r.exitCode !== 2) { allBlocked = false; break; }
  }
  assert(allBlocked, 'all 8 registered skills get blocked');
}

// Test 9: Bypass file exists → allow + delete bypass file
{
  fs.writeFileSync(BYPASS_PATH, '');
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  assert(r.exitCode === 0, 'bypass file → exit 0 (allow)');
  assert(!fs.existsSync(BYPASS_PATH), 'bypass file deleted after use');
}

// Test 10: No bypass file → block (normal behavior)
{
  try { fs.unlinkSync(BYPASS_PATH); } catch {}
  const r = runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  assert(r.exitCode === 2, 'no bypass file → exit 2 (block)');
}

// Test 11: Performance < 50ms
{
  const start = Date.now();
  runHook({ tool_name: 'Skill', tool_input: { skill: 'backend-development', args: 'build API' } });
  const elapsed = Date.now() - start;
  assert(elapsed < 50, `execution under 50ms (actual: ${elapsed}ms)`);
}

// Cleanup
try { fs.unlinkSync(BYPASS_PATH); } catch {}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

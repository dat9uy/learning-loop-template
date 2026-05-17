#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const COORD_DIR = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(COORD_DIR, 'skill-registry.json');
const CONFIG_PATH = path.join(COORD_DIR, 'coordination-config.json');

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

// Load files
let registry, config;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  console.error('Cannot read skill-registry.json:', e.message);
  process.exit(1);
}

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('Cannot read coordination-config.json:', e.message);
  process.exit(1);
}

// --- skill-registry.json tests ---

console.log('\n--- skill-registry.json ---');

assert(typeof registry.version === 'string', 'has version field');
assert(typeof registry.coordinator === 'string', 'has coordinator field');
assert(typeof registry.registered_skills === 'object' && registry.registered_skills !== null, 'has registered_skills object');

const skills = registry.registered_skills;
const skillNames = Object.keys(skills);
assert(skillNames.length > 0, 'has at least one registered skill');

for (const name of skillNames) {
  assert(typeof skills[name].profile === 'string', `skill "${name}" has profile field`);
}

assert(registry.unregistered_skills_bypass === true, 'unregistered_skills_bypass defaults to true');

// --- coordination-config.json tests ---

console.log('\n--- coordination-config.json ---');

assert(typeof config.version === 'string', 'has version field');
assert(typeof config.profiles === 'object' && config.profiles !== null, 'has profiles object');

const profiles = config.profiles;
const profileNames = Object.keys(profiles);
assert(profileNames.length > 0, 'has at least one profile');

for (const name of profileNames) {
  const profile = profiles[name];
  assert(Array.isArray(profile.write_allowlist), `profile "${name}" has write_allowlist (array)`);
  assert(Array.isArray(profile.write_forbidlist), `profile "${name}" has write_forbidlist (array)`);
  assert(Array.isArray(profile.gate_signals), `profile "${name}" has gate_signals (array)`);
}

// v1 restrictions
assert(!config.skill_overrides, 'no skill_overrides in v1 config');
for (const name of profileNames) {
  assert(!profiles[name].post_execution, `profile "${name}" has no post_execution in v1`);
}

// Cross-reference: all registered skills must have valid profiles
for (const name of skillNames) {
  const profileName = skills[name].profile;
  assert(profiles[profileName], `skill "${name}" profile "${profileName}" exists in config`);
}

// --- Summary ---

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

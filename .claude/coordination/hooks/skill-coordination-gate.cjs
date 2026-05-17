#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findRegistry() {
  const candidates = [
    path.join(process.cwd(), '.claude', 'coordination', 'skill-registry.json'),
    path.join(__dirname, '..', 'skill-registry.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  if (input.tool_name !== 'Skill') {
    process.exit(0);
  }

  const skillName = input.tool_input?.skill;
  if (!skillName || typeof skillName !== 'string') {
    process.exit(0);
  }

  const registryPath = findRegistry();
  if (!registryPath) {
    process.exit(0);
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    console.error(`skill-coordination-gate: malformed registry: ${err.message}`);
    process.exit(0);
  }

  const registered = registry.registered_skills?.[skillName];
  if (!registered) {
    process.exit(0);
  }

  // Bypass file: coordinator-initiated call (one-shot)
  const bypassPath = path.join(path.dirname(registryPath), '.bypass-next');
  if (fs.existsSync(bypassPath)) {
    try { fs.unlinkSync(bypassPath); } catch {}
    process.exit(0);
  }

  // Block — skill must go through coordinator
  const coordinator = registry.coordinator || 'learning-loop';
  const output = {
    decision: 'block',
    reason: `Skill "${skillName}" requires coordination. Invoke /ck:${coordinator} with target=${skillName} and your original intent.`,
    coordinator,
    target_skill: skillName,
    profile: registered.profile
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

main();

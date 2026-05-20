#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { globMatch, readObservations, checkObservationStaleness, pathMatchesObservation, findProjectRoot } = require('./lib/gate-utils.cjs');

// Rollback: cp write-coordination-gate.cjs.bak write-coordination-gate.cjs

function toRelative(filePath) {
  if (!path.isAbsolute(filePath)) return filePath;
  const root = findProjectRoot();
  const rel = path.relative(root, filePath);
  if (rel.startsWith('..')) return filePath;
  return rel;
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || typeof filePath !== 'string') {
    process.exit(0);
  }

  const relPath = path.normalize(toRelative(filePath));

  // Unconditional block for observation files
  if (globMatch('records/observations/**', relPath)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Observation files affect gate decisions. Explicit approval required.',
      file_path: filePath,
      matched_rule: 'records/observations/**',
    }));
    process.exit(2);
  }

  // Unconditional block for schemas
  if (globMatch('schemas/**', relPath)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Schema changes require validation. Run pnpm validate:records first, then approve.',
      file_path: filePath,
      matched_rule: 'schemas/**',
    }));
    process.exit(2);
  }

  // Unconditional blocks for build artifacts
  if (globMatch('**/node_modules/**', relPath) || globMatch('**/dist/**', relPath) || globMatch('**/build/**', relPath)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Build artifacts are not git-tracked',
      file_path: filePath,
      matched_rule: '**/node_modules/**',
    }));
    process.exit(2);
  }

  // Evidence write-path check: active observation + staleness check
  if (globMatch('records/evidence/**', relPath)) {
    const root = findProjectRoot();
    const obsDir = path.join(root, 'records', 'observations');
    const coordDir = path.join(__dirname, '..');
    const observations = readObservations(obsDir);
    const matchingObs = observations.find(obs => pathMatchesObservation(obs, relPath));

    if (matchingObs) {
      const staleness = checkObservationStaleness([matchingObs], coordDir);
      if (staleness.stale) {
        console.log(JSON.stringify({
          decision: 'escalate',
          reason: staleness.reason,
          file_path: filePath,
          observation_id: staleness.observation_id,
          inbound_gate: true,
        }));
        process.exit(2);
      }
      process.exit(0);
    }

    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Evidence files affect validation. Explicit approval required.',
      file_path: filePath,
      matched_rule: 'records/evidence/**',
    }));
    process.exit(2);
  }

  // Allowed domains
  if (globMatch('docs/**', relPath) || globMatch('plans/**', relPath) || globMatch('.claude/**', relPath) || globMatch('product/**', relPath) || globMatch('tools/**', relPath)) {
    process.exit(0);
  }

  // Single-segment unknown files -> allow
  if (globMatch('*', relPath)) {
    process.exit(0);
  }

  // Multi-segment catch-all -> block
  if (globMatch('**', relPath)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Unknown path. Only write to known domains.',
      file_path: filePath,
      matched_rule: '**',
    }));
    process.exit(2);
  }

  process.exit(0);
}

main();

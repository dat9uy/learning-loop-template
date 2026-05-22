#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  globMatch, readObservations, checkObservationStaleness, pathMatchesObservation, findProjectRoot,
  extractFrontmatter, hasProductBuildTag, extractSurfaces, checkDecisionRecords,
  inferSurface, hasDecisionRecords,
} = require('./lib/gate-utils.cjs');

// Rollback: cp write-coordination-gate.cjs.bak write-coordination-gate.cjs

function toRelative(filePath) {
  if (!path.isAbsolute(filePath)) return filePath;
  const root = findProjectRoot();
  const rel = path.relative(root, filePath);
  if (rel.startsWith('..')) return filePath;
  return rel;
}

function getResponseMode() {
  const mode = process.env.GATE_RESPONSE_MODE || 'warn';
  return mode === 'escalate' ? 'escalate' : 'warn';
}

function main() {
  const responseMode = getResponseMode();

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
  const coordDir = path.join(__dirname, '..');

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

  // ─── Artifact-aware gate: plan content scanning ───
  if (globMatch('plans/**/plan.md', relPath)) {
    // Skip content scan for edits to existing plans
    const root = findProjectRoot();
    const fullPath = path.join(root, relPath);
    if (fs.existsSync(fullPath)) {
      process.exit(0);
    }

    const content = (input.tool_input?.content || '').slice(0, 2048);
    const frontmatter = extractFrontmatter(content);
    if (frontmatter && hasProductBuildTag(frontmatter)) {
      const surfaces = extractSurfaces(frontmatter);
      const recordsDir = path.join(root, 'records');
      const { missing } = checkDecisionRecords(surfaces, recordsDir);
      if (missing.length > 0) {
        if (responseMode === 'escalate') {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `Missing decision records for surfaces: ${missing.join(', ')}. Create records/<surface>/decisions/*.yaml before product-build plans.`,
            file_path: filePath,
            matched_rule: 'plans/**/plan.md',
            missing_surfaces: missing,
          }));
          process.exit(2);
        } else {
          console.log(JSON.stringify({
            decision: 'warn',
            reason: `Missing decision records for surfaces: ${missing.join(', ')}. Create records/<surface>/decisions/*.yaml before product-build plans.`,
            file_path: filePath,
            matched_rule: 'plans/**/plan.md',
            missing_surfaces: missing,
          }));
        }
      }
    }
    process.exit(0);
  }

  // ─── Artifact-aware gate: product code & journal surface inference ───
  if (globMatch('product/**', relPath)) {
    const surface = inferSurface(relPath);
    const root = findProjectRoot();
    const recordsDir = path.join(root, 'records');
    if (surface && !hasDecisionRecords(surface, recordsDir)) {
      if (responseMode === 'escalate') {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `Missing decision records for surface "${surface}". Create records/${surface}/decisions/*.yaml or records/decisions/*${surface}*.yaml before writing product code.`,
          file_path: filePath,
          matched_rule: 'product/**',
          surface,
        }));
        process.exit(2);
      } else {
        console.log(JSON.stringify({
          decision: 'warn',
          reason: `Missing decision records for surface "${surface}". Create records/${surface}/decisions/*.yaml or records/decisions/*${surface}*.yaml before writing product code.`,
          file_path: filePath,
          matched_rule: 'product/**',
          surface,
        }));
      }
    }
    process.exit(0);
  }

  if (globMatch('docs/journals/**', relPath)) {
    process.exit(0);
  }

  // Evidence write-path check: active observation + staleness check
  if (globMatch('records/evidence/**', relPath) || globMatch('records/*/evidence/**', relPath)) {
    const root = findProjectRoot();
    const obsDir = path.join(root, 'records', 'observations');
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

  // Index and capabilities are agent-managed derived artifacts
  if (globMatch('records/index/**', relPath) || globMatch('records/*/index/**', relPath) || globMatch('records/capabilities/**', relPath) || globMatch('records/*/capabilities/**', relPath)) {
    const root = findProjectRoot();
    const obsDir = path.join(root, 'records', 'observations');
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
      reason: 'Index/capability files require observation. Explicit approval required.',
      file_path: filePath,
      matched_rule: 'records/{index,capabilities}/**',
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

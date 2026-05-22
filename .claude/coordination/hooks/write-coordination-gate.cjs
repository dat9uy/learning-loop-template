#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  globMatch, findProjectRoot,
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

  // All records/** writes go through MCP tools — block direct Edit/Write
  if (globMatch('records/**', relPath)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.',
      file_path: filePath,
      matched_rule: 'records/**',
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
        console.log(JSON.stringify({
          decision: 'block',
          reason: `Missing decision records for surfaces: ${missing.join(', ')}. Create records/<surface>/decisions/*.yaml before product-build plans.`,
          file_path: filePath,
          matched_rule: 'plans/**/plan.md',
          missing_surfaces: missing,
        }));
        process.exit(2);
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
      console.log(JSON.stringify({
        decision: 'block',
        reason: `Missing decision records for surface "${surface}". Create records/${surface}/decisions/*.yaml or records/decisions/*${surface}*.yaml before writing product code.`,
        file_path: filePath,
        matched_rule: 'product/**',
        surface,
      }));
      process.exit(2);
    }
    process.exit(0);
  }

  if (globMatch('docs/journals/**', relPath)) {
    process.exit(0);
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

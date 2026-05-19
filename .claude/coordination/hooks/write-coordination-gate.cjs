#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { globMatch } = require('./lib/gate-utils.cjs');

const DOMAIN_RULES = [
  { pattern: 'docs/**',           decision: 'allow' },
  { pattern: 'plans/**',          decision: 'allow' },
  { pattern: '.claude/**',        decision: 'allow' },
  { pattern: 'records/observations/**', decision: 'block', reason: 'Observation files affect bash gate decisions. Explicit approval required.' },
  { pattern: 'records/evidence/**',     decision: 'block', reason: 'Evidence files affect validation. Explicit approval required.' },
  { pattern: 'records/**',        decision: 'allow' },
  { pattern: 'evidence/**',       decision: 'allow' },
  { pattern: '**/node_modules/**', decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/dist/**',        decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/build/**',       decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: 'product/**',        decision: 'allow' },
  { pattern: 'tools/**',          decision: 'allow' },
  { pattern: 'schemas/**',        decision: 'block', reason: 'Schema changes require validation. Run pnpm validate:records first, then approve.' },
  { pattern: '*',                 decision: 'allow' },
  { pattern: '**',                decision: 'block', reason: 'Unknown path. Only write to known domains.' },
];

function findProjectRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = path.join(__dirname, '..', '..', '..');
  while (!fs.existsSync(path.join(dir, 'records'))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

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

  const relPath = toRelative(filePath);

  for (const rule of DOMAIN_RULES) {
    if (globMatch(rule.pattern, relPath)) {
      if (rule.decision === 'allow') {
        process.exit(0);
      } else {
        const output = {
          decision: 'block',
          reason: rule.reason || `Write to "${relPath}" is forbidden by domain rule "${rule.pattern}".`,
          file_path: filePath,
          matched_rule: rule.pattern,
        };
        console.log(JSON.stringify(output));
        process.exit(2);
      }
    }
  }

  process.exit(0);
}

main();

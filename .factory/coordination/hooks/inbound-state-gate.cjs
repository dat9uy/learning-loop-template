#!/usr/bin/env node
/**
 * Universal hook shim — delegates to universal inbound-gate.js (single source of truth).
 * Mirrored byte-identical across all runtime surfaces (.claude, .factory, .mastracode);
 * enforced by the `shims-in-sync` runtime-agnostic checklist item.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/legacy/inbound-gate.js');

const stdin = require('fs').readFileSync(0, 'utf8');
try {
  execFileSync('node', [universalHook], {
    input: stdin,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
  });
  process.exit(0);
} catch (err) {
  process.exit(err.status ?? 1);
}
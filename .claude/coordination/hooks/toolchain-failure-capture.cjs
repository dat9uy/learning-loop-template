#!/usr/bin/env node
/**
 * Universal hook shim — delegates to universal toolchain-failure-capture.js
 * (single source of truth). Mirrored byte-identical across runtime surfaces
 * (.claude, .factory); enforced by the `shims-in-sync` runtime-agnostic
 * checklist item.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js');

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

#!/usr/bin/env node
/**
 * Droid CLI SessionStart hook — checks the gate decision log for recurring
 * false-positive patterns and auto-files findings.
 * Delegates to universal recurrence-check-on-start.js (single source of truth).
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mcp/hooks/recurrence-check-on-start.js');

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

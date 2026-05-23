#!/usr/bin/env node
/**
 * Droid CLI Write Gate — PreToolUse hook for Edit/Create/ApplyPatch.
 * Delegates to universal write-gate.js (single source of truth).
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const universalHook = path.join(__dirname, '../../../../tools/coordination-gate/hooks/write-gate.js');

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

#!/usr/bin/env node
/**
 * Droid CLI Inbound State Gate — UserPromptSubmit hook.
 * Delegates to universal inbound-gate.js (single source of truth).
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const universalHook = path.join(__dirname, '../../../../tools/coordination-gate/hooks/inbound-gate.js');

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

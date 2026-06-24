#!/usr/bin/env node
/**
 * Thin wrapper — delegates to universal bash-gate.js
 * Kept for backward compatibility with existing .claude/settings.json
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const universalHook = path.join(__dirname, '../../../tools/learning-loop-mastra/hooks/legacy/bash-gate.js');

// Read stdin and pass it to the universal hook
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

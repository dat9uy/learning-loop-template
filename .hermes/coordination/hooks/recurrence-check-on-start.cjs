#!/usr/bin/env node
/**
 * Hermes Agent universal hook shim — delegates to the universal
 * recurrence-check-on-start.js.
 *
 * Hermes' SessionStart equivalent: the on_session_start shell hook (observer —
 * its stdout is ignored, which suits the recurrence check: the universal hook
 * is a silent-write channel that files recurring-false-positive findings into
 * the registry and emits only a stderr summary line).
 *
 * Fires once per new session; the universal hook is fail-open and exits 0.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js');

const stdin = require('fs').readFileSync(0, 'utf8');

// Project scope guard: Hermes shell hooks are global; the recurrence check
// scans THIS repo's decision log, so skip sessions outside the repo.
function isInScope(cwd) {
  if (!cwd || typeof cwd !== 'string') return true; // unknown cwd: fail-open
  return cwd === projectRoot || cwd.startsWith(projectRoot + path.sep);
}

function main() {
  let input = {};
  try {
    input = JSON.parse(stdin || '{}');
  } catch {
    process.exit(0);
  }
  if (!isInScope(input.cwd ?? process.cwd())) process.exit(0);

  try {
    execFileSync('node', [universalHook], {
      input: stdin,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, GATE_ROOT: projectRoot },
    });
    process.exit(0);
  } catch (err) {
    process.exit(err.status ?? 1);
  }
}

main();

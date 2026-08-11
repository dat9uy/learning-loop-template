#!/usr/bin/env node
/**
 * Hermes Agent universal hook shim — delegates to the universal
 * toolchain-failure-capture.js.
 *
 * Hermes' PostToolUseFailure equivalent is the post_tool_call shell hook,
 * which fires after EVERY tool call (blocked, error, or success). The shim
 * therefore filters to failed calls (`status` present and not "success")
 * before delegating; the universal hook then applies its own toolchain-pattern
 * filter (pnpm fallow/test/build/vitest). Fail-open: never blocks.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js');

const stdin = require('fs').readFileSync(0, 'utf8');

// Project scope guard: Hermes shell hooks are global; only capture toolchain
// failures from sessions inside this repo.
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

  // post_tool_call payload carries `status` ("success" | "error" | "blocked").
  // Only failed calls are toolchain-failure candidates.
  const status = input.status;
  if (status && status === 'success') process.exit(0);
  if (input.tool_name !== 'terminal') process.exit(0);

  // Map Hermes' tool name to the canonical Bash name the universal hook
  // filters on.
  const payload = { tool_name: 'Bash', tool_input: input.tool_input || {} };

  try {
    execFileSync('node', [universalHook], {
      input: JSON.stringify(payload),
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, GATE_ROOT: projectRoot },
    });
  } catch (err) {
    process.exit(err.status ?? 1);
  }
  process.exit(0);
}

main();

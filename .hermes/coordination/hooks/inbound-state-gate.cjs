#!/usr/bin/env node
/**
 * Hermes Agent universal hook shim — delegates to the universal inbound-gate.js.
 *
 * Hermes' UserPromptSubmit equivalent is the pre_llm_call shell hook (fires
 * once per turn before the tool-calling loop). The universal inbound-gate
 * expects `{ prompt }`; Hermes' payload carries `user_message`. Output is the
 * Claude-Code soft-warning envelope
 * (`hookSpecificOutput.additionalContext`), which this shim translates into
 * Hermes' pre_llm_call context-injection shape (`{"context": "..."}`).
 *
 * The inbound gate is designed to be idempotent within its suppress window
 * (SUPPRESS_WINDOW_MS), so firing per turn instead of once per user message
 * is safe: a stale-warning re-emits at most once per window.
 *
 * Always exits 0 (soft gate — never blocks).
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/inbound-gate.js');

const stdin = require('fs').readFileSync(0, 'utf8');

// Project scope guard: only inject loop steering context in sessions whose
// cwd is inside this repo (Hermes shell hooks are global; Claude Code's
// UserPromptSubmit hook is project-scoped by .claude/settings.json).
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

  // Hermes pre_llm_call payload: session_id, user_message, conversation_history,
  // is_first_turn, model, platform. Accept any of the common prompt keys.
  const prompt = input.user_message ?? input.prompt ?? input.message ?? '';
  if (typeof prompt !== 'string' || prompt.length === 0) process.exit(0);

  const payload = { prompt };

  let stdout = '';
  try {
    stdout = execFileSync('node', [universalHook], {
      input: JSON.stringify(payload),
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, GATE_ROOT: projectRoot },
    }).toString('utf8');
  } catch (err) {
    // Fail-open: a soft gate must never block on transport failure.
    process.exit(0);
  }

  const context = translateContext(stdout);
  if (context) console.log(JSON.stringify({ context }));
  process.exit(0);
}

/**
 * Extract the soft-warning / pointer text from the universal hook's
 * UserPromptSubmit envelope. Returns null when nothing should be injected.
 */
function translateContext(stdout) {
  if (!stdout || !stdout.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const out = parsed?.hookSpecificOutput;
  if (!out || typeof out.additionalContext !== 'string' || !out.additionalContext.trim()) return null;
  return out.additionalContext;
}

main();

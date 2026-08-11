#!/usr/bin/env node
/**
 * Hermes Agent universal hook shim — delegates to the universal bash-gate.js.
 *
 * Hermes shell hooks (declared in ~/.hermes/config.yaml, `hooks:` block) speak
 * the Claude Code-compatible wire protocol: they receive
 * `{ hook_event_name, tool_name, tool_input, session_id, cwd, extra }` on stdin
 * and block via `{"decision":"block","reason":...}` (or `{"action":"block",...}`)
 * on stdout, or by exiting 2. The loop's universal hooks emit the modern
 * Claude-Code PreToolUse envelope (`hookSpecificOutput.permissionDecision`),
 * so this shim only:
 *
 *   1. maps Hermes tool names to the loop's canonical names (terminal → Bash),
 *   2. pins GATE_ROOT from its own location — Hermes spawns hook subprocesses
 *      from the session cwd, which may differ from the project root,
 *   3. translates the universal hook's deny envelope into Hermes' block
 *      directive, and
 *   4. exits 0 always (Hermes resolves the block from the stdout JSON).
 *
 * Wired as `kind: "adapter"` in hooks-lock.json — intentionally NOT byte-
 * identical to the .claude/.factory shims (protocol translation is required).
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/bash-gate.js');

const stdin = require('fs').readFileSync(0, 'utf8');

// Project scope guard: Hermes shell hooks are GLOBAL (config.yaml), unlike
// Claude Code's project-scoped .claude/settings.json. Gate only sessions
// whose cwd is inside this repo — elsewhere the loop's gates do not apply
// (fail-open, matching Claude Code's no-hooks-outside-the-repo semantics).
function isInScope(cwd) {
  if (!cwd || typeof cwd !== 'string') return true; // unknown cwd: fail-open
  return cwd === projectRoot || cwd.startsWith(projectRoot + path.sep);
}

function main() {
  let input = {};
  try {
    input = JSON.parse(stdin || '{}');
  } catch {
    // Non-JSON payload: allow (fail-open).
    process.exit(0);
  }

  if (!isInScope(input.cwd ?? process.cwd())) process.exit(0);

  const toolName = input.tool_name || '';
  if (toolName !== 'terminal') process.exit(0);

  const payload = {
    tool_name: 'Bash',
    tool_input: input.tool_input || {},
  };

  let stdout = '';
  try {
    stdout = execFileSync('node', [universalHook], {
      input: JSON.stringify(payload),
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, GATE_ROOT: projectRoot },
    }).toString('utf8');
  } catch (err) {
    process.exit(err.status ?? 1);
  }

  const directive = translateDeny(stdout);
  if (directive) console.log(JSON.stringify(directive));
  process.exit(0);
}

/**
 * Translate the universal hook's Claude-Code envelope into Hermes' block
 * directive. Returns null when the call is allowed (or the envelope is
 * unparseable — fail-open, matching the loop's fail-open hook contract).
 */
function translateDeny(stdout) {
  if (!stdout || !stdout.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const out = parsed?.hookSpecificOutput;
  if (!out || out.permissionDecision !== 'deny') return null;
  const reason = out.permissionDecisionReason || decodeReason(out.additionalContext) || 'Blocked by learning-loop gate';
  return { decision: 'block', reason };
}

function decodeReason(additionalContext) {
  if (typeof additionalContext !== 'string' || !additionalContext) return null;
  try {
    const parsed = JSON.parse(additionalContext);
    if (typeof parsed?.reason === 'string' && parsed.reason) return parsed.reason;
  } catch {
    // fall through to raw text
  }
  return additionalContext.slice(0, 2000);
}

main();

#!/usr/bin/env node
/**
 * Hermes Agent universal hook shim — delegates to the universal write-gate.js.
 *
 * Same translation role as bash-coordination-gate.cjs, for Hermes' write
 * tools (write_file, patch). Maps Hermes tool_input.path → the loop's
 * tool_input.file_path (the universal write-gate reads file_path; authored
 * content rides content / new_string / patch, which both runtimes share).
 *
 * Wired as `kind: "adapter"` in hooks-lock.json.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const universalHook = path.join(projectRoot, 'tools/learning-loop-mastra/hooks/universal/write-gate.js');

const stdin = require('fs').readFileSync(0, 'utf8');

// Hermes write tools → canonical loop tool name (normalizeToolName maps
// Edit → "write").
const WRITE_TOOLS = new Set(['write_file', 'patch']);

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
  if (!WRITE_TOOLS.has(toolName)) process.exit(0);

  const toolInput = { ...(input.tool_input || {}) };
  if (typeof toolInput.path === 'string' && toolInput.file_path === undefined) {
    toolInput.file_path = toolInput.path;
  }

  const payload = { tool_name: 'Edit', tool_input: toolInput };

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
 * directive. Returns null when the write is allowed (or unparseable —
 * fail-open).
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

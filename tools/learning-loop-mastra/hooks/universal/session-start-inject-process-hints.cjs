#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: inject PROCESS_HINTS as a system-reminder.
 *
 * Companion to session-start-inject-discoverability.cjs. That hook writes the
 * full sidecar (.claude/session-context.json, both hint sets) and injects the
 * discoverability hints; this hook injects the process hints. The split exists
 * because the SessionStart `hookSpecificOutput.additionalContext` channel is
 * capped at 10k chars and the two hint sets combined (~11.8k) exceed it; each
 * set is under the cap on its own, so both land as full system-reminders.
 *
 * Why a second hook at all: the sidecar has no in-process reader, so without
 * inline injection the agent never sees PROCESS_HINTS row #1 (the test-parsing
 * rule) unless it voluntarily calls loop_describe — the observed regression in
 * session 4760ee34 (4x `pnpm test | grep`). Injecting at SessionStart makes
 * delivery deterministic. See
 * plans/reports/debug-260715-1141-GH-260715-process-hint-not-injected-report.md.
 *
 * Fail-open: a build error emits a degraded marker instead of crashing the
 * session start. The discoverability hook's sidecar remains the audit source
 * for the *_source flags.
 */
"use strict";

const { buildProcessHints } = require("../../core/loop-introspect.js");

let text;
try {
  if (process.env.SESSION_START_FORCE_PROCESS_HINTS_FAIL === "1") {
    throw new Error("forced process-hints loader failure (SESSION_START_FORCE_PROCESS_HINTS_FAIL=1)");
  }
  const hints = buildProcessHints();
  text = `Loop process hints (injected at session start; full set also in .claude/session-context.json):\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
} catch (err) {
  console.error(`[session-start][process-hints] build failed: ${err.message}`);
  text = `Loop process hints unavailable: ${err.message}. Inspect .claude/session-context.json process_hints_source.`;
}

console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
process.exit(0);
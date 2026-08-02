#!/usr/bin/env node
/**
 * Universal SessionStart hook — checks the gate decision log for recurring
 * false-positive patterns and auto-files findings.
 *
 * Works with both Claude Code and Droid CLI.
 *
 * Fail-open contract: any throw inside checkAndEmit (or its scan path)
 * exits 0 with a stderr diagnostic. A blocking hook is worse than a
 * skipped recurrence check — SessionStart must not regress on a tracker
 * regression. Per-group exceptions are caught inside checkAndEmit's
 * write loop; this top-level guard is the belt-and-suspenders for the
 * scan itself (e.g. an unexpected throw in findRecurrentGroups).
 *
 * Silent-write channel: no hookSpecificOutput.additionalContext in the
 * JSON output — 0 agent tokens, the recurring-false-positive finding
 * surface is the loop registry, not the agent context.
 */

import { readFileSync } from "node:fs";
import { checkAndEmit } from "../../core/recurrence-tracker.js";
import { parseInput } from "./lib/protocol-adapter.js";
import { resolveRoot } from "#lib/resolve-root.js";

// fallow-ignore-next-line complexity -- CRAP inflated by the subprocess-coverage blind spot (hook is exercised via spawnSync integration tests, invisible to Istanbul)
async function main() {
  // SessionStart payloads are surface metadata; we do not need them.
  // Consume stdin via parseInput (per protocol-adapter-i-o audit) so the
  // hook speaks the same dialect as the PreToolUse hooks, and so the next
  // stdin reader doesn't inherit the payload.
  parseInput(readFileSync(0, "utf8"));

  const t0 = Date.now();
  try {
    const root = resolveRoot();
    const result = await checkAndEmit(root);
    const elapsedMs = Date.now() - t0;
    // Latency tripwire: stderr timing on every run against the budget
    // pinned in the plan (p50 < 500ms on the ~28.4K-line cross-surface union).
    console.error(
      `recurrence-check: checked ${result.checked_groups} group(s), ` +
        `emitted ${result.findings_emitted} finding(s), ` +
        `entries ${result.entries_scanned ?? "?"}, ` +
        `elapsed ${elapsedMs}ms`,
    );
  } catch (err) {
    // Fail-open: log + exit 0 so SessionStart proceeds. The stderr line
    // is the observability channel; the recurring-false-positive surface
    // (the registry) sees no entry this session, which is acceptable.
    // Covers any throw in resolveRoot (bad GATE_ROOT), the registry read,
    // the decision-log scan, or the writeEntry call.
    console.error(`recurrence-check: failed (${err?.message ?? String(err)}) — skipping this session`);
  }
  process.exit(0);
}

main();

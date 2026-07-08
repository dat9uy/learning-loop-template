#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: inject discoverability hints.
 *
 * Reads `buildDiscoverabilityHints()` directly from core/loop-introspect.js
 * (a frozen constant; no MCP server startup required). Writes hints to
 * .claude/session-context.json. Replaces the previous hand-rolled JSON-RPC
 * pattern that was the documented deadlock root cause in meta-260621T1743Z.
 *
 * Per Red Team Finding 2: the previous pattern spawned the full MCP server
 * (~50-500ms startup) and hand-rolled JSON-RPC parsing to read a frozen
 * constant. Direct import eliminates that entire class of risk.
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildDiscoverabilityHints, buildProcessHints } = require("../../core/loop-introspect.js");

async function main() {
  // Test hook: when SESSION_START_FORCE_FATAL=1, throw to exercise the
  // fatal-catch write path (the BOTH-write-sites invariant).
  if (process.env.SESSION_START_FORCE_FATAL === "1") {
    throw new Error("forced fatal for smoke test");
  }

  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const contextPath = path.join(projectRoot, ".claude", "session-context.json");

  let discoverability_hints = [];
  let process_hints = [];
  let stale_dispatch_hints = { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" };
  let change_log_gap_hints = { gap_candidates: [], gap_protocol_prompt: "" };
  try {
    discoverability_hints = buildDiscoverabilityHints();
    process_hints = buildProcessHints();
  } catch (err) {
    // Fall through with empty hints; do NOT exit 1 (smoke test requires exit 0).
    console.error(`[session-start] buildHints failed: ${err.message}`);
  }

  // Rec 10 surfacing (plan 260704-0301-stale-findings-dispatch-handle Phase 3).
  // The builder imports readRegistry; if it throws (e.g. registry missing),
  // fall back to empty lists. Do NOT call buildColdTierCache/writeColdTierCache
  // here — those write to disk and would corrupt the read-only contract.
  // `entries` is shared with the Rec 12 builder below — we read the registry
  // ONCE, then reuse the snapshot (avoid a second registry read on the hot path).
  let entries = [];
  try {
    const { buildStaleDispatchHints } = require("../../core/loop-introspect.js");
    const { readRegistry } = require("../../core/meta-state.js");
    const { readRuntimeStateRows } = require("../../core/runtime-state.js");
    entries = readRegistry(projectRoot);
    // INC-10 orphan detection: find finding ids that have a `dispatch-<id>`
    // ledger row in runtime-state.jsonl. The builder is a pure function over
    // entries + this set, so it stays unit-testable without the sidecar.
    let dispatchIds = [];
    try {
      const rows = readRuntimeStateRows(projectRoot);
      dispatchIds = rows
        .filter((r) => r && typeof r.id === "string" && r.id.startsWith("dispatch-") && r.kind === "ledger-event")
        .map((r) => r.id.slice("dispatch-".length));
    } catch (rowsErr) {
      console.error(`[session-start] readRuntimeStateRows failed: ${rowsErr.message}`);
    }
    stale_dispatch_hints = buildStaleDispatchHints(entries, new Set(dispatchIds));
  } catch (err) {
    console.error(`[session-start] buildStaleDispatchHints failed: ${err.message}`);
  }

  // Rec 12 closed-loop (plan 260708-1216-rec12-closed-loop, phase 4).
  // (b)+(c): change-log gap detection + session-start surfacing. The gap
  // builder is pure (caller-supplied set); we read the branch-touched
  // paths via a read-only git call and reuse the `entries` snapshot above
  // (registry read once). The builder is advisory — coarse prefix-descendant
  // over-coverage is acceptable for a signal; the deferred SessionEnd hook
  // owns the promotion of recurrence into enforcement.
  try {
    const { buildChangeLogGapHints } = require("../../core/loop-introspect.js");
    const { readBranchTouchedPaths } = require("../../core/git-diff.js");
    const touched = readBranchTouchedPaths(projectRoot);
    change_log_gap_hints = buildChangeLogGapHints(entries, touched);
  } catch (err) {
    console.error(`[session-start] buildChangeLogGapHints failed: ${err.message}`);
  }

  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(
    contextPath,
    JSON.stringify({
      discoverability_hints,
      process_hints,
      stale_dispatch_hints,
      change_log_gap_hints,
      injected_at: new Date().toISOString(),
    }, null, 2),
  );

  console.error(`[session-start] wrote ${discoverability_hints.length} discoverability + ${process_hints.length} process + ${stale_dispatch_hints.fixable_candidates.length} stale-dispatch + ${change_log_gap_hints.gap_candidates.length} change-log-gap hints to .claude/session-context.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // Write empty hints file before exit so downstream readers don't see missing file.
  // The BOTH-write-sites invariant: the fatal-catch path MUST carry the same
  // keys as the happy-path write (incl. `change_log_gap_hints`) so downstream
  // readers never see a missing key on a failure path.
  try {
    const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
    const contextPath = path.join(projectRoot, ".claude", "session-context.json");
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, JSON.stringify({
      discoverability_hints: [],
      process_hints: [],
      stale_dispatch_hints: { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" },
      change_log_gap_hints: { gap_candidates: [], gap_protocol_prompt: "" },
      injected_at: new Date().toISOString(),
    }, null, 2));
  } catch { /* ignore */ }
  process.exit(0);
});
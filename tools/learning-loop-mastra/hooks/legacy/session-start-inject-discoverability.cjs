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
 *
 * Each hint source is loaded by a dedicated helper (Rec 9 discoverability +
 * process, Rec 10 stale-dispatch, Rec 12 change-log-gap). Helpers degrade to
 * empty defaults on builder failure so downstream readers see a stable
 * shape; the BOTH-write-sites invariant (Rec 10/12) keeps the fatal-catch
 * path in sync with the happy-path key set.
 */

const fs = require("node:fs");
const path = require("node:path");

const EMPTY_STALE_DISPATCH = { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" };
const EMPTY_CHANGE_LOG_GAP = { gap_candidates: [], gap_protocol_prompt: "" };

/**
 * Load discoverability + process hints (Rec 9).
 * Returns empty arrays on builder failure so the JSON shape stays stable.
 */
function loadCoreHints() {
  try {
    const { buildDiscoverabilityHints, buildProcessHints } = require("../../core/loop-introspect.js");
    return {
      discoverability_hints: buildDiscoverabilityHints(),
      process_hints: buildProcessHints(),
    };
  } catch (err) {
    console.error(`[session-start] buildHints failed: ${err.message}`);
    return { discoverability_hints: [], process_hints: [] };
  }
}

/**
 * Read the meta-state registry. Returns [] on read failure; never throws.
 */
function loadRegistry(root) {
  try {
    const { readRegistry } = require("../../core/meta-state.js");
    return readRegistry(root);
  } catch (err) {
    console.error(`[session-start] readRegistry failed: ${err.message}`);
    return [];
  }
}

/**
 * True iff `r` is a runtime-state.jsonl row that recorded a finding dispatch
 * (used by `buildStaleDispatchHints` to surface INC-10 orphans). CC kept low
 * via `?.` + short-circuit `&&` — three branches instead of four explicit
 * `if` returns.
 */
function isDispatchLedgerRow(r) {
  return typeof r?.id === "string"
    && r.kind === "ledger-event"
    && r.id.startsWith("dispatch-");
}

/**
 * Read runtime-state.jsonl and project out the dispatched-finding ids.
 * Returns [] on read failure or when the sidecar is absent.
 */
function loadDispatchIds(root) {
  try {
    const { readRuntimeStateRows } = require("../../core/runtime-state.js");
    return readRuntimeStateRows(root)
      .filter(isDispatchLedgerRow)
      .map((r) => r.id.slice("dispatch-".length));
  } catch (err) {
    console.error(`[session-start] readRuntimeStateRows failed: ${err.message}`);
    return [];
  }
}

/**
 * Rec 10 surfacing (plan 260704-0301-stale-findings-dispatch-handle Phase 3).
 * Pure builder over `entries` + dispatch ids. Returns empty shape on failure.
 */
function loadStaleDispatchHints(entries, dispatchIds) {
  try {
    const { buildStaleDispatchHints } = require("../../core/loop-introspect.js");
    return buildStaleDispatchHints(entries, new Set(dispatchIds));
  } catch (err) {
    console.error(`[session-start] buildStaleDispatchHints failed: ${err.message}`);
    return EMPTY_STALE_DISPATCH;
  }
}

/**
 * Rec 12 closed-loop (plan 260708-1216-rec12-closed-loop, phase 4):
 * change-log gap detection. The gap builder is pure (caller-supplied set);
 * we read branch-touched paths via a read-only git call (never throws).
 * Returns empty shape on builder failure.
 */
function loadChangeLogGapHints(root, entries) {
  try {
    const { buildChangeLogGapHints } = require("../../core/loop-introspect.js");
    const { readBranchTouchedPaths } = require("../../core/git-diff.js");
    return buildChangeLogGapHints(entries, readBranchTouchedPaths(root));
  } catch (err) {
    console.error(`[session-start] buildChangeLogGapHints failed: ${err.message}`);
    return EMPTY_CHANGE_LOG_GAP;
  }
}

/**
 * Write the session-context.json sidecar. mkdirSync({recursive:true}) keeps
 * the path available on a fresh clone; both happy-path and fatal-catch
 * write through this helper.
 */
function writeContext(root, payload) {
  const contextPath = path.join(root, ".claude", "session-context.json");
  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(contextPath, JSON.stringify(payload, null, 2));
  return contextPath;
}

async function main() {
  // Test hook: when SESSION_START_FORCE_FATAL=1, throw to exercise the
  // fatal-catch write path (the BOTH-write-sites invariant).
  if (process.env.SESSION_START_FORCE_FATAL === "1") {
    throw new Error("forced fatal for smoke test");
  }

  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

  // 1. Core hints (no registry dep).
  const { discoverability_hints, process_hints } = loadCoreHints();

  // 2. Registry + dispatch ids (Rec 10 INC-10 orphan detection).
  const entries = loadRegistry(projectRoot);
  const dispatchIds = loadDispatchIds(projectRoot);

  // 3. Stale dispatch hints (Rec 10) + change-log gap hints (Rec 12).
  const stale_dispatch_hints = loadStaleDispatchHints(entries, dispatchIds);
  const change_log_gap_hints = loadChangeLogGapHints(projectRoot, entries);

  const contextPath = writeContext(projectRoot, {
    discoverability_hints,
    process_hints,
    stale_dispatch_hints,
    change_log_gap_hints,
    injected_at: new Date().toISOString(),
  });

  console.error(
    `[session-start] wrote ${discoverability_hints.length} discoverability + ${process_hints.length} process + ${stale_dispatch_hints.fixable_candidates.length} stale-dispatch + ${change_log_gap_hints.gap_candidates.length} change-log-gap hints to ${contextPath}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // BOTH-write-sites invariant: fatal-catch must carry the same keys as the
  // happy-path write (incl. `change_log_gap_hints`) so downstream readers
  // never see a missing key on a failure path.
  try {
    writeContext(path.resolve(__dirname, "..", "..", "..", ".."), {
      discoverability_hints: [],
      process_hints: [],
      stale_dispatch_hints: EMPTY_STALE_DISPATCH,
      change_log_gap_hints: EMPTY_CHANGE_LOG_GAP,
      injected_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
  process.exit(0);
});
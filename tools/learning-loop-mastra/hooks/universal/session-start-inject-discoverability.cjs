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
 *
 * Each hint payload carries a `*_source` flag ("core" on success,
 * "fallback" on degraded loader) plus an optional `*_error` string. The
 * flag is what makes the silent-degrade failure mode visible: without it,
 * a consumer reading the sidecar cannot distinguish "no hints configured"
 * from "loaders failed and returned empty." Plan 260715-1100 fix for the
 * PROCESS_HINTS row #1 silent-degrade path observed in sessions
 * 260715-1010 and 260715-1100.
 */
function loadCoreHints() {
  try {
    if (process.env.SESSION_START_FORCE_HINTS_FAIL === "1") {
      throw new Error("forced core-hints loader failure (SESSION_START_FORCE_HINTS_FAIL=1)");
    }
    const { buildDiscoverabilityHints, buildProcessHints } = require("../../core/loop-introspect.js");
    return {
      discoverability_hints: buildDiscoverabilityHints(),
      discoverability_hints_source: "core",
      process_hints: buildProcessHints(),
      process_hints_source: "core",
    };
  } catch (err) {
    console.error(`[session-start] buildHints failed: ${err.message}`);
    return {
      discoverability_hints: [],
      discoverability_hints_source: "fallback",
      discoverability_hints_error: err.message,
      process_hints: [],
      process_hints_source: "fallback",
      process_hints_error: err.message,
    };
  }
}

/**
 * Read the meta-state registry. Returns [] on read failure; never throws.
 * Carries a `_source` flag mirroring the loadCoreHints contract.
 */
function loadRegistry(root) {
  try {
    if (process.env.SESSION_START_FORCE_REGISTRY_FAIL === "1") {
      throw new Error("forced registry loader failure (SESSION_START_FORCE_REGISTRY_FAIL=1)");
    }
    const { readRegistry } = require("../../core/meta-state.js");
    return { entries: readRegistry(root), registry_source: "core" };
  } catch (err) {
    console.error(`[session-start] readRegistry failed: ${err.message}`);
    return { entries: [], registry_source: "fallback", registry_error: err.message };
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
  const core = loadCoreHints();

  // 2. Registry + dispatch ids (Rec 10 INC-10 orphan detection).
  const registry = loadRegistry(projectRoot);
  const dispatchIds = loadDispatchIds(projectRoot);

  // 3. Stale dispatch hints (Rec 10) + change-log gap hints (Rec 12).
  const stale_dispatch_hints = loadStaleDispatchHints(registry.entries, dispatchIds);
  const change_log_gap_hints = loadChangeLogGapHints(projectRoot, registry.entries);

  const contextPath = writeContext(projectRoot, {
    discoverability_hints: core.discoverability_hints,
    discoverability_hints_source: core.discoverability_hints_source,
    discoverability_hints_error: core.discoverability_hints_error ?? null,
    process_hints: core.process_hints,
    process_hints_source: core.process_hints_source,
    process_hints_error: core.process_hints_error ?? null,
    registry_source: registry.registry_source,
    registry_error: registry.registry_error ?? null,
    stale_dispatch_hints,
    change_log_gap_hints,
    injected_at: new Date().toISOString(),
  });

  // Stderr summary line — the existing success signal. Includes source flags
  // when any loader degraded so the harness surfaces the failure to the agent
  // (silent-degrade was the bug class fixed in plan 260715-1100).
  const degradedSources = [
    core.discoverability_hints_source === "fallback" ? "discoverability_hints" : null,
    core.process_hints_source === "fallback" ? "process_hints" : null,
    registry.registry_source === "fallback" ? "registry" : null,
  ].filter(Boolean);
  if (degradedSources.length > 0) {
    console.error(
      `[session-start] DEGRADED loaders: ${degradedSources.join(", ")} — sidecar at ${contextPath} carries *_source=fallback flags`,
    );
  }
  console.error(
    `[session-start] wrote ${core.discoverability_hints.length} discoverability + ${core.process_hints.length} process + ${stale_dispatch_hints.fixable_candidates.length} stale-dispatch + ${change_log_gap_hints.gap_candidates.length} change-log-gap hints to ${contextPath}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // BOTH-write-sites invariant: fatal-catch must carry the same keys as the
  // happy-path write (incl. `change_log_gap_hints`) so downstream readers
  // never see a missing key on a failure path. The fatal path also sets
  // every `*_source` to "fatal" so a downstream reader can distinguish a
  // fatal from a per-loader fallback — both look like empty arrays on the
  // surface but represent different failure modes.
  try {
    writeContext(path.resolve(__dirname, "..", "..", "..", ".."), {
      discoverability_hints: [],
      discoverability_hints_source: "fatal",
      discoverability_hints_error: err.message,
      process_hints: [],
      process_hints_source: "fatal",
      process_hints_error: err.message,
      registry_source: "fatal",
      registry_error: err.message,
      stale_dispatch_hints: EMPTY_STALE_DISPATCH,
      change_log_gap_hints: EMPTY_CHANGE_LOG_GAP,
      injected_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
  process.exit(0);
});
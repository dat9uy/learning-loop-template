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
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const contextPath = path.join(projectRoot, ".claude", "session-context.json");

  let discoverability_hints = [];
  let process_hints = [];
  let stale_dispatch_hints = { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" };
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
  try {
    const { buildStaleDispatchHints } = require("../../core/loop-introspect.js");
    const { readRegistry } = require("../../core/meta-state.js");
    const { readRuntimeStateRows } = require("../../core/runtime-state.js");
    const entries = readRegistry(projectRoot);
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

  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(
    contextPath,
    JSON.stringify({
      discoverability_hints,
      process_hints,
      stale_dispatch_hints,
      injected_at: new Date().toISOString(),
    }, null, 2),
  );

  console.error(`[session-start] wrote ${discoverability_hints.length} discoverability + ${process_hints.length} process + ${stale_dispatch_hints.fixable_candidates.length} stale-dispatch hints to .claude/session-context.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // Write empty hints file before exit so downstream readers don't see missing file.
  try {
    const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
    const contextPath = path.join(projectRoot, ".claude", "session-context.json");
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, JSON.stringify({ discoverability_hints: [], process_hints: [], stale_dispatch_hints: { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" }, injected_at: new Date().toISOString() }, null, 2));
  } catch { /* ignore */ }
  process.exit(0);
});
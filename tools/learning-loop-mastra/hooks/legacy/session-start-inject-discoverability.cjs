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
const { buildDiscoverabilityHints, buildProcessHints } = require("../../core/legacy/loop-introspect.js");

async function main() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const contextPath = path.join(projectRoot, ".claude", "session-context.json");

  let discoverability_hints = [];
  let process_hints = [];
  try {
    discoverability_hints = buildDiscoverabilityHints();
    process_hints = buildProcessHints();
  } catch (err) {
    // Fall through with empty hints; do NOT exit 1 (smoke test requires exit 0).
    console.error(`[session-start] buildHints failed: ${err.message}`);
  }

  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(
    contextPath,
    JSON.stringify({ discoverability_hints, process_hints, injected_at: new Date().toISOString() }, null, 2),
  );

  console.error(`[session-start] wrote ${discoverability_hints.length} discoverability + ${process_hints.length} process hints to .claude/session-context.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // Write empty hints file before exit so downstream readers don't see missing file.
  try {
    const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
    const contextPath = path.join(projectRoot, ".claude", "session-context.json");
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, JSON.stringify({ discoverability_hints: [], process_hints: [], injected_at: new Date().toISOString() }, null, 2));
  } catch { /* ignore */ }
  process.exit(0);
});
// cli-write-tool-set-drift.test.js — Phase 1 of plans/260722-1343-write-capable-cli-w.
//
// Drift guard: every manifest entry MUST be in exactly one of three
// buckets — `CLI_TOOLS` (rides the CLI), `MCP_RESIDUE` (stays on MCP for
// documented reasons), or the audit catches the unclassified addition.
// A future manifest entry would silently default to neither bucket and
// surface here as a failing assertion, forcing a deliberate decision
// about its CLI portability.
//
// Bucket definitions (single source of truth = `core/cli-tools.js`):
//   CLI_TOOLS              = CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS
//   MCP_RESIDUE            = workflow + storage + allowlist + audit +
//                            auxiliary read-ish tools
//
// Adding a tool?  Either add it to CLI_WRITE_TOOLS or MCP_RESIDUE and
// update this test. Do not silently leave it out.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_TOOLS } from "../core/cli-tools.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(PKG_ROOT, "tools", "manifest.json");

// Tools that intentionally stay MCP for documented reasons. Adding a tool
// here means it stays MCP regardless of the LOOP_RECORDS_VIA_CLI flag.
const MCP_RESIDUE = new Set([
  // workflow registry (Mastra-bound)
  "workflow_generate_prompt",
  "workflow_notify_artifact",
  "workflow_trigger",
  // storage substrate (initStorage, server-bound)
  // (workflow_storage_round_trip / workflow_storage_read — server-bound)
  // operator-only R2 mutation
  "update_r2_allowlist",
  // runtime-agnostic audit tool (audit-only, never invoked by agents)
  "check_runtime_agnostic",
  // auxiliary read-ish tools — not in the 7 reads; not mutation handlers.
  // Listed in plan.md Architecture as "stay MCP until a follow-up adds
  // them to CLI_READ_TOOLS if a runtime wants the full surface".
  "gate_check",
  "gate_check_recurrence",
  "meta_state_sweep",
  "meta_state_query_drift",
  "meta_state_relationship_validate",
]);

async function readManifestToolNames() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest not found at ${MANIFEST_PATH}`);
  }
  const text = readFileSync(MANIFEST_PATH, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const manifest = JSON.parse(text);
  // Resolve bare tool name for each entry by importing the module.
  // `resolveToolImportUrl` rewrites the canonical `tools/X-tool.js` form
  // to the actual `tools/handlers/X-tool.js` location.
  const names = [];
  for (const entry of manifest) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const tool = mod[entry.export];
    if (tool?.name) names.push(tool.name);
    else names.push(entry.export); // fallback so the test still sees the entry
  }
  return names;
}

test("every manifest handler-module tool is in CLI_TOOLS or MCP_RESIDUE", async () => {
  const toolNames = await readManifestToolNames();
  assert.ok(toolNames.length > 0, "manifest must yield at least one tool");
  const unclassified = toolNames.filter((n) => !CLI_TOOLS.has(n) && !MCP_RESIDUE.has(n));
  assert.deepStrictEqual(
    unclassified,
    [],
    `every manifest tool must be in CLI_TOOLS or MCP_RESIDUE; unclassified: ${JSON.stringify(unclassified)}. ` +
      `Add it to CLI_WRITE_TOOLS (in core/cli-tools.js) for CLI portability, or to MCP_RESIDUE in this test for MCP-only with a documented reason.`,
  );
});

test("CLI_TOOLS and MCP_RESIDUE are disjoint (single-bucket invariant)", () => {
  for (const t of CLI_TOOLS) {
    assert.ok(!MCP_RESIDUE.has(t), `tool ${t} appears in both CLI_TOOLS and MCP_RESIDUE — single-bucket invariant violated`);
  }
});

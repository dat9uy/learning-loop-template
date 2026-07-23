// cli-write-tool-set-drift.test.js — Phase 3 of plans/260722-2147.
//
// Drift guard: every MCP tool name MUST be in exactly one of two buckets —
// `CLI_TOOLS` (rides the CLI), `MCP_RESIDUE` (stays on MCP for a declared
// reason). A future manifest entry would silently default to neither bucket
// and surface here as a failing assertion, forcing a deliberate decision
// about its CLI portability.
//
// Bucket definitions (single source of truth = `core/cli-tools.js`):
//   CLI_TOOLS              = CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS
//   MCP_RESIDUE            = Map<tool-name, reason> where reason ∈
//                            {"server-state","operator-policy",
//                             "agent-facing","deferred-rehoming"}
//
// MCP_RESIDUE uses `new Map([...])` (NOT a plain object — `.has` is required
// by the disjoint + classification tests; plain objects crash with
// `Map.has is not a function`). Adding a tool? Either add it to
// CLI_WRITE_TOOLS / CLI_READ_TOOLS in core/cli-tools.js for CLI
// portability, or extend MCP_RESIDUE with a reason tag from the taxonomy.

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
const WORKFLOW_MANIFEST_PATH = join(PKG_ROOT, "mastra", "workflows-manifest.json");

// Tools that intentionally stay MCP for declared reasons. Reason taxonomy
// (locked in docs/runtime-contract.md § "Transport capability (per function)"):
//   - "server-state"        tool reads/writes process-scoped server state
//                           (singletons, allowlist, per-process DB handles)
//   - "operator-policy"     tool applies an operator-only effect that
//                           agents must not invoke transitively
//   - "agent-facing"        stateless but retained on MCP so Mastra
//                           internal-agent tool resolution sees it under
//                           LOOP_RECORDS_VIA_CLI=1
//   - "deferred-rehoming"   CLI-capable in principle; re-homing is gated
//                           on a separate evidence-driven plan (see
//                           portable-six finding recorded in plan-260722-2147
//                           Phase 4)
//
// Phase 3 reclassifies 8 tools (3 workflow helpers + 5 aux-read-ish) into
// CLI_TOOLS. The 10 residue entries below are exactly the irreducible
// MCP surface under LOOP_RECORDS_VIA_CLI=1.
const MCP_RESIDUE = new Map([
  // server-state: storage substrate uses initStorage() singleton DB handle.
  ["run_workflow_storage_round_trip", "server-state"],
  ["run_workflow_storage_read", "server-state"],
  // server-state: operator-only R2 allowlist mutation (singleton cache).
  ["update_r2_allowlist", "server-state"],
  // agent-facing: stateless but agent-invoked via intake/scout agents.
  // Reclassifying to CLI_TOOLS would break Mastra internal-agent tool
  // surface resolution (validation Q2: keep MCP).
  ["check_runtime_agnostic", "agent-facing"],
  // deferred-rehoming: 6 portable-six workflow tools. CLI-capable in
  // principle but blocked on (U-Q1) unwrap contract for createLoopWorkflow
  // schema normalization, (U-Q2) resolveRoot wiring under learning-loop-mcp
  // subtree, (P-Q2) gate-observed step-success ordering, and (Sec-F9) the
  // convertWorkflowsToTools opt-out branch parallel to server.js:71.
  // Separate evidence-driven plan owns the unwrap; no re-homing code here.
  ["run_workflow_classify_prompt", "deferred-rehoming"],
  ["run_workflow_prepare_runtime_request", "deferred-rehoming"],
  ["run_workflow_self_improvement", "deferred-rehoming"],
  ["run_workflow_intentional_skip", "deferred-rehoming"],
  ["run_workflow_report_phase_status", "deferred-rehoming"],
  ["run_workflow_runtime_probe", "deferred-rehoming"],
]);

const MCP_RESIDUE_REASONS = new Set([
  "server-state",
  "operator-policy",
  "agent-facing",
  "deferred-rehoming",
]);

async function readManifestToolNames() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest not found at ${MANIFEST_PATH}`);
  }
  const text = readFileSync(MANIFEST_PATH, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const manifest = JSON.parse(text);
  const names = [];
  for (const entry of manifest) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const tool = mod[entry.export];
    if (tool?.name) names.push(tool.name);
    else names.push(entry.export);
  }
  return names;
}

// Mirrors server.js:135 (workflows[wf.id] = wf;) + server.js:187
// (const workflowToolName = `run_${workflowKey}`). The test imports the
// workflow module by file, reads wf.id, and produces run_<wf.id> exactly
// the way Mastra surfaces it on the MCP. Closes the 8-tool blind spot
// where the test only read tools/manifest.json.
async function readWorkflowToolNames() {
  if (!existsSync(WORKFLOW_MANIFEST_PATH)) {
    throw new Error(`workflows-manifest not found at ${WORKFLOW_MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(WORKFLOW_MANIFEST_PATH, "utf8"));
  const names = [];
  for (const entry of manifest) {
    // server.js uses `import(`./${file}`)` against the mastra/ cwd; mirror it.
    const mod = await import(join(PKG_ROOT, "mastra", entry.file));
    const wf = mod[entry.export];
    if (wf?.id) names.push(`run_${wf.id}`);
    else names.push(`run_${entry.export}`);
  }
  return names;
}

test("every manifest handler-module tool is in CLI_TOOLS or MCP_RESIDUE", async () => {
  const toolNames = await readManifestToolNames();
  assert.ok(toolNames.length > 0, "manifest must yield at least one tool");
  const unclassified = toolNames.filter(
    (n) => !CLI_TOOLS.has(n) && !MCP_RESIDUE.has(n),
  );
  assert.deepStrictEqual(
    unclassified,
    [],
    `every manifest tool must be in CLI_TOOLS or MCP_RESIDUE; unclassified: ${JSON.stringify(unclassified)}. ` +
      `Add it to CLI_READ_TOOLS / CLI_WRITE_TOOLS (in core/cli-tools.js) for CLI portability, or to MCP_RESIDUE in this test with a reason from the taxonomy.`,
  );
});

test("every workflow tool is in CLI_TOOLS or MCP_RESIDUE (blind-spot closure)", async () => {
  const workflowToolNames = await readWorkflowToolNames();
  assert.ok(workflowToolNames.length > 0, "workflows-manifest must yield at least one tool");
  const unclassified = workflowToolNames.filter(
    (n) => !CLI_TOOLS.has(n) && !MCP_RESIDUE.has(n),
  );
  assert.deepStrictEqual(
    unclassified,
    [],
    `every workflow tool must be in CLI_TOOLS or MCP_RESIDUE; unclassified: ${JSON.stringify(unclassified)}. ` +
      `Add it to CLI_READ_TOOLS / CLI_WRITE_TOOLS (in core/cli-tools.js) for CLI portability, or to MCP_RESIDUE in this test with a reason from the taxonomy.`,
  );
});

test("CLI_TOOLS and MCP_RESIDUE are disjoint (single-bucket invariant)", () => {
  for (const t of CLI_TOOLS) {
    assert.ok(
      !MCP_RESIDUE.has(t),
      `tool ${t} appears in both CLI_TOOLS and MCP_RESIDUE — single-bucket invariant violated`,
    );
  }
});

test("every MCP_RESIDUE entry declares a known reason tag", () => {
  for (const [name, reason] of MCP_RESIDUE) {
    assert.ok(
      MCP_RESIDUE_REASONS.has(reason),
      `MCP_RESIDUE entry ${name} uses undeclared reason tag ${JSON.stringify(reason)}; declared tags: ${[...MCP_RESIDUE_REASONS].join(", ")}`,
    );
  }
});

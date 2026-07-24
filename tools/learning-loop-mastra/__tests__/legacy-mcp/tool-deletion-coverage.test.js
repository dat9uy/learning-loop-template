import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, "..", "..", "tools");
const manifestPath = join(toolsDir, "manifest.json");
const agentManifestPath = join(__dirname, "..", "..", "agent-manifest.json");

const DELETED_TOOLS = [
  "capability_generate",
  "capability_list_probes",
  "capability_list_verified",
  "index_extract",
  "index_search",
  "index_update_claim",
  "record_create_observation",
  "record_update_observation",
  "workflow_convert_evidence",
  "workflow_verify_evidence",
  "workflow_external_decision",
  "workflow_candidate_to_experiment",
  "workflow_vendor_doc_assist",
  "record_create_decision",
  "record_update_decision",
  "record_create_experiment",
  "record_update_experiment",
  "record_create_risk",
  "record_update_risk",
  "record_delete",
  "budget_check",
  "workflow_product_build",
  "index_validate",
  "index_validate_plans",
];

// Strip full-line // comments (manifest.json uses JSONC; see tools/manifest.json
// header for the rule — inline comments and trailing commas are not allowed).
const manifestRaw = readFileSync(manifestPath, "utf8")
  .replace(/^\s*\/\/.*$/gm, "");
const manifest = JSON.parse(manifestRaw);
const agentManifest = JSON.parse(readFileSync(agentManifestPath, "utf8"));

// 1. Manifest has 35 entries (was 32; runtime_state_pause/resume/stop added
// for the in-band tracking lifecycle).
await test("manifest has 35 entries", () => {
  assert.strictEqual(manifest.length, 35, `Expected 35, got ${manifest.length}`);
});

// 2. No deleted tool appears in manifest
for (const toolName of DELETED_TOOLS) {
  await test(`manifest does not contain ${toolName}`, () => {
    const found = manifest.some((m) => m.export === `${toolName}Tool` || m.file.includes(toolName.replace(/_/g, "-")));
    assert.strictEqual(found, false, `${toolName} should not be in manifest`);
  });
}

// 3. No deleted tool file exists on disk
const toolFiles = readdirSync(toolsDir);
for (const toolName of DELETED_TOOLS) {
  const fileName = toolName.replace(/_/g, "-") + "-tool.js";
  await test(`tool file ${fileName} does not exist`, () => {
    assert.strictEqual(toolFiles.includes(fileName), false, `${fileName} should be deleted`);
  });
}

// 4. agent-manifest.json does not have capability group
await test("agent-manifest does not have capability group", () => {
  assert.strictEqual(agentManifest.groups.capability, undefined, "capability group should be removed");
});

// 5. agent-manifest.json does not have index group
await test("agent-manifest does not have index group", () => {
  assert.strictEqual(agentManifest.groups.index, undefined, "index group should be removed");
});

// 6. agent-manifest.json does not have record_crud group
await test("agent-manifest does not have record_crud group", () => {
  assert.strictEqual(agentManifest.groups.record_crud, undefined, "record_crud group should be removed");
});

// 7. agent-manifest.json does not have budget group
await test("agent-manifest does not have budget group", () => {
  assert.strictEqual(agentManifest.groups.budget, undefined, "budget group should be removed");
});

// 8. agent-manifest.json workflow group has 11 tools after intake-chain deprecation (6 run_workflow_* + 3 mastra_workflow_* + 2 storage)
await test("agent-manifest workflow group has 11 tools", () => {
  assert.strictEqual(agentManifest.groups.workflow.tools.length, 11);
  // 6 in-scope workflows migrated to Mastra createWorkflow in Phase D Plan 1.
  const migratedInThisPlan = [
    "workflow_classify_prompt",
    "workflow_prepare_runtime_request",
    "workflow_self_improvement",
    "workflow_intentional_skip",
    "workflow_report_phase_status",
    "workflow_runtime_probe",
  ];
  // 2 intake-chain workflows deleted in this plan; check via run_<id> MCP names.
  const deletedInThisPlan = [
    "workflow_intake_orient",
    "workflow_intake_plan",
  ];
  // 5 workflows deleted in earlier phases; kept here as a regression guard.
  const historicallyDeleted = [
    "workflow_convert_evidence",
    "workflow_verify_evidence",
    "workflow_external_decision",
    "workflow_candidate_to_experiment",
    "workflow_vendor_doc_assist",
  ];
  // migratedInThisPlan are the 6 surviving run_workflow_* tools; assert they ARE
  // registered (load-bearing — the bare-name check was a phantom no-op).
  for (const tool of migratedInThisPlan) {
    assert.strictEqual(agentManifest.groups.workflow.tools.includes(`run_${tool}`), true, `run_${tool} should be in workflow group`);
  }
  for (const tool of [...deletedInThisPlan, ...historicallyDeleted]) {
    assert.strictEqual(agentManifest.groups.workflow.tools.includes(`run_${tool}`), false, `run_${tool} should not be in workflow group`);
  }
});

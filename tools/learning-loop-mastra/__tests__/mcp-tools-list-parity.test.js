// Test layering rationale: unit tests in `coerce-correctness.test.js` lock the
// shim's transformation logic at the zod API level (cheap, fast, exhaustive
// across 7 migration cases). This e2e test locks the full path through
// Mastra's `MCPServer.convertSchema` → `standardSchemaToJSONSchema` (one
// server spawn, ~400ms, catches SDK regressions the unit test can't see).
// Both layers are needed because they catch different classes of regressions.
import { describe, test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";

// Tools whose inputSchemas use the migration's preprocess + guarded-boolean
// wrappers. These are the load-bearing assertions — if the shim or override
// mechanism regresses, these tests will fail loudly.
//
// Note: "migrated" here means "uses z.preprocess(stripEnvelope, ...) or
// z.union([z.boolean(), z.string()]).transform(strictBooleanGuard) in its
// inputSchema". Other tools (e.g. tools using plain zod primitives) pass
// through the shim unchanged; they're covered by the universal contract test
// in coerce-correctness.test.js, not here.
const MIGRATED_TOOL_NAMES = [
  "mastra_meta_state_sweep",
  "mastra_meta_state_archive",
  "mastra_meta_state_resolve",
  "mastra_meta_state_promote_rule",
  "mastra_meta_state_check_grounding",
  "mastra_meta_state_query_drift",
  "mastra_meta_state_derive_status",
  "mastra_meta_state_list",
  "run_workflow_self_improvement",
  "mastra_workflow_generate_prompt",
  // "mastra_trigger_workflow" intentionally omitted: server logs
  // "registered 39 of 39" with the current manifest, but the
  // trigger-workflow module's `legacy.name` is `workflowTriggerTool` and
  // the actual exposed name is `mastra_workflow_trigger` (different from
  // the migration touch list which used a guessed snake_case mapping).
  // Out of scope — re-add once trigger-workflow naming is reconciled.
];

describe("mcp tools/list parity — JSON Schema contract for migration-touched tools", () => {
  let tools;
  let byName;

  beforeAll(async () => {
    await withMcpServer(async (handles) => {
      tools = await handles.listTools();
      byName = new Map(tools.map((t) => [t.name, t]));
    });
  }, 15000);

  // Test 1 (universal contract): every tool's inputSchema is a real object
  // schema, not the bypass sentinel. Catches the Q3 bug class.
  test("every tool has an object inputSchema with type:object and properties", { timeout: 5000 }, () => {
    for (const t of tools) {
      assert.ok(t.inputSchema && typeof t.inputSchema === "object", `${t.name}: inputSchema must be an object`);
      assert.notDeepEqual(t.inputSchema, { $ref: "#" }, `${t.name}: inputSchema must NOT be the bypass sentinel`);
      assert.strictEqual(t.inputSchema.type, "object", `${t.name}: inputSchema.type must be "object"`);
      assert.ok(t.inputSchema.properties && typeof t.inputSchema.properties === "object", `${t.name}: inputSchema must have a properties object`);
    }
  });

  // Test 2 (per-tool — read-only sweep): meta_state_sweep lost its `apply`
  // mode in Plan 260707-0812 Phase 3. The schema is now `{}` (empty). This test
  // locks the read-only contract: no `apply` property means sweep cannot
  // mutate the registry. Replaces the old guarded-boolean pipe-collapse proof
  // (the schema-parity.js pipe-collapse branch is still exercised by the
  // universal contract test above on other tools' schemas).
  test("meta_state_sweep has no apply property (read-only, apply mode removed)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_sweep");
    assert.ok(t, "mastra_meta_state_sweep must be registered");
    assert.strictEqual(
      Object.keys(t.inputSchema.properties).length, 0,
      `sweep inputSchema must have no properties (got ${JSON.stringify(Object.keys(t.inputSchema.properties))})`,
    );
    assert.strictEqual(t.inputSchema.properties.apply, undefined,
      "apply property must NOT exist — sweep is read-only (Plan 260707-0812 Phase 3 removed apply mode)");
  });

  // Test 3 (per-tool — preprocess + default([])): meta_state_archive.candidates
  // must have default:[]. This is the load-bearing proof that schema-parity.js
  // lines 43-48 (default-recovery branch) ran.
  test("meta_state_archive.candidates has default:[] (preprocess + default recovery)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_archive");
    assert.ok(t, "mastra_meta_state_archive must be registered");
    const candidates = t.inputSchema.properties.candidates;
    assert.ok(candidates, "candidates property must exist");
    assert.strictEqual(candidates.type, "array", "candidates.type must be array");
    assert.deepEqual(candidates.default, [], "candidates.default must be [] (shim's default recovery)");
    assert.strictEqual(candidates.items?.type, "string", "candidates.items.type must be string");
  });

  // Test 4 (per-tool — preprocess inside z.object): meta_state_resolve.cascade_from
  // must be array of string. This is the load-bearing proof that schema-parity.js
  // lines 62-77 (recursive object rebuild) ran.
  test("meta_state_resolve.cascade_from is array of string (preprocess inside z.object)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_resolve");
    assert.ok(t, "mastra_meta_state_resolve must be registered");
    const cascade = t.inputSchema.properties.cascade_from;
    assert.ok(cascade, "cascade_from property must exist");
    assert.strictEqual(cascade.type, "array", "cascade_from.type must be array");
    assert.strictEqual(cascade.items?.type, "string", "cascade_from.items.type must be string");
  });
});

// Test layering rationale: unit tests in `coerce-correctness.test.js` lock the
// shim's transformation logic at the zod API level (cheap, fast, exhaustive
// across 7 migration cases). This e2e test locks the full path through
// Mastra's `MCPServer.convertSchema` → `standardSchemaToJSONSchema` (one
// server spawn, ~400ms, catches SDK regressions the unit test can't see).
// Both layers are needed because they catch different classes of regressions.
import { describe, test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withMcpServer } from "./with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// (The former MIGRATED_TOOL_NAMES list was dropped: it was declared but never
// referenced by any assertion — a phantom. The real guarantee for the one
// re-homed workflow tool is the per-tool parity test below, which compares
// the live MCP parity view against the captured oracle fixture.)

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
  // mode. The schema is now `{}` (empty). This test
  // locks the read-only contract: no `apply` property means sweep cannot
  // mutate the registry. Replaces the old guarded-boolean pipe-collapse proof
  // (the schema-parity.js pipe-collapse branch is still exercised by the
  // universal contract test above on other tools' schemas).
  test("mastra_workflow_self_improvement parity view matches the oracle fixture (incl. per-field stripEnvelope)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_workflow_self_improvement");
    assert.ok(t, "mastra_workflow_self_improvement must be registered");
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, "fixtures", "workflow-oracles", "workflow_self_improvement.json"),
        "utf8",
      ),
    );
    const live = { ...t.inputSchema };
    const oracle = { ...fixture.schema };
    // Schema-view-only difference tolerated: the manifest-handler path emits
    // additionalProperties:false where the workflow parity view did not. The
    // load-bearing guarantee is fields/descriptions/required (incl. the
    // per-field stripEnvelope shape surviving the unwrap).
    delete live.$schema;
    delete oracle.$schema;
    delete live.additionalProperties;
    delete oracle.additionalProperties;
    assert.deepStrictEqual(live, oracle);
  });

  test("meta_state_sweep has no apply property (read-only, apply mode removed)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_sweep");
    assert.ok(t, "mastra_meta_state_sweep must be registered");
    assert.strictEqual(
      Object.keys(t.inputSchema.properties).length, 0,
      `sweep inputSchema must have no properties (got ${JSON.stringify(Object.keys(t.inputSchema.properties))})`,
    );
    assert.strictEqual(t.inputSchema.properties.apply, undefined,
      "apply property must NOT exist — sweep is read-only (apply mode removed)");
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

  // Test 4 (per-tool — migration-touched schemas): `meta_state_resolve` lost
  // `cascade_from` (the cascade writer was removed; close a stale parent by
  // calling `meta_state_resolve` on it directly). `meta_state_accept` was
  // added (flips open→accepted). Pin the CURRENT shipped schemas so a future
  // drift that re-adds `cascade_from` or drops `meta_state_accept` fails loud.
  test("meta_state_resolve.cascade_from removed; meta_state_accept registered (migration-touched schemas)", { timeout: 5000 }, () => {
    const resolve = byName.get("mastra_meta_state_resolve");
    assert.ok(resolve, "mastra_meta_state_resolve must be registered");
    assert.strictEqual(
      resolve.inputSchema.properties.cascade_from, undefined,
      "cascade_from was removed from meta_state_resolve (cascade writer dropped)",
    );
    const accept = byName.get("mastra_meta_state_accept");
    assert.ok(accept, "mastra_meta_state_accept must be registered (added by the migration)");
    assert.ok(accept.inputSchema.properties.id, "meta_state_accept must declare an id property");
  });

  // Test 5 (per-tool — steering layer): meta_state_patch.patch must
  // declare minProperties >= 1 on the model-visible JSON schema so the empty-{}
  // safe emission (verified root cause: union of four .partial().strict() branches)
  // is rejected pre-invocation. Generation-only: .parse({}) still succeeds at the
  // Zod layer (the runtime empty_patch check is the safety net). Other tools
  // must be unaffected — confirms the hints seam is scoped, not global.
  test("meta_state_patch.patch declares minProperties:1 (steering layer)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_patch");
    assert.ok(t, "mastra_meta_state_patch must be registered");
    const patchProp = t.inputSchema.properties?.patch;
    assert.ok(patchProp, "patch property must exist");
    assert.ok(
      typeof patchProp.minProperties === "number" && patchProp.minProperties >= 1,
      `patch.minProperties must be >= 1 (got ${JSON.stringify(patchProp.minProperties)})`,
    );
  });

  // Test 6 (counter-assert): the parity hints seam must not bleed into other
  // tools' schemas. meta_state_list takes a filter object — its properties
  // must NOT carry an injected minProperties (no hint is declared for it).
  test("meta_state_list unaffected by parity hints seam (no minProperties injection)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_list");
    assert.ok(t, "mastra_meta_state_list must be registered");
    for (const [key, prop] of Object.entries(t.inputSchema.properties ?? {})) {
      assert.strictEqual(
        prop.minProperties, undefined,
        `meta_state_list.${key} must NOT carry minProperties (hints seam must be scoped)`,
      );
    }
  });

  // Test 7 (separation invariant): the
  // generation-only override is on the parity JSON-schema side. The runtime
  // Zod schema must still parse({}) successfully — the empty_patch runtime
  // check is the safety net, not the schema. This pins steering (schema)
  // vs safety-net (runtime) so a future refactor cannot collapse them.
  test("meta_state_patch runtime Zod schema still parses {} (generation-only steering)", { timeout: 5000 }, async () => {
    const { metaStatePatchTool } = await import("../tools/handlers/meta-state-patch-tool.js");
    const parsed = metaStatePatchTool.schema.patch.safeParse({});
    assert.ok(
      parsed.success,
      `Zod .parse({}) must succeed (runtime empty_patch check is the safety net, not the schema). Got: ${JSON.stringify(parsed.error?.issues)}`,
    );
  });
});

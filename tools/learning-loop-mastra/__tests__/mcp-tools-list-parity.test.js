// MCP schema/transport parity — direct createLoopTool conversion.
//
// Single-surface contract: MCP registers only the 8-tool residue, so the
// live tools/list surface can no longer assert per-tool schemas for CLI tools.
// Instead, the schema-conversion path (createLoopTool → parity JSON schema)
// is exercised DIRECTLY, preserving the MCP schema-conversion coverage (the
// same machinery Mastra's MCPServer.convertSchema runs). The live MCP
// transport/shape coverage for the residue lives in mcp-protocol-e2e.test.cjs.
//
// This retains the migration-touched schema checks: free-form patch with the
// steering minProperties hint, no cascade_from, meta_state_accept registered,
// and the universal contract that every tool's inputSchema is a real object
// (not the bypass sentinel).
import { describe, test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toJSONSchema } from "zod";
import { createLoopTool } from "../mastra/create-loop-tool.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

async function loadAllSchemas() {
  const text = readFileSync(join(PKG_ROOT, "tools", "manifest.json"), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const manifest = JSON.parse(text);
  const tools = [];
  for (const entry of manifest) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const legacy = mod[entry.export];
    if (!legacy) continue;
    const tool = createLoopTool({
      id: "mastra_" + legacy.name,
      description: legacy.description,
      inputSchema: legacy.schema,
      execute: async () => ({}),
      pathFields: entry.pathFields ?? [],
      parityHints: legacy.parityJsonSchemaHints ?? {},
    });
    const schema = JSON.parse(JSON.stringify(toJSONSchema(tool.inputSchema, { target: "draft-7", io: "input" })));
    tools.push({ name: tool.id, description: tool.description, inputSchema: schema });
  }
  return tools;
}

describe("mcp schema parity — direct createLoopTool conversion", () => {
  let tools;
  let byName;

  beforeAll(async () => {
    tools = await loadAllSchemas();
    byName = new Map(tools.map((t) => [t.name, t]));
  }, 15000);

  // Test 1 (universal contract): every tool's inputSchema is a real object
  // schema, not the bypass sentinel. Catches the Q3 bug class.
  test("every tool has an object inputSchema with type:object and properties", () => {
    for (const t of tools) {
      assert.ok(t.inputSchema && typeof t.inputSchema === "object", `${t.name}: inputSchema must be an object`);
      assert.notDeepEqual(t.inputSchema, { $ref: "#" }, `${t.name}: inputSchema must NOT be the bypass sentinel`);
      assert.strictEqual(t.inputSchema.type, "object", `${t.name}: inputSchema.type must be "object"`);
      assert.ok(t.inputSchema.properties && typeof t.inputSchema.properties === "object", `${t.name}: inputSchema must have a properties object`);
    }
  });

  test("mastra_workflow_self_improvement parity view matches the oracle fixture (incl. per-field stripEnvelope)", () => {
    const t = byName.get("mastra_workflow_self_improvement");
    assert.ok(t, "mastra_workflow_self_improvement must exist in the manifest");
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, "fixtures", "workflow-oracles", "workflow_self_improvement.json"),
        "utf8",
      ),
    );
    const live = { ...t.inputSchema };
    const oracle = { ...fixture.schema };
    delete live.$schema;
    delete oracle.$schema;
    delete live.additionalProperties;
    delete oracle.additionalProperties;
    assert.deepStrictEqual(live, oracle);
  });

  test("meta_state_sweep has no apply property (read-only, apply mode removed)", () => {
    const t = byName.get("mastra_meta_state_sweep");
    assert.ok(t, "mastra_meta_state_sweep must exist in the manifest");
    assert.strictEqual(
      Object.keys(t.inputSchema.properties).length, 0,
      `sweep inputSchema must have no properties (got ${JSON.stringify(Object.keys(t.inputSchema.properties))})`,
    );
    assert.strictEqual(t.inputSchema.properties.apply, undefined,
      "apply property must NOT exist — sweep is read-only (apply mode removed)");
  });

  test("meta_state_archive.candidates has default:[] (preprocess + default recovery)", () => {
    const t = byName.get("mastra_meta_state_archive");
    assert.ok(t, "mastra_meta_state_archive must exist in the manifest");
    const candidates = t.inputSchema.properties.candidates;
    assert.ok(candidates, "candidates property must exist");
    assert.strictEqual(candidates.type, "array", "candidates.type must be array");
    assert.deepEqual(candidates.default, [], "candidates.default must be [] (shim's default recovery)");
    assert.strictEqual(candidates.items?.type, "string", "candidates.items.type must be string");
  });

  test("meta_state_resolve.cascade_from removed; meta_state_accept registered (migration-touched schemas)", () => {
    const resolve = byName.get("mastra_meta_state_resolve");
    assert.ok(resolve, "mastra_meta_state_resolve must exist in the manifest");
    assert.strictEqual(
      resolve.inputSchema.properties.cascade_from, undefined,
      "cascade_from was removed from meta_state_resolve (cascade writer dropped)",
    );
    const accept = byName.get("mastra_meta_state_accept");
    assert.ok(accept, "mastra_meta_state_accept must exist (added by the migration)");
    assert.ok(accept.inputSchema.properties.id, "meta_state_accept must declare an id property");
  });

  test("meta_state_patch.patch declares minProperties:1 (steering layer)", () => {
    const t = byName.get("mastra_meta_state_patch");
    assert.ok(t, "mastra_meta_state_patch must exist in the manifest");
    const patchProp = t.inputSchema.properties?.patch;
    assert.ok(patchProp, "patch property must exist");
    assert.ok(
      typeof patchProp.minProperties === "number" && patchProp.minProperties >= 1,
      `patch.minProperties must be >= 1 (got ${JSON.stringify(patchProp.minProperties)})`,
    );
  });

  test("meta_state_list unaffected by parity hints seam (no minProperties injection)", () => {
    const t = byName.get("mastra_meta_state_list");
    assert.ok(t, "mastra_meta_state_list must exist in the manifest");
    for (const [key, prop] of Object.entries(t.inputSchema.properties ?? {})) {
      assert.strictEqual(
        prop.minProperties, undefined,
        `meta_state_list.${key} must NOT carry minProperties (hints seam must be scoped)`,
      );
    }
  });

  test("meta_state_patch runtime Zod schema still parses {} (generation-only steering)", async () => {
    const { metaStatePatchTool } = await import("../tools/handlers/meta-state-patch-tool.js");
    const parsed = metaStatePatchTool.schema.patch.safeParse({});
    assert.ok(
      parsed.success,
      `Zod .parse({}) must succeed (runtime empty_patch check is the safety net, not the schema). Got: ${JSON.stringify(parsed.error?.issues)}`,
    );
  });
});

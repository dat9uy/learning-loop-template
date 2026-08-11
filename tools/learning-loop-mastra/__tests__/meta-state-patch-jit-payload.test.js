import { test } from "vitest";
import assert from "node:assert/strict";
import { metaStatePatchTool } from "../tools/handlers/meta-state-patch-tool.js";
import { metaStateReportTool } from "../tools/handlers/meta-state-report-tool.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalRoot = process.env.GATE_ROOT;

async function reportFinding() {
  return JSON.parse((await metaStateReportTool.handler({
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "JIT payload fixture finding (minimum twenty chars)",
  })).content[0].text);
}

test("meta_state_patch parity JSON schema is free-form with a minProperties hint", async () => {
  // meta_state_patch is a CLI tool (single-surface contract); MCP does not
  // register it. The wire JSON schema is produced by createLoopTool's
  // attachParityJSONSchema — the exact conversion the MCP server applied.
  // The steering hint (minProperties:1) lives on the parity JSON schema.
  const { createLoopTool } = await import("../mastra/create-loop-tool.js");
  const { toJSONSchema } = await import("zod");
  const tool = createLoopTool({
    id: "mastra_meta_state_patch",
    description: metaStatePatchTool.description,
    inputSchema: metaStatePatchTool.schema,
    execute: async () => ({}),
    pathFields: [],
    parityHints: metaStatePatchTool.parityJsonSchemaHints ?? {},
  });
  const parityJSON = JSON.parse(JSON.stringify(toJSONSchema(tool.inputSchema, { target: "draft-7", io: "input" })));
  const patchProp = parityJSON.properties?.patch;
  assert.ok(patchProp, "patch property must exist in the parity schema");
  assert.equal(patchProp.anyOf, undefined);
  assert.equal(patchProp.minProperties, 1, "steering hint must render minProperties:1");
  assert.equal(patchProp.type, "object");
  assert.match(tool.description, /description/);
  assert.match(tool.description, /evidence_code_ref/);
});

test("invalid and empty patch responses carry the selected branch schema", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "patch-jit-test-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    const { id } = await reportFinding();
    const empty = JSON.parse((await metaStatePatchTool.handler({
      id,
      entry_kind: "finding",
      patch: {},
    })).content[0].text);
    assert.ok(empty.patch_schema?.properties?.description);
    assert.equal(empty.patch_schema.anyOf, undefined);

    const invalid = JSON.parse((await metaStatePatchTool.handler({
      id,
      entry_kind: "finding",
      patch: { description: "short" },
    })).content[0].text);
    assert.equal(invalid.reason, "invalid_field");
    assert.ok(invalid.patch_schema?.properties?.description);
    assert.ok(invalid.field_errors[0].glossary === undefined || typeof invalid.field_errors[0].glossary.meaning === "string");
  } finally {
    if (originalRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalRoot;
  }
});

test("free-form patch schema preserves recursive MCP envelope normalization", () => {
  const parsed = metaStatePatchTool.schema.patch.safeParse({
    proposed_design_for: { item: ["rule-envelope-fixture"] },
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.proposed_design_for, ["rule-envelope-fixture"]);
  assert.equal(metaStatePatchTool.schema.patch.safeParse({}).success, true);
});


test("batch invalid_field responses carry the selected operation branch schema", async () => {
  const { metaStateBatchTool } = await import("../tools/handlers/meta-state-batch-tool.js");
  const tempRoot = mkdtempSync(join(tmpdir(), "batch-jit-test-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateReportTool: reportTool } = await import("../tools/handlers/meta-state-report-tool.js");
    const { id } = JSON.parse((await reportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Batch JIT payload fixture (minimum twenty chars)",
    })).content[0].text);
    const result = JSON.parse((await metaStateBatchTool.handler({
      operations: [{ op: "update", id, category: "not-a-real-category" }],
    })).content[0].text);
    assert.equal(result.reason, "invalid_field");
    assert.ok(result.patch_schema?.properties?.description);
  } finally {
    if (originalRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalRoot;
  }
});

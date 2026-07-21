import { test } from "vitest";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";
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

test("meta_state_patch wire schema is free-form with a minProperties hint", async () => {
  await withMcpServer(async ({ listTools }) => {
    const patch = (await listTools()).find((tool) => tool.name === "mastra_meta_state_patch");
    assert.ok(patch);
    assert.equal(patch.inputSchema.properties.patch.anyOf, undefined);
    assert.equal(patch.inputSchema.properties.patch.minProperties, 1);
    assert.equal(patch.inputSchema.properties.patch.type, "object");
    assert.match(patch.description, /description/);
    assert.match(patch.description, /evidence_code_ref/);
  });
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

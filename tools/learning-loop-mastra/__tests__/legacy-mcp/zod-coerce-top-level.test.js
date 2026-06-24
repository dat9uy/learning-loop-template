import { test } from "node:test";
import assert from "node:assert/strict";
import { readRegistry } from "../../core/legacy/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// Stdio smoke test: meta_state_report "true" coercion + tools/list schema preservation.
// Both tests share one server instance to avoid spawn overhead.
test("stdio smoke: mechanism_check coercion + tools/list schema preservation", async () => {
  await withMcpServer(async ({ callTool, listTools, tempRoot }) => {
    // 1. Test mechanism_check coercion via stdio
    const result = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description:
        "Test boolean wire-format coercion via stdio transport (min 20 chars)",
      evidence_code_ref: "tools/test.js",
      mechanism_check: "true",
    });
    assert.equal(
      result.reported,
      true,
      `Failed to report finding: ${JSON.stringify(result)}`,
    );

    const entries = readRegistry(tempRoot);
    const entry = entries.find((e) => e.id === result.id);
    assert(entry, "entry not found in registry");
    assert.equal(entry.mechanism_check, true);

    // 2. Test tools/list schema preservation
    const tools = await listTools();
    const proposeDesign = tools.find(
      (t) => t.name === "mastra_meta_state_propose_design",
    );
    assert(proposeDesign, "meta_state_propose_design not found in tools/list");
    assert(proposeDesign.inputSchema, "inputSchema missing");
    const schema = proposeDesign.inputSchema;
    assert(
      schema.properties && schema.properties.proposed_design_for,
      "proposed_design_for missing from schema",
    );
    assert.equal(
      schema.properties.proposed_design_for.type,
      "array",
      "proposed_design_for should be array type",
    );
    assert(
      schema.properties && schema.properties.addresses,
      "addresses missing from schema",
    );
    assert.equal(
      schema.properties.addresses.type,
      "array",
      "addresses should be array type",
    );
  });
});

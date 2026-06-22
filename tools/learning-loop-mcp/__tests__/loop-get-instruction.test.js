import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loopGetInstructionTool } from "../tools/loop-get-instruction-tool.js";
import { withMcpServer } from "../../learning-loop-mastra/__tests__/with-mcp-server.js";

describe("loop_get_instruction", () => {
  test("returns hint by named slug 'reopens-script'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "reopens-script" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "reopens-script");
    assert.strictEqual(parsed.results[0].index, 10);
    assert.ok(parsed.results[0].hint.includes("meta_state_relationship_validate"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("returns hint by numeric index", async () => {
    const result = await loopGetInstructionTool.handler({ key: 0 });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.results[0].index, 0);
    assert.ok(parsed.results[0].hint.includes("evidence_code_ref"));
  });

  test("accepts an array of keys and returns multiple results", async () => {
    const result = await loopGetInstructionTool.handler({
      key: ["internalization-rule", 10, "loop-get-instruction"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 3);
    assert.ok(parsed.results.every((r) => r.hint && r.suggestion));
  });

  test("returns error entry for unknown slug", async () => {
    const result = await loopGetInstructionTool.handler({ key: "no-such-hint" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.ok(parsed.results[0].error);
    assert.ok(parsed.results[0].error.includes("no-such-hint"));
  });

  test("returns hint by named slug 'narrow-query'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "narrow-query" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "narrow-query");
    assert.strictEqual(parsed.results[0].index, 12);
    assert.ok(parsed.results[0].hint.includes("meta_state_list"));
    assert.ok(parsed.results[0].hint.includes("id:"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("schema advertises key as string | number | array", () => {
    const keySchema = loopGetInstructionTool.schema.key;
    assert.ok(keySchema, "schema.key should be defined");
  });
});

// Stdio transport regression test: top-level array input over MCP stdio
// must round-trip without being wrapped to {item: [...]} by the
// wire-format coercion helper. Pairs with the meta-260610T1458Z fix.
describe("loop_get_instruction (stdio transport)", () => {
  test("accepts top-level array key input over stdio", async () => {
    await withMcpServer(async ({ callTool }) => {
      const result = await callTool("mastra_loop_get_instruction", {
        key: ["reopens-script", "internalization-rule"],
      });

      assert.strictEqual(result.count, 2, "array of 2 keys should return count=2");
      assert.strictEqual(result.results.length, 2);
      const reopens = result.results.find((r) => r.index === 10);
      const internalization = result.results.find((r) => r.index === 0);
      assert.ok(reopens, "results should contain the reopens-script hint (index 10)");
      assert.ok(internalization, "results should contain the internalization-rule hint (index 0)");
      assert.ok(reopens.hint.includes("meta_state_relationship_validate"));
      assert.ok(internalization.hint.includes("evidence_code_ref"));
    });
  });
});

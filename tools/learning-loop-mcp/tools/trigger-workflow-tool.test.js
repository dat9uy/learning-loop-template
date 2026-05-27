import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workflowTriggerTool } from "./trigger-workflow-tool.js";

const { handler } = workflowTriggerTool;

describe("workflow_trigger", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function setupTemp() {
    tempDir = mkdtempSync(join(tmpdir(), "trigger-test-"));
    process.env.GATE_ROOT = tempDir;
    mkdirSync(join(tempDir, ".claude", "coordination"), { recursive: true });
  }

  function cleanup() {
    process.env.GATE_ROOT = originalEnv;
  }

  test("returns tool list for evidence-changed", async () => {
    setupTemp();
    const result = await handler({ name: "evidence-changed" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, true);
    assert.deepStrictEqual(parsed.recommended_tools, ["index_extract", "index_validate"]);
    assert.ok(parsed.reasoning.includes("evidence-changed"));
    cleanup();
  });

  test("returns tool list for observation-changed", async () => {
    setupTemp();
    const result = await handler({ name: "observation-changed" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, true);
    assert.deepStrictEqual(parsed.recommended_tools, ["index_validate"]);
    cleanup();
  });

  test("returns tool list for capability-changed", async () => {
    setupTemp();
    const result = await handler({ name: "capability-changed" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, true);
    assert.deepStrictEqual(parsed.recommended_tools, ["index_validate", "capability_generate"]);
    cleanup();
  });

  test("returns tool list for index-changed", async () => {
    setupTemp();
    const result = await handler({ name: "index-changed" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, true);
    assert.deepStrictEqual(parsed.recommended_tools, ["index_validate"]);
    cleanup();
  });

  test("returns not_found for unknown workflow", async () => {
    setupTemp();
    const result = await handler({ name: "nonexistent" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, false);
    assert.strictEqual(parsed.reason, "not_found");
    cleanup();
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowGeneratePromptTool } from "./workflow-generate-prompt-tool.js";

describe("workflowGeneratePromptTool", () => {
  it("evidence blueprint returns correct shape", async () => {
    const result = await workflowGeneratePromptTool.handler({
      blueprint: "evidence",
      skeleton: "generic-learning-loop",
      context: { work_context: "/tmp/test" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.prompt === "string");
    assert.ok(parsed.prompt.length > 0);
    assert.ok(Array.isArray(parsed.constraints));
    assert.ok(Array.isArray(parsed.required_records));
    assert.ok(Array.isArray(parsed.suggested_tools));
    assert.ok(typeof parsed.budget_context === "object");
    assert.ok(Array.isArray(parsed.approval_gates));
  });

  it("state-gated blueprint returns correct shape", async () => {
    const result = await workflowGeneratePromptTool.handler({
      blueprint: "state-gated",
      skeleton: "blocked",
      context: { system: "test", resource: "api" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.prompt === "string");
    assert.ok(Array.isArray(parsed.constraints));
    assert.ok(Array.isArray(parsed.approval_gates));
  });

  it("product-build blueprint returns correct shape", async () => {
    const result = await workflowGeneratePromptTool.handler({
      blueprint: "product-build",
      skeleton: "pre-build",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.prompt === "string");
    assert.ok(Array.isArray(parsed.constraints));
    assert.ok(Array.isArray(parsed.suggested_tools));
  });

  it("experiment blueprint returns correct shape", async () => {
    const result = await workflowGeneratePromptTool.handler({
      blueprint: "experiment",
      skeleton: "experiment-planning",
      context: { goal: "test goal" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.prompt === "string");
    assert.ok(Array.isArray(parsed.constraints));
  });

  it("runtime-validation blueprint returns correct shape", async () => {
    const result = await workflowGeneratePromptTool.handler({
      blueprint: "runtime-validation",
      skeleton: "runtime-install-proof",
      context: { scope: "sandbox" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.prompt === "string");
    assert.ok(Array.isArray(parsed.constraints));
    assert.ok(Array.isArray(parsed.approval_gates));
  });
});

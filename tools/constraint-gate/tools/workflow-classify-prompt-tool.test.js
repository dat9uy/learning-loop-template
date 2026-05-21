import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowClassifyPromptTool } from "./workflow-classify-prompt-tool.js";

describe("workflowClassifyPromptTool", () => {
  it("returns error for empty prompt", async () => {
    const result = await workflowClassifyPromptTool.handler({ prompt: "" });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("empty"));
  });

  it("classifies evidence-style prompt as evidence", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "I found evidence that the bootstrap script creates a venv at home",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "evidence");
    assert.ok(parsed.confidence >= 0.5);
    assert.ok(Array.isArray(parsed.suggested_tools));
    assert.ok(parsed.suggested_tools.length > 0);
  });

  it("classifies product-style prompt as product", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "The product should expose REST endpoints for fundamental data",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "product");
    assert.ok(parsed.confidence >= 0.5);
    assert.ok(Array.isArray(parsed.suggested_tools));
  });

  it("classifies runtime command prompt as verification", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "Run pytest in a sandbox container to verify the install exits zero",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "verification");
    assert.ok(parsed.confidence >= 0.5);
    assert.ok(Array.isArray(parsed.suggested_tools));
  });

  it("classifies observation-style prompt as observation", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "Record an observation that the write gate blocks evidence files",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "observation");
    assert.ok(parsed.confidence >= 0.5);
  });

  it("classifies assertion-style prompt as assertion", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "Assert that the installer ignores precreated venv paths",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "assertion");
    assert.ok(parsed.confidence >= 0.5);
  });

  it("classifies skip-style prompt as skip", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "Skip verification for this minor docs change",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "skip");
    assert.ok(parsed.confidence >= 0.5);
  });

  it("classifies external decision prompt as external_decision", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "The user decided we should use OAuth instead of API keys",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "external_decision");
    assert.ok(parsed.confidence >= 0.5);
  });

  it("classifies self improvement prompt as self_improvement", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "How can we improve our classification heuristic",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "self_improvement");
    assert.ok(parsed.confidence >= 0.5);
  });
});

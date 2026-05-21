import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowIntakeOrientTool } from "./workflow-intake-orient-tool.js";

describe("workflowIntakeOrientTool", () => {
  it("basic orient returns non-empty index entries", async () => {
    const result = await workflowIntakeOrientTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.index_entries));
    assert.ok(parsed.index_entries.length > 0);
    assert.ok(Array.isArray(parsed.meta_triggers));
    assert.ok(Array.isArray(parsed.observations));
    assert.ok(Array.isArray(parsed.capability_files));
    assert.ok(Array.isArray(parsed.missing_decisions));
  });

  it("missing category returns error", async () => {
    const result = await workflowIntakeOrientTool.handler({ category: "" });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("category"));
  });

  it("capability scope filters capability files", async () => {
    const result = await workflowIntakeOrientTool.handler({ capability_scope: "fastapi" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.capability_files));
    const allMatch = parsed.capability_files.every((f) =>
      f.toLowerCase().includes("fastapi")
    );
    assert.ok(allMatch || parsed.capability_files.length === 0);
  });

  it("returns observations with status fields", async () => {
    const result = await workflowIntakeOrientTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.observations));
    if (parsed.observations.length > 0) {
      assert.ok(typeof parsed.observations[0].id === "string");
      assert.ok(typeof parsed.observations[0].status === "string");
    }
  });

  it("returns meta trigger filenames", async () => {
    const result = await workflowIntakeOrientTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.meta_triggers));
    assert.ok(parsed.meta_triggers.every((m) => typeof m === "string"));
  });
});

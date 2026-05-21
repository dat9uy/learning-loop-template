import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractIndexTool } from "./extract-index-tool.js";

describe("extractIndexTool", () => {
  it("dry run returns stats without writing", async () => {
    const result = await extractIndexTool.handler({ dry_run: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.stats === "object");
  });

  it("accepts capability filter", async () => {
    const result = await extractIndexTool.handler({ capability: "nonexistent", dry_run: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.stats === "object");
  });
});

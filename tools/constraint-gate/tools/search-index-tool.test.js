import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchIndexTool } from "./search-index-tool.js";

describe("searchIndexTool", () => {
  it("returns results with count", async () => {
    const result = await searchIndexTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.count === "number");
    assert.ok(Array.isArray(parsed.results));
  });

  it("filters by capability", async () => {
    const result = await searchIndexTool.handler({ capability: "nonexistent" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.count, 0);
    assert.equal(parsed.results.length, 0);
  });
});

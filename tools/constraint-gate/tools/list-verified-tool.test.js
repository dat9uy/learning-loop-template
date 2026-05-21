import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listVerifiedTool } from "./list-verified-tool.js";

describe("listVerifiedTool", () => {
  it("returns claims and evidence arrays", async () => {
    const result = await listVerifiedTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.claims));
    assert.ok(Array.isArray(parsed.evidence));
  });
});

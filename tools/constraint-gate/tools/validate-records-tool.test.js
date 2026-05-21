import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateRecordsTool } from "./validate-records-tool.js";

describe("validateRecordsTool", () => {
  it("returns valid: true with no errors for current repo", async () => {
    const result = await validateRecordsTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.valid, true);
    assert.ok(parsed.record_count > 0);
    assert.equal(parsed.errors.length, 0);
  });

  it("returns structured result with record_count", async () => {
    const result = await validateRecordsTool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.record_count === "number");
    assert.ok(Array.isArray(parsed.errors));
    assert.ok(Array.isArray(parsed.warnings));
  });

  it("accepts allow_disallowed_fixtures option", async () => {
    const result = await validateRecordsTool.handler({ allow_disallowed_fixtures: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.valid === "boolean");
  });
});

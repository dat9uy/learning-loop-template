import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listProbesTool } from "./list-probes-tool.js";

describe("listProbesTool", () => {
  it("returns probes for valid stack", async () => {
    const result = await listProbesTool.handler({ stack: "api" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.count === "number");
    assert.ok(Array.isArray(parsed.probes));
  });

  it("returns empty for non-existent stack", async () => {
    const result = await listProbesTool.handler({ stack: "nonexistent" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.count, 0);
    assert.equal(parsed.probes.length, 0);
  });
});

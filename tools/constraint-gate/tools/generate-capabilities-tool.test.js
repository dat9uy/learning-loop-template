import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateCapabilitiesTool } from "./generate-capabilities-tool.js";

describe("generateCapabilitiesTool", () => {
  it("dry run returns drift result", async () => {
    const result = await generateCapabilitiesTool.handler({ dry_run: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.drift === "boolean");
    assert.ok(Array.isArray(parsed.diffs));
  });

  it("accepts custom stacks", async () => {
    const result = await generateCapabilitiesTool.handler({
      dry_run: true,
      stacks: [{ name: "api", surfaces: ["HTTP/REST"] }],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.drift === "boolean");
  });
});

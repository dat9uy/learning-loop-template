import { test } from "vitest";
import assert from "node:assert/strict";

// Bucket A fixture: pure MCP-only test, no file I/O.
test("bucket A: mcp-only happy path", async () => {
  const result = await globalThis.mcpCall("loop_describe", { tier: "summary" });
  assert.ok(result);
});

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bucket B fixture: I/O only in beforeEach/afterEach (setup/teardown).
let tempDir;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "bucket-b-"));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test("bucket B: mcp call with setup/teardown I/O only", async () => {
  assert.ok(tempDir);
  const result = await globalThis.mcpCall("loop_describe", { tier: "summary" });
  assert.ok(result);
});

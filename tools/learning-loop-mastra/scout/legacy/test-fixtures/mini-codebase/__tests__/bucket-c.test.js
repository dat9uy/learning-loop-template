import { test } from "node:test";
import assert from "node:assert/strict";
import { writeEntry } from "../../core/meta-state.js";

// Bucket C fixture: direct writeEntry import (anti-pattern) inside test body.
test("bucket C: bypasses MCP with direct writeEntry import", async () => {
  // BUG: should call meta_state_report MCP tool, not writeEntry directly.
  const result = await writeEntry({ id: "x", category: "loop-anti-pattern" });
  assert.ok(result);
});

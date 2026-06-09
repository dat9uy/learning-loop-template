import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";
import { indexValidateTool } from "../tools/validate-records-tool.js";

test("registry validates against new schema after Phase 2 schema widening", async () => {
  const root = resolveRoot();
  if (!existsSync(join(root, "meta-state.jsonl"))) {
    // No registry in test env — skip
    return;
  }
  const result = await indexValidateTool.handler({ schema: "meta-state" });
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.valid, true, "registry must validate");
  assert.strictEqual(parsed.errors.length, 0);
});

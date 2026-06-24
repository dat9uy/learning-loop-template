import assert from "node:assert";
import { test } from "node:test";
import { isGlobScopeWhitelisted } from "../../core/gate-logic.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

await test("whitelists .claude/ prefix (was rejected before refactor)", () => {
  assert.strictEqual(isGlobScopeWhitelisted(".claude/skills/foo/**"), true);
  assert.strictEqual(isGlobScopeWhitelisted(".claude/coordination/hooks/*"), true);
});

await test("whitelists .factory/ prefix (no regression)", () => {
  assert.strictEqual(isGlobScopeWhitelisted(".factory/skills/foo/**"), true);
  assert.strictEqual(isGlobScopeWhitelisted(".factory/coordination/hooks/*"), true);
});

await test("whitelists non-surface prefixes (no regression)", () => {
  assert.strictEqual(isGlobScopeWhitelisted("product/foo/bar"), true);
  assert.strictEqual(isGlobScopeWhitelisted("docs/readme.md"), true);
  assert.strictEqual(isGlobScopeWhitelisted("plans/2026-06/test.md"), true);
  assert.strictEqual(isGlobScopeWhitelisted("tools/learning-loop-mastra/core/gate-logic.js"), true);
  assert.strictEqual(isGlobScopeWhitelisted("meta-state.jsonl"), true);
});

await test("rejects records/ and other non-whitelisted paths", () => {
  assert.strictEqual(isGlobScopeWhitelisted("records/observations/test.yaml"), false);
  assert.strictEqual(isGlobScopeWhitelisted("secrets/api-key.txt"), false);
  assert.strictEqual(isGlobScopeWhitelisted("~/.ssh/id_rsa"), false);
});

await test("rejects empty string and non-string input", () => {
  assert.strictEqual(isGlobScopeWhitelisted(""), false);
  assert.strictEqual(isGlobScopeWhitelisted(null), false);
  assert.strictEqual(isGlobScopeWhitelisted(undefined), false);
  assert.strictEqual(isGlobScopeWhitelisted(123), false);
});

await test("GLOB_SCOPE_WHITELIST parameterizes on SURFACES: source derives prefixes from SURFACES.map", () => {
  const src = readFileSync(join(__dirname, "../../core/gate-logic.js"), "utf8");
  assert.ok(src.includes("...SURFACES.map"), "GLOB_SCOPE_WHITELIST must derive prefixes from SURFACES.map(...)");
});

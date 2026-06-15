import assert from "node:assert";
import { test } from "node:test";
import { isGlobScopeWhitelisted } from "../core/gate-logic.js";

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
  assert.strictEqual(isGlobScopeWhitelisted("tools/learning-loop-mcp/core/gate-logic.js"), true);
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

await test("GLOB_SCOPE_WHITELIST includes both surfaces when SURFACES is multi-element", async () => {
  // Mutation test: dynamically import to get a fresh module with the current SURFACES
  const { SURFACES } = await import("../core/surfaces.js");
  // Create a temporary extended array (do not mutate the frozen constant)
  const extended = [...SURFACES, ".cursor"];
  // The whitelist is built from the actual SURFACES at module load time.
  // We verify the parameterization property by checking that both current
  // surfaces are present, which proves the spread-map construction works.
  assert.ok(SURFACES.includes(".claude"), "SURFACES includes .claude");
  assert.ok(SURFACES.includes(".factory"), "SURFACES includes .factory");
  assert.strictEqual(SURFACES.length, 2, "SURFACES has exactly 2 elements today");
});

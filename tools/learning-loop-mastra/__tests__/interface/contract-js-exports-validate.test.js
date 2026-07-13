import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CONTRACT_JS = join(import.meta.dirname, "..", "..", "interface", "contract.js");

test("contract.js exists", () => {
  assert.ok(existsSync(CONTRACT_JS), `expected ${CONTRACT_JS} to exist`);
});

test("contract.js exports validate as named export", async () => {
  const mod = await import(CONTRACT_JS);
  assert.equal(typeof mod.validate, "function", "expected validate to be a function");
});

test("contract.js exports REQUIREMENT_IDS constant", async () => {
  const mod = await import(CONTRACT_JS);
  assert.ok(Array.isArray(mod.REQUIREMENT_IDS), "expected REQUIREMENT_IDS to be an array");
  // Plan 5-Lite Phase 3: REQUIREMENT_IDS grew 7 → 10 with additive
  // Req #9 (.mastracode-config-presence), Req #10 (mastracode-session-start-pins-loop-surface),
  // and Req #11 (tools-manifest-has-path-fields). Req #8 is intentionally skipped (gap).
  assert.equal(mod.REQUIREMENT_IDS.length, 10, "expected 10 requirement IDs (5 base + Req #6 + #7 + #9 + #10 + #11)");
});

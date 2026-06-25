import { test } from "node:test";
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
  assert.equal(mod.REQUIREMENT_IDS.length, 5, "expected 5 requirement IDs");
});

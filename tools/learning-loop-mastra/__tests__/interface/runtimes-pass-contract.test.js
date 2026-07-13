import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import { validate } from "../../interface/contract.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

test("validate('claude-code') on real repo returns ok: true", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("claude-code", PROJECT_ROOT);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.ok(result.notes.includes("identity-marker-not-adopted"));
});

test("validate('droid') on real repo returns ok: true", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("droid", PROJECT_ROOT);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.ok(result.notes.includes("identity-marker-not-adopted"));
});

test("validate('mastra-code') on real repo returns ok: true (Phase E Plan 4 shipped .mastracode/)", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("mastra-code", PROJECT_ROOT);
  // Phase E Plan 4 Phase 2 shipped .mastracode/{mcp,hooks,settings,database}.json;
  // the contract validator now passes against the real repo.
  assert.equal(result.ok, true, `mastra-code must pass on real repo after Plan 4: missing=${JSON.stringify(result.missing)}`);
  assert.deepEqual(result.missing, []);
});

test("path_map includes all 7 requirement entries for claude-code", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("claude-code", PROJECT_ROOT);
  for (const id of ["hook-shim-set", "mcp-client-config", "skill-spec", "identity-marker", "settings-integration", "hook-declarative-config", "settings-no-bypass"]) {
    assert.ok(id in result.path_map, `expected path_map to contain "${id}"`);
  }
});

test("hook-shim-set path_map lists 4 shims (existence only, no universal_exists gate)", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("claude-code", PROJECT_ROOT);
  const shimCheck = result.path_map["hook-shim-set"];
  assert.equal(shimCheck.shims.length, 4, "expected 4 shims");
  for (const shim of shimCheck.shims) {
    // Red-team Finding F1: universal_exists is documented in path_map but NOT a gating assertion.
    assert.ok(typeof shim.path === "string", `${shim.name} path should be a string`);
  }
});

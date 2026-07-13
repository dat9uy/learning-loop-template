import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { validateR2AllowlistShape } from "../../core/r2/allowlist-shape.js";

// Minimal well-shaped allowlist (r2-allowlist/v1). Each test clones and
// mutates one field to exercise a single throw branch.
const VALID = {
  schema: "r2-allowlist/v1",
  version: 1,
  "claude-code": { own: [".claude/**"], deny: [] },
  droid: { own: [".factory/**"], deny: [] },
  "mastra-code": { own: [".mastracode/**"], deny: [] },
  universal: ["records/**"],
};

describe("validateR2AllowlistShape", () => {
  test("accepts a valid allowlist", () => {
    assert.doesNotThrow(() => validateR2AllowlistShape(VALID));
    // version is any number, not just 1
    assert.doesNotThrow(() => validateR2AllowlistShape({ ...VALID, version: 2 }));
  });

  test("rejects a non-object root", () => {
    for (const bad of [null, undefined, "x", 42, true]) {
      assert.throws(() => validateR2AllowlistShape(bad), /root must be an object/);
    }
  });

  test("rejects a wrong schema string", () => {
    assert.throws(() => validateR2AllowlistShape({ ...VALID, schema: "other/v2" }), /schema must be/);
  });

  test("rejects a non-number version", () => {
    assert.throws(() => validateR2AllowlistShape({ ...VALID, version: "1" }), /version must be a number/);
  });

  for (const runtime of ["claude-code", "droid", "mastra-code"]) {
    test(`rejects missing runtime "${runtime}"`, () => {
      const bad = { ...VALID };
      delete bad[runtime];
      assert.throws(() => validateR2AllowlistShape(bad), new RegExp(`missing runtime "${runtime}"`));
    });

    test(`rejects ${runtime}.own that is not an array`, () => {
      const bad = { ...VALID, [runtime]: { ...VALID[runtime], own: "not-array" } };
      assert.throws(() => validateR2AllowlistShape(bad), new RegExp(`${escapeRe(runtime)}\\.own must be an array`));
    });

    test(`rejects ${runtime}.deny that is not an array`, () => {
      const bad = { ...VALID, [runtime]: { ...VALID[runtime], deny: "not-array" } };
      assert.throws(() => validateR2AllowlistShape(bad), new RegExp(`${escapeRe(runtime)}\\.deny must be an array`));
    });
  }

  test("rejects a non-array universal", () => {
    assert.throws(() => validateR2AllowlistShape({ ...VALID, universal: "not-array" }), /universal must be an array/);
  });
});

// Hyphens are literal in regex, but escape defensively so the runtime name
// never collides with a future metacharacter.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
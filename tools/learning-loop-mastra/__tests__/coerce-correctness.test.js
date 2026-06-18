import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stripEnvelope } from "../../learning-loop-mcp/core/envelope-stripper.js";

// Regression net: single-server wire-format correctness after zod-native migration.
// Replaces the dual-server parity harness with direct zod-API assertions.
describe("coerce-correctness — single-server wire-format regression net", () => {
  test("z.coerce.boolean() coerces 'true' / 'false' (JS Boolean semantics)", () => {
    const schema = z.object({ flag: z.coerce.boolean() });
    assert.deepEqual(schema.parse({ flag: "true" }), { flag: true });
    // JS Boolean("false") === true — any non-empty string is truthy
    assert.deepEqual(schema.parse({ flag: "false" }), { flag: true });
    assert.deepEqual(schema.parse({ flag: true }), { flag: true });
    assert.deepEqual(schema.parse({ flag: false }), { flag: false });
  });

  test("z.coerce.number() coerces numeric string; empty → 0, non-numeric throws", () => {
    const schema = z.object({ count: z.coerce.number() });
    assert.deepEqual(schema.parse({ count: "42" }), { count: 42 });
    assert.deepEqual(schema.parse({ count: "3.14" }), { count: 3.14 });
    // Empty string → 0 (Number("") === 0)
    assert.deepEqual(schema.parse({ count: "" }), { count: 0 });
    // Non-numeric throws (Zod 4 rejects NaN)
    assert.throws(() => schema.parse({ count: "abc" }));
  });

  test("z.preprocess strips {item: [...]} envelope", () => {
    const schema = z.object({
      tags: z.preprocess(stripEnvelope, z.array(z.string())),
    });
    assert.deepEqual(
      schema.parse({ tags: { item: ["x", "y"] } }),
      { tags: ["x", "y"] },
    );
    assert.deepEqual(
      schema.parse({ tags: ["x", "y"] }),
      { tags: ["x", "y"] },
    );
  });

  test("z.preprocess strips {item: []} to empty array", () => {
    const schema = z.object({
      tags: z.preprocess(stripEnvelope, z.array(z.string())),
    });
    assert.deepEqual(
      schema.parse({ tags: { item: [] } }),
      { tags: [] },
    );
  });

  test("z.preprocess is undefined-safe for optional fields", () => {
    const schema = z.object({
      tags: z.preprocess(stripEnvelope, z.array(z.string())).optional(),
    });
    assert.deepEqual(schema.parse({}), {});
  });

  test("z.preprocess emits identical JSON Schema to non-preprocess", () => {
    const plain = z.array(z.string());
    const wrapped = z.preprocess(stripEnvelope, z.array(z.string()));
    const a = z.toJSONSchema(plain, { target: "draft-7", io: "input" });
    const b = z.toJSONSchema(wrapped, { target: "draft-7", io: "input" });
    assert.deepEqual(a, b);
  });

  test("z.coerce.boolean() semantic widening documented", () => {
    // z.coerce.boolean() uses JS Boolean() — "false" → true, "0" → true, "no" → true
    assert.equal(z.coerce.boolean().parse("false"), true);
    assert.equal(z.coerce.boolean().parse("0"), true);
    assert.equal(z.coerce.boolean().parse("no"), true);
    assert.equal(z.coerce.boolean().parse("yes"), true);
  });
});

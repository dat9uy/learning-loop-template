import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stripEnvelope } from "../core/envelope-stripper.js";
import { strictBooleanGuard } from "../core/strict-boolean-guard.js";
import { buildParitySchema } from "../schema-parity.js";

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

  test("z.preprocess emits identical JSON Schema to non-preprocess (trivial case)", () => {
    // This is the trivial case tested by the original Researcher 1 verification.
    // It is NOT sufficient on its own — see explicit parity tests below
    // for the migration's actual use cases.
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

// =============================================================================
// Migration parity contract — locks the schema-parity.js shim's behavior.
// =============================================================================
//
// Without buildParitySchema, the following cases produce DIVERGENT JSON Schema
// between pre-migration (plain zod) and post-migration (preprocess-wrapped)
// schemas. The shim recovers byte-identical output. These tests fail loudly
// if the shim regresses.
describe("migration parity contract — schema-parity.js shim", () => {
  // Helper: build a wrapped schema, then ask the shim for its parity view
  // and assert it matches the pre-migration baseline.
  function assertParityMatchesBaseline(label, baseline, wrapped) {
    const parityView = buildParitySchema(wrapped);
    const a = z.toJSONSchema(baseline, { target: "draft-7", io: "input" });
    const b = z.toJSONSchema(parityView, { target: "draft-7", io: "input" });
    assert.deepEqual(
      b,
      a,
      `${label}: parity shim did not recover baseline JSON Schema\n` +
        `  baseline: ${JSON.stringify(a)}\n` +
        `  parity:   ${JSON.stringify(b)}`,
    );
  }

  test("preprocess(.default([])) recovers baseline default", () => {
    // Real migration: meta_state_archive.candidates, .override
    const baseline = z.array(z.string()).default([]);
    const wrapped = z.preprocess(stripEnvelope, z.array(z.string())).default(
      [],
    );
    assertParityMatchesBaseline("array.default([])", baseline, wrapped);
  });

  test("preprocess(.optional()) recovers baseline optional structure", () => {
    // Real migration: meta_state_resolve.cascade_from, .entry_kinds, etc.
    const baseline = z.array(z.string()).optional();
    const wrapped = z
      .preprocess(stripEnvelope, z.array(z.string()))
      .optional();
    assertParityMatchesBaseline("array.optional()", baseline, wrapped);
  });

  test("preprocess() inside z.object() recovers baseline", () => {
    // Real migration: meta_state_query_drift.filter, workflow_intake_plan.orient_result
    const baseline = z.object({
      tags: z.array(z.string()).optional(),
    });
    const wrapped = z.object({
      tags: z.preprocess(stripEnvelope, z.array(z.string())).optional(),
    });
    assertParityMatchesBaseline("object wrapping preprocess", baseline, wrapped);
  });

  test("guarded-boolean union recovers plain boolean JSON Schema", () => {
    // Real migration: meta_state_sweep.apply, archive.confirm, etc.
    const baseline = z.boolean();
    const wrapped = z
      .union([z.boolean(), z.string()])
      .transform(strictBooleanGuard);
    assertParityMatchesBaseline(
      "guarded-boolean union",
      baseline,
      wrapped,
    );
  });

  test("guarded-boolean + optional + default(false) recovers baseline", () => {
    // Real migration: meta_state_sweep.apply is the most common shape.
    const baseline = z.boolean().optional().default(false);
    const wrapped = z
      .union([z.boolean(), z.string()])
      .transform(strictBooleanGuard)
      .optional()
      .default(false);
    assertParityMatchesBaseline(
      "guarded-boolean + optional + default(false)",
      baseline,
      wrapped,
    );
  });

  test("preprocess + .default([]) inside z.object() recovers baseline", () => {
    // Real migration: meta_state_archive.candidates shape
    const baseline = z.object({
      candidates: z.array(z.string()).default([]),
    });
    const wrapped = z.object({
      candidates: z.preprocess(stripEnvelope, z.array(z.string())).default([]),
    });
    assertParityMatchesBaseline(
      "object { preprocess.default([]) }",
      baseline,
      wrapped,
    );
  });

  test("buildParitySchema is a no-op for plain zod primitives", () => {
    // The shim should pass through unchanged schemas that don't have
    // migration wrappers — confirms the conservative unwrap.
    const plain = z.object({
      name: z.string(),
      count: z.number().int().min(1),
      flag: z.boolean(),
    });
    const parityView = buildParitySchema(plain);
    const a = z.toJSONSchema(plain, { target: "draft-7", io: "input" });
    const b = z.toJSONSchema(parityView, { target: "draft-7", io: "input" });
    assert.deepEqual(a, b);
  });
});

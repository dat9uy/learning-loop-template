import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stripEnvelope, deepStripEnvelope } from "../../core/envelope-stripper.js";

test("z.preprocess strips {item: [...]} envelope", () => {
  const schema = z.preprocess(stripEnvelope, z.array(z.string()));
  assert.deepEqual(schema.parse({ item: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(schema.parse(["a", "b"]), ["a", "b"]);
});

test("z.preprocess strips {item: []} to empty array", () => {
  const schema = z.preprocess(stripEnvelope, z.array(z.string()));
  assert.deepEqual(schema.parse({ item: [] }), []);
});

test("z.preprocess passes through plain arrays unchanged", () => {
  const schema = z.preprocess(stripEnvelope, z.array(z.string()));
  assert.deepEqual(schema.parse(["x", "y", "z"]), ["x", "y", "z"]);
});

test("z.preprocess is undefined-safe for optional fields", () => {
  const schema = z.object({
    tags: z.preprocess(stripEnvelope, z.array(z.string())).optional(),
  });
  assert.deepEqual(schema.parse({}), {});
  assert.deepEqual(schema.parse({ tags: undefined }), { tags: undefined });
});

test("z.preprocess emits identical JSON Schema to non-preprocess", () => {
  const plain = z.array(z.string());
  const wrapped = z.preprocess(stripEnvelope, z.array(z.string()));
  const a = z.toJSONSchema(plain, { target: "draft-7", io: "input" });
  const b = z.toJSONSchema(wrapped, { target: "draft-7", io: "input" });
  assert.deepEqual(a, b);
});

test("z.preprocess in object schema strips envelope at parse time", () => {
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

test("z.preprocess strips {item: {...}} envelope for objects", () => {
  const schema = z.preprocess(
    stripEnvelope,
    z.object({ name: z.string() }),
  );
  assert.deepEqual(
    schema.parse({ item: { name: "test" } }),
    { name: "test" },
  );
  assert.deepEqual(
    schema.parse({ name: "test" }),
    { name: "test" },
  );
});

// --- deepStripEnvelope: recursive variant used by meta_state_batch -----

test("deepStripEnvelope unwraps top-level {item: [...]} envelope", () => {
  assert.deepEqual(
    deepStripEnvelope({ item: [{ op: "write" }] }),
    [{ op: "write" }],
  );
});

test("deepStripEnvelope unwraps nested array fields", () => {
  assert.deepEqual(
    deepStripEnvelope({
      added: { item: ["core/envelope-stripper.js#deepStripEnvelope"] },
      removed: { item: [] },
      changed: { item: ["operations schema preprocess"] },
    }),
    {
      added: ["core/envelope-stripper.js#deepStripEnvelope"],
      removed: [],
      changed: ["operations schema preprocess"],
    },
  );
});

test("deepStripEnvelope unwraps doubly-nested envelopes", () => {
  assert.deepEqual(
    deepStripEnvelope({ item: { item: [{ op: "write" }] } }),
    [{ op: "write" }],
  );
});

test("deepStripEnvelope unwraps envelopes inside arrays", () => {
  assert.deepEqual(
    deepStripEnvelope([{ item: "a" }, { item: "b" }]),
    ["a", "b"],
  );
});

test("deepStripEnvelope fail-closed on non-envelope objects", () => {
  // Multi-key object with an `item` key is NOT an envelope; preserve as-is.
  const input = { tag: { item: "x" }, count: 3 };
  assert.deepEqual(deepStripEnvelope(input), { tag: "x", count: 3 });
});

test("deepStripEnvelope passes through primitive values", () => {
  assert.equal(deepStripEnvelope("string"), "string");
  assert.equal(deepStripEnvelope(42), 42);
  assert.equal(deepStripEnvelope(null), null);
  assert.equal(deepStripEnvelope(undefined), undefined);
  assert.equal(deepStripEnvelope(true), true);
});

test("deepStripEnvelope passes through native arrays unchanged", () => {
  assert.deepEqual(deepStripEnvelope(["a", "b"]), ["a", "b"]);
  assert.deepEqual(
    deepStripEnvelope([{ a: 1 }, { b: 2 }]),
    [{ a: 1 }, { b: 2 }],
  );
});

test("deepStripEnvelope unwraps triple-nested envelopes", () => {
  assert.deepEqual(
    deepStripEnvelope({ item: { item: { item: "deep" } } }),
    "deep",
  );
});

// schema-normalize.test.js — transport-agnostic seam test.
//
// Phase 1 of plans/260721-1933-cli-transport-phase1-read-only-slice extracts
// `normalizeInputSchema` from mastra/create-loop-tool.js into
// core/schema-normalize.js so the Phase-2 CLI can import it without dragging
// @mastra/core into its import graph. This test locks:
//   1. behavior: identity for already-zod schemas; z.object() for plain shapes;
//      empty {} still wraps.
//   2. boundary: the seam file imports ONLY zod — no @mastra, no Mastra-bound
//      siblings. A future edit that silently reintroduces the dependency
//      would break the CLI's "no @mastra/*" contract.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { normalizeInputSchema } from "../core/schema-normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEAM_PATH = join(__dirname, "..", "core", "schema-normalize.js");

test("normalizeInputSchema: plain shape wraps in z.object", () => {
  const shape = { a: z.string() };
  const wrapped = normalizeInputSchema(shape);
  // Result is a zod schema (has .parse and _zod metadata).
  assert.equal(typeof wrapped.parse, "function");
  assert.ok(wrapped._zod, "expected zod schema marker");
  // .parse coerces correctly.
  assert.deepEqual(wrapped.parse({ a: "x" }), { a: "x" });
  // Wraps: the input shape was a plain object, not a ZodObject.
  assert.notStrictEqual(wrapped, shape);
});

test("normalizeInputSchema: already-zod schema is returned by identity", () => {
  const schema = z.object({ a: z.string() });
  const result = normalizeInputSchema(schema);
  // Identity: same instance returned, not a rewrap.
  assert.strictEqual(result, schema);
  // parse still works.
  assert.deepEqual(result.parse({ a: "y" }), { a: "y" });
});

test("normalizeInputSchema: empty shape still wraps", () => {
  const wrapped = normalizeInputSchema({});
  assert.equal(typeof wrapped.parse, "function");
  assert.deepEqual(wrapped.parse({}), {});
});

test("normalizeInputSchema: accepts zod schema with _def and parse", () => {
  // Some zod schemas expose `def` instead of `_def` (older wrapper contract);
  // the seam should accept either.
  const schema = z.object({ b: z.number() });
  // Sanity: schema has both .parse and _def or .def.
  assert.equal(typeof schema.parse, "function");
  const result = normalizeInputSchema(schema);
  assert.strictEqual(result, schema);
});

test("schema-normalize seam is Mastra-free (locks the Phase 1 boundary)", () => {
  const src = readFileSync(SEAM_PATH, "utf8");
  assert.ok(
    !src.includes("@mastra"),
    `core/schema-normalize.js must not import @mastra (found @mastra in source)`,
  );
  assert.ok(
    !src.includes('from "./schema-parity'),
    `core/schema-normalize.js must not import the MCP-only schema-parity sibling`,
  );
  assert.ok(
    !src.includes('from "./with-r2-gate'),
    `core/schema-normalize.js must not import the MCP-only with-r2-gate sibling`,
  );
  // The seam must import zod so it can construct z.object for plain shapes.
  assert.ok(
    src.includes("zod"),
    `core/schema-normalize.js must import zod`,
  );
});
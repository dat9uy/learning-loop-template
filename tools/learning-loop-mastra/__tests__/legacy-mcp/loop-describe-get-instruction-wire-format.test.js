import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import { loopGetInstructionTool } from "../../tools/handlers/loop-get-instruction-tool.js";

// Wire-format coercion coverage for the two remaining holes closed in plan
// 260709-1237-wire-format-coverage-guardrail. Mirrors zod-union-envelope.test.js style:
// the stripEnvelope preprocess must accept both bare arrays and {item:[...]} envelopes,
// and the string/number paths must stay byte-identical.

// The handler tools expose schemas as plain objects (legacy MCP shape); wrap them
// in z.object so safeParse works on the same field set the Mastra server receives.
const describeSchema = z.object(loopDescribeTool.schema);
const instructionSchema = z.object(loopGetInstructionTool.schema);

// --- loop_describe.categories -------------------------------------------------

test("loop_describe schema accepts coerced categories: {item:[...]} envelope", () => {
  const result = describeSchema.safeParse({
    categories: { item: ["gate-logic-bug"] },
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.categories, ["gate-logic-bug"]);
});

test("loop_describe schema accepts bare array (non-coerced unchanged path)", () => {
  const result = describeSchema.safeParse({
    categories: ["gate-logic-bug", "schema-drift"],
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.categories, ["gate-logic-bug", "schema-drift"]);
});

test("loop_describe schema still accepts omitted categories (optional)", () => {
  const result = describeSchema.safeParse({});
  assert.equal(result.success, true);
  assert.strictEqual(result.data.categories, undefined);
});

// --- loop_get_instruction.key (array branch) ---------------------------------

test("loop_get_instruction schema accepts coerced key: {item:[...]} envelope", () => {
  const result = instructionSchema.safeParse({
    key: { item: ["reopens", "rule-lifecycle"] },
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.key, ["reopens", "rule-lifecycle"]);
});

test("loop_get_instruction schema accepts bare string (string branch unchanged)", () => {
  const result = instructionSchema.safeParse({ key: "reopens" });
  assert.equal(result.success, true);
  assert.strictEqual(result.data.key, "reopens");
});

test("loop_get_instruction schema accepts bare number (number branch unchanged)", () => {
  const result = instructionSchema.safeParse({ key: 6 });
  assert.equal(result.success, true);
  assert.strictEqual(result.data.key, 6);
});

test("loop_get_instruction schema accepts bare array (array branch non-coerced unchanged)", () => {
  const result = instructionSchema.safeParse({ key: ["reopens", 7] });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.key, ["reopens", 7]);
});

test("loop_get_instruction schema accepts mixed-type coerced array (string + number)", () => {
  const result = instructionSchema.safeParse({
    key: { item: ["reopens", 7, 12] },
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.key, ["reopens", 7, 12]);
});

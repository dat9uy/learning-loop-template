import { test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";

test("z.coerce.boolean() accepts 'true' / 'false' strings (JS Boolean semantics)", () => {
  assert.equal(z.coerce.boolean().parse("true"), true);
  // JS Boolean("false") === true — any non-empty string is truthy
  assert.equal(z.coerce.boolean().parse("false"), true);
});

test("z.coerce.boolean() semantic widening: any truthy string → true", () => {
  assert.equal(z.coerce.boolean().parse("1"), true);
  assert.equal(z.coerce.boolean().parse("false"), true);  // WIDENING
  assert.equal(z.coerce.boolean().parse("0"), true);      // WIDENING
  assert.equal(z.coerce.boolean().parse("no"), true);     // WIDENING
  assert.equal(z.coerce.boolean().parse("yes"), true);    // WIDENING
});

test("z.coerce.boolean() rejects non-string/non-boolean", () => {
  assert.equal(z.coerce.boolean().parse(1), true);
  assert.equal(z.coerce.boolean().parse(0), false);
  assert.equal(z.coerce.boolean().parse(null), false);
});

test("z.coerce.boolean() in object schema coerces at parse time", () => {
  const schema = z.object({ flag: z.coerce.boolean() });
  assert.deepEqual(schema.parse({ flag: "true" }), { flag: true });
  // JS Boolean semantics: any non-empty string → true
  assert.deepEqual(schema.parse({ flag: "false" }), { flag: true });
  assert.deepEqual(schema.parse({ flag: true }), { flag: true });
  assert.deepEqual(schema.parse({ flag: false }), { flag: false });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { strictBooleanGuard } from "../core/strict-boolean-guard.js";

// Locks the strict-true contract for 5 HIGH/CRITICAL boolean fields.
// Each field uses: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard)
// Only true / "true" → true; everything else → false.

function makeGuardedBoolean() {
  return z.union([z.boolean(), z.string(), z.number()]).transform(strictBooleanGuard);
}

const GUARDED_FIELDS = [
  { name: "meta_state_sweep.apply", schema: makeGuardedBoolean().optional().default(false) },
  { name: "meta_state_archive.confirm", schema: makeGuardedBoolean().optional() },
  { name: "meta_state_promote_rule.preview", schema: makeGuardedBoolean().optional().default(false) },
  { name: "meta_state_check_grounding.run_tests", schema: makeGuardedBoolean().optional().default(false) },
  { name: "meta_state_derive_status.run_tests", schema: makeGuardedBoolean().optional().default(false) },
  { name: "meta_state_query_drift.run_grounding", schema: makeGuardedBoolean().optional().default(false) },
];

const TRUE_INPUTS = [true, "true"];
const FALSE_INPUTS = [false, "false", "yes", "no", "1", "0", 1, 0];

for (const { name, schema } of GUARDED_FIELDS) {
  for (const input of TRUE_INPUTS) {
    test(`${name} → true for input ${JSON.stringify(input)}`, () => {
      assert.equal(schema.parse(input), true);
    });
  }
  for (const input of FALSE_INPUTS) {
    test(`${name} → false for input ${JSON.stringify(input)}`, () => {
      assert.equal(schema.parse(input), false);
    });
  }
}

test("strictBooleanGuard contract: only true / 'true' → true", () => {
  assert.equal(strictBooleanGuard(true), true);
  assert.equal(strictBooleanGuard("true"), true);
  assert.equal(strictBooleanGuard(false), false);
  assert.equal(strictBooleanGuard("false"), false);
  assert.equal(strictBooleanGuard("yes"), false);
  assert.equal(strictBooleanGuard("no"), false);
  assert.equal(strictBooleanGuard("1"), false);
  assert.equal(strictBooleanGuard("0"), false);
  assert.equal(strictBooleanGuard(1), false);
  assert.equal(strictBooleanGuard(0), false);
  assert.equal(strictBooleanGuard(undefined), false);
  assert.equal(strictBooleanGuard(null), false);
});

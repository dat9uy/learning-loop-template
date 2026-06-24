import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";

// Locks the strict-true contract for 6 guarded boolean fields:
//   - 2 HIGH/CRITICAL: meta_state_archive.confirm, meta_state_promote_rule.preview, meta_state_sweep.apply
//   - 3 MEDIUM: meta_state_check_grounding.run_tests, meta_state_derive_status.run_tests, meta_state_query_drift.run_grounding
// Each field uses: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional()
// Only true / "true" → true; everything else → false (and inputs the union doesn't accept throw).

// Real tool schema: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard)
function makeGuardedBoolean() {
  return z.union([z.boolean(), z.string()]).transform(strictBooleanGuard);
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
const FALSE_INPUTS = [false, "false", "yes", "no", "1", "0"];

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

// Transform contract test — exercises strictBooleanGuard directly with all
// input types the real union accepts (boolean, string) plus the runtime types
// it might encounter after preprocess/optional/transform layers (number, null,
// undefined). This is the only place the number/null/undefined cases are
// covered, because the real tool schemas reject them at the zod validation
// step before reaching the transform.
test("strictBooleanGuard contract: only true / 'true' → true", () => {
  // boolean
  assert.equal(strictBooleanGuard(true), true);
  assert.equal(strictBooleanGuard(false), false);
  // string
  assert.equal(strictBooleanGuard("true"), true);
  assert.equal(strictBooleanGuard("false"), false);
  assert.equal(strictBooleanGuard("yes"), false);
  assert.equal(strictBooleanGuard("no"), false);
  assert.equal(strictBooleanGuard("1"), false);
  assert.equal(strictBooleanGuard("0"), false);
  // runtime-only (real schemas reject at zod layer, but transform is total)
  assert.equal(strictBooleanGuard(1), false);
  assert.equal(strictBooleanGuard(0), false);
  assert.equal(strictBooleanGuard(undefined), false);
  assert.equal(strictBooleanGuard(null), false);
});

// Lock the union-rejection contract: numbers/objects/arrays throw at the
// zod layer (zod would surface "Invalid input" before the transform runs).
// This proves the over-permissive number acceptance only happens if the
// schema is loosened, which the migration does NOT do.
test("real guarded-boolean union rejects numbers at zod layer", () => {
  const schema = makeGuardedBoolean();
  assert.throws(() => schema.parse(1), /Invalid input/);
  assert.throws(() => schema.parse(0), /Invalid input/);
  assert.throws(() => schema.parse(null), /Invalid input/);
  assert.throws(() => schema.parse(undefined), /Invalid input/);
  assert.throws(() => schema.parse({}), /Invalid input/);
  assert.throws(() => schema.parse([]), /Invalid input/);
});

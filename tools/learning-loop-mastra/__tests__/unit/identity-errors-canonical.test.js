/**
 * R11 (red-team, Plan 5-Lite Phase 3): boot error message canonicalization.
 *
 * The identity-pin boot errors (`mastra/identity-errors.json`) are the single
 * source of truth for the canonical messages thrown by `pinRuntimeIdAtBoot()`.
 * They MUST be stable, non-empty strings with the documented substitution
 * placeholders, so an operator diagnosing a boot failure sees a consistent,
 * actionable message regardless of which runtime triggered it.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ERRORS_PATH = join(__dirname, "..", "..", "mastra", "identity-errors.json");
const ERRORS = JSON.parse(readFileSync(ERRORS_PATH, "utf8"));

test("R11 identity-errors.json has all 4 canonical message keys", () => {
  for (const key of ["MISSING_LOOP_SURFACE", "INVALID_LOOP_SURFACE", "MISSING_RUNTIME_MAPPING", "PIN_NOT_INITIALIZED"]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ERRORS, key),
      `identity-errors.json must define ${key}`,
    );
    assert.equal(typeof ERRORS[key], "string", `${key} must be a string`);
    assert.ok(ERRORS[key].length > 0, `${key} must be non-empty`);
  }
});

test("R11 MISSING_LOOP_SURFACE names all three allowed surfaces", () => {
  const msg = ERRORS.MISSING_LOOP_SURFACE;
  assert.ok(msg.includes(".claude"), "MISSING_LOOP_SURFACE must mention .claude");
  assert.ok(msg.includes(".factory"), "MISSING_LOOP_SURFACE must mention .factory");
  assert.ok(msg.includes(".mastracode"), "MISSING_LOOP_SURFACE must mention .mastracode");
  assert.ok(msg.includes("LOOP_SURFACE"), "MISSING_LOOP_SURFACE must name the env var");
});

test("R11 INVALID_LOOP_SURFACE has {value} and {allowed} substitution placeholders", () => {
  const msg = ERRORS.INVALID_LOOP_SURFACE;
  assert.ok(msg.includes("{value}"), "INVALID_LOOP_SURFACE must have {value} placeholder");
  assert.ok(msg.includes("{allowed}"), "INVALID_LOOP_SURFACE must have {allowed} placeholder");
});

test("R11 MISSING_RUNTIME_MAPPING has {surface} substitution placeholder", () => {
  assert.ok(
    ERRORS.MISSING_RUNTIME_MAPPING.includes("{surface}"),
    "MISSING_RUNTIME_MAPPING must have {surface} placeholder",
  );
});

test("R11 PIN_NOT_INITIALIZED names the boot function", () => {
  assert.ok(
    ERRORS.PIN_NOT_INITIALIZED.includes("pinRuntimeIdAtBoot"),
    "PIN_NOT_INITIALIZED must reference pinRuntimeIdAtBoot() so the operator knows the fix",
  );
});
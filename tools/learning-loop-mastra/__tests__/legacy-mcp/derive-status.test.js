import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveStatus,
  META_STATE_DERIVATION_KINDS,
  META_STATE_DERIVED_STATUSES,
  META_STATE_RECOMMENDATIONS,
} from "../../core/derive-status.js";

describe("deriveStatus pure function", () => {
  // Helper to build a temp dir with files
  function makeTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function baseEntry(overrides = {}) {
    return {
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "open",
      ...overrides,
    };
  }

  function baseContext(overrides = {}) {
    return {
      root: makeTempDir("derive-status-"),
      now: () => 1700000000000,
      ...overrides,
    };
  }

  test("ACCEPTS: returns kind: code-only when both files exist but test_passed is null (no positive test-pass signal)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    // Bare file existence is not enough — test_passed must be true for
    // mechanism-shipped. With no test pass signal, we land on code-only
    // (active-uncertain).
    assert.strictEqual(result.derivation.kind, "code-only");
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    assert.strictEqual(result.derivation.signals.test_file_exists, true);
  });

  test("returns kind: code-only when code_ref exists but test_file is specified and missing", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "code-only");
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    assert.strictEqual(result.derivation.signals.test_file_exists, false);
  });

  test("returns kind: code-missing when code_ref is specified and missing", () => {
    const ctx = baseContext();
    const entry = baseEntry({ evidence_code_ref: "src.js" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "code-missing");
    assert.strictEqual(result.derivation.signals.code_ref_exists, false);
  });

  test("returns kind: no-signals when entry has no code_ref or test_file paths", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "no-signals");
    assert.strictEqual(result.derivation.signals.code_ref_exists, undefined);
    assert.strictEqual(result.derivation.signals.test_file_exists, undefined);
  });

  test("sets signals.test_passed to null when run_tests is false and codeContext.test_passed is not provided", () => {
    const ctx = baseContext({ run_tests: false });
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.test_passed, null);
  });

  test("ACCEPTS: returns derived_status: active-uncertain for code-only when both files exist without test_passed", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    // Without test_passed:true we no longer claim "resolved-by-mechanism".
    // active-uncertain is honest.
    assert.strictEqual(result.derived_status, "active-uncertain");
    assert.strictEqual(result.derivation.kind, "code-only");
  });

  test("returns derived_status: active-no-signal for kind: code-missing or no-signals", () => {
    const ctx1 = baseContext();
    const entry1 = baseEntry({ evidence_code_ref: "missing.js" });
    const result1 = deriveStatus(entry1, ctx1);
    assert.strictEqual(result1.derived_status, "active-no-signal");

    const ctx2 = baseContext();
    const entry2 = baseEntry();
    const result2 = deriveStatus(entry2, ctx2);
    assert.strictEqual(result2.derived_status, "active-no-signal");
  });

  test("returns derived_status: active-uncertain for kind: code-only", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "missing.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derived_status, "active-uncertain");
  });

  test("ACCEPTS: returns recommendation: investigate for code-only findings (no positive test-pass signal)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entryReported = baseEntry({
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    // code-only → investigate. Operators must opt into run_tests:true or
    // meta_state_re_verify to get the resolve recommendation.
    assert.strictEqual(deriveStatus(entryReported, ctx).recommendation, "investigate");

    const ctx2 = baseContext();
    writeFileSync(join(ctx2.root, "src.js"), "// code");
    writeFileSync(join(ctx2.root, "src.test.js"), "// test");
    const entryActive = baseEntry({
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    assert.strictEqual(deriveStatus(entryActive, ctx2).recommendation, "investigate");
  });

  test("returns recommendation: investigate when code_ref is missing", () => {
    const ctx = baseContext();
    const entry = baseEntry({ evidence_code_ref: "missing.js" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.recommendation, "investigate");
  });

  test("returns recommendation: no_action when signals match raw_status assertion", () => {
    const ctx = baseContext();
    const entry = baseEntry({ status: "open" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.recommendation, "no_action");
  });

  test("ACCEPTS: drift: false when both files exist without test_passed (drift means resolved-by-mechanism only)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    // derive_status `drift` means strictly `resolved-by-mechanism` vs
    // raw_status; query-drift is the drift-detection source of truth (and
    // still flags this as drift via active-uncertain).
    assert.strictEqual(result.drift, false);
    assert.strictEqual(result.derivation.kind, "code-only");
  });

  test("ACCEPTS: evidence_code_ref exists without test_passed → code-only (bare existence not enough)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "legacy.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "legacy.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    // Bare existence + no test_passed → code-only.
    assert.strictEqual(result.derivation.kind, "code-only");
  });

  test("populates checked_at as a valid ISO string", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    const d = new Date(result.derivation.checked_at);
    assert.ok(!isNaN(d.getTime()), "checked_at should be a valid ISO string");
  });

  test("populates duration_ms as a non-negative number", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.ok(result.derivation.duration_ms >= 0, "duration_ms should be >= 0");
  });

  test("uses injected now() for deterministic checked_at", () => {
    const fixed = 1700000000000;
    const ctx = baseContext({ now: () => fixed });
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.checked_at, new Date(fixed).toISOString());
  });

  test("passes through codeContext.test_passed when provided", () => {
    const ctx = baseContext({ test_passed: true });
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.test_passed, true);
  });

  test("does not run subprocesses (signals.test_passed stays null when codeContext.test_passed is omitted)", () => {
    const ctx = baseContext({ run_tests: true });
    const entry = baseEntry();
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.test_passed, null);
  });

  test("sets drift: false when mechanism shipped and raw_status is terminal (e.g. resolved)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      status: "resolved",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.drift, false);
  });

  test("sets drift: false when kind is code-missing or code-only regardless of raw_status", () => {
    const ctx1 = baseContext();
    const entry1 = baseEntry({ status: "open", evidence_code_ref: "missing.js" });
    assert.strictEqual(deriveStatus(entry1, ctx1).drift, false);

    const ctx2 = baseContext();
    writeFileSync(join(ctx2.root, "src.js"), "// code");
    const entry2 = baseEntry({ status: "open", evidence_code_ref: "src.js", evidence_test: "missing.test.js" });
    assert.strictEqual(deriveStatus(entry2, ctx2).drift, false);
  });

  test("change-log with no evidence_code_ref returns kind: no-signals (post-migration, no entry-kind fast path)", () => {
    // Post-migration: change-logs flow through the same evaluation as findings.
    // A change-log without evidence_code_ref or evidence_test naturally resolves
    // to kind: "no-signals" (same as a finding without those fields).
    const ctx = baseContext();
    const entry = baseEntry({ entry_kind: "change-log" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "no-signals");
    assert.strictEqual(result.derived_status, "active-no-signal");
    assert.strictEqual(result.drift, false);
    assert.strictEqual(result.recommendation, "no_action");
  });

  test("resolves relative paths in evidence_code_ref against codeContext.root", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "relative.js"), "// code");
    const entry = baseEntry({ evidence_code_ref: "relative.js" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
  });

  test("treats absolute paths in evidence_code_ref as absolute (does not join with codeContext.root)", () => {
    const ctx = baseContext();
    const entry = baseEntry({ evidence_code_ref: "/nonexistent/absolute.js" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, false);
  });

  test("defensively handles non-string evidence_code_ref (null, number) as missing", () => {
    const ctx1 = baseContext();
    const entry1 = baseEntry({ evidence_code_ref: null });
    const result1 = deriveStatus(entry1, ctx1);
    assert.strictEqual(result1.derivation.signals.code_ref_exists, undefined);
    assert.strictEqual(result1.derivation.kind, "no-signals");

    const ctx2 = baseContext();
    const entry2 = baseEntry({ evidence_code_ref: 42 });
    const result2 = deriveStatus(entry2, ctx2);
    assert.strictEqual(result2.derivation.signals.code_ref_exists, undefined);
    assert.strictEqual(result2.derivation.kind, "no-signals");
  });

  test("exports source-of-truth constant arrays", () => {
    assert.deepStrictEqual(META_STATE_DERIVATION_KINDS, [
      "mechanism-shipped", "code-only", "code-missing", "no-signals",
    ]);
    assert.deepStrictEqual(META_STATE_DERIVED_STATUSES, [
      "resolved-by-mechanism", "active-no-signal", "active-uncertain",
    ]);
    assert.deepStrictEqual(META_STATE_RECOMMENDATIONS, [
      "no_action", "resolve", "investigate", "log_drift", "re_verify",
    ]);
  });

  // deriveStatus fidelity: code-only → investigate, symptom-file, and suffixed-ref tests.
  // These lock the contract: test_passed required for mechanism-shipped;
  // bare file existence + no test_passed → code-only; code-only → investigate.
  test("ACCEPTS: code-only (file exists, no evidence_test) recommends investigate (not no_action)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "code-only");
    assert.strictEqual(result.derived_status, "active-uncertain");
    assert.strictEqual(result.recommendation, "investigate");
    assert.strictEqual(result.drift, false);
  });

  test("ACCEPTS: symptom-file evidence_code_ref (e.g. .gitignore exists) without evidence_test yields code-only + investigate", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, ".gitignore"), "node_modules/\n");
    const entry = baseEntry({
      evidence_code_ref: ".gitignore",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    assert.strictEqual(result.derivation.kind, "code-only");
    assert.strictEqual(result.derived_status, "active-uncertain");
    assert.strictEqual(result.recommendation, "investigate");
  });

  test("ACCEPTS: suffixed evidence_code_ref (e.g. src.js:102-113) resolves to the base file when file exists", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js:102-113",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    // No test_passed → code-only (NOT mechanism-shipped)
    assert.strictEqual(result.derivation.kind, "code-only");
  });

  test("ACCEPTS: suffixed evidence_code_ref with #anchor still resolves to the base file when file exists", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js#methodName",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    assert.strictEqual(result.derivation.kind, "code-only");
  });

  test("ACCEPTS: explicit test_passed: true + both files existing → mechanism-shipped", () => {
    const ctx = baseContext({ test_passed: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "mechanism-shipped");
    assert.strictEqual(result.derived_status, "resolved-by-mechanism");
    assert.strictEqual(result.derivation.signals.test_passed, true);
  });

  test("ACCEPTS: explicit test_passed: false + both files existing → code-only (not mechanism-shipped)", () => {
    const ctx = baseContext({ test_passed: false });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "code-only");
    assert.strictEqual(result.derived_status, "active-uncertain");
  });
});

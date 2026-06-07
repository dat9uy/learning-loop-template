import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveStatus,
  META_STATE_DERIVATION_KINDS,
  META_STATE_DERIVED_STATUSES,
  META_STATE_RECOMMENDATIONS,
} from "../core/derive-status.js";

describe("deriveStatus pure function", () => {
  // Helper to build a temp dir with files
  function makeTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function baseEntry(overrides = {}) {
    return {
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "active",
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

  test("returns kind: mechanism-shipped when both code_ref and test_file exist", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.kind, "mechanism-shipped");
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

  test("returns derived_status: resolved-by-mechanism for kind: mechanism-shipped", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derived_status, "resolved-by-mechanism");
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

  test("returns recommendation: resolve when mechanism shipped and raw_status is reported/active", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entryReported = baseEntry({
      status: "reported",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    assert.strictEqual(deriveStatus(entryReported, ctx).recommendation, "resolve");

    const ctx2 = baseContext();
    writeFileSync(join(ctx2.root, "src.js"), "// code");
    writeFileSync(join(ctx2.root, "src.test.js"), "// test");
    const entryActive = baseEntry({
      status: "active",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    assert.strictEqual(deriveStatus(entryActive, ctx2).recommendation, "resolve");
  });

  test("returns recommendation: investigate when code_ref is missing", () => {
    const ctx = baseContext();
    const entry = baseEntry({ evidence_code_ref: "missing.js" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.recommendation, "investigate");
  });

  test("returns recommendation: no_action when signals match raw_status assertion", () => {
    const ctx = baseContext();
    const entry = baseEntry({ status: "active" });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.recommendation, "no_action");
  });

  test("sets drift: true when mechanism shipped but raw_status is not terminal", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      status: "active",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.drift, true);
  });

  test("reads evidence_code_ref from top-level field only", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "legacy.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "legacy.js",
    });
    const result = deriveStatus(entry, ctx);
    assert.strictEqual(result.derivation.signals.code_ref_exists, true);
    assert.strictEqual(result.derivation.kind, "mechanism-shipped");
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
    const entry1 = baseEntry({ status: "active", evidence_code_ref: "missing.js" });
    assert.strictEqual(deriveStatus(entry1, ctx1).drift, false);

    const ctx2 = baseContext();
    writeFileSync(join(ctx2.root, "src.js"), "// code");
    const entry2 = baseEntry({ status: "active", evidence_code_ref: "src.js", evidence_test: "missing.test.js" });
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
      "no_action", "resolve", "investigate", "log_drift",
    ]);
  });
});

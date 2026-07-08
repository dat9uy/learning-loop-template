import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkGrounding,
  computeFileHash,
  META_STATE_GROUNDING_STATUSES,
  META_STATE_GROUNDING_DRIFT_KINDS,
} from "../../core/check-grounding.js";
import { PathContainmentError } from "../../core/path-containment.js";

describe("checkGrounding pure function", () => {
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
      root: makeTempDir("check-grounding-"),
      now: () => 1700000000000,
      ...overrides,
    };
  }

  // T-1: status: "skipped" when mechanism_check is undefined
  test("returns status: 'skipped' when mechanism_check is not true (undefined)", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "skipped");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.fingerprint_was_recorded, false);
  });

  // T-2: status: "skipped" for change-log entries (entry_kind: "change-log")
  test("returns status: 'skipped' for change-log entries (entry_kind: 'change-log')", () => {
    const ctx = baseContext();
    const entry = baseEntry({
      entry_kind: "change-log",
      change_target: "tools/foo.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "skipped");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.fingerprint_was_recorded, false);
  });

  // T-3: status: "skipped" when mechanism_check is false (strict equality)
  test("returns status: 'skipped' when mechanism_check is false (strict equality)", () => {
    const ctx = baseContext();
    const entry = baseEntry({ mechanism_check: false });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "skipped");
  });

  // T-4: status: "skipped" when mechanism_check is a non-boolean (string "true", number 1, etc.)
  test("returns status: 'skipped' when mechanism_check is a non-boolean (string 'true', number 1, etc.)", () => {
    const ctx = baseContext();
    for (const mc of ["true", 1, null, {}, [], "yes"]) {
      const entry = baseEntry({ mechanism_check: mc });
      const result = checkGrounding(entry, ctx);
      assert.strictEqual(result.status, "skipped", `mechanism_check=${JSON.stringify(mc)} should yield skipped`);
    }
  });

  // T-5: status: "unknown" when mechanism_check is true but evidence_code_ref is not set
  test("returns status: 'unknown' when mechanism_check is true but evidence_code_ref is not set", () => {
    const ctx = baseContext();
    const entry = baseEntry({ mechanism_check: true });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "unknown");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.grounding.evidence_code_ref, null);
    assert.strictEqual(result.grounding.code_ref_exists, null);
    assert.strictEqual(result.grounding.code_ref_hash, null);
    assert.strictEqual(result.grounding.code_fingerprint, null);
    assert.strictEqual(result.grounding.hash_match, null);
  });

  // T-6: status: "grounded" when code_ref exists and no fingerprint recorded
  test("returns status: 'grounded' when code_ref exists and no fingerprint recorded", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "src.js" });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.grounding.code_ref_exists, true);
    assert.ok(result.grounding.code_ref_hash?.startsWith("sha256:"));
    assert.strictEqual(result.grounding.hash_match, null);
  });

  // T-7: status: "grounded" when code_ref exists and fingerprint matches
  test("returns status: 'grounded' when code_ref exists and fingerprint matches", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const expectedHash = computeFileHash(join(ctx.root, "src.js"));
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: expectedHash,
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.grounding.hash_match, true);
  });

  // T-8: status: "drifted" with drift_kind: "code_missing" when file is missing
  test("returns status: 'drifted' with drift_kind: 'code_missing' when file is missing", () => {
    const ctx = baseContext();
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "missing.js" });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "drifted");
    assert.strictEqual(result.drift_kind, "code_missing");
    assert.strictEqual(result.grounding.code_ref_exists, false);
  });

  // T-9: status: "drifted" with drift_kind: "hash_mismatch" when fingerprint differs
  test("returns status: 'drifted' with drift_kind: 'hash_mismatch' when fingerprint differs", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: "sha256:" + "0".repeat(64),
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "drifted");
    assert.strictEqual(result.drift_kind, "hash_mismatch");
    assert.strictEqual(result.grounding.hash_match, false);
  });

  // T-10: status: "grounded" when test passed (run_tests: true, evidence_test set, exit 0)
  test("returns status: 'grounded' when test passed (run_tests: true, evidence_test set, test_passed: true)", () => {
    const ctx = baseContext({ run_tests: true, test_passed: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.grounding.test_passed, true);
  });

  // T-11: status: "drifted" with drift_kind: "test_failed" when test fails
  test("returns status: 'drifted' with drift_kind: 'test_failed' when test fails", () => {
    const ctx = baseContext({ run_tests: true, test_passed: false });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "drifted");
    assert.strictEqual(result.drift_kind, "test_failed");
    assert.strictEqual(result.grounding.test_passed, false);
  });

  // T-12: test_passed to null when run_tests is false
  test("sets test_passed to null when run_tests is false", () => {
    const ctx = baseContext({ run_tests: false });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.test_passed, null);
    assert.strictEqual(result.grounding.tests_run, false);
  });

  // T-13: test_passed to boolean when run_tests is true and test_passed provided
  test("sets test_passed to boolean when run_tests is true and test_passed provided", () => {
    const ctx = baseContext({ run_tests: true, test_passed: true });
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.test_passed, true);
    assert.strictEqual(result.grounding.tests_run, true);
  });

  // T-14: hash_match to null when fingerprint is not yet recorded
  test("sets hash_match to null when fingerprint is not yet recorded (first check)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "src.js" });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.hash_match, null);
  });

  // T-15: hash_match to null when evidence_code_ref is not set
  test("sets hash_match to null when evidence_code_ref is not set (no comparison possible)", () => {
    const ctx = baseContext();
    const entry = baseEntry({ mechanism_check: true });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.hash_match, null);
  });

  // T-16: hash_match to null when stored fingerprint is corrupt (regex mismatch)
  test("sets hash_match to null when stored fingerprint is corrupt (regex mismatch)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: "not-a-valid-hash",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.grounding.hash_match, null);
    assert.strictEqual(result.grounding.code_fingerprint, null);
  });

  // T-17: computeFileHash returns "sha256:<64hex>" for a known file
  test("computeFileHash returns 'sha256:<64hex>' for a known file content (deterministic)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const hash = computeFileHash(join(ctx.root, "src.js"));
    assert.ok(hash.startsWith("sha256:"));
    assert.strictEqual(hash.length, "sha256:".length + 64);
    assert.match(hash.slice("sha256:".length), /^[a-f0-9]{64}$/);
  });

  // T-18: computeFileHash rejects non-existent files (throws FileNotFoundError)
  test("computeFileHash rejects non-existent files (throws FileNotFoundError)", () => {
    const ctx = baseContext();
    assert.throws(
      () => computeFileHash(join(ctx.root, "missing.js")),
      (err) => err.name === "FileNotFoundError"
    );
  });

  // T-19: computeFileHash is deterministic
  test("computeFileHash is deterministic for the same content (call twice, same hash)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const h1 = computeFileHash(join(ctx.root, "src.js"));
    const h2 = computeFileHash(join(ctx.root, "src.js"));
    assert.strictEqual(h1, h2);
  });

  // T-20: absolute paths treated as absolute
  test("handles absolute paths (no join with root)", () => {
    const ctx = baseContext();
    const absFile = join(ctx.root, "absolute.js");
    writeFileSync(absFile, "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: absFile,
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.evidence_code_ref, absFile);
    assert.strictEqual(result.grounding.code_ref_exists, true);
    assert.strictEqual(result.status, "grounded");
  });

  // T-21: relative paths joined with codeContext.root
  test("handles relative paths (joined with codeContext.root)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "rel.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "rel.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.evidence_code_ref, join(ctx.root, "rel.js"));
    assert.strictEqual(result.grounding.code_ref_exists, true);
  });

  // T-22: paths with spaces
  test("handles paths with spaces (no quoting issues)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "with space.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "with space.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.code_ref_exists, true);
    assert.strictEqual(result.status, "grounded");
  });

  // T-23: path traversal (../) outside root is rejected by LIM-4 path containment.
  // A ref that escapes the project root is a broken/unsafe finding; checkGrounding
  // surfaces it as a PathContainmentError(outside_root) rather than silently
  // grounding against a file outside the audited tree.
  test("rejects path traversal (../) outside root with PathContainmentError", () => {
    const ctx = baseContext();
    // Create a file outside the root, then refer to it via ../
    const sibling = mkdtempSync(join(tmpdir(), "sibling-"));
    writeFileSync(join(sibling, "external.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "../" + join(sibling.split("/").pop(), "external.js"),
    });
    assert.throws(
      () => checkGrounding(entry, ctx),
      (err) => err instanceof PathContainmentError && err.reason === "outside_root",
    );
  });

  // T-24: non-string evidence_code_ref and evidence_test (defensive)
  test("handles non-string evidence_code_ref and evidence_test (defensive null return)", () => {
    const ctx = baseContext();
    for (const cr of [123, null, {}, [], true]) {
      const entry = baseEntry({
        mechanism_check: true,
        evidence_code_ref: cr,
        evidence_test: cr,
      });
      // Should not throw; should return some status
      const result = checkGrounding(entry, ctx);
      assert.strictEqual(typeof result.status, "string");
      // When evidence_code_ref is non-string, treated as missing -> unknown
      // (because mechanism_check is true but no code_ref)
      if (cr === null || typeof cr !== "string") {
        assert.strictEqual(result.status, "unknown");
      }
    }
  });

  // T-25: now() injection for deterministic checked_at
  test("uses injected now() for deterministic checked_at", () => {
    const ctx = baseContext({ now: () => 1700000000000 });
    const entry = baseEntry();
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.checked_at, new Date(1700000000000).toISOString());
  });

  // T-26: duration_ms via injected now() (start/end pair)
  test("computes duration_ms via injected now() (start/end pair)", () => {
    let counter = 1000;
    const ctx = baseContext({ now: () => counter++ });
    const entry = baseEntry();
    const result = checkGrounding(entry, ctx);
    // t0 = 1000, end = 1001 → duration_ms = 1
    assert.strictEqual(result.grounding.duration_ms, 1);
  });

  // T-27: top-level evidence_code_ref only (nested form removed by migration)
  test("reads evidence_code_ref from top-level field only", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "legacy.js"), "// code");
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "legacy.js",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.grounding.code_ref_exists, true);
    assert.strictEqual(result.status, "grounded");
  });

  // T-28: change-log fast path returns minimal grounding shape
  test("returns minimal grounding for change-log fast path (no evidence_code_ref lookup)", () => {
    const ctx = baseContext();
    const entry = baseEntry({
      entry_kind: "change-log",
      change_target: "tools/x.js",
      status: "open",
    });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "skipped");
    assert.ok(result.grounding.checked_at);
    assert.strictEqual(typeof result.grounding.duration_ms, "number");
    // Minimal shape: no evidence_code_ref / code_ref_exists / etc.
    assert.strictEqual(result.grounding.evidence_code_ref, undefined);
    assert.strictEqual(result.grounding.code_ref_exists, undefined);
  });

  // ── File-index baseline (Phase 3 repoint) ──────────────────────────────
  // The index is passed in via codeContext.fileIndex (Map<canonicalKey, hash>);
  // the pure function stays pure. Index baseline wins over the per-record field;
  // both are validated against TERMINAL_HASH_REGEX (F6).
  test("index-authoritative: fileIndex baseline wins over the per-record field", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const realHash = computeFileHash(join(ctx.root, "src.js"));
    const stalePerRecord = "sha256:" + "0".repeat(64);
    const fileIndex = new Map([["src.js", realHash]]);
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: stalePerRecord,
    });
    const result = checkGrounding(entry, { ...ctx, fileIndex });
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.drift_kind, null);
    assert.strictEqual(result.grounding.code_fingerprint, realHash, "exposed baseline is the index value");
    assert.strictEqual(result.grounding.hash_match, true);
  });

  test("index-missing: falls back to the per-record field (byte-identical to today)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const realHash = computeFileHash(join(ctx.root, "src.js"));
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: realHash,
    });
    // No fileIndex → fallback to the per-record field, exactly as before.
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.grounding.hash_match, true);
  });

  test("index-missing + no per-record: hash_match null -> grounded (file exists)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "src.js" });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.grounding.hash_match, null);
  });

  // Red-team F6: a corrupt index value (fails TERMINAL_HASH_REGEX) must fall
  // through to the per-record field, never feed a false baseline.
  test("index-corrupt (fails regex): falls through to per-record fallback (F6)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const realHash = computeFileHash(join(ctx.root, "src.js"));
    const corruptIndex = new Map([["src.js", "sha256:BAD"]]);
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js",
      code_fingerprint: realHash,
    });
    const result = checkGrounding(entry, { ...ctx, fileIndex: corruptIndex });
    assert.strictEqual(result.grounding.code_fingerprint, realHash, "corrupt index dropped; per-record used");
    assert.strictEqual(result.status, "grounded");
  });

  test("index key is canonical (stripped): :line and #anchor resolve to the index entry", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const realHash = computeFileHash(join(ctx.root, "src.js"));
    // Index keyed on the bare path; evidence_code_ref carries a :line suffix.
    const fileIndex = new Map([["src.js", realHash]]);
    const entry = baseEntry({
      mechanism_check: true,
      evidence_code_ref: "src.js:42",
    });
    const result = checkGrounding(entry, { ...ctx, fileIndex });
    assert.strictEqual(result.grounding.code_fingerprint, realHash);
    assert.strictEqual(result.status, "grounded");
  });

  // ── Phase 6 field-strip invariant ──────────────────────────────────────
  // After the strip, findings have NO per-record code_fingerprint. The index is
  // the sole baseline. A no-field finding grounds via the index; a no-field +
  // no-index finding grounds on file-existence (hash_match: null). Locks the
  // post-strip shape so a future refactor that deletes the fallback branch
  // breaks these tests (the fallback branch stays — it reads an absent field).
  test("Phase 6: no code_fingerprint + index has the key -> grounded via the index", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const realHash = computeFileHash(join(ctx.root, "src.js"));
    const fileIndex = new Map([["src.js", realHash]]);
    // No code_fingerprint on the entry — the post-strip shape.
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "src.js" });
    const result = checkGrounding(entry, { ...ctx, fileIndex });
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.grounding.code_fingerprint, realHash, "index owns the baseline");
    assert.strictEqual(result.grounding.hash_match, true);
  });

  test("Phase 6: no code_fingerprint + no index entry -> grounded on file-existence (hash_match null)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    // No code_fingerprint, no fileIndex — the post-strip shape for an un-indexed path.
    const entry = baseEntry({ mechanism_check: true, evidence_code_ref: "src.js" });
    const result = checkGrounding(entry, ctx);
    assert.strictEqual(result.status, "grounded");
    assert.strictEqual(result.grounding.code_fingerprint, null);
    assert.strictEqual(result.grounding.hash_match, null);
  });
});

describe("META_STATE_GROUNDING_* constants", () => {
  test("META_STATE_GROUNDING_STATUSES contains 4 expected values", () => {
    assert.deepStrictEqual(
      [...META_STATE_GROUNDING_STATUSES].sort(),
      ["drifted", "grounded", "skipped", "unknown"]
    );
  });

  test("META_STATE_GROUNDING_DRIFT_KINDS contains 3 expected values", () => {
    assert.deepStrictEqual(
      [...META_STATE_GROUNDING_DRIFT_KINDS].sort(),
      ["code_missing", "hash_mismatch", "test_failed"]
    );
  });
});

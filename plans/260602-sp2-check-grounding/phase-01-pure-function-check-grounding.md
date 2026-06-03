---
phase: 1
title: "Pure Function `checkGrounding` (TDD, 28 unit tests)"
status: pending
priority: P2
effort: "6-8h"
dependencies: [0]
---

# Phase 1: Pure Function `checkGrounding` (TDD, 28 unit tests)

## Overview

Create the pure grounding function `checkGrounding(entry, codeContext) -> GroundingResult` in `core/check-grounding.js`. The function is the SP2 verifier: it reads the entry's `evidence_code_ref` + the current filesystem state, computes SHA-256 of the file, compares to the stored `code_fingerprint`, and returns a structured answer. The function does NOT mutate entries, does NOT call subprocesses (test-runner integration is deferred to the tool layer), and is deterministic given inputs (including injected `now` and `codeContext.root`). Tests-first: **28 unit tests** lock the contract before any code is written.

**Test count breakdown:** 24 tests from the locked brainstorm + 4 tests added from the pre-plan verification report (C-1 legacy fallback, I-2 strict equality × 2 tests, I-3 corrupt fingerprint, I-8 change-log fast-path grounding shape) = 28 unit tests. The brainstorm T-22 (non-string `evidence_test`) is folded into T-24 (non-string `evidence_code_ref`) as a combined defensive test — both test the same `typeof === "string"` guard pattern.

## Requirements

- Functional:
  - `checkGrounding(entry, codeContext) -> GroundingResult` — pure function, no I/O at unit level (other than `existsSync`, `readFileSync`, `createHash` calls parameterized via `codeContext.root` and `codeContext.now`)
  - Returns the parent's locked shape: `{ id, raw_status, grounding { ... }, status, drift_kind, fingerprint_was_recorded }`
  - **`codeContext` shape (extended from locked design per C-3):** `{ root: string, run_tests?: boolean, test_passed?: boolean | null, now?: () => number }`. Default `now = () => Date.now()`. Default `test_passed = null`. Default `run_tests = false`.
  - **Source-of-truth constants exported:** `META_STATE_GROUNDING_STATUSES` (4 values), `META_STATE_GROUNDING_DRIFT_KINDS` (3 values). Mirrors the SP1 `META_STATE_DERIVATION_KINDS` pattern. `TERMINAL_HASH_REGEX` is internal (`/^sha256:[a-f0-9]{64}$/`).
  - **Legacy fallback (per C-1 mitigation):** the function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (the 8 of 18 legacy findings use the nested form; the 10 newer findings use the top-level form per the SP0 schema).
  - **Change-log fast path (per I-8):** when `entry.entry_kind === "change-log"`, the function returns `status: "skipped"` and `grounding: { checked_at, duration_ms }` only. Applied BEFORE the `mechanism_check` check.
  - **Strict equality (per I-2):** the function checks `mechanism_check === true` (not truthy). `mechanism_check: false` / `"true"` (string) / `1` (number) all yield `status: "skipped"`.
  - **`now` injection (per C-3):** the function captures `t0 = codeContext.now()` at start and computes `duration_ms = codeContext.now() - t0` at end. The function is deterministic given inputs.
  - **`test_passed` pass-through:** when `codeContext.test_passed` is provided, it is passed through to `grounding.test_passed`. When not provided, `grounding.test_passed` is `null`.
  - **Path semantics (per M-1):** absolute paths in `evidence_code_ref` are treated as absolute (not joined with `codeContext.root`). Relative paths are joined with `codeContext.root`. Non-string `evidence_code_ref` is treated as missing. Path traversal (`../`) is accepted as-is (no sanitization; the function reads the filesystem, path safety is the caller's concern).
  - **Corrupt fingerprint (per H-2):** if the stored `entry.code_fingerprint` doesn't match the regex (corruption, manual edit), the function returns `hash_match: null` and `drift_kind: null` (defensive — comparison not possible).
  - **SHA-256 determinism (per M-5):** `computeFileHash(absPath)` returns `"sha256:<64hex>"`. Throws `FileNotFoundError` for non-existent files.
- Non-functional:
  - 512 existing tests still pass (regression-safety floor)
  - 28 new unit tests pass (T-1 to T-28 enumerated below)
  - No new npm dependencies (use only `node:crypto`, `node:fs`, `node:path`)

## Architecture

### `core/check-grounding.js` (new file)

```js
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";

/**
 * Source-of-truth enums. Export so introspection layers (e.g. SP3's drift aggregation)
 * can derive from the same source — mirrors SP0's META_STATE_FINDING_CATEGORIES and
 * SP1's META_STATE_DERIVATION_KINDS.
 */
export const META_STATE_GROUNDING_STATUSES = [
  "grounded", "drifted", "unknown", "skipped",
];

export const META_STATE_GROUNDING_DRIFT_KINDS = [
  "hash_mismatch", "code_missing", "test_failed",
];

/** Internal: validates the canonical format of a stored code_fingerprint. */
const TERMINAL_HASH_REGEX = /^sha256:[a-f0-9]{64}$/;

/** Thrown by computeFileHash when the file is missing or unreadable. */
class FileNotFoundError extends Error {
  constructor(path) {
    super(`File not found or unreadable: ${path}`);
    this.name = "FileNotFoundError";
    this.path = path;
  }
}

/**
 * Compute the SHA-256 of a file's raw bytes, returned as "sha256:<64hex>".
 * Throws FileNotFoundError if the file doesn't exist or can't be read.
 */
export function computeFileHash(absPath) {
  if (!existsSync(absPath)) {
    throw new FileNotFoundError(absPath);
  }
  const bytes = readFileSync(absPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${digest}`;
}

/**
 * Check the grounding of a meta-state finding entry.
 *
 * Pure: deterministic given (entry, codeContext) inputs, including the
 * injected `now` and `codeContext.root` for filesystem checks. No subprocess
 * execution; `test_passed` is passed in, not computed here.
 *
 * Output uses `grounding` (not `derivation`) because the parent's lock uses
 * `grounding` for the nested per-check object. SP1 uses `derivation` for the
 * same concept; the names diverge by design (different tool, different shape).
 *
 * Change-log fast path: when `entry.entry_kind === "change-log"`, returns
 * `status: "skipped"` and `grounding: { checked_at, duration_ms }` only.
 * Applied BEFORE the `mechanism_check` check.
 *
 * Strict equality: `mechanism_check === true` is the opt-in condition.
 * Any other value (false, "true", 1, null, undefined) yields `skipped`.
 *
 * Legacy fallback: reads `entry.evidence_code_ref ?? entry.evidence?.code_ref`
 * (8 of 18 existing findings use the nested form per the SP0 schema).
 *
 * Path safety: the function does not validate path safety — callers should
 * sanitize paths. Relative paths are joined with `codeContext.root` using
 * standard path resolution (e.g., `../` traverses upward).
 */
export function checkGrounding(entry, codeContext) {
  const root = codeContext.root;
  const now = codeContext.now ?? (() => Date.now());
  const t0 = now();

  // Change-log fast path (per I-8)
  if (entry.entry_kind === "change-log") {
    return {
      id: entry.id,
      raw_status: entry.status ?? "active",
      grounding: {
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "skipped",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Strict equality opt-in (per I-2)
  if (entry.mechanism_check !== true) {
    return {
      id: entry.id,
      raw_status: entry.status ?? "active",
      grounding: {
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "skipped",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Signal extraction (per C-1 mitigation: legacy fallback)
  const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
  const codeRef = typeof rawCodeRef === "string" ? rawCodeRef : null;

  // Unknown: opted in but no evidence to ground on
  if (codeRef === null) {
    return {
      id: entry.id,
      raw_status: entry.status ?? "unknown",
      grounding: {
        evidence_code_ref: null,
        code_ref_exists: null,
        code_ref_hash: null,
        code_fingerprint: null,
        hash_match: null,
        tests_referenced: typeof entry.evidence_test === "string",
        tests_run: false,
        test_passed: null,
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "unknown",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Resolve path
  const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef);
  const codeRefExists = existsSync(absPath);

  // Compute hash if file exists
  let codeRefHash = null;
  if (codeRefExists) {
    try {
      codeRefHash = computeFileHash(absPath);
    } catch {
      // File vanished between existsSync and readFileSync (race)
      codeRefExists = false;
    }
  }

  // Validate stored fingerprint against regex (per H-2)
  const storedFingerprint = typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
    ? entry.code_fingerprint
    : null;
  const hashMatch = codeRefHash !== null && storedFingerprint !== null
    ? codeRefHash === storedFingerprint
    : null;

  const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
  const testPass = codeContext.test_passed ?? null;

  const grounding = {
    evidence_code_ref: absPath,
    code_ref_exists: codeRefExists,
    code_ref_hash: codeRefHash,
    code_fingerprint: storedFingerprint,
    hash_match: hashMatch,
    tests_referenced: testPath !== null,
    tests_run: testPath !== null && codeContext.run_tests === true,
    test_passed: testPass,
    checked_at: new Date(t0).toISOString(),
    duration_ms: now() - t0,
  };

  // Status and drift_kind computation
  const status = computeStatus(grounding);
  const driftKind = computeDriftKind(status, grounding);

  return {
    id: entry.id,
    raw_status: entry.status ?? "unknown",
    grounding,
    status,
    drift_kind: driftKind,
    fingerprint_was_recorded: false, // Set by tool layer when auto-record fires
  };
}

function computeStatus(grounding) {
  if (!grounding.code_ref_exists) return "drifted";
  if (grounding.hash_match === false) return "drifted";
  if (grounding.tests_referenced && grounding.tests_run && grounding.test_passed === false) return "drifted";
  return "grounded";
}

function computeDriftKind(status, grounding) {
  if (status !== "drifted") return null;
  if (!grounding.code_ref_exists) return "code_missing";
  if (grounding.hash_match === false) return "hash_mismatch";
  if (grounding.tests_referenced && grounding.tests_run && grounding.test_passed === false) return "test_failed";
  return null; // defensive; should not happen
}
```

### Header comment (per L-1 mitigation)

The header comment in `core/check-grounding.js` includes:
- "Pure: deterministic given (entry, codeContext) inputs..."
- "Output uses `grounding` (not `derivation`)..." (rationale for the divergence from SP1)
- "Change-log fast path: ... (rationale for applying before `mechanism_check` check)"
- Cross-reference to `plans/reports/brainstorm-260602-sp2-check-grounding.md` and `plans/260602-sp1-derive-status/plan.md`

## Tests (write FIRST, then implement)

Create `__tests__/check-grounding.test.js` with 28 tests (T-1 to T-28 enumerated below).

### Status enums (4 tests: T-1, T-2, T-3, T-4)

1. `checkGrounding returns status: "skipped" when mechanism_check is not true (undefined)`
2. `checkGrounding returns status: "skipped" for change-log entries (entry_kind: "change-log")`
3. `checkGrounding returns status: "skipped" when mechanism_check is false (strict equality)`
4. `checkGrounding returns status: "skipped" when mechanism_check is a non-boolean (string "true", number 1, etc.)`

### Status values (4 tests: T-5, T-6, T-7, T-8)

5. `checkGrounding returns status: "unknown" when mechanism_check is true but evidence_code_ref is not set`
6. `checkGrounding returns status: "grounded" when code_ref exists and no fingerprint recorded`
7. `checkGrounding returns status: "grounded" when code_ref exists and fingerprint matches`
8. `checkGrounding returns status: "drifted" with drift_kind: "code_missing" when file is missing`

### Drift kinds (3 tests: T-9, T-10, T-11)

9. `checkGrounding returns status: "drifted" with drift_kind: "hash_mismatch" when fingerprint differs`
10. `checkGrounding returns status: "grounded" when test passed (run_tests: true, evidence_test set, exit 0)`
11. `checkGrounding returns status: "drifted" with drift_kind: "test_failed" when test fails`

### Test runner integration (2 tests: T-12, T-13)

12. `checkGrounding sets test_passed to null when run_tests is false`
13. `checkGrounding sets test_passed to boolean when run_tests is true and test runner spawned`

### Hash match (3 tests: T-14, T-15, T-16)

14. `checkGrounding sets hash_match to null when fingerprint is not yet recorded (first check)`
15. `checkGrounding sets hash_match to null when evidence_code_ref is not set (no comparison possible)`
16. `checkGrounding sets hash_match to null when stored fingerprint is corrupt (regex mismatch)`

### File hash (3 tests: T-17, T-18, T-19)

17. `computeFileHash returns "sha256:<64hex>" for a known file content (deterministic)`
18. `computeFileHash rejects non-existent files (throws FileNotFoundError)`
19. `computeFileHash is deterministic for the same content (call twice, same hash)`

### Path semantics (4 tests: T-20, T-21, T-22, T-23)

20. `checkGrounding handles absolute paths (no join with root)`
21. `checkGrounding handles relative paths (joined with codeContext.root)`
22. `checkGrounding handles paths with spaces (no quoting issues)`
23. `checkGrounding handles path traversal (../, defensively)`
24. `checkGrounding handles non-string evidence_code_ref and evidence_test (defensive null return for both — combines brainstorm T-21 and T-22)`

### Now injection (2 tests: T-25, T-26)

25. `checkGrounding uses injected now() for deterministic checked_at`
26. `checkGrounding computes duration_ms via injected now() (start/end pair)`

### Legacy fallback (1 test: T-27)

27. `checkGrounding reads evidence_code_ref from legacy nested evidence.code_ref field` (C-1 mitigation)

### Change-log fast path grounding shape (1 test: T-28)

28. `checkGrounding returns minimal grounding for change-log fast path (no evidence_code_ref lookup)` (I-8)

## TDD Workflow

1. **Write all 28 new tests first.** Run `pnpm test -- __tests__/check-grounding.test.js`. Observe RED (file not found / 28 tests error).
2. **Create `core/check-grounding.js`** with the implementation above.
3. **Run tests.** Observe GREEN (28 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All 512 existing tests still pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/core/check-grounding.js` (the pure function)
  - `tools/learning-loop-mcp/__tests__/check-grounding.test.js` (the 28 unit tests)
- Modify: none
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/check-grounding.test.js` with 28 stubbed tests.
2. Run `pnpm test -- __tests__/check-grounding.test.js` — confirm file not found / 28 tests error (RED).
3. Create the implementation file `core/check-grounding.js` with the locked design.
4. Run `pnpm test -- __tests__/check-grounding.test.js` — confirm 28 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 512 + 28 = 540 tests pass.

## Success Criteria

- [ ] 28 new unit tests written and failing (RED)
- [ ] 28 new unit tests pass after implementation (GREEN)
- [ ] 512 existing tests still pass (regression-safety floor)
- [ ] `META_STATE_GROUNDING_STATUSES`, `META_STATE_GROUNDING_DRIFT_KINDS` exported as source-of-truth constants
- [ ] Header comment in `core/check-grounding.js` cross-references SP1's `derivation` shape and the change-log fast-path rationale
- [ ] Legacy fallback (`entry.evidence_code_ref ?? entry.evidence?.code_ref`) is unit-tested (T-27)
- [ ] `now` injection is unit-tested (T-25, T-26)
- [ ] `test_passed` pass-through is unit-tested (T-12, T-13)
- [ ] Strict equality for `mechanism_check === true` is unit-tested (T-1, T-3, T-4)
- [ ] Corrupt fingerprint regex validation is unit-tested (T-16)
- [ ] Change-log fast path is unit-tested (T-2, T-28)
- [ ] Path semantics are unit-tested (T-20, T-21, T-22, T-23, T-24)
- [ ] `pnpm test` passes (full suite, ≥ 540 tests)

## Risk Assessment

- **Risk: the `evidence.code_ref` legacy fallback fails for entries with neither `evidence_code_ref` nor `evidence.code_ref` (10 of 18 findings).** Mitigation: `codeRef` is `null` in this case; the function correctly returns `status: "skipped"` (because `mechanism_check` is also undefined for these legacy entries). Unit test T-27 covers the legacy case where `evidence_code_ref` is set in the nested form.
- **Risk: `now()` is not deterministic in tests.** Mitigation: the 2 unit tests T-25, T-26 use `codeContext.now = () => 1700000000000` (or a similar fixed value) and assert exact output.
- **Risk: the `existsSync` and `readFileSync` calls have side effects on the test environment.** Mitigation: the test uses `mkdtempSync(join(tmpdir(), ...))` for `codeContext.root`. The temp dir is auto-cleaned by the OS.
- **Risk: a `path` argument with `..` traverses outside `codeContext.root`.** Mitigation: `join(root, "../etc/passwd")` resolves to `<parent-of-root>/etc/passwd`; the function does not check this. Documented in the function header as "the function does not validate path safety — callers should sanitize paths." This is acceptable for a verifier (the function reads the filesystem; path safety is the caller's concern).
- **Risk: a non-string `evidence_code_ref` causes a TypeError.** Mitigation: T-24 locks in defensive handling. The function checks `typeof rawCodeRef === "string"` before using it.
- **Risk: SHA-256 of a large file is slow.** Mitigation: SHA-256 of typical source files (10-50KB) is < 1ms. The function reads the entire file into memory; for very large files, callers should pass an absolute path to a small file. Not a concern for the current 18 entries (all evidence_code_ref point to small JS files).
- **Risk: race between `existsSync` and `readFileSync`.** Mitigation: the function catches errors from `readFileSync` and treats them as `code_ref_exists: false`. Unit test covers this case implicitly (test creates a temp file, hashes it, deletes it, then re-hashes — the second call throws).

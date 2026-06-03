---
phase: 1
title: "Pure Function `deriveStatus` (TDD, 24 unit tests)"
status: completed
priority: P2
effort: "6-8h"
dependencies: []
---

# Phase 1: Pure Function `deriveStatus` (TDD, 24 unit tests)

## Overview

Create the pure derivation function `deriveStatus(entry, codeContext) -> DerivedStatus` in `core/derive-status.js`. The function is the verifier (Pattern 2 from the parent doc): it reads the entry's stored references + the current filesystem state, computes the locked shape, and returns a structured answer. The function does NOT mutate entries, does NOT call subprocesses (test-runner integration is deferred to the tool layer), and is deterministic given inputs (including injected `now` and `codeContext.root`). Tests-first: **24 unit tests** (12 original from the brainstorm + 12 added from the pre-plan verification report's risk table) lock the contract before any code is written.

## Requirements

- Functional:
  - `deriveStatus(entry, codeContext) -> DerivedStatus` — pure function, no I/O at unit level (other than the parameterized `existsSync` calls via `codeContext.root`)
  - Returns the parent's locked shape: `{ id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }`
  - **`codeContext` shape:** `{ root: string, run_tests?: boolean, test_runner?: string, test_passed?: boolean | null, now?: () => number }`. Default `now = () => Date.now()`. Default `test_passed = null`. Default `run_tests = false`. Default `test_runner = "pnpm test -- "`.
  - **Source-of-truth constants exported:** `META_STATE_DERIVATION_KINDS` (4 values), `META_STATE_DERIVED_STATUSES` (3 values), `META_STATE_RECOMMENDATIONS` (4 values). Mirrors the SP0 `META_STATE_FINDING_CATEGORIES` pattern.
  - **Legacy fallback (per C-1 mitigation):** the function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (the 8 of 18 legacy findings use the nested form; the 10 newer findings use the top-level form per the SP0 schema). Same `evidence_test` lookup is top-level only (no legacy equivalent).
  - **Change-log fast path (per C-3 mitigation):** when `entry.entry_kind === "change-log"`, return `{ id, raw_status: "active", derived_status: "active-no-signal", derivation: { kind: "no-signals", signals: {}, checked_at, duration_ms }, drift: false, recommendation: "no_action" }`. Reuses the locked `"no-signals"` kind and `"active-no-signal"` derived_status (semantically accurate: change-logs have no `evidence_code_ref` field).
  - **`now` injection (per H-2 mitigation):** the function captures `t0 = codeContext.now()` at start and computes `duration_ms = codeContext.now() - t0` at end. The function is deterministic given inputs.
  - **`test_passed` pass-through (per H-3 mitigation):** when `codeContext.test_passed` is provided, it is passed through to `signals.test_passed`. When not provided, `signals.test_passed` is `null`.
  - **Path semantics (per M-3 mitigation):** absolute paths in `evidence_code_ref` are treated as absolute (not joined with `codeContext.root`). Relative paths are joined with `codeContext.root`. Non-string `evidence_code_ref` is treated as missing.
- Non-functional:
  - 475 existing tests still pass (regression-safety floor)
  - 24 new unit tests pass (12 original + 12 added)
  - No new npm dependencies (use only `node:fs`, `node:path`)

## Architecture

### `core/derive-status.js` (new file)

```js
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

/**
 * Source-of-truth enums. Export so introspection layers (e.g., core/loop-introspect.js
 * in a future SP3) can derive from the same source — mirrors SP0's META_STATE_FINDING_CATEGORIES.
 */
export const META_STATE_DERIVATION_KINDS = [
  "mechanism-shipped", "code-only", "code-missing", "no-signals",
];

export const META_STATE_DERIVED_STATUSES = [
  "resolved-by-mechanism", "active-no-signal", "active-uncertain",
];

export const META_STATE_RECOMMENDATIONS = [
  "no_action", "resolve", "investigate", "log_drift",
];

/** Terminal raw_status values: a `resolved-by-mechanism` derivation is NOT drift
 *  if the entry is already in a terminal state (the agent's claim is consistent). */
const TERMINAL_RAW_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

/**
 * Derive the effective status of a meta-state finding entry.
 *
 * Pure: deterministic given (entry, codeContext) inputs, including the
 * injected `now` and `codeContext.root` for filesystem checks. No subprocess
 * execution; `test_passed` is passed in, not computed here.
 *
 * Output uses `signals` (not `evidence`) for per-check booleans because
 * `evidence` is reserved for `records/meta/evidence/` artifacts in the
 * parent doc (per the locked design, brainstorm-260602-sp1-derive-status.md).
 *
 * Change-log fast path: when `entry.entry_kind === "change-log"`, returns
 * `kind: "no-signals"` and `derived_status: "active-no-signal"` (reuses the
 * locked enums; semantically accurate — change-logs have no `evidence_code_ref`).
 */
export function deriveStatus(entry, codeContext) {
  const root = codeContext.root;
  const now = codeContext.now ?? (() => Date.now());
  const t0 = now();

  // Change-log fast path (per C-3 mitigation)
  if (entry.entry_kind === "change-log") {
    return {
      id: entry.id,
      raw_status: entry.status ?? "active",
      derived_status: "active-no-signal",
      derivation: {
        kind: "no-signals",
        signals: {},
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      drift: false,
      recommendation: "no_action",
    };
  }

  // Signal extraction (per C-1 mitigation: legacy fallback)
  const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
  const codeRef = typeof rawCodeRef === "string" ? rawCodeRef : null;
  const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;

  const codeRefExists = codeRef ? checkExists(root, codeRef) : null;
  const testFileExists = testPath ? checkExists(root, testPath) : null;

  const signals = {
    ...(codeRef !== null && { code_ref_exists: codeRefExists, code_ref_path: codeRef }),
    ...(testPath !== null && { test_file_exists: testFileExists, test_file_path: testPath }),
    test_passed: codeContext.test_passed ?? null,
  };

  // Kind computation
  const kind = computeKind(codeRefExists, testFileExists, codeRef, testPath);
  const derived_status = computeDerivedStatus(kind);
  const recommendation = computeRecommendation(derived_status, kind, entry.status);
  const drift = computeDrift(derived_status, entry.status);

  return {
    id: entry.id,
    raw_status: entry.status ?? "unknown",
    derived_status,
    derivation: {
      kind,
      signals,
      checked_at: new Date(t0).toISOString(),
      duration_ms: now() - t0,
    },
    drift,
    recommendation,
  };
}

function checkExists(root, path) {
  const fullPath = isAbsolute(path) ? path : join(root, path);
  return existsSync(fullPath);
}

function computeKind(codeRefExists, testFileExists, codeRef, testPath) {
  if (codeRef === null && testPath === null) return "no-signals";
  if (codeRefExists === false) return "code-missing";
  if (testPath !== null && testFileExists === false) return "code-only";
  return "mechanism-shipped";
}

function computeDerivedStatus(kind) {
  if (kind === "mechanism-shipped") return "resolved-by-mechanism";
  if (kind === "code-only") return "active-uncertain";
  return "active-no-signal"; // code-missing or no-signals
}

function computeRecommendation(derivedStatus, kind, rawStatus) {
  if (kind === "mechanism-shipped" && (rawStatus === "reported" || rawStatus === "active")) {
    return "resolve";
  }
  if (kind === "mechanism-shipped" && TERMINAL_RAW_STATUSES.has(rawStatus)) {
    return "log_drift";
  }
  if (kind === "code-missing") return "investigate";
  return "no_action";
}

function computeDrift(derivedStatus, rawStatus) {
  if (derivedStatus !== "resolved-by-mechanism") return false;
  return !TERMINAL_RAW_STATUSES.has(rawStatus);
}
```

### Header comment (per L-2 mitigation)

The header comment in `core/derive-status.js` includes:
- "Pure: deterministic given (entry, codeContext) inputs..."
- "Output uses `signals` (not `evidence`)..." (rationale for the rename from the parent's `evidence` term)
- "Change-log fast path: ... (rationale for reusing `"no-signals"` and `"active-no-signal"`)"
- Cross-reference to `plans/reports/brainstorm-260602-sp1-derive-status.md`

## Tests (write FIRST, then implement)

Create `__tests__/derive-status.test.js` with 24 tests (12 original from the brainstorm + 12 added from the pre-plan verification report).

### Original 12 tests (from the brainstorm)

1. `deriveStatus returns kind: "mechanism-shipped" when both code_ref and test_file exist`
2. `deriveStatus returns kind: "code-only" when code_ref exists but test_file is specified and missing`
3. `deriveStatus returns kind: "code-missing" when code_ref is specified and missing`
4. `deriveStatus returns kind: "no-signals" when entry has no code_ref or test_file paths`
5. `deriveStatus sets signals.test_passed to null when run_tests is false (and codeContext.test_passed is not provided)`
6. `deriveStatus returns derived_status: "resolved-by-mechanism" for kind: "mechanism-shipped"`
7. `deriveStatus returns derived_status: "active-no-signal" for kind: "code-missing" or "no-signals"`
8. `deriveStatus returns derived_status: "active-uncertain" for kind: "code-only"`
9. `deriveStatus returns recommendation: "resolve" when mechanism shipped and raw_status is reported/active`
10. `deriveStatus returns recommendation: "investigate" when code_ref is missing`
11. `deriveStatus returns recommendation: "no_action" when signals match raw_status assertion (e.g., active + active-no-signal)`
12. `deriveStatus sets drift: true when mechanism shipped but raw_status is not terminal`

### Added 12 tests (from the verification report)

13. **`deriveStatus reads evidence_code_ref from legacy nested evidence.code_ref field`** (C-1 mitigation) — entry has `evidence: { code_ref: "..." }` (no top-level `evidence_code_ref`); function reads `entry.evidence.code_ref`.
14. **`deriveStatus populates checked_at as a valid ISO string`** (H-2 mitigation) — `new Date(checked_at)` is a valid Date.
15. **`deriveStatus populates duration_ms as a non-negative number`** (H-2 mitigation) — `duration_ms >= 0`.
16. **`deriveStatus uses injected now() for deterministic checked_at`** (H-2 mitigation) — pass `codeContext.now = () => 1700000000000`; assert `checked_at === new Date(1700000000000).toISOString()`.
17. **`deriveStatus passes through codeContext.test_passed when provided`** (H-3 mitigation) — pass `codeContext.test_passed = true`; assert `signals.test_passed === true`.
18. **`deriveStatus does not run subprocesses (signals.test_passed stays null when codeContext.test_passed is omitted)`** (H-3 mitigation) — even if `codeContext.run_tests = true`, `signals.test_passed` is `null` because the function does not invoke any subprocess.
19. **`deriveStatus sets drift: false when mechanism shipped and raw_status is terminal (e.g., resolved)`** (M-2 mitigation) — entry with `status: "resolved"` and `evidence_code_ref` to an existing file; assert `drift: false`.
20. **`deriveStatus sets drift: false when kind is code-missing or code-only regardless of raw_status`** (M-2 mitigation).
21. **`deriveStatus returns kind: "no-signals" (fast-path) and drift: false for change-log entries`** (C-3 + M-2 mitigation) — entry with `entry_kind: "change-log"`; assert `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`.
22. **`deriveStatus resolves relative paths in evidence_code_ref against codeContext.root`** (M-3 mitigation) — use `mkdtempSync` + `mkdirSync` to create a real file; pass `codeContext.root = tempDir`; assert `code_ref_exists: true`.
23. **`deriveStatus treats absolute paths in evidence_code_ref as absolute (does not join with codeContext.root)`** (M-3 mitigation) — use an absolute path outside the temp dir; assert `code_ref_exists: false` (file doesn't exist) without throwing.
24. **`deriveStatus defensively handles non-string evidence_code_ref (null, number) as missing`** (M-3 mitigation) — pass `entry.evidence_code_ref = null` (or `42`); assert `code_ref_exists: null` (field absent) and `kind: "no-signals"`.

## TDD Workflow

1. **Write all 24 new tests first.** Run `pnpm test -- __tests__/derive-status.test.js`. Observe RED (file not found / 24 tests error).
2. **Create `core/derive-status.js`** with the implementation above.
3. **Run tests.** Observe GREEN (24 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All 475 existing tests still pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/core/derive-status.js` (the pure function)
  - `tools/learning-loop-mcp/__tests__/derive-status.test.js` (the 24 unit tests)
- Modify: none
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/derive-status.test.js` with 24 stubbed tests.
2. Run `pnpm test -- __tests__/derive-status.test.js` — confirm file not found / 24 tests error (RED).
3. Create the implementation file `core/derive-status.js` with the locked design.
4. Run `pnpm test -- __tests__/derive-status.test.js` — confirm 24 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 475 + 24 = 499 tests pass.

## Success Criteria

- [ ] 24 new unit tests written and failing (RED)
- [ ] 24 new unit tests pass after implementation (GREEN)
- [ ] 475 existing tests still pass (regression-safety floor)
- [ ] `META_STATE_DERIVATION_KINDS`, `META_STATE_DERIVED_STATUSES`, `META_STATE_RECOMMENDATIONS` exported as source-of-truth constants
- [ ] Header comment in `core/derive-status.js` cross-references the parent's `evidence` → `signals` rename and the change-log fast-path rationale
- [ ] Legacy fallback (`entry.evidence_code_ref ?? entry.evidence?.code_ref`) is unit-tested (T-13)
- [ ] `now` injection is unit-tested (T-14, T-15, T-16)
- [ ] `test_passed` pass-through is unit-tested (T-17, T-18)
- [ ] Drift converse cases are unit-tested (T-19, T-20)
- [ ] Change-log fast path is unit-tested (T-21)
- [ ] Path semantics are unit-tested (T-22, T-23, T-24)
- [ ] `pnpm test` passes (full suite, ≥ 499 tests)

## Risk Assessment

- **Risk: the `evidence.code_ref` legacy fallback fails for entries with neither `evidence_code_ref` nor `evidence.code_ref` (10 of 18 findings).** Mitigation: `codeRef` is `null` in this case; `kind: "no-signals"` is the safe default; `recommendation: "no_action"` is correct (signals match the assertion).
- **Risk: `now()` is not deterministic in tests.** Mitigation: the 3 unit tests T-14, T-15, T-16 use `codeContext.now = () => 1700000000000` (or a similar fixed value) and assert exact output.
- **Risk: the `existsSync` call has side effects on the test environment.** Mitigation: the test uses `mkdtempSync(join(tmpdir(), ...))` for `codeContext.root`. The temp dir is auto-cleaned by the OS.
- **Risk: a `path` argument with `..` traverses outside `codeContext.root`.** Mitigation: `join(root, "../etc/passwd")` resolves to `<parent-of-root>/etc/passwd`; the function does not check this. Documented in the function header as "the function does not validate path safety — callers should sanitize paths." This is acceptable for a verifier (the function reads the filesystem; path safety is the caller's concern).
- **Risk: a non-string `evidence_code_ref` causes a TypeError.** Mitigation: T-24 locks in defensive handling. The function checks `typeof rawCodeRef === "string"` before using it.
- **Risk: `recommendation: "log_drift"` is semantically the converse of `drift: true` (H-1).** Mitigation: keep the locked 4-value enum. Unit test locks in the trigger. The semantic is "the entry was claimed resolved AND the mechanism exists; this is a no-op for the agent." SP3 (drift aggregation) is where drift patterns actually surface.

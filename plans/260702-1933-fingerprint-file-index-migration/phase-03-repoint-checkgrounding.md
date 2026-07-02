---
phase: 3
title: "Repoint CheckGrounding"
status: pending
priority: P1
dependencies: [1, 2]
---

# Phase 3: Repoint CheckGrounding

## Overview

Repoint the grounding **baseline** from the per-finding `code_fingerprint` to the shared path-keyed index, passed in via `codeContext.fileIndex`, with the per-record field as **fallback**. The pure function stays pure (index passed in, not read from disk). This is the core of the vestigial migration: the index becomes authoritative, the per-record field becomes dead-data fallback.

## Requirements

- Functional: `checkGrounding(entry, codeContext)` resolves baseline as `validatedIndexBaseline ?? validatedPerRecordFallback ?? null`, where both baselines are validated against `TERMINAL_HASH_REGEX` (red-team F6). When the index has the canonical key, it wins; otherwise fall back to the per-record field (preserves the 30 unit tests, which pass no `fileIndex`).
- Non-functional: **`checkGrounding` stays a pure function** (no filesystem read of the sidecar). The index is passed in via `codeContext.fileIndex`; the tool layer loads it (cached — Phase 1/F11).
- The 30 `check-grounding.test.js` unit tests pass **unchanged** (they pass `entry.code_fingerprint` with no `codeContext.fileIndex`, exercising the fallback).
- **Red-team F1 — cold-tier test is updated, NOT "unchanged":** `cold-tier-regression.test.js` loads `readFileIndex(root)` and passes `fileIndex` in `codeContext` for the grounding loop. After Phase 5 stops writing the per-record field, the fallback would be stale/undefined; the test must exercise the authoritative path. Same `grounded` invariant, authoritative path.
- **Red-team F2 — repoint `checkResolutionEvidence`:** `gate-logic.js#checkResolutionEvidence` (the `rule-no-orphaned-evidence` gate, ~line 692) compares the live hash to `entry.code_fingerprint` directly — NOT via `checkGrounding`. It must be repointed to read the index baseline (load `readFileIndex(root)`, compare to `index.get(canonicalKey)`) with the per-record field as fallback. Without this, the gate fails in CI for any edited source file post-migration.
- **Red-team F5 — repoint `query_drift`:** `meta-state-query-drift-tool.js` (~line 45-51) builds `codeContext` with no `fileIndex`; `queryDrift` calls `checkGrounding` and would hit the stale fallback → false drift. Wire `readFileIndex(root)` into its handler identically to the check-grounding tool.

## Architecture

- `check-grounding.js#checkGrounding`: baseline resolution from `codeContext.fileIndex` (a `Map<canonicalKey, hash>` or undefined), validated; existing `entry.code_fingerprint` becomes the validated fallback.
  ```js
  // NEW: index baseline (authoritative) with validated per-record fallback (vestigial).
  const idx = codeContext.fileIndex; // Map|undefined
  const canonical = canonicalIndexKey(codeRef); // stripped relative path (Phase 1)
  const rawIndex = idx && idx.has(canonical) ? idx.get(canonical) : null;
  const indexBaseline = typeof rawIndex === "string" && TERMINAL_HASH_REGEX.test(rawIndex) ? rawIndex : null; // F6
  const storedFingerprint = indexBaseline
    ?? (typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint : null);
  ```
  The `hash_match` / `status` / `drift_kind` computation downstream is **unchanged** — only the baseline source changes.
- `meta-state-check-grounding-tool.js`: load `const fileIndex = readFileIndex(root)` (cached) and pass `codeContext = { root, run_tests, test_passed, fileIndex }`. Use `computeFileHashCached` (Phase 2) for the live hash.
- `meta-state-query-drift-tool.js`: load `fileIndex` the same way; pass it in `codeContext` (F5).
- `gate-logic.js#checkResolutionEvidence`: repoint the baseline read from `entry.code_fingerprint` to `readFileIndex(root).get(canonicalKey(evidence_code_ref)) ?? entry.code_fingerprint`, both validated (F2). Add to the modify list.
- `cold-tier-regression.test.js`: surgical update — `const fileIndex = readFileIndex(root);` then `checkGrounding(finding, { root, fileIndex })` in the grounding loop. The skip-classes and assertions stay; only the call gains `fileIndex` (F1).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/check-grounding.js` (`checkGrounding` baseline resolution; validate index baseline; ~12 lines).
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (`checkResolutionEvidence` ~line 692 — repoint baseline to index; F2).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js` (load + pass `fileIndex`; use `computeFileHashCached`).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-query-drift-tool.js` (load + pass `fileIndex`; F5).
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (surgical: load index + pass `fileIndex` in the grounding loop; F1).
- Reference: `tools/learning-loop-mastra/__tests__/legacy-mcp/check-grounding.test.js` (30 tests — must pass unchanged).

## Implementation Steps

1. **TDD — lock current behavior first:** run `pnpm test -- check-grounding cold-tier-regression` and confirm green baseline (30 + cold-tier). Note the green snapshot.
2. Add `codeContext.fileIndex` resolution to `checkGrounding` (snippet above, with F6 validation). Verify the 30 unit tests still pass unchanged (they exercise the fallback).
3. Add **new** unit tests: index-present -> index wins; index-present overrides per-record field; index-missing -> per-record fallback; index-missing + no per-record -> `hash_match:null` -> `grounded` (file exists); **index-baseline corrupt (fails regex) -> falls through to per-record (F6)**.
4. Wire `readFileIndex(root)` into the **check-grounding tool** AND the **query-drift tool** handlers; pass `fileIndex` in `codeContext`; use `computeFileHashCached` (F5).
5. Repoint `checkResolutionEvidence` in `gate-logic.js` to read the index baseline (F2). Add/adjust its tests to assert the index-authoritative path.
6. Surgical update to `cold-tier-regression.test.js`: load `readFileIndex(root)`, pass `fileIndex` in the grounding loop (F1). Confirm green.
7. Run full grounding + cold-tier + gate + query-drift suites. All green.

## Success Criteria (TDD)

- [ ] Pre-step: 30 `check-grounding.test.js` + `cold-tier-regression` green before any change (baseline locked).
- [ ] After change: same 30 `check-grounding.test.js` tests green **unchanged** (fallback path preserved).
- [ ] **New** unit tests pass: index-authoritative, index-overrides-per-record, index-missing-fallback, index-missing-no-per-record-grounds, **index-corrupt-falls-to-fallback (F6)**.
- [ ] `cold-tier-regression.test.js` passes **with the index loaded** (surgical update, F1) — same `grounded` invariant.
- [ ] `checkResolutionEvidence` repointed to the index (F2); its tests assert index-authoritative + fallback.
- [ ] `query_drift` passes `fileIndex` (F5); a legitimately-edited+refreshed finding reports `grounded`, not false drift.
- [ ] `checkGrounding` remains a pure function (no `readFileSync`/`readFileIndex` call inside it — verified by grep: `check-grounding.js` imports no new fs read for the index).

## Risk Assessment

- **Risk (red-team F1, highest):** leaving the cold-tier test on the fallback path → drift masked/fails post-Phase-5. **Mitigation:** surgical update loads the index; the test asserts the authoritative path.
- **Risk (red-team F2):** `checkResolutionEvidence` not repointed → CI gate fails for edited source files. **Mitigation:** repoint in this phase; test the gate with a seeded index.
- **Risk (red-team F5):** `query_drift` on the fallback → false drift events. **Mitigation:** wire `fileIndex` into its handler identically.
- **Risk (red-team F6):** corrupt index value → false drift (drops H-2 defense). **Mitigation:** validate `indexBaseline` against `TERMINAL_HASH_REGEX`; corrupt falls through to the fallback.
- **Risk:** index-stale -> false drift (index baseline older than file). **Same failure mode as today's per-record staleness**; fixed by one refresh (Phase 4) instead of N. Acceptable and the intended improvement.
- **Rollback:** remove the `codeContext.fileIndex` resolution + the cold-tier/test updates + the `checkResolutionEvidence` repoint; baseline reverts to per-record field. Zero data loss (index never mutated findings).

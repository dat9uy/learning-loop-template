---
phase: 2
title: "1 — Diagnostic red: dual-form coverage"
status: completed
priority: P1
effort: "30m"
dependencies: ["0"]
---

# Phase 1: Diagnostic red — dual-form coverage

## Overview

Write the first test that captures the current (broken) state. **RED:** 30 entries carry nested `evidence.code_ref`; 2 of 4 union branches expose `evidence_code_ref` top-level. The failing tests are the red signal for Phases 3 (schema flatten) and 4 (migration).

## Requirements

- **Functional:** 3 tests in `__tests__/meta-state-evidence-coverage.test.js`:
  1. `T-1`: 0 entries carry nested `evidence.code_ref` (currently fails: 30)
  2. `T-2`: all active findings with `mechanism_check === true` have either `evidence_code_ref` or `evidence.code_ref` set
  3. `T-3`: 3 of 4 union branches expose `evidence_code_ref` as a top-level field (finding, change-log, rule; loop-design exempt — loop-designs don't have evidence). Currently fails: 1 of 3 — change-log uses nested.
- **Non-functional:** test is read-only (no registry mutation). Uses `mkdtempSync` + a fixture with 4 representative entries (one per kind). Also a real-registry test that reads the project's `meta-state.jsonl`.

## Architecture

Pure test scaffolding. No production code changes. The "red" state is captured in the test file itself; no separate diagnostic script.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js`

## Implementation Steps

1. **Test fixture (4 entries, one per kind).** Create a function `buildFixtureRegistry()` that returns a fresh `mkdtempSync` directory with 4 entries: 1 finding (with `evidence_code_ref` top-level only), 1 change-log (with only `evidence.code_ref` nested), 1 rule (with `evidence_code_ref` top-level), 1 loop-design (no `evidence` field).
2. **T-1: 0 nested `evidence.code_ref`.** Read fixture, count entries with `e.evidence?.code_ref`, assert === 0. Currently: 2 (finding + change-log).
3. **T-2: all active findings with mechanism_check have a code_ref.** Read project's `meta-state.jsonl` via `readRegistry(root)`, filter `entry_kind: "finding" && status in {active, reported} && mechanism_check === true`, assert every entry has `e.evidence_code_ref || e.evidence?.code_ref`. Currently passes (no false negatives).
4. **T-3: 3 of 4 union branches expose `evidence_code_ref` top-level.** Inspect the 3 zod schemas that should have the field: `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`. For each, parse a stub entry that includes `evidence_code_ref: "x.js"`; assert the schema accepts it. For `metaStateLoopDesignSchema`, assert it does NOT require `evidence_code_ref` (the field is absent by design). Currently: 1 of 3 fails (change-log rejects because its schema doesn't have the field).
5. **Run tests.** Expect T-1 and T-3 to fail (RED); T-2 to pass (it's a safety net).

## Success Criteria

- [ ] `node --test tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` runs
- [ ] T-1 fails (30 nested entries)
- [ ] T-2 passes (no orphan findings)
- [ ] T-3 fails (change-log schema lacks top-level `evidence_code_ref`)

## Risk Assessment

- **Risk:** T-2 is the only test currently passing. **Mitigation:** keep T-2 as the regression guard; it must NOT regress in any later phase.
- **Risk:** T-3 over-constrains by requiring `loop-design` to have `evidence_code_ref`. **Mitigation:** the test should only assert the schema ACCEPTS the field when provided (using `.safeParse({ ...stub, evidence_code_ref: "x.js" })`); it should not require the field on loop-design. The loop-design schema's lack of `evidence_code_ref` is intentional (loop-designs don't have evidence).
- **Risk:** Hardcoded entry count in T-1 (assert === 0) may regress if a new entry is added with nested form. **Mitigation:** the test is the canonical regression guard. Any test failure here means a new entry has regressed; the migration script in Phase 4 should be re-run.

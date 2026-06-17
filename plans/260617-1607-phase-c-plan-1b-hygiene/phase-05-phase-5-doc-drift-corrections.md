---
phase: 5
title: "phase-5-doc-drift-corrections"
status: pending
effort: "30min"
---

# Phase 5: Doc Drift Corrections (Plan 1a review Minors 7-10 + Minor 6)

## Overview

Correct 5 doc locations that contain stale or hallucinated information from Plan 1a. Also rename `TERMINAL_STATUSES` to `EXCLUDABLE_STATUSES` (or add `"archived"` to the set) per Plan 1a review Minor 6 to remove the naming inconsistency.

<!-- Updated: Validation Session 1 - corrected line references per verification (journal: 25 + 31; Plan 2: 121; Plan 1a: 44, 46, 85, 87, 113, 201; closeout: 6 + 28). Self-drift fix decision. -->

## Context Links

- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` [Minor 6, 7, 8, 9, 10]
- `package.json:17` (test script; 10 globs verified 2026-06-17)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md` (lines 44, 46, 85, 87, 113, 201 — all contain "9 test namespaces"; line 113 has "+4 RED tests")
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` (lines 6, 28 — both "9 test namespaces")
- `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` (line 25 — hallucinated 5 map names; line 31 — TERMINAL_STATUSES "added" claim)
- `docs/project-changelog.md` (Plan 1a entry to add; test count math)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14` (TERMINAL_STATUSES set; will rename to EXCLUDABLE_STATUSES)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md:121` (R-09 arithmetic; 70-mastra-test count anchor — NOTE: was incorrectly cited as line 105 in prior draft; verified 2026-06-17)

## Requirements

- **Functional:** All 7 doc locations (5 originals + Plan 1a plan.md lines 44, 85, 201 + Plan 1a closeout line 6) are corrected; the `TERMINAL_STATUSES` naming inconsistency is resolved.
- **Non-functional:** No code logic changes (Phase 5 is doc + 1-line code rename only).

## Architecture

**Doc correction 1 — Plan 1a `plan.md` (6 lines):**
- Lines 44, 46, 85, 87, 113, 201 — "9 test namespaces" / "9 legacy namespaces" → "all test namespaces" (durable anchor)
- Line 113 — "+4 RED tests" → "+5 new test files / +11 new tests"

**Doc correction 2 — Plan 1a `closeout-report.md` (2 lines):**
- Line 6, 28 — "9 test namespaces" → "all test namespaces" or "all 10 test namespaces"

**Doc correction 3 — Plan 1a journal `2026-06-17-phase-c-plan-1a-closeout.md` (2 lines):**
- Line 25 — "5 maps: `supersedes_inverse, resolves_inverse, archives_inverse, consolidates_inverse, depends_on_inverse`" → "5 maps: `addresses_inverse, supersedes_inverse, origin_inverse, promoted_to_rule_inverse, reopens_inverse`"
- Line 31 — "TERMINAL_STATUSES array added; 173-182 — filter logic changed" → "filter logic at lines 179-186 changed; TERMINAL_STATUSES set was pre-existing from plan 260611-1000"

**Doc correction 4 — `docs/project-changelog.md` Plan 1a entry (to be added in this phase):**
- Add "2026-06-17 — Phase C Plan 1a" entry: 2 findings resolved, 4 fixes shipped, 5 new test files / 11 new tests, all 10 test namespaces pass, 1069 pass / 0 fail / 1 skip.

**Doc correction 5 — `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14` (rename):**
- Rename `TERMINAL_STATUSES` → `EXCLUDABLE_STATUSES` (validation decision 2026-06-17; semantic unification, single-flag path). Update the JSDoc comment at lines 12-13 to match. Search the file for all references and update each (lines 14, 179, 182 verified).
- NOT adding `"archived"` to the set (rejected — would require deleting the separate `if (!include_archived)` filter at line ~180 and changing the dual-filter pattern; larger blast radius).

**Doc correction 6 — `plans/260616-2200-phase-c-plan-2-parity/plan.md:121` (CR-6 R-09 arithmetic):**
- Rewrite the R-09 arithmetic to anchor on "all 10 test namespaces pass" (durable). Replace the 70-mastra-test count claim with a reference to the package.json test script envelope. The per-test counts (55 baseline + 36 parity + 5 cold-session + 3 collision) are snapshots that drift; the namespace count is durable.
- Validation decision 2026-06-17: durable anchor > precise counts (precise counts are inherently stale; per-test counts are snapshots).

**Doc correction 7 — Plan 1b's own Phase 5 line references (self-drift fix):**
- This document's prior draft cited wrong line numbers (journal 38-60, Plan 2 105, Plan 1a 46/87/113, closeout 28). Corrected to verified locations during Validation Session 1. This entry is the audit trail; future readers can trace the correction back to the validation log.

## Related Code Files

- **Modify:** `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md` (lines 44, 46, 85, 87, 113, 201 — 6 corrections)
- **Modify:** `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` (lines 6, 28 — 2 corrections)
- **Modify:** `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` (lines 25, 31 — 2 corrections)
- **Modify:** `docs/project-changelog.md` (add Plan 1a entry)
- **Modify:** `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (lines 12-14, 179, 182 — rename `TERMINAL_STATUSES` → `EXCLUDABLE_STATUSES`; update comment)
- **Modify:** `plans/260616-2200-phase-c-plan-2-parity/plan.md:121` (R-09 arithmetic to durable anchor; CR-6)

## Implementation Steps

1. **Plan 1a `plan.md`:** Grep for "9 test namespaces" and "9 legacy namespaces"; correct all 6 occurrences (lines 44, 46, 85, 87, 113, 201) to "all test namespaces" (durable). Grep for "+4 RED tests" at line 113; correct to "+5 new test files / +11 new tests".
2. **Plan 1a `closeout-report.md`:** Grep for "9 test namespaces"; correct both occurrences (lines 6, 28).
3. **Plan 1a journal line 25:** Rewrite the hallucinated 5-map claim to use the real 5 map names. Preserve the "Brutal Truth" narrative voice; only correct the technical details.
4. **Plan 1a journal line 31:** Rewrite the "Finding 1 fix location" to clarify TERMINAL_STATUSES was pre-existing (line 14 unchanged; lines 179-186 changed in Plan 1a).
5. **`docs/project-changelog.md`:** Add a "2026-06-17 — Phase C Plan 1a" entry. Reference the actual test counts (5 new test files, 11 new tests, 1069 pass / 0 fail / 1 skip, 2 findings resolved, 4 fixes shipped).
6. **`meta-state-list-tool.js`:** Rename `TERMINAL_STATUSES` → `EXCLUDABLE_STATUSES` (validation decision). Update the JSDoc comment at lines 12-13. Grep the file for all references (verified at lines 14, 179, 182) and update each.
7. **Plan 2 `plan.md:121`:** Rewrite the R-09 arithmetic to anchor on "all 10 test namespaces pass" (durable). Replace the 70-mastra-test count with a reference to `package.json:17` test envelope.
8. **Verify:** `pnpm test` runs GREEN; 0 regressions (Phase 5 is doc + 1 rename only).

## Success Criteria

- [ ] All 7 doc locations are corrected; the misleading claims are replaced with accurate text.
- [ ] `TERMINAL_STATUSES` is renamed to `EXCLUDABLE_STATUSES`; the comment at lines 12-13 is updated to match; all references in the file (lines 14, 179, 182) are updated.
- [ ] `docs/project-changelog.md` has a Plan 1a entry with accurate test counts (5 new test files / 11 new tests / 1069 pass).
- [ ] Plan 2's R-09 arithmetic at line 121 uses the durable "all 10 test namespaces pass" anchor (per validation decision 2026-06-17).
- [ ] Plan 1b's own Phase 5 line references are self-consistent (validated in Validation Session 1).
- [ ] All 10 test namespaces pass; 0 regressions (the rename is a no-op semantically; the comment update is doc-only).

## Risk Assessment

- **Risk:** The `EXCLUDABLE_STATUSES` rename breaks a downstream consumer that imports the constant. **Mitigation:** It's a module-local constant (not exported); grep the file for all references and update each (verified at lines 14, 179, 182). No cross-module imports.
- **Risk:** Doc corrections are subjective (e.g., "all test namespaces" vs "10 test namespaces"). **Mitigation:** Use "all test namespaces" for the durable anchor in plan.md; use "10 test namespaces" only when citing the `package.json:17` evidence. Document the choice in the closeout.
- **Risk:** The Plan 2 plan.md R-09 arithmetic at line 121 was the operator's prior decision; changing it could be perceived as audit drift. **Mitigation:** The change is from a stale count to a durable anchor; it strengthens the operator's intent (testability is per-namespace, not per-count). Document the rationale in the change-log entry (CR-6 origin from PR #3 review).
- **Risk:** The journal's "war story" tone may lose narrative value after the corrections. **Mitigation:** Preserve the structure; only correct the technical details. The "Brutal Truth" is still valid (TTL pressure was real); the inverse-index claim is corrected without changing the lesson. Validation decision: correct the names in place (not a footnote, not a deletion) — preserves narrative voice AND fixes technical details.
- **Risk:** The Phase 3 duplicate-ids RED test fails mid-PR (between commits 3 and 4 of Plan 1b's PR). **Mitigation:** Validation decision 2026-06-17: accept failing test mid-PR. Document in PR description; expected by author. Bisect-friendly. Phase 4 makes it GREEN.

## TDD Note

This phase is doc-only (no code RED/GREEN). The `TERMINAL_STATUSES` rename is a code change but is semantically a no-op (the constant's value doesn't change, only its name + comment). Verification: all tests still pass after the rename.

## Next Steps

- Phase 6 (acceptance gate) runs the full `pnpm test`, files the `meta_state_log_change`, and flips the master tracker.

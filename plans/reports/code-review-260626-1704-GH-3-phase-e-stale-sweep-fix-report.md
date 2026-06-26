---
title: "Code Review — plans/260626-1535-phase-e-stale-sweep-fix/ (last 4 commits)"
reviewer: ck-code-review
session: 260626-1704
input: "4 commits affecting plan 260626-1535-phase-e-stale-sweep-fix"
date: 2026-06-26
branch: phase-e/plan-3-housekeeping
status: NEEDS_FIXES
---

# Code Review — Phase E Stale Sweep Fix

## Scope Reviewed

The 4 commits implementing `plans/260626-1535-phase-e-stale-sweep-fix/`:

| # | SHA | Subject |
|---|------|---------|
| 1 | `789cf5c` | chore(phase-e): apply corrective batch + sweep-success assertion + docs fix |
| 2 | `4132891` | chore(phase-e): ack 2 deferred mc=false entries + revert finding resolution |
| 3 | `27be280` | fix(write-gate): block direct Write/Edit to meta-state.jsonl at PreToolUse layer |
| 4 | `54fe242` | chore(meta-state): auto-backfill code_fingerprint on audit-gap finding |

Total diff: 9 files, +309 / -17.

---

## Verification Gate — PASS

| Test | Result |
|------|--------|
| `cold-tier-regression.test.js` | pass (1/1) — new Phase 6 sweep-success assertion active |
| `write-gate-index-capabilities.test.cjs` | pass (9/9) — new meta-state.jsonl block tests active |
| `pnpm test` (13 namespaces) | pass (25.36s, 0 failures) |

Verified live during review at `2026-06-26 17:04`.

---

## Stage 1 — Spec Compliance

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | All 10 mc=true entries: status stale → active | PASS | `meta_state_ack` invocations in 789cf5c |
| 2 | All 10 entries: `acked_at` set | PASS | All 10 entries carry `acked_at: <batch-ts>` |
| 3 | All 10 entries: `last_verified_at` set to batch timestamp | **MISSING** | `meta_state_ack` does not set `last_verified_at`; only `acked_at` + `expires_at: null` |
| 4 | Single atomic batch (D3) | **VIOLATED** | 10 separate `meta_state_ack` invocations (10 cache invalidations, no rollback safety) |
| 5 | 2 mc=null entries filed as separate finding | PASS (but mc=false, not mc=null — plan labeling bug) | `meta-260626T1627Z-plan-7-fix-phase-1-deferred-...` filed in 789cf5c |
| 6 | Cold-tier assertion added | PASS | `cold-tier-regression.test.js` Phase 6 block at L52-64 |
| 7 | Assertion has teeth (FAILS against pre-fix state) | **NOT VERIFIED** | Plan Phase 2 Step 5 required revert-to-pre-fix + rerun. No commit or journal entry shows this was done. |
| 8 | Audit-log gap investigation filed | PASS | `meta-260626T1638Z-...` filed |
| 9 | Audit-gap fix is OUT of scope (D6) | **VIOLATED** | 27be280 implements the fix (write-gate.js rule), D6 explicitly excluded it |
| 10 | New change-log with `supersedes` field | PASS | `meta-260626T1639Z-plans-260626-1535-phase-e-stale-sweep-fix-plan-md` |
| 11 | Journal rewritten with `checkStaleness` mechanism | PASS | `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` |
| 12 | Plan 7 footer corrected | PASS | `plans/260626-0720-phase-e-stale-sweep/plan.md:150` |
| 13 | Cold-tier + pnpm test GREEN | PASS | See Verification Gate |
| 14 | No AI references in commits | PASS | All 4 commits clean |
| 15 | Commit subject ≤ 72 chars | **VIOLATED** | `789cf5c` subject is 75 chars; plan R3 acknowledged this risk but didn't trim |
| 16 | Plan.md footer: ADD a "Status (post-correction)" note | **DEVIATION** | Implementation REPLACES the status line instead of adding a note. Plan spec said "Add an explicit note pointing to this fix plan." |
| 17 | Audit-gap report filename | **DEVIATION** | Plan: `debugger-260626-1535-phase-e-plan-7-fix-audit-gap-report.md`. Actual: `debugger-260626-1535-phase-e-plan-7-audit-gap-mechanism-investigation.md` |

**Spec compliance: 11 PASS, 6 VIOLATED/DEVIATED.**

---

## Stage 2 — Code Quality

### CRITICAL-1: Audit-trail orphan on `meta-260626T1627Z` (intentional but undocumented invariant violation)

**Location:** `meta-state.jsonl` entry `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en`

**State at HEAD:**
```json
{
  "status": "reported",
  "resolved_at": "2026-06-26T09:48:02.704Z",
  "resolved_by": "operator",
  ...
}
```

**Issue:** Entry has `status: reported` but `resolved_at` + `resolved_by` are set. This violates the documented registry-consistency invariant from the active finding `meta-260614T1236Z-no-automated-registry-consistency-check-exists-...`:

> Expected invariants: `status: active` must not carry `resolved_at` / `resolution`; `status: archived` must carry `archived_at` / `archived_by` / `archived_reason`; `status: resolved` must carry `resolved_by`; `status: superseded` must carry `consolidated_into`.

The plan's invariant spec does not explicitly cover `status: reported`, but the same logic applies — non-terminal status with terminal audit fields. The cold-tier test does not currently check this case.

**Origin:** 4132891 added these fields when reverting the resolution. Commit message acknowledges: "The finding's resolved_at/resolved_by fields remain as audit-trail orphans but lifecycle is correct."

**Severity:** Important (not critical — acknowledged by commit author; but creates a known drift class that the registry-consistency-check finding would flag if it could see reported).

**Recommendation:** Either (a) clear `resolved_at` and `resolved_by` from `meta-260626T1627Z` since status is reported, or (b) explicitly add `status: reported must not carry resolved_at/resolved_by` to the documented invariants and extend the cold-tier test to check it.

---

### CRITICAL-2: Pre-existing invariant violation propagated by `meta_state_ack`

**Location:** `meta-state.jsonl` entry `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met`

**State at HEAD:**
```json
{
  "status": "active",
  "acked_at": "2026-06-26T09:45:44.778Z",
  "resolved_at": "2026-06-08T01:11:42.524Z",
  "resolved_by": "auto-resolve",
  "mechanism_check": false,
  ...
}
```

**Issue:** Entry has `status: active` AND `resolved_at` set. This is the EXACT pattern that the registry-consistency-check finding (`meta-260614T1236Z-...`) is designed to detect and flag. The plan acked both findings (the anti-pattern AND the consistency-check) but left the underlying invariant violation in place.

The journal's O1 acknowledges a similar pattern on a different entry: "**O1:** Registry consistency: `meta-260606T1830Z-context-pollution-...` has `resolved_by: auto-resolve` + `resolved_at` set but was `status: stale`. Now `status: active` — the inconsistency is preserved."

By acking these mc=false entries, the loop preserves an invariant violation it has a finding to detect.

**Severity:** Important — perpetuates the documented drift class. Not critical because the mc=false status exempts the entry from the test's grounding invariant (line 81: `f.mechanism_check === true`).

**Recommendation:** File a follow-up plan (Plan 8 candidate) to either (a) clear the orphan `resolved_at` / `resolved_by` fields from active mc=false entries via a one-line `meta_state_patch`, or (b) update the registry-consistency-check finding's recommended remediation to allow `status: active + resolved_at` as a known acceptable state.

---

### CRITICAL-3: `last_verified_at` not set on transitioned entries

**Plan requirement (Phase 1):**
> "All 10 entries have `acked_at` + `last_verified_at` set to the same ISO timestamp (the batch timestamp)"

**Implementation:** `meta_state_ack` only sets `{ status: "active", acked_at: now, expires_at: null }`. The `last_verified_at` field is not set.

**Impact:** Future `meta_state_re_verify` calls on these entries will lack the `last_verified_at` reference. The grounding history will be incomplete (no `last_verified_at` to anchor the verification step).

**Severity:** Important — plan compliance gap; degrades future re-verification signal.

**Recommendation:** Either (a) update the plan to drop the `last_verified_at` requirement since `meta_state_ack` is the canonical tool and doesn't set it, or (b) for the 10 transitioned entries, apply a follow-up `meta_state_patch` to set `last_verified_at: <batch-ts>`.

---

### CRITICAL-4: D6 violated — Audit-gap fix landed in this plan

**Plan D6:**
> "Audit-gap investigation is read-only (no fix in this plan) | Scope discipline | Investigation identifies the mechanism + writes recommendation; fixing the audit gap may touch core code and warrants its own plan."

**Reality:** 27be280 adds `meta-state.jsonl` block rule to `tools/learning-loop-mastra/hooks/legacy/write-gate.js` — directly implementing the fix the plan deferred.

The commit message itself acknowledges this: "Closes concern 2 from Plan 7 Fix follow-up" — but Plan 7 Fix follow-up is a separate plan, not this one.

**Impact:** Scope drift. The work should have been filed under a separate plan (Plan 8 candidate per the plan's own R7 mitigation: "Audit-gap investigation reveals a deeper system issue → Phase 3 is scoped to investigation + recommendation; fixes are out of scope for this plan").

**Severity:** Critical (against plan compliance) — but the work itself is well-executed. Decision should be: keep the fix in this branch (recommended — the work is clean and ships the same set of issues) but retroactively update the plan.md to reflect D6 reversal, OR revert the fix and re-file under Plan 8.

---

### IMPORTANT-1: Atomicity lost (D3 violated)

**Plan D3:**
> "Single atomic `meta_state_batch` for the corrective transition | Plan 1 D10 + Plan 7 D1 | Single lock, single cache invalidation, all-or-nothing rollback."

**Reality:** 10 separate `meta_state_ack` invocations. No atomicity; if entry 5 fails, entries 1-4 are active but 5-10 remain stale. The implementation also performed 10 separate cache invalidations (vs 1 for a batch).

**Severity:** Important — but the practical risk is low because `meta_state_ack` is idempotent and the failure mode is recoverable (re-run the remaining entries).

**Recommendation:** Document the rationale (canonical tool choice — `meta_state_ack` is the appropriate tool for individual ack, while `meta_state_batch` is for atomic bulk mutations). Update the plan to reflect this design decision.

---

### IMPORTANT-2: Pre-fix verification skipped (Phase 2 Step 5)

**Plan Phase 2 Step 5:**
> "Verify the assertion catches the regression — To prove the assertion is not a no-op, temporarily revert the meta-state.jsonl to the pre-fix state and re-run... This step proves the assertion has teeth."

**Reality:** No commit, journal entry, or cook summary shows this was done. The assertion passes against the post-fix state, but its teeth are unproven.

**Severity:** Important — the assertion could be a no-op and we wouldn't know. If it is a no-op, the entire Phase 2 deliverable is cosmetic.

**Recommendation:** Run the verification now: `git show 1186c33:meta-state.jsonl > /tmp/pre-fix.jsonl && cp meta-state.jsonl /tmp/post-fix.jsonl && cp /tmp/pre-fix.jsonl meta-state.jsonl && node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js && cp /tmp/post-fix.jsonl meta-state.jsonl`. The assertion MUST fail with `Phase 6: sweep-success broken — 12 stale mechanism_check findings exceed threshold 1`.

---

### IMPORTANT-3: 27be280 commit message claim is stale

**27be280 commit message:**
> "Resolves finding meta-260626T1638Z-... which captured the audit gap."

**Reality:** At HEAD, the finding IS `status: resolved` (27be280's resolution was preserved because the file was re-edited in subsequent commits; my earlier concern that 4132891 reverted it was incorrect — 4132891 reverted, then 27be280 re-resolved, then 54fe242 added fingerprint to the resolved entry).

So the claim IS accurate at HEAD. **However**, this is fragile — if anyone reverts 27be280, the resolution claim becomes false. The 27be280 commit message should note the resolution lifecycle (resolved → reverted in 4132891 → re-resolved here) so future readers understand the audit-trail.

**Severity:** Minor (factually correct at HEAD, but commit history is hard to reconstruct).

**Recommendation:** Add a footer to 27be280's commit message noting the resolution lifecycle. Not blocking — the git history shows the sequence.

---

### MINOR-1: Commit subject exceeds 72 chars

`789cf5c` subject: "chore(phase-e): apply corrective batch + sweep-success assertion + docs fix" = 75 chars

Plan R3 acknowledged this risk: "Subject kept ≤ 72 chars (current: ... = 75 chars — trim if needed)" — the plan self-flagged but the implementation didn't trim.

**Recommendation:** For future commits in this style, prefer: "chore(phase-e): corrective batch + sweep-success assertion" (62 chars).

---

### MINOR-2: Plan 7 footer: replace vs append

**Plan Phase 4 Step 3:**
> "Use `Edit` to modify `plans/260626-0720-phase-e-stale-sweep/plan.md` line 150 (the status footer)... NEW: ... Do not consider Plan 7 truly done until Plan 7 Fix ships."

**Reality:** The implementation REPLACES the entire status line with a longer version. The plan suggested ADDING a note (implicit from "Add an explicit 'Status (post-correction)' note pointing to this fix plan" in Phase 4 overview).

This is a minor deviation — the resulting footer is more readable as a single line than as appended text. Acceptable.

---

### MINOR-3: Audit-gap report filename diverges from plan

Plan: `debugger-260626-1535-phase-e-plan-7-fix-audit-gap-report.md`
Actual: `debugger-260626-1535-phase-e-plan-7-audit-gap-mechanism-investigation.md`

The actual filename includes a "mechanism-investigation" suffix that more accurately describes the report's scope. Acceptable.

---

## Code-Level Findings

### `tools/learning-loop-mastra/tools/legacy/meta-state-ack-tool.js` (+9 lines)

**Quality:** Clean. Minimal change, clear comments, preserves existing handler shape.

**Concerns:**
- The tool description update (line 12) mentions "For stale entries this re-pins acked_at so future checkStaleness sweeps use the new reference instead of created_at" — accurate but the connection to `meta-state-sweep-tool.js:25-36` could be more explicit.
- No tool-level test added for the new stale-accepting behavior. Existing tests cover the reported-accepting path; the new path is unverified by direct test (only by the indirect e2e via cold-tier test).

**Recommendation:** Add a unit test for `meta_state_ack` accepting a stale entry.

---

### `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (+14 lines)

**Quality:** Clean. Phase 6 block follows the existing comment style. Threshold = 1 with clear message.

**Concerns:**
- The assertion excludes `mc === false` per plan design, but the comment "mc=false is excluded because mechanism_check is explicitly opted out" is incomplete. The actual reason is that the pre-fix state had 12 stale mc=true+null entries, and mc=false entries were never in scope. The comment should mention that mc=false was excluded by plan design (D2 + Step 6 acknowledgment of mc=false vs mc=null discrepancy).
- The assertion message could include the count and the IDs (it does, good).

**Recommendation:** Improve the comment to reference the D2 design decision.

---

### `tools/learning-loop-mastra/hooks/legacy/write-gate.js` (+19 lines)

**Quality:** Excellent. Mirrors the existing `runtime-state.jsonl` block pattern exactly. Comment explains the audit-log gap context.

**Concerns:**
- The block is inserted at position 1.6 (between `runtime-state.jsonl` and `schemas/**`), maintaining logical grouping. Good.
- No `globMatch` test for paths like `subdir/meta-state.jsonl` — verify `globMatch` semantics match expectations (likely yes since the runtime-state.jsonl rule already does this).

**Recommendation:** Consider adding a test case for nested paths (e.g., `tools/learning-loop-mastra/meta-state.jsonl`).

---

### `meta-state.jsonl` (+27 / -17)

**Quality:** N/A (data file). The transitions are correct per the implementation strategy.

**Concerns:**
- All transitions use the MCP-canonical path (`meta_state_ack`, `meta_state_log_change`, `meta_state_report`). Good.
- Two audit-trail orphans remain (see CRITICAL-1, CRITICAL-2).

---

## Plan Documentation Quality

The plan itself is well-structured. Five phases with clear TDD gates, success criteria, and risk assessments. The actual implementation follows the plan with 6 deviations:

| Deviation | Severity | Recommendation |
|-----------|----------|----------------|
| D3 atomicity (used 10 acks vs 1 batch) | Important | Document rationale; update plan |
| D6 audit-fix included (vs deferred) | Critical | Retroactively update plan or revert fix |
| last_verified_at missing | Important | Update plan or backfill field |
| Phase 2 Step 5 verification skipped | Important | Run now |
| Footer replace vs append | Minor | Acceptable |
| Audit-gap report filename | Minor | Acceptable |

The plan's pre-implementation review (R3 on subject length, R4 on orphan resolution) showed good foresight — but the implementation didn't act on its own pre-flight warnings.

---

## Recommendations Summary

### Must-fix before merge (blockers)

1. **Run Phase 2 Step 5 verification** — prove the cold-tier assertion has teeth (revert to pre-fix state, run test, restore). [IMPORTANT-2]
2. **Decide on D6 violation** — either keep the audit-gap fix in this branch (recommended) and update plan.md retroactively, OR revert and re-file under Plan 8. [CRITICAL-4]
3. **Decide on `last_verified_at`** — either update plan.md to drop the requirement or backfill the field on the 10 entries. [CRITICAL-3]

### Should-fix (warnings)

4. **Document audit-trail orphan choice** — add a follow-up plan entry that explicitly handles the `status: reported + resolved_at` orphan on `meta-260626T1627Z` and the `status: active + resolved_at` pattern on `meta-260606T2102Z`. The latter is the EXACT pattern that `meta-260614T1236Z-...` was filed to detect — by acking both findings, we leave the drift class in place. [CRITICAL-1, CRITICAL-2]
5. **Document D3 atomicity deviation** — explain in plan.md or journal why 10 separate acks were used vs the planned batch. [IMPORTANT-1]
6. **Add `meta_state_ack` unit test** for the stale-accepting path.

### Nice-to-have (notes)

7. Improve Phase 6 test comment to reference D2 design decision. [Code-level]
8. Add nested-path test to write-gate.js meta-state.jsonl coverage. [Code-level]
9. Trim future commit subjects to ≤ 72 chars. [MINOR-1]

---

## Status

**NEEDS_FIXES** — 3 critical/must-fix items before merge, 3 should-fix items, 3 nice-to-have items.

The implementation correctly resolves the primary problem (12 stale entries re-staled by `checkStaleness`) and ships a clean write-gate fix. The remaining issues are mostly plan-compliance and follow-up hygiene, not behavioral defects.

Tests pass. The corrective batch is in place. The cold-tier assertion exists. The audit-log gap is closed at the Write/Edit layer. The journal and plan footer accurately describe what shipped.

The reviewer's recommendation: **address CRITICAL-1 through CRITICAL-3 before merge** (audit-trail orphan + D6 deviation + last_verified_at), and **verify Phase 2 Step 5 (IMPORTANT-2)** as the highest-confidence step. Everything else can be a follow-up plan.

---

**Status:** NEEDS_FIXES
**Summary:** Spec compliance is 11/17; 3 critical plan deviations (D6 audit-fix scope, last_verified_at missing, audit-trail orphans); 1 unverified test (Phase 2 Step 5); tests pass.
**Concerns/Blockers:** Audit-trail orphans on `meta-260626T1627Z` and `meta-260606T2102Z` perpetuate the exact drift class that the registry-consistency-check finding was filed to detect. By acking both findings, the loop preserves an invariant violation.

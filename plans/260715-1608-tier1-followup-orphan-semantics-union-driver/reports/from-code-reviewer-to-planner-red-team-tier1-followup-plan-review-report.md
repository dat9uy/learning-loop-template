# Red Team Review — Tier 1 closeout follow-ups plan

**Plan:** `plans/260715-1608-tier1-followup-orphan-semantics-union-driver/`
**Date:** 2026-07-15
**Tier:** Standard (4 phases → Fact Checker + Contract Verifier active for all reviewers)
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer
**Result:** 24 raw findings → 14 consolidated → 13 Accept + 1 Accept-with-user-decision (#13). 0 Critical, 6 High, 8 Medium.
**Applied:** all 14 folded into plan.md + phase files; `## Red Team Review` + Whole-Plan Consistency Sweep appended to plan.md.

## Consolidated findings

### F1 (High, Accept) — Phase 2 rule-`origin` cleanup prescribed `null` (rejected); `meta_state_patch` replaces whole arrays
**Location:** Phase 2 triage table.
**Flaw:** `origin` is `z.string()` non-nullable (`meta-state.js:410`); `null` is rejected by zod. `meta_state_patch` replaces fields (no remove-element op) — "remove only the dangling id" isn't a tool operation.
**Failure:** operator calls `patch({origin:null})` → zod rejects → 9 rule-origin refs never cleaned → validator never exits 0 → Phase 3 blocked. Mis-filtered array silently drops a valid ref the validator won't catch.
**Evidence:** `meta-state.js:410`; `validate-registry-refs.js:81` (`entry.origin ? [...] : []` — falsy origin = no ref); `meta-state-patch-tool.js:24-25`.
**Fix:** `origin:""` (empty string) for rules; arrays via read→filter→verify `len==orig-1`→patch full array→re-query `meta_state_relationships`.

### F2 (High, Accept) — Relationships-tool parity is a signature refactor, not a label
**Location:** Phase 1 "Relationships-tool parity" + step 7.
**Flaw:** `meta-state-relationships-tool.js:89-113` `computeDanglingRefs(refs, entries)` has no source entry in scope → can't classify `historical` without threading the source.
**Fix:** Accept divergence (YAGNI) — validator adds `historical`; tool keeps flat `missing`/`stale`/`superseded`/`resolved` reasons; document in-code on both files. No refactor.

### F3 (High, Accept) — `isStaleViewLike` diverges from canonical `isStaleView`
**Location:** Phase 1 Architecture step 3 + "Source-status helper".
**Flaw:** Validator uses `created_at`-only (`validate-registry-refs.js:57`); canonical uses `last_verified_at‖created_at` (`core/stale-view.js:74`). Plan said "mirror canonical" but the validator already diverges.
**Fix:** Keep `isStaleViewLike` + document why (post-merge, drift intentionally skipped per `:48-51`); remove "mirror canonical" instruction.

### F4 (High, Accept) — Phase 2 mid-triage session death = no provenance/recovery
**Location:** Phase 2 triage loop steps 2-5.
**Flaw:** `meta_state_log_change` + triage report written only at the end; a crash leaves a partially-cleaned registry with no audit trail and no rollback.
**Fix:** Incremental `meta_state_log_change` per batch + incremental triage report + recovery procedure (re-run validator, diff against last-committed report, resume).

### F5 (High, Accept) — Phase 3 pre-flip `workflow_dispatch` sees stale state
**Location:** Phase 3 pre-flip gates + step 2.
**Flaw:** `workflow_dispatch` checks out main HEAD (`actions/checkout@v7`); if Phase 2 cleanup isn't merged first, the runner reports ~27 blocking and the flip is falsely blocked.
**Fix:** Merge Phase 2 cleanup PR to main → note merge SHA → trigger dispatch → confirm run's checkout SHA == merge SHA → only then flip.

### F6 (High, Accept, scope+) — Change-log exemption source-keyed → `supersedes` typos uncaught
**Location:** Phase 1 Architecture step 2 + Phase 1 TDD list.
**Flaw:** Source-keyed exemption + advisory-only pre-merge (`meta-state-pr-body-advisory.yml:4`) + post-merge `historical` = an unmonitored hole for any typo'd/fabricated change-log `consolidates`/`supersedes` ref. The `supersedes`-from-change-log exemption branch is untested.
**Fix:** Add a pre-merge BLOCK on the PR's own change-log diff validating new `consolidates`/`supersedes` resolve (catches typos before immutability); add TDD for the supersedes exemption branch; document that the post-merge exemption relies on this backstop.

### F7 (Medium, Accept) — Terminal-source exemption correctness (3 sub-points)
**Location:** Phase 1 `isTerminalSource` + Risk Assessment.
**Flaw:** (a) plan said "rules use the first three" but rule schema is `active`/`inactive` only (`meta-state.js:421`) — an inactive (deprecated) rule with dangling `origin` would still block; (b) terminal-source exemption enables "supersede-to-bury" — bad refs on a superseded finding silently become `historical`; (c) legacy entries with absent `entry_kind`+`status` untested.
**Fix:** `isTerminalSource` includes `inactive` for `rule`+`loop-design` (not findings); triage report lists every blocking→historical reclassification via terminal status with justification; TDD: legacy no-status-no-entry_kind → blocking.

### F8 (Medium, Accept) — No duplicate-id guard in validator union
**Location:** Phase 1 (entire — `entryById = new Map(...)` last-write-wins).
**Flaw:** An appended change-log with an existing open finding's id + `status:superseded` overwrites the open entry in the Map → masks it. `registry-table.sh` dedupes via `max_by(.version)` but the validator does not. Tier-2 will introduce dups.
**Fix:** Add a `duplicate_id` blocking reason (scan for ids appearing >1 time across the union).

### F9 (Medium, Accept) — Phase 2 "SHA unchanged except append" criterion is a tautology
**Location:** Phase 2 Success Criteria.
**Flaw:** Any append changes the whole-file SHA; "SHA unchanged except for the append" is uncheckable and can't distinguish an append from an edit of an existing line.
**Fix:** "First N lines byte-identical (N=pre-count); `git diff change-log.jsonl` shows only `+` lines, zero `-`."

### F10 (Medium, Accept) — Load-bearing counts off + residual overestimated
**Location:** plan.md Overview + Phase 1/2 "Why this exists".
**Flaw:** Actual: 55 `consolidates` (not 54), 34 `addresses` (not 33); residual after exemption is ~27 (not ≤44) — 18 inactive loop-design `addresses` auto-exempt.
**Fix:** Re-run validator, record exact counts + ids; Phase 1 step 6 = HARD GATE; replace "≤44" with measured ~27.

### F11 (Medium, Accept) — Live-gate invariant false
**Location:** Phase 2 "Live-gate".
**Flaw:** Only `meta_state_ship_loop_design`/`supersede`/`promote_rule`/`dispatch_finding` are live-gated; `meta_state_patch`/`meta_state_log_change` are NOT (`meta-state-patch-tool.js` has no `LOOP_SESSION_MODE` check).
**Fix:** Correct the claim — bulk of Phase 2 (patch + log_change) works in any session; only ship-loop-design needs live.

### F12 (Medium, Accept) — Phase 4 "0 duplicate ids" not guaranteed by `git merge-file --union`
**Location:** Phase 4 Test + plan.md acceptance.
**Flaw:** `--union` concatenates both sides without deduping; id-uniqueness is a fixture property, not a driver guarantee.
**Fix:** Assert (a) both lines present (driver correctness), (b) fixture ids distinct by construction (assert at fixture-gen); drop "0 dup ids" as a driver assertion.

### F13 (Medium, Accept-with-user-decision) — Phase 4 per-clone script doesn't cover ephemeral CI runners
**Location:** Phase 4 Risk Assessment + plan.md Out of Scope.
**Flaw:** CI runners never run the per-clone script → `merge=union` no-op on CI; a merge-queue conflict is unprotected. Re-opens the CI guard the operator declined.
**Operator decision:** middle-ground — add a `git config merge.union.driver "git merge-file --union %A %O %B"` step to `meta-state-refs-check.yml` (not a full guard workflow); document the residual limitation (separate merge-queue workflows would need the same step).

### F14 (Medium, Accept) — `metaStateBatch` `update` op on change-log is a silent no-op
**Location:** Phase 1 (immutability gap); `core/meta-state.js:1290-1336` + `:1452`.
**Flaw:** Batch `update` doesn't reject change-logs; `tableOnly` strips them before persist → mutation silently discarded, `applied:N` returned as if success. (The `delete` op DOES reject at `:1344-1358`.)
**Fix:** Add `change_log_immutable` guard to batch `update` (mirror `delete` op's assertinvariant); test: batch update on a change-log id throws.
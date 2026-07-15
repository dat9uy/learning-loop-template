---
title: "Tier 1: change-log stream split + Tier 2 de-risk (jq projection seam)"
description: "Split the registry by mutability/lifecycle: move immutable change-logs to change-log.jsonl (true-append + merge=union); keep mutable findings/rules/loop-designs as table entries in meta-state.jsonl; extend the read chokepoint as a swappable projection seam (identity now, last-wins-by-max-version at Tier 2); ship a Tier-0-adoptable jq projection (registry-table.sh) that de-risks Tier 2 ergonomics; add pre-merge WARN + post-merge BLOCK ref-validation CI gates. Tier 2 (mutable stream → versioned append + jq projection + CI advisory for same-id concurrent mutations) is the committed next phase, tracked by the open finding-stream finding — NOT in this plan."
status: pending
priority: P1
branch: "main"
tags: [meta-surface, registry, change-log, merge-union, ci, tier1, jq-projection]
blockedBy: []
blocks: []
created: "2026-07-15T01:03:20.298Z"
createdBy: "ck:plan"
source: skill
---

# Tier 1: change-log stream split + Tier 2 de-risk (jq projection seam)

## Overview

Resolves the observed 2026-07-09 parallel-PR EOF conflict (PR #44/#45) by splitting the registry **by mutability/lifecycle**: immutable change-logs → `change-log.jsonl` (true-append + `merge=union`, safe because they are never mutated in place); mutable findings/rules/loop-designs → stay as one-line-per-id table entries in `meta-state.jsonl` (operator `fx` workflow unchanged). The read chokepoint becomes a **swappable projection seam** — identity projection now, last-wins-by-max-version at Tier 2 — so Tier 2 plugs in without reworking the chokepoint. A `jq` projection script (`tools/scripts/registry-table.sh`) ships now and is **forward-compatible** (identity on today's one-line-per-id file, real dedupe once Tier 2 versions entries), letting the operator adopt the projection read surface at Tier 0 and never relearn it. CI ref-validation splits: pre-merge WARNING (can't resolve transient cross-file orphans), post-merge BLOCK (real orphans only).

**Design source:** `plans/reports/problem-solving-meta-state-merge-conflict-260715-0735-lifecycle-split-staged-tier2-migration-report.md` (all 7 questions resolved in §11). **Registry tickets:** `meta-260715T0633Z-change-log-stream-…` (this plan resolves) and `meta-260715T0633Z-finding-stream-…` (stays OPEN as the Tier-2 ticket — this plan must NOT resolve it).

**Scope boundary:** Tier 2 is NOT in this plan. Tier 1 leaves the parallel-resolve speed limiter 100% in place; debt is paid only at Tier 2. The finding-stream finding stays open to carry that debt.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 01a | [Pre-merge dedupe (4 historical dup-id groups)](./phase-01a-pre-merge-dedupe.md) | Pending |
| 1 | [De-risk jq projection](./phase-01-de-risk-jq-projection.md) | Pending |
| 2 | [Read seam and change-log split](./phase-02-read-seam-and-change-log-split.md) | Pending |
| 3 | [CI validation gates](./phase-03-ci-validation-gates.md) | Pending |
| 4 | [Verify and closeout](./phase-04-verify-and-closeout.md) | Pending |

## Dependencies

- **blockedBy:** none. Relevant priors are all completed:
  - `260715-0500-git-workflow-idempotency` (completed) — reframed+kept-open `meta-260709T1017Z` with the two-target framing this plan's report retires; no file conflict (file-index idempotency, orthogonal).
  - `260623-1237-meta-state-pr-quality-and-hints-split` (completed) — added `meta-state-pr-body-advisory.yml` + `ci-registry-deltas.sh`; Phase 3 extends these, does not duplicate.
- **internal order:** Phase 1 depends on Phase 01a (the live file must be one-line-per-id before Phase 1's "identity on a true one-line-per-id file" claim is honored); Phases 2/3/4 follow Phase 1 in order. No inter-phase file conflicts.
- **blocks:** none yet. The future Tier-2 plan will `blockedBy: [this-plan]`; record it when the Tier-2 plan is created. The open `meta-260715T0633Z-finding-stream-…` finding is the Tier-2 ticket pointer.

## Acceptance Criteria

- [ ] `change-log.jsonl` exists at repo root, carries all and only `entry_kind=change-log` entries; `meta-state.jsonl` carries zero change-logs.
- [ ] `change-log.jsonl` is **free of intra-file duplicate ids** (live file has 313 lines / 309 unique ids — Red Team F3; migration dedupes first).
- [ ] `.gitattributes` has `change-log.jsonl merge=union` (mirroring `runtime-state.jsonl`).
- [ ] `meta_state_log_change` and all other change-log producers write via a **true-append** path to `change-log.jsonl`; non-change-log writes keep the existing table read-all→rewrite. **`metaStateBatch` auto-emit** change-log also lands in `change-log.jsonl` (Red Team F2 — current batch path bypasses `writeEntry`).
- [ ] Every registry read funnels through the extended chokepoint and sees the **union** of both files; relationship validation (`dangling_refs`, bidirectional invariants) is unchanged on the union.
- [ ] **Cold-tier cache invalidates on `change-log.jsonl` append** (Red Team F5): `changeLogSha256` helper exists; both SHAs in `readColdTierCache`/`writeColdTierCache` keys; `loop_describe({tier:"cold"})` returns fresh `all_entries` after a change-log-only write.
- [ ] **Immutability guard at CORE layer** rejects any in-place mutation of a change-log: `writeEntry` (L760-803), `updateEntry` (L812), `archiveEntry` (L917), `metaStateBatch` (write/update/delete/archive cases) — 8 sites, each with a test (Red Team F2, F7).
- [ ] The read chokepoint's projection is a **pluggable function** (identity now); a code comment + a unit test pin the swap point for Tier 2's last-wins-by-max-version projection.
- [ ] `tools/scripts/registry-table.sh` ships + passes a test mirroring `vitest-failures.test.js` (identity on one-line-per-id fixtures; dedupe on versioned fixtures; **multi-file `PATH_ARG` after Phase 2 ships — Red Team F11a**).
- [ ] Pre-merge: `meta-state-pr-body-advisory.yml` emits ref-validation WARNINGs on the PR's own diff and exits 0. **Cross-PR orphans self-heal on merge; post-merge BLOCK is the only defense for cross-PR refs (Validation Session 1 Q3).** Post-merge: net-new workflow on `push: main` runs **`meta_state_relationships` (plural) / `validate-registry-refs.mjs`** over the union and BLOCKs on real orphans (Red Team F4).
- [ ] All existing tests pass (2 confirmed broken tests updated to chokepoint or `change-log.jsonl`; 3 secondary touches verified; 5 unaffected — Red Team F13); `pnpm test` green.
- [ ] One-time migration lands in the same PR as the code change (no parallel registry PRs that session); migration wrapped in `withRegistryLock`; advisory workflow path-filter + diff-command updated in this PR (Red Team F6).
- [ ] Post-concat sort by `created_at` ascending on `_readAndParseRegistry` so `meta_state_list` returns chronological union (Red Team F15a).
- [ ] Inbound gate verified post-split: **AGENTS.md "last 20 raw lines" instruction updated to `registry-table.sh | tail -20`; CLAUDE.md inherits per project structure; the false "reads through the chokepoint" claim is removed (Validation Session 1 Q1 — Red Team F11b).**
- [ ] `meta-260715T0633Z-change-log-stream-…` resolved with PR + change-log refs; `meta-260715T0633Z-finding-stream-…` stays OPEN (Tier-2 ticket), description unchanged, with pre-resolve `meta_state_list` assertion (Red Team F15b).

## Risks

- **Duplicate-id corruption if a change-log is ever mutated in place.** Mitigation: change-log writes are true-append only; **CORE-layer** `entry_kind !== "change-log"` guards in `writeEntry` (L760-803), `updateEntry` (L812), `archiveEntry` (L917), `metaStateBatch` (write/update/delete/archive) — handler-level guards retained for resolve/patch paths but insufficient alone (Red Team F2, F7). Direct core callers (e.g. `fix-loop-design-refs.mjs:48`) bypass handlers. Migration FIRST dedupes by id (live file has 4 historical dup-id groups — Red Team F3). `merge=union` safety depends on immutability — assert at write time + tested at every guard site.
- **Cache staleness across two files.** `readRegistryWithCache` keys on `meta-state.jsonl` mtime+size only; a `change-log.jsonl` append wouldn't invalidate it. Mitigation: expand the cache key to stat both files; `invalidateCache(root)` is already called after writes but is **insufficient alone post-split** (the cache contract at `read-registry-cache.js:18` is FALSE without the dual-file key — Red Team F5). Cold-tier SHA cache (`loop-introspect-cache.js:24-29` `registrySha256` only) must also be extended: add `changeLogSha256`; both SHAs in `readColdTierCache`/`writeColdTierCache` keys (paired atomic-read pattern at L51-69).
- **Transient orphans pre-merge (Validation Session 1 Q3 down-tier).** A change-log on branch B referencing a finding on un-merged sibling branch A. **Decision: down-tier pre-merge WARN to own-diff only** — cross-PR orphans self-heal on merge (the sibling PR's push to main also brings the target). The post-merge BLOCK is the only defense for cross-PR refs (uses `meta_state_relationships` (plural), NOT `meta_state_relationship_validate` (singular) — Red Team F4).
- **Test churn from raw-file reads.** Verified list (Red Team F13): **2 confirmed broken** (check-grounding:243, resolve-tool:46) → route to chokepoint or `change-log.jsonl`; **3 secondary touches** (cross-process-file-lock, drop-idempotency-cache, gate-recurrence) verified; **5 unaffected**. TDD — update broken tests alongside the split.
- **Migration runs during a parallel registry PR.** Mitigation: Q6 decision — single PR on main, no parallel window; **wrap migration in `withRegistryLock` + `invalidateCache` after** (Red Team F8b). **No pre-merge `gh pr list` check** (Validation Session 1 Q6 deferred to single-PR convention).
- **`merge=union` true-append without cross-process lock (Red Team F8a).** If `appendChangeLogEntryAtomic` is called outside `writeEntry`'s `enqueue+withRegistryLock` wrapper, two concurrent MCP servers can interleave byte-for-byte. Mitigation: dispatch lives INSIDE the existing wrapper at L760-803.
- **`merge=union` dry-run doesn't exercise the strategy (Red Team F10).** Sequential merge A→B doesn't trigger union. Mitigation: dry-run constructs two branches cut from a SHARED base, each appending at the SAME EOF position, only touching `change-log.jsonl`.

## Out of Scope (Tier 2)

- Versioned append + last-wins-by-max-version projection on the mutable file.
- CI advisory for same-id concurrent mutations (`group_by(.id) | map(group_by(.version)) | any(map(length) > 1)`).
- Compaction (deferred to ~1k entries).
- Inbound-gate rewiring to read the registry chokepoint (Tier 1 docs-only fix via `AGENTS.md` — Validation Session 1 Q1 — is sufficient; Tier 2 may revisit if a deeper coupling is needed).

## Red Team Review

### Session — 2026-07-15
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 7 High, 4 Medium
**Reviewers:** Security Adversary (Fact Checker) + Failure Mode Analyst (Flow Tracer) + Assumption Destroyer (Scope Auditor)
**Report:** `plans/reports/from-code-reviewer-to-planner-red-team-tier1-stream-split-260715-0828-GH-260715-tier1-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Pre-merge WARN math unsound for cross-PR change-log refs | Critical | Accept | Phase 3 |
| F2 | `metaStateBatch` auto-emit bypasses dispatch + immutability guard missing at core | Critical | Accept | Phase 2 |
| F3 | Live registry has 4 duplicate-id groups; migration must dedupe | Critical | Accept | Phase 2 |
| F4 | `meta_state_relationship_validate` ≠ `meta_state_relationships` (post-merge BLOCK no-op) | Critical | Accept | Phase 3, Phase 4 |
| F5 | Cold-tier SHA cache won't bust on `change-log.jsonl` append | High | Accept | Phase 2 |
| F6 | Pre-merge advisory path-filter gap window (Phase 3 update after Phase 2) | High | Accept | Phase 2, Phase 3 |
| F7 | Immutability guard placement: handlers only, not core | High | Accept (covered by F2) | Phase 2 |
| F8 | `appendChangeLogEntryAtomic` lock coverage + migration lock | High | Accept | Phase 2 |
| F9 | Phase 1 "identity on live file" claim is false | High | Accept | Phase 1, Phase 2 |
| F10 | `merge=union` dry-run doesn't exercise strategy + doesn't isolate file | High | Accept | Phase 4 |
| F11 | `registry-table.sh` default needs multi-file state + inbound-gate claim is false | High | Accept | Phase 1, Phase 2, Phase 4 |
| F12 | Ref-field extraction fragility + `consolidates` schema/relationships-tool mismatch | Medium | Accept | Phase 3 |
| F13 | Test churn count inflated (~10 → 2 confirmed + 3 secondary + 5 unaffected) | Medium | Accept | Phase 2 |
| F14 | Line citations wrong/imprecise | Medium | Accept | Phase 1, Phase 2 |
| F15 | File-order-is-no-longer-chronological + "do not resolve finding-stream" lacks guard | Medium | Accept | Phase 2, Phase 4 |

### Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-de-risk-jq-projection.md, phase-02-read-seam-and-change-log-split.md, phase-03-ci-validation-gates.md, phase-04-verify-and-closeout.md
**Decision deltas checked:** 15
**Reconciled stale references:** 7
- Phase 2 §"Risks" `loop-introspect-cache.js:59` SHA → committed fix in Phase 2 step 1 (was deferred to "step 1/6")
- Phase 2 §"Risk Assessment" immutability-guard test → expanded to cover core-layer (updateEntry, archiveEntry) and metaStateBatch
- Phase 3 step 1 → tool name corrected to `meta_state_relationships` / `validate-registry-refs.mjs`
- Phase 1 manual-check acceptance criterion → restated (one line per UNIQUE id; live file has 4 dup-id groups)
- plan.md §"Acceptance Criteria" → restored correctness (cold-tier cache SHA, core-layer 8-site immutability, multi-file PATH_ARG, cross-PR orphan detection, post-concat sort, 2-broken test list, pre-resolve assertion)
- plan.md §"Risks" → aligned with Red Team findings (CORE-layer guard, lock coverage, dup-id migration, cold-tier SHA in risks, merge=union dry-run framing)
- plan.md §"Out of Scope" + Phase 3 Overview + Phase 4 Requirements non-functional → corrected `meta_state_relationship_validate` (singular) → `meta_state_relationships` (plural) and "inbound gate reads through chokepoint" → "preserved (claim was false; see Phase 4 step 5)"
**Unresolved contradictions:** 0

**Cross-phase reconciliation notes:**
- Phase 2 step 1 expanded cache key + cold-tier SHA → Phase 4 acceptance criteria reference loop_describe verify (no change needed; alignment preserved)
- Phase 3 step 1 fix to use `meta_state_relationships` (plural) → Phase 4 step 2 reference to `meta_state_relationship_validate` (singular) updated to match
- Phase 2 step 7 added advisory workflow update → Phase 3 step 2 becomes a no-op (already done) — kept Phase 3 wording but added a "no-op if Phase 2 already landed this" note
- F9 Phase 1 acceptance criterion reframed → Phase 2 step 4 must dedupe FIRST so Phase 1's manual check produces one-line-per-id post-Phase-2
- F11b inbound-gate claim reconciled across plan.md (Out of Scope), Phase 3 (no regression reference), Phase 4 (Implementation Step 5 + Requirements non-functional)
- F4 tool-name reconciliation across plan.md acceptance, Phase 3 architecture, Phase 4 implementation step 2
- F13 test-churn count reconciliation across plan.md (Acceptance), Phase 2 (Implementation step 5), Phase 2 Risk Assessment

**Post-sweep state:** no contradictions remain. Plan ready for `/ck:plan validate` or `/ck:cook`.

## Validation Log

### Session 1 — 2026-07-15
**Trigger:** Post-red-team follow-up; 6 open decisions surfaced during the red-team session but deferred to validation.
**Questions asked:** 6
**Tier:** Standard (4 phases, red-team already at Standard tier)

#### Questions & Answers

1. **[Architecture]** Red Team F11b: the claim that the inbound gate "reads through the chokepoint" was false. Phase 4 step 5 offers two paths. Which?
   - Options: Docs-only (update CLAUDE.md) | Rewire gate to read union via chokepoint | Defer to Tier 2
   - **Answer:** Update AGENTS.md; CLAUDE.md will inherit from that file.
   - **Custom input:** "Update AGENTS.md , CLAUDE.md will inherit from that file"
   - **Rationale:** Per the project structure (CLAUDE.md points to AGENTS.md for agent coordination), AGENTS.md is the source of truth for operator instructions. Rewriting CLAUDE.md directly is redundant when AGENTS.md is the authoritative layer. Tier 2 defer is unnecessary since this is a low-risk docs fix.

2. **[Assumptions]** Red Team F12b: `consolidates` is `z.string()` in the core schema but the relationships tool treats it as multi-valued. Which way?
   - Options: Schema: z.array(z.string()) | Refactor relationships tool | Defer to Tier 2
   - **Answer:** Schema: z.array(z.string()) (Recommended)
   - **Rationale:** Aligns the schema with the relationships tool's already-documented behavior. Migration script handles single-string → array conversion. Tier 2 defer doesn't actually unblock Tier 1 ship because the post-merge BLOCK already relies on relationships-tool semantics.

3. **[Tradeoffs]** Red Team F1: pre-merge cross-PR orphan detection requires fetching all open PR heads. Cost vs. coverage tradeoff?
   - Options: Accept N+1 fetch (full coverage) | Down-tier to heuristic; BLOCK only | Cap at N=3 sibling PRs
   - **Answer:** Down-tier to heuristic; BLOCK only.
   - **Rationale:** Cross-PR orphans self-heal on merge (the offending sibling also pushes). The post-merge BLOCK is the load-bearing defense. The cost of N+1 fetches + auth scope expansion isn't justified for a problem that proves out only at the post-merge stage. Phase 3 step 2 simplifies accordingly.

4. **[Scope]** Red Team F9: Phase 1's manual check "produces one line per id" is false on the live file (313 lines / 309 unique ids). Ship ordering?
   - Options: Keep Phase 1 first (independent) | Move Phase 1 after Phase 2's dedupe | Add a third file: phase-01a-dedupe-first
   - **Answer:** Add a third file: phase-01a-dedupe-first.
   - **Rationale:** Phase 1's "identity on a true one-line-per-id file" claim becomes literally true if a tiny pre-step dedupes the 4 historical dup-id groups. Adds one phase file but keeps Phase 1's Tier-0-safe intent intact. The pre-step is small and self-contained.

5. **[Risks]** Red Team F8b: migration is wrapped in `withRegistryLock`, but background hooks/MCP auto-emit can still race. Additional safety?
   - Options: withRegistryLock only | Add pre-migration write-pause signal | Run migration in operator-controlled step
   - **Answer:** withRegistryLock only (Recommended)
   - **Rationale:** `withRegistryLock` is the canonical cross-process write gate; background hooks and MCP auto-emit serialize on the same lockfile. A write-pause signal duplicates the guarantee; a manual step adds ceremony without changing the safety bound.

6. **[Scope]** Pre-merge `gh pr list` concurrency check (per F6 follow-up): CI guard or manual operator step?
   - Options: Manual operator step (journaled) | CI guard via PR label | Defer — single-PR convention
   - **Answer:** Defer — single-PR convention.
   - **Rationale:** The Q6 single-PR convention is the documented operating model. The post-merge BLOCK catches cross-PR issues that slip through. CI guard complexity isn't justified for a convention-driven invariant.

#### Confirmed Decisions
- F11b inbound-gate fix: docs-only at Tier 1 via `AGENTS.md` (CLAUDE.md inherits per project structure).
- F12b `consolidates`: schema change to `z.array(z.string())`; migration script handles conversion.
- F1 cross-PR detection: down-tier pre-merge to WARN-on-own-diff only; post-merge BLOCK is the only defense.
- F9 Phase 1 ordering: insert new `phase-01a-dedupe-first` between plan-level pre-Phase-1 work and the existing Phase 1.
- F8b migration safety: `withRegistryLock` only; no extra signal/marker.
- Pre-merge concurrency check: defer; single-PR convention sufficient.

#### Action Items
- [ ] Create `phase-01a-pre-merge-dedupe.md` (small, one-time dedupe pass).
- [ ] Update Phase 1's manual-check acceptance criterion (already done in F9 acceptance, but should reference `phase-01a`).
- [ ] Phase 2 step 1 schema change: `metaStateChangeEntrySchema`'s `consolidates` field becomes `z.array(z.string())`.
- [ ] Phase 2 step 4 migration script: convert existing single-string `consolidates` to one-element arrays.
- [ ] Phase 3 step 2: simplify pre-merge WARN to diff-only (drop `gh pr list` step).
- [ ] Phase 4 step 5: change "either rewires the gate OR docs-only update" to just "update `AGENTS.md`; CLAUDE.md inherits" — already aligned.
- [ ] Drop the optional `gh pr list` check from Phase 2 step 7.
- [ ] Update plan.md `## Phases` table to include `phase-01a`.

#### Impact on Phases
- **Phase 1 (De-risk jq projection):** manual check acceptance now references `phase-01a` upstream — the script lands against a true one-line-per-id file.
- **Phase 1a (NEW, Pre-merge dedupe):** one-time dedupe of the 4 historical dup-id groups in `meta-state.jsonl` before Phase 1 ships.
- **Phase 2 (Read seam and change-log split):** step 1 schema change + step 4 migration script's single-string → array conversion.
- **Phase 3 (CI validation gates):** step 2 pre-merge WARN simplifies to own-diff-only; `gh pr list` cross-PR step dropped.
- **Phase 4 (Verify and closeout):** step 5 already aligned (AGENTS.md path, not CLAUDE.md direct edit).

### Whole-Plan Consistency Sweep (Post-Validation)

**Files reread:** plan.md, phase-01a-pre-merge-dedupe.md, phase-01-de-risk-jq-projection.md, phase-02-read-seam-and-change-log-split.md, phase-03-ci-validation-gates.md, phase-04-verify-and-closeout.md
**Validation decisions propagated:** 6/6
- F11b → Phase 4 step 5 wording: AGENTS.md is the source of truth, CLAUDE.md inherits.
- F12b → Phase 2 step 1 schema (`consolidates: z.array(z.string())`) + step 4 migration script annotated for single-string → one-element-array conversion.
- F1 → Phase 3 step 2 pre-merge WARN simplified (own-diff only; no `gh pr list`).
- F9 → New `phase-01a-pre-merge-dedupe.md` inserted before Phase 1; plan.md §Phases table includes `01a`; Phase 1 manual check cross-references Phase 1a.
- F8b → Phase 2 step 4 already at `withRegistryLock` (no change).
- Pre-merge guard → Dropped from Phase 2 step 7; Phase 3 step 2 no `gh pr list` step.

**Reconciled stale references (post-propagation):** 5
- plan.md §"Acceptance Criteria" pre-merge WARN line → drop "including cross-PR orphan detection" (Validation Q3 down-tier).
- plan.md §"Acceptance Criteria" inbound gate line → AGENTS.md is the source (per Q1), not CLAUDE.md direct.
- plan.md §"Risks" transient-orphans mitigation → drop `gh pr list` enumeration (Validation Q3 down-tier); reword as cross-PR self-heal.
- plan.md §"Risks" migration row → drop "optional `gh pr list` pre-merge concurrency check" (Validation Q6 deferred).
- plan.md §"Out of Scope" → reword Tier-2 inbound-gate rewiring entry as Tier-1 docs-only sufficient.
- plan.md §"Out of Scope" `AGENTS.md "last 20 raw lines"` entry → reword: Tier 1 IS doing this via Q1.
- Phase 3 Overview + Functional Requirements + Success Criteria → drop cross-PR orphan detection references; reword to "cross-PR orphans self-heal on merge; post-merge BLOCK is the only defense."
- Phase 3 Success Criteria `consolidates` semantics line → reference Validation Q2 schema change `z.array(z.string())` (which lands in Phase 2 step 1).

**Unresolved contradictions:** 0

**Pre-`/ck:cook` recommendation:** proceed. Plan has 5 phases (4 + new 01a); red-team review applied (15/15 findings inline); validation decisions propagated; sweep reports clean.

### Session 1 (continued) — Post-Sweep Reconciliation
**Trigger:** Whole-plan consistency sweep surfaced 5 stale references after validation propagation.
**Reconciled:** 5
- plan.md §"Acceptance Criteria" pre-merge WARN wording aligned with Q3 down-tier.
- plan.md §"Acceptance Criteria" inbound gate wording aligned with Q1 (AGENTS.md source).
- plan.md §"Risks" transient-orphans + migration entries aligned with Q3 + Q6.
- plan.md §"Out of Scope" reworded: Tier-1 docs-only fix is sufficient.
- Phase 3 Overview + Requirements + Success Criteria aligned with Q3 down-tier + Q2 schema change.
**Unresolved contradictions:** 0

---

## Validation Log
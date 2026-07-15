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
| 1 | [De-risk jq projection](./phase-01-de-risk-jq-projection.md) | Pending |
| 2 | [Read seam and change-log split](./phase-02-read-seam-and-change-log-split.md) | Pending |
| 3 | [CI validation gates](./phase-03-ci-validation-gates.md) | Pending |
| 4 | [Verify and closeout](./phase-04-verify-and-closeout.md) | Pending |

## Dependencies

- **blockedBy:** none. Relevant priors are all completed:
  - `260715-0500-git-workflow-idempotency` (completed) — reframed+kept-open `meta-260709T1017Z` with the two-target framing this plan's report retires; no file conflict (file-index idempotency, orthogonal).
  - `260623-1237-meta-state-pr-quality-and-hints-split` (completed) — added `meta-state-pr-body-advisory.yml` + `ci-registry-deltas.sh`; Phase 3 extends these, does not duplicate.
- **blocks:** none yet. The future Tier-2 plan will `blockedBy: [this-plan]`; record it when the Tier-2 plan is created. The open `meta-260715T0633Z-finding-stream-…` finding is the Tier-2 ticket pointer.

## Acceptance Criteria

- [ ] `change-log.jsonl` exists at repo root, carries all and only `entry_kind=change-log` entries; `meta-state.jsonl` carries zero change-logs.
- [ ] `.gitattributes` has `change-log.jsonl merge=union` (mirroring `runtime-state.jsonl`).
- [ ] `meta_state_log_change` and all other change-log producers write via a **true-append** path to `change-log.jsonl`; non-change-log writes keep the existing table read-all→rewrite.
- [ ] Every registry read funnels through the extended chokepoint and sees the **union** of both files; relationship validation (`dangling_refs`, bidirectional invariants) is unchanged on the union.
- [ ] The read chokepoint's projection is a **pluggable function** (identity now); a code comment + a unit test pin the swap point for Tier 2's last-wins-by-max-version projection.
- [ ] `tools/scripts/registry-table.sh` ships + passes a test mirroring `vitest-failures.test.js` (identity on one-line-per-id fixtures; dedupe on versioned fixtures).
- [ ] Pre-merge: `meta-state-pr-body-advisory.yml` emits ref-validation WARNINGs (exit 0). Post-merge: net-new workflow on `push: main` runs `meta_state_relationship_validate` on the union and BLOCKs on real orphans.
- [ ] All existing tests pass (raw-reading tests updated to chokepoint or `change-log.jsonl`); `pnpm test` green.
- [ ] One-time migration of existing change-logs lands in the same PR as the code change (no parallel registry PRs that session).
- [ ] `meta-260715T0633Z-change-log-stream-…` resolved with PR + change-log refs; `meta-260715T0633Z-finding-stream-…` stays OPEN (Tier-2 ticket), description unchanged.

## Risks

- **Duplicate-id corruption if a change-log is ever mutated in place.** Mitigation: change-log writes are true-append only; no `updateEntry`/`patch`/`resolve` path accepts `entry_kind=change-log` (already rejected by archive/resolve entry-kind guards; add a write-layer assert). `merge=union` safety depends on immutability — assert it at write time.
- **Cache staleness across two files.** `readRegistryWithCache` keys on `meta-state.jsonl` mtime+size only; a `change-log.jsonl` append wouldn't invalidate it. Mitigation: expand the cache key to stat both files; `invalidateCache(root)` is already called after writes — ensure the true-append change-log writer calls it too.
- **Transient orphans false-positive pre-merge.** A change-log on branch B referencing a finding on un-merged branch A. Mitigation: pre-merge = WARNING only (exit 0); post-merge = BLOCK where the full union is present.
- **Test churn from raw-file reads.** ~10 tests `readFileSync(meta-state.jsonl)` and assert change-log lines. Mitigation: Phase 2 step updates each to the chokepoint or to `change-log.jsonl`; TDD — update tests alongside the split, run full suite per phase.
- **Migration runs during a parallel registry PR.** Mitigation: Q6 decision — single PR on main, no parallel window; coordinate by not cutting concurrent registry PRs that session.

## Out of Scope (Tier 2)

- Versioned append + last-wins-by-max-version projection on the mutable file.
- CI advisory for same-id concurrent mutations (`group_by(.id) | map(group_by(.version)) | any(map(length) > 1)`).
- Compaction (deferred to ~1k entries).
- AGENTS.md/CLAUDE.md "last 20 raw lines" instruction rewrite (becomes `registry-table.sh | tail -20` at Tier 2).
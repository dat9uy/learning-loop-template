---
title: "Tier 2: Mutable Stream → Union-Safe Versioned-Append"
description: "Make meta-state.jsonl union-safe so parallel finding-resolve stops being operator-self-limited. Mutable table becomes append-only + versioned last-wins dedupe; projection seam swaps; .gitattributes flip removes the speed limiter. Resolves meta-260715T0633Z-finding-stream (Tier 2 ticket) + meta-260715T2311Z-gratuitous-mutations (in-scope)."
status: pending
priority: P1
branch: "main"
tags: [meta-state, tier2, versioned-append, merge-union, registry]
blockedBy: []
blocks: []
created: "2026-07-16T04:08:54.774Z"
createdBy: "ck:plan"
source: skill
brainstorm: "../../reports/brainstorm-260716-1101-tier2-versioned-append-mutable-stream-report.md"
---

# Tier 2: Mutable Stream → Union-Safe Versioned-Append

## Overview

Tier 1 (PR #60) split immutable change-logs to `change-log.jsonl` (`merge=union`, safe) and built the read chokepoint as a swappable projection seam. It deliberately left the mutable table (`meta-state.jsonl`) on read-all → tmp-rename full-rewrite — the pattern that makes `merge=union` unsafe and forces the operator to self-limit parallel finding-resolve. Tier 2 pays that debt: make the mutable stream union-safe via versioned-append + last-wins-by-max-version dedupe so the self-limiter comes off.

Three staged sub-PRs, each independently green. The `.gitattributes` flip (Phase C) is the load-bearing mechanical fix that removes the speed limiter; it lands only after the Phase B write-path rewrite is on main and proven.

**Decisions (from brainstorm):** per-id monotonic versioning; staged sub-PRs; reuse `archived` status for delete (hard-delete is gone — union-safety forbids line removal); manual compaction script + `loop_describe` warm-tier `registry_stats` signal + CI notice.

**Findings resolved by this plan:**
- `meta-260715T0633Z-…-finding-stream-…` (Tier 2 ticket) — resolves at Phase C (stays OPEN across A+B per report §6.2; do not close early).
- `meta-260715T2311Z-gratuitous-mutations-…` — resolves at Phase B (no-op short-circuit + prune stale split-patch guidance).

## Phases

| Phase | Name | Status | PR |
|-------|------|--------|----|
| 1 | [Phase A: Projection Swap + Version Backfill](./phase-01-phase-a-projection-swap-version-backfill.md) | **Completed** (2026-07-16) | standalone, no-op behavior change |
| 2 | [Phase B: Write-Path Rewrite to Versioned-Append](./phase-02-phase-b-write-path-rewrite-to-versioned-append.md) | Pending | standalone, internal correctness |
| 3 | [Phase C: gitattributes Flip + CI Advisory + Compaction Signal](./phase-03-phase-c-gitattributes-flip-ci-advisory-compaction-signal.md) | Pending | standalone, removes speed limiter |

## Dependencies

- **Blocked by:** none (Tier 1 shipped in PR #60; follow-ups #61–#63 merged).
- **Blocks:** none (no pending plans touch the registry write-path/union mechanism — verified via cross-plan scan 2026-07-16).
- **In-plan ordering:** Phase A → Phase B → Phase C, strict. A is a no-op prerequisite that narrows B's blast radius (projection live before write-path changes). B is internal correctness (appends safe in-process via lock+queue). C flips union on only after B is on main + green — flipping before B is unsafe (in-place mutation + union = duplicate ids → corruption).

## Acceptance Criteria (whole plan)

1. `meta-state.jsonl` is append-only (no line is ever replaced); mutations append a new versioned line, true-appends like `change-log.jsonl`.
2. The read projection (`_readAndParseRegistry` + `registry-table.sh`) returns last-wins-by-max-version per id; `meta_state_list` output ordering preserved (chronological by `created_at`).
3. `git merge` of two branches that each mutate the same finding id auto-resolves via `merge=union`; projection dedupes to last-wins; CI advisory surfaces the duplicate-version-per-id (WARNING, no block); both version lines retained (audit-complete).
4. `updateEntry` short-circuits on no-op patches (no version bump, no append) — `meta-260715T2311Z` repro (promote an already-open finding) produces zero file change.
5. `deleteEntry` produces an `archived` tombstone append (no hard-delete); `meta_state_list` hides it; `include_archived: true` shows it.
6. Compaction signal ships: `compact-registry.sh --check`, `loop_describe` warm-tier `registry_stats`, CI notice. Threshold `raw_lines >= 1000`.
7. Stale split-patch guidance pruned from AGENTS.md/CLAUDE.md.
8. All existing meta-state tests green; new tests per phase (TDD) green.

## Risks (plan-level)

- **P1 — Phase C flip timing:** `.gitattributes` flip is irreversible-in-effect once a parallel merge relies on it. Must land after Phase B on main + green. Mitigation: Phase C gated on Phase B merged; flip is the last step.
- **P1 — Public-contract shift (delete):** hard-delete gone; `include_archived: true` now shows deleted entries. Mitigation: document in a change-log entry at Phase B; benign (more complete audit).
- **P2 — Projection ordering:** Phase A re-sort must preserve `meta_state_list` chronological order. Mitigation: TDD test asserting byte-identical `meta_state_list` output before/after swap.
- **P2 — Version backfill idempotence:** must not clobber existing non-zero versions. Mitigation: backfill only null/missing `version`; default `0`.

## Out of Scope (Tier 3)

Real DB / event store; auto-compaction; global lamport versioning; post-merge BLOCK for same-id mutations (pre-merge WARNING only this round).

## Open Questions (Settled)

All open questions from the prior revision are settled by Validation Session 1. See `## Validation Log` for the resolved decisions.

- Phase A: confirm no existing entry uses `version: 0` with a different meaning before adopting `0` as the backfill default. *(resolved by Validation Session 1 Q1 — see Validation Log)*
- Phase C: whether the post-merge relationship-validate workflow also runs the Q2 same-id-concurrent-mutation advisory, or it stays pre-merge-only. *(resolved by Validation Session 1 Q2 — see Validation Log)*
- Phase C compaction: drop superseded tombstones entirely vs keep-latest-tombstone-per-id (recommend keep-latest for audit completeness). *(resolved by Validation Session 1 Q3 — see Validation Log)*

## Validation Log

### Session 1 — 2026-07-16T11:30Z

**Trigger:** Post-red-team critical-questions interview on the patched Tier 2 plan.
**Tier:** Standard (3 phases × 10 claims/phase sampled).
**Verification Results:** 30 claims checked → 28 verified, 0 failed, 2 unverified (`meta_state_compact` MCP tool optional, not yet in manifest; `meta-state-pr-body-advisory.yml` workflow present).
**Questions asked:** 5

#### Questions & Answers

1. **[Assumptions]** Phase A adopts `version: 0` as the backfill default. The schema today has `version: z.number().default(0)`. Is `0` semantically safe as 'no patches applied'?
   - Options: Confirm safe | Audit before adoption | Use a different default
   - **Answer:** Confirm safe (Recommended)
   - **Rationale:** Today's `version` field on new entries is always bumped from `0` to `1+` on first patch (see `core/meta-state.js:1049`). Defaulting to `0` is consistent with current write-path semantics.

2. **[Scope]** Open question from plan: when does the Q2 same-id-concurrent-mutation advisory run?
   - Options: Pre-merge WARNING only | Pre-merge WARNING + post-merge BLOCK | Post-merge BLOCK only
   - **Answer:** Pre-merge WARNING only (Recommended)
   - **Rationale:** Post-merge BLOCK is irreversible and the projection dedupes to last-wins-by-max-version (no data loss, just audit ambiguity). Pre-merge WARN surfaces the case for operator audit before it lands.

3. **[Risks]** Open question from plan: compaction tombstones — drop superseded versions entirely vs keep-latest-tombstone-per-id?
   - Options: Keep-latest-tombstone | Drop tombstones entirely | Keep-all-tombstones
   - **Answer:** Keep-latest-tombstone (Recommended)
   - **Rationale:** Preserves the fact that an id was deleted/archived at some point. Smaller than keep-all-tombstones; minimal compaction efficiency.

4. **[Architecture]** Red-team C1: writer-side union-safety guard after the `.gitattributes` flip. What gate?
   - Options: CI BLOCK | WARN-only, post-merge only | Per-clone check only
   - **Answer:** CI BLOCK (Recommended)
   - **Rationale:** The flip is irreversible-in-effect once a parallel merge relies on it. BLOCK catches re-introduced in-place writes before they reach main; matches the red-team recommendation.

5. **[Scope]** Should Phase C ship a `meta_state_compact` MCP tool, or is shell-script-only surface enough?
   - Options: Shell script only | Add `meta_state_compact` MCP tool | Tool in a follow-up plan
   - **Answer:** Shell script only (Recommended)
   - **Rationale:** YAGNI — current scope is solo scale; no agent needs programmatic compaction yet. Defer the MCP tool to a Tier-3 plan when there's a concrete agent consumer.

#### Confirmed Decisions

- **Q1** Confirm `version: 0` default — consistent with `metaStateEntrySchema.default(0)` and write-path semantics. Document in backfill script header.
- **Q2** Q2 advisory: pre-merge WARNING only. Plan's current default; no change.
- **Q3** Compaction: keep-latest-tombstone-per-id. Plan's current default; no change.
- **Q4** Writer-side guard: CI BLOCK. Already applied via red-team C1; no change.
- **Q5** Phase C scope: shell-script only. Removed `meta_state_compact` MCP tool reference from Phase C.

#### Action Items

- [x] Add Validation Log to plan.md *(this section)*.
- [x] Phase A: document `version: 0` default in backfill script header comment.
- [x] Phase C: remove `meta_state_compact` MCP tool references; replace with shell-script-only discoverability hint.

#### Impact on Phases

- Phase 1: Implementation step 5h added (script header documentation).
- Phase 2: no changes (decisions were already plan defaults).
- Phase 3: Compaction action hook line updated; Whole-Plan Consistency Sweep summary updated; Risk Assessment updated.

## Progress

| Phase | Status | Shipped | Notes |
|-------|--------|---------|-------|
| A — Projection Swap + Version Backfill | **Completed** | 2026-07-16 | 12 new tests; 1624 total green. See journal `reports/phase-a-implementation-journal.md`. |
| B — Write-Path Rewrite to Versioned-Append | Pending | — | Hard-blocked on A green. A green ✅ — unblock. |
| C — gitattributes Flip + CI Advisory + Compaction Signal | Pending | — | Hard-blocked on B on main + green. |

### Phase A Verification (2026-07-16)

- `_readAndParseRegistry` swapped to `group_by(id) → max_by(version) → re-sort by created_at`; pure JS, V8 stable sort.
- `backfill-versions.mjs` ships with `proper-lockfile` cross-process lock + unique `pid`-suffixed tmp + gate-log entry + dry-run mode. Default `version: 0` documented in script header per Validation Session 1 Q1.
- `registry-table.sh` default reads both `meta-state.jsonl` + `change-log.jsonl` (RT-M2).
- Live registry backfilled: 14 entries missing `version` set to `0`; 100 lines preserved; 0 null/non-integer versions remaining; 0 all-null-version groups.
- Test coverage added: `projection-last-wins-by-max-version.test.js` (6 tests) + `backfill-versions.test.cjs` (6 tests) = 12 new tests.
- Pre-existing tests adapted: `meta-state-log-change.test.js` + `file-index-o1-regression.test.js` used identical descriptions → same-id entries → previously undeduplicated. Updated to use unique descriptions so each generates a distinct id.
- Acceptance criteria 1–3, 7, 8 of the whole plan are now load-bearing-safe (projection writes present + verified). Critically, Phase B acceptance criteria 1 + 4–8 are now safe to implement against — the projection backstops the versioned-append semantics at the read layer.

### Whole-Plan Consistency Sweep (post-validation)

- All 5 decisions resolved. Plan defaults matched 3 of 5 (Q1, Q2, Q3); 2 changes (Q4 was already-applied-by-RT; Q5 dropped the optional MCP tool).
- Phase A: added step 5h documentation. No other Phase A changes.
- Phase B: no changes (decisions were already plan defaults).
- Phase C: removed 4 references to `meta_state_compact` MCP tool; replaced with shell-script-only discoverability hint.
- Cross-phase: `version: 0` confirmation aligns with Phase A backfill + Phase B short-circuit (no semantic conflict). Q2 advisory timing aligns with red-team C1 (writer-side BLOCK + advisory WARN are distinct surfaces — BLOCK on stale-base versions, WARN on duplicate-version-per-id, both are valid signals).
- **No unresolved contradictions. Plan is ready for review.**

## Red Team Review

### Session — 2026-07-16T11:25Z

**Findings:** 15 raw → 15 deduped (cap applied) | 2 Critical, 9 High, 2 Medium-adjacent | 14 accepted, 0 rejected
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer (3 adversarial lenses)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | Writer-side union-safety unguarded after `.gitattributes` flip | Critical | Accept | Phase C — flip risk + add writer-side guard requirement |
| C2 | No-op short-circuit `JSON.stringify` comparator re-introduces `meta-260715T2311Z` (3-reviewer consensus) | Critical | Accept | Phase B — replace `JSON.stringify` with canonical comparator |
| H1 | `appendFileSync` lacks fsync; plan contradicts itself (`:25` vs `:80`); partial-last-line crash on process kill | High | Accept | Phase B — `trueAppendAtomic` helper with explicit fsync |
| H2 | Phase A backfill script lacks atomicity (mirrors `seed-file-index.mjs` not `migrate-change-log-stream.mjs`); MCP-tab race | High | Accept | Phase A — atomic tmp+rename + unique tmp suffix + coordinated maintenance window |
| H3 | `deleteEntry` is module-private; reachable only via `meta_state_batch case "delete"` (line 1370) which still splices — plan never names this path | High | Accept | Phase B — name case "delete" rewrite explicitly |
| H4 | `assertNoChangeLogLeak` bypassed by new true-append path; future change-log leak into `meta-state.jsonl` = registry corruption on merge | High | Accept | Phase B — guard must run before `appendFileSync` on the new path |
| H5 | Per-clone `merge.union.driver` configuration is documentation-only; wrong-arg-order `git merge-file --union %O %A %B` = silent data loss | High | Accept | Phase C — CI check that BLOCKS PR touching `meta-state.jsonl` if driver missing |
| H6 | Archived tombstone collides with `meta_state_archive`; only `archived_reason` prefix distinguishes; audit degraded | High | Accept | Phase B — add `tombstone_kind: "archive" \| "delete"` discriminator |
| H7 | Compaction signal is decorative + Phase B removes inline compaction with no replacement until Phase C | High | Accept | Phase C — `--check` exits 1 when eligible; ship `compact-registry.sh --check` in Phase B for early signal |
| H8 | `assertinvariant` wrapper is pre-state-only; post-short-circuit "real change" semantics outside its reach | High | Accept | Phase B — document that post-short-circuit invariants must encode in the comparator |
| H9 | `_readAndParseRegistry` does not run schema validation; missing-version entries stay `undefined` on read | High | Accept | Phase A — schema-coerce at read time or document Phase B short-circuit precondition |
| H10 | `metaStateBatch` rollback via `writeFileSync(preBatchContent)` — contract shift unstated post-Phase B | High | Accept | Phase B — note that byte-snapshot rollback discipline is still-valid |
| H11 | `max_by(.version)` null behavior — plan's "undefined" prediction is empirically wrong; actual = arbitrary pick (worse) | High | Accept | Phase A — correct Architecture prediction + add "every group has ≥1 non-null version post-backfill" to idempotence test |
| M1 | Phase A "byte-identical output" test premise is wrong (jq `sort_by` not stable; JS `Array.prototype.sort` is stable) | Medium | Accept | Phase A — projection must be pure JS, not jq-in-JS-seam |
| M2 | `registry-table.sh` defaults to `meta-state.jsonl` only; Phase A "no change" claim is wrong | Medium | Accept | Phase A — flip default to both files (already-documented script behavior at `registry-table.sh:11-12,30-34`) |

### Whole-Plan Consistency Sweep

Performed after all 15 accepted findings were applied inline (RT-marker comments throughout phase files). Searched for stale terms, rejected assumptions, renamed APIs, superseded decisions, and duplicate embedded drafts/contracts across `plan.md` + `phase-01` + `phase-02` + `phase-03`.

**Contradictions surfaced during sweep (resolved):**

1. Phase C Architecture (line 63) says `compact-registry.sh --check` exits **1** when eligible; Implementation Step 3 (line 97) said exits **0**. Corrected step 3 to match Architecture.
2. Phase B says "no `.gitattributes` change this phase" — verified consistent across Phase B and Phase C (the flip is Phase C only).
3. `registry-table.sh` default-flip is Phase A (per M2); Phase C formalization of read instruction depends on it. Cross-verified.
4. `compact-registry.sh --check` ships in Phase B (per H7) AND in Phase C (full version). Cross-verified; Phase B ships early signal, Phase C ships full.
5. `tombstone_kind` discriminator is Phase B-only (per H6). Phase C compaction "keep-latest-tombstone-per-id" preserves it. Cross-verified.
6. Plan.md Acceptance Criterion #6 still says "Compaction signal ships: `compact-registry.sh --check`, `loop_describe` warm-tier `registry_stats`, CI notice" — matches Phase C deliverables. Threshold `raw_lines >= 1000` consistent.

**No unresolved contradictions. Plan is ready for review.**

### Per-Phase Sweep Summaries

- **Phase A:** Architecture clarified (pure-JS projection per M1; max_by null behavior empirically corrected per H11); Related Code Files: backfill mirrors `migrate-change-log-stream.mjs` (H2); `registry-table.sh` default flips (M2); Implementation Steps 5-7 expanded with atomic-tmp+rename + cohort check.
- **Phase B:** Architecture: `trueAppendAtomic` helper (H1); `assertNoChangeLogLeak` moves into new path (H4); `case "delete"` rewrite explicit (H3); `tombstone_kind` discriminator (H6); canonical comparator replaces `JSON.stringify` (C2); `assertinvariant` precondition documented (H8); `applyDefaults` before compare (H9); batch rollback still valid (H10); Implementation Steps expanded to 17 (was 12); Risk Assessment: 12 risks tracked.
- **Phase C:** Architecture: writer-side guard (C1), per-clone driver CI check (H5), compaction signal made actionable (H7), per-id jq (S-F9) added; Risk Assessment: 8 risks tracked; Implementation Step 3 exit-code assertion corrected to match Architecture.
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
| 1 | [Phase A: Projection Swap + Version Backfill](./phase-01-phase-a-projection-swap-version-backfill.md) | Pending | standalone, no-op behavior change |
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

## Open Questions (settle at implementation time)

- Phase A: confirm no existing entry uses `version: 0` with a different meaning before adopting `0` as the backfill default.
- Phase C: whether the post-merge relationship-validate workflow also runs the Q2 same-id-concurrent-mutation advisory, or it stays pre-merge-only.
- Phase C compaction: drop superseded tombstones entirely vs keep-latest-tombstone-per-id (recommend keep-latest for audit completeness).
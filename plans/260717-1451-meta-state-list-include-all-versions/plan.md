---
title: "Tier 2 Phase B Audit-Trail Affordance — meta_state_list include_all_versions"
description: "Add `include_all_versions: boolean = false` to `meta_state_list` so operators can inspect the versioned-append history per id (v0 open + v1 resolved + …) instead of collapsing via `group_by(.id) | max_by(.version)`. Resolves meta-260717T0943Z-the-tier-2-versioned-append-write-path-pr-64-phase-b-made-me."
status: pending
priority: P1
branch: "main"
tags: [meta-state, tier2, versioned-append, audit-trail, meta-state-tools]
blockedBy: []
blocks: []
created: "2026-07-17T14:51:00.000Z"
createdBy: "ak:plan"
addresses: ["meta-260717T0943Z-the-tier-2-versioned-append-write-path-pr-64-phase-b-made-me"]
source: skill
---

# Tier 2 Phase B Audit-Trail Affordance

## Overview

Tier 2 Phase B (PR #64 / #65, plan `260716-1101-tier2-versioned-append-mutable-stream` phase 02; PR #64 merged the original Phase B write-path rewrite, PR #65 landed the review followups per phase 02 `shipped_via`) made `meta-state.jsonl` a multi-record-per-id file: an entry's v0 (open) and v1 (resolved) coexist on disk. The read chokepoint collapses them via `group_by(.id) | map(max_by(.version))[]`, surfacing the latest version only. There is **no first-class affordance on `meta_state_list` to surface the versioned-append history per id** — only `include_archived: true` (a status filter, not a history surface), which collapses to one entry per id. Operators fall back to `grep meta-state.jsonl | jq` to inspect version history.

This plan adds `include_all_versions: boolean = false` as a new flag on `meta_state_list`. When true, the read path bypasses the `max_by(.version)` projection and returns every line per id, sorted by `(id, version)` ascending. The flag is orthogonal to `include_archived` (status filter) and `compact` (projection shape), so the three compose naturally.

**Operator decision context:** the 2026-06-17 semantic unification (plan `260617-1138-phase-c-plan-1a-atomic-fix` phase 01) deliberately rejected renaming `include_archived` → `include_terminal` and rejected adding `include_terminal` as a separate flag. This plan respects that decision: `include_archived` stays as the unified terminal-status filter. `include_all_versions` is a NEW orthogonal dimension (history surface), not a rename or replacement.

**YAGNI scope cuts:**
- **No rename of `include_archived`.** Operator rejected 2026-06-17.
- **No new `include_resolved` flag.** `include_archived: true` already surfaces resolved entries.
- **No new `meta_state_versions` tool.** Flag composition is sufficient.
- **No `compact: "history"` mode.** Flag is cleaner than a compact enum value.
- **No change to `loop_describe` registry_stats.** Per-id history is the gap; aggregate stats don't fill it.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Phase 1: TDD — `include_all_versions` flag on `meta_state_list`](./phase-01-red-green-include-all-versions-flag.md) | Pending | 2h |
| 2 | [Phase 2: Discoverability — tool description + AGENTS.md audit recipe](./phase-02-discoverability-tool-desc-agents-md.md) | Pending | 1h |
| 3 | [Phase 3: Closeout-plan parity verification + symmetric shell-script affordance](./phase-03-parity-verification-registry-table-all-versions.md) | Pending | 1h |
| 4 | [Phase 4: Resolve source finding + change-log + journal](./phase-04-resolve-and-closeout.md) | Pending | 30m |

## Dependencies

- **Blocked by:** none (Tier 2 Phase B shipped via PR #64 + #65 followups; Phase C shipped in PR #66; projection lives in `core/meta-state.js#_readAndParseRegistry` since plan 260716-1101 Phase A).
- **Blocks:** none (no pending plans depend on this flag — verified via cross-plan scan 2026-07-17).
- **In-plan ordering:** strict. Phase 1 ships the flag; Phase 2 surfaces it; Phase 3 verifies parity; Phase 4 closes the finding.

## Acceptance Criteria (whole plan)

1. `meta_state_list({ include_all_versions: true })` returns every line per id from `meta-state.jsonl` (and `change-log.jsonl`), sorted by `(id ascending, version ascending)`. Each entry carries its original `version` field intact.
2. `meta_state_list({ id: "<id>", include_all_versions: true })` returns the full version history of that id only (v0, v1, v2, … as they exist on disk).
3. `meta_state_list({ include_all_versions: false })` (default) preserves the existing `group_by(.id) | max_by(.version)` projection behavior. No behavioral change for existing callers.
4. `include_all_versions: true` composes orthogonally with `include_archived: true`, `status: "resolved"`, `entry_kind: "finding"`, `compact: false`, and the id/ref_by filters. Test coverage proves each composition.
5. The new read path does not poison the projected cache (cache key or cache value shape differs).
6. Tool description for `meta_state_list` calls out `include_all_versions` as the affordance for the versioned-append history.
7. AGENTS.md §6 (Internalization Rule) gains a sibling subsection documenting the audit-trail recipe (`meta_state_list({ id, include_all_versions: true })`).
8. Existing closeout plans (260710-0104 phase 02 verify-after-write pattern) continue to work as-is — no docs churn.
9. All existing meta-state tests green; new TDD tests per Phase 1 green.
10. Source finding `meta-260717T0943Z-...` resolved via `meta_state_resolve`; change-log entry emitted via `meta_state_log_change`.

## Risks (plan-level)

- **P1 — Cache poison:** if the new read path shares the cache key with the projected read but produces a different array shape, downstream code that holds a reference to the cached `entries` array sees inconsistent results. Mitigation: separate cache entry (different `parseFn` argument) OR a different cache key suffix. Phase 1 Implementation Step 5 makes the call explicit.
- **P1 — JSONL corpus shape regression:** the projection's precondition (`every id has ≥1 non-null integer version`) was guaranteed by the Phase A backfill. `include_all_versions: true` reads the raw lines — legacy entries with no `version` field must still parse cleanly. Mitigation: TDD test using a pre-Phase-A fixture (legacy entries with no version field); confirm raw read handles `undefined` version as `0` without throwing.
- **P2 — `compact: true` strips the `version` field:** if `toCompact` omits `version`, the new flag's value is invisible under default compact mode. Mitigation: ensure `toCompact` retains `version` (it's a top-level identity field that all 4 entry kinds carry; the compact whitelist must include it).
- **P2 — Output ordering changes break callers that depend on `created_at` ascending:** the existing projection sorts by `created_at` ascending. The all-versions path must NOT sort the same way — multi-line per id means the v1 line has a different `created_at` than v0, and sorting on `created_at` would shuffle v0/v1 arbitrarily within the id group. Mitigation: sort by `(id, version)` ascending; preserve `created_at` sort only as a tie-breaker within equal `(id, version)` (matches the projection's tie-break).
- **P3 — Operators expect `include_all_versions: true` to override `include_archived`:** that's not how the flag works (orthogonal composition). Mitigation: tool description explicitly states composition. TDD test verifies that `include_all_versions: true` + `include_archived: false` (default) still hides archived tombstone rows (the v_max is `archived`, so all versions get filtered).

## Out of Scope (Tier 3)

- A new `meta_state_history` tool (operator can call `meta_state_list({ id, include_all_versions: true })` instead — flag composition is sufficient).
- Renaming `include_archived` to `include_terminal` (operator-rejected 2026-06-17).
- A `versions: [0, 2]` range filter (YAGNI — single-id narrow query already returns the history; range filters can wait for a concrete consumer).
- Auto-resolving the silent-persistence-fail class via `meta_state_resolve` returning the full v1 entry (separate finding `meta-260619T2233Z`; orthogonal to this plan).

## Open Questions (Settled)

None — operator confirmed scope via AskUserQuestion 2026-07-17:
1. Add `include_all_versions` + refine docs (preserve 2026-06-17 semantic unification). ✅
2. Primary consumers: debug/forensic/drift analysis + verification scripts (closeout plans). ✅

## Progress

| Phase | Status | Shipped | Notes |
|-------|--------|---------|-------|
| 1 — TDD red-green | Pending | — | Schema flag + read path bypass + 5 new tests |
| 2 — Discoverability | Pending | — | Tool description + AGENTS.md §6.x |
| 3 — Parity verification | Pending | — | Closeout plan + shell-script `--all-versions` (optional) |
| 4 — Closeout | Pending | — | Resolve finding + change-log + journal |

## Validation Log

### Session 1 — 2026-07-17 (inline)

**Trigger:** Post-red-team critical-questions interview on the Tier 2 Phase B audit-trail affordance plan.
**Tier:** Standard (1 plan × ~12 claims sampled).
**Verification Results:** ~12 claims checked → 11 verified, 0 failed, 1 unverified (Phase 3's shell-script test runner location not confirmed against current `__tests__/` layout).

#### Questions & Answers

1. **[Architecture]** Is the cache-layer shape change `{entries} → {projected, allVersions}` correct?
   - Options: Cache shape change | Second cache slot | Same cache, shape shift
   - **Answer:** Cache shape change (Option C of Phase 1) — **Recommended**
   - **Rationale:** Single cold-cache miss per (root + mtime+size); both projections share the same file-stat invalidation key; downstream callers see no behavior change because `readRegistry(root)` returns the same shape as today.

2. **[Scope]** Should `readRegistryAllVersions` parse `change-log.jsonl` too, or only `meta-state.jsonl`?
   - Options: Both files (mirror projected path) | Only `meta-state.jsonl` | Both, but only return `meta-state.jsonl` lines by default
   - **Answer:** Both files (Option A) — **Recommended**
   - **Rationale:** Symmetric with the projected path; the new affordance is "show me everything the registry reader sees, uncollapsed." A change-log line is also a registry entry from the operator's perspective. The `entry_kind` filter still applies.

3. **[Scope]** Does the new flag work for the change-log stream's `version` field, or only for `meta-state.jsonl`'s?
   - Options: Both (use the shared `version` field) | Only `meta-state.jsonl` (where version is meaningful) | Both, with a discriminator
   - **Answer:** Both — **Recommended**
   - **Rationale:** `version` is in the schema for all 4 entry kinds (`core/meta-state.js:411`). Change-log entries also carry `version` (default 0). The new flag surfaces whatever the file holds.

4. **[Risks]** Does the `meta_state_resolve` return shape need to change to include the v1 entry, or is `include_all_versions` enough?
   - Options: Just `include_all_versions` (YAGNI) | Also update `meta_state_resolve` to return the full v1 entry | Both
   - **Answer:** Just `include_all_versions` (Option A) — **Recommended**
   - **Rationale:** YAGNI. Operators can call `meta_state_list({id, include_all_versions: true})` after `meta_state_resolve` to get the full v1 entry — one extra call, but no contract change. The silent-persistence-fail class is a separate concern (`meta-260619T2233Z`); orthogonal to this plan.

5. **[Architecture]** Sort order: should the all-versions path sort by `(id, version)` ascending or `(version, created_at)` ascending?
   - Options: `(id, version)` | `(version, created_at)` | `created_at` ascending (same as projected)
   - **Answer:** `(id, version)` ascending — **Recommended**
   - **Rationale:** Operators asking "what does id X look like across all its versions" expect grouping by id. Within an id, version ascending is the natural order. `created_at` tie-break handles the rare equal-version case (matches the projection's tie-break).

6. **[Risks]** Does the new flag compose with `ref_by`/`ref_field`? An id with N versions would appear N times in the result if it ref'd the target.
   - Options: Yes (N rows per id) | No (collapse to 1 row per id) | Per-id dedupe but flag-aware
   - **Answer:** Yes (Option A) — **Recommended**
   - **Rationale:** Consistent with the flag's semantics ("show me everything the registry holds"). Operators can post-process to dedupe if they want; the raw answer preserves audit completeness.

7. **[Risks]** Does `loop_describe` warm-tier `registry_stats` make `include_all_versions` redundant?
   - Options: No, different affordance | Yes, ship registry_stats instead | Both (defense-in-depth)
   - **Answer:** No (Option A) — **Recommended**
   - **Rationale:** `registry_stats` exposes REGISTRY-level stats (`raw_lines / deduped_ids / dead_version_lines`); it does NOT surface per-id version history. Different granularity. Both ship.

8. **[Scope]** Phase 3's `--all-versions` shell flag — necessary or YAGNI?
   - Options: Ship it (symmetric to MCP) | Skip Phase 3 | Ship it as a follow-up plan
   - **Answer:** Ship it (Option A) — **Recommended**
   - **Rationale:** Operators who `tail -20 meta-state.jsonl` see only raw lines; `registry-table.sh` is the shell-side wrapper. Without `--all-versions`, the shell still collapses — defeating the purpose of the MCP-side fix for shell users. Tiny scope (1 shell flag, 2 tests).

#### Confirmed Decisions

- **Q1** Cache shape change: `{projected, allVersions}` single-slot per (root + mtime+size).
- **Q2** `readRegistryAllVersions` reads both files (mirrors projected path).
- **Q3** `version` field is shared across entry kinds; the flag works for all.
- **Q4** No `meta_state_resolve` return-shape change. YAGNI.
- **Q5** Sort order: `(id, version)` ascending, `created_at` tie-break.
- **Q6** `ref_by/ref_field` returns N rows per id (no dedupe). Documented in tool description.
- **Q7** `loop_describe registry_stats` is orthogonal; ships alongside.
- **Q8** Phase 3 ships `--all-versions` shell flag.

#### Action Items

- [x] Update Phase 1 acceptance criteria to codify the cache-shape decision.
- [x] Update Phase 1 architecture description to clarify the both-files read.
- [x] Phase 1 success criteria: include the legacy-entry (no version field) test (Q3 implication).
- [x] Phase 2 tool description must call out the N-rows-per-id behavior under `ref_by`/`ref_field` (Q6).

#### Impact on Phases

- Phase 1: refined cache-shape decision (Q1); added legacy-entry test (Q3); both-files read explicit (Q2).
- Phase 2: tool description must mention N-rows-per-id under ref_by (Q6).
- Phase 3: confirmed `--all-versions` scope (Q8).
- Phase 4: no changes (validation Q4 confirmed YAGNI on resolve return-shape).

---

## Red Team Review

### Session 1 — 2026-07-17 (inline; scoped to 1 plan)

**Findings:** 8 raw → 8 deduped | 0 Critical, 4 High, 3 Medium, 1 Low | 8 accepted, 0 rejected
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer (3 adversarial lenses)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| H1 | Cache value shape change invalidates every caller's process-lifetime cache on first invocation after deploy — operators on a hot process see one stale read | High | Accept | Phase 1 — Implementation Step 11 (cache-test for single cold-miss per root) |
| H2 | `ref_by/ref_field` returning N rows per id may break downstream callers that assume 1 row per id | High | Accept | Phase 2 — tool description callout; Phase 1 — TDD test 7 (ref_by with multi-version id) |
| H3 | `_readAndParseRegistry` and `parseFnAllVersions` may drift apart over time — shared `readRawLines(root)` helper mitigates but doesn't prevent | High | Accept | Phase 1 — Implementation Step 7 (extract `readRawLines` private helper; code comment calls out divergence surface) |
| H4 | `meta_state_resolve` return shape unchanged — operators who only read the resolve response (no follow-up list call) won't see the v1 entry | High | Accept | Phase 4 — closeout journal documents the follow-up needed (`meta-260619T2233Z` silent-persistence-fail class is a separate finding); the new flag makes the v1 entry observable in 1 extra call |
| M1 | The `(id, version, created_at)` sort may not be stable for entries where `created_at` differs by <1ms across writes | Medium | Accept | Phase 1 — Implementation Step 7 (sort key explicit; same tie-break as the projection for parity) |
| M2 | `tools/scripts/registry-table.sh --all-versions` may emit a different ordering than the MCP tool under edge cases (different jq semantics vs JS) | Medium | Accept | Phase 3 — Implementation Step 6 (full shell-test suite; parity test under same fixture) |
| M3 | `toCompact` may not retain the `version` field under default `compact: true` | Medium | Accept | Phase 1 — Implementation Step 10 (regression test + verify `summarize` includes `version`) |
| L1 | The plan title uses kebab-case + a verbose slug; future grep may not match other Tier 2 follow-ups | Low | Accept | No change — slug is descriptive; grep target is `plans/2607*meta-state-list*` pattern |

#### Whole-Plan Consistency Sweep (post-red-team)

Performed after all 8 findings were applied inline. Searched for stale terms, rejected assumptions, renamed APIs, superseded decisions, and duplicate embedded drafts/contracts across `plan.md` + `phase-01` + `phase-02` + `phase-03` + `phase-04`.

**Contradictions surfaced during sweep (resolved):**

1. `plan.md` line 44 referenced "PR #65" for Phase B, while the source finding's title references "PR #64". Resolved: updated to "PR #64 + #65 followups" with the merge-commit citation per Phase 02 `shipped_via`.
2. `phase-01` mentions `tombstone_kind: "delete"` v3 line in TDD test 3; the actual `tombstone_kind` enum (`archive` | `delete`) ships via Phase B (per `phase-02-phase-b-write-path-rewrite-to-versioned-append.md` lines 49, 58). Cross-verified — the test fixture is correct.
3. `phase-03` mentions a test runner path `__tests__/registry-table-all-versions.test.cjs` that wasn't verified against the current `__tests__/` layout. Mitigation: implementer's call; pick the actual path during Phase 3 implementation.
4. `phase-04` references `meta_state_log_change` shape verbatim. Cross-verified against the tool definition; matches the 4-kind union shape.

**Contradictions resolved:** all 4.

**No unresolved contradictions. Plan is ready for review.**

---

## Whole-Plan Consistency Sweep (post-validation)

Performed after all 8 red-team findings + 8 validation Q&A decisions were applied inline. Re-read `plan.md` + every `phase-*.md`. Searched for:
- Stale API references (none — `max_by(.version)`, `tombstone_kind`, `isOpen`, `EXCLUDABLE_STATUSES` all current).
- Rejected assumptions (none — `include_terminal` only in operator-rejected context).
- Renamed APIs (none — `readRegistry`, `_readAndParseRegistry`, `withDefaults` all current per Phase 02 implementation).
- Superseded decisions (none — `meta_state_log_change` shape matches the 4-kind union).

**Verified cross-references:**
- Source finding `meta-260717T0943Z-...` exists in `meta-state.jsonl` (122 lines, status: open).
- Plan `260716-1101-tier2-versioned-append-mutable-stream` is COMPLETED (all 3 phases shipped).
- Operator decision 2026-06-17 (semantic unification) is documented in plan `260617-1138-phase-c-plan-1a-atomic-fix` phase 01 — referenced correctly.
- Phase 02 of plan 260716-1101 documents the actual shipped PR (e9e02a6 via PR #65) — referenced correctly.

**No unresolved contradictions. Plan is ready for review.**
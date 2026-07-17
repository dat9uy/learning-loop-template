# Planning Session — meta_state_list include_all_versions affordance

**Date:** 2026-07-17T14:51+07:00
**Mode:** `--deep --tdd`
**Plan dir:** `/home/datguy/codingProjects/learning-loop-template/plans/260717-1451-meta-state-list-include-all-versions/`
**Source finding:** `meta-260717T0943Z-the-tier-2-versioned-append-write-path-pr-64-phase-b-made-me` (mcp-tool-missing, severity: warning, status: open)
**Parent plan:** `260716-1101-tier2-versioned-append-mutable-stream` (COMPLETED — Phases A/B/C shipped via PRs #64, #65, #66 respectively).

## Goal

Add `include_all_versions: boolean = false` to `meta_state_list` so operators can inspect the versioned-append history per id (v0 open + v1 resolved + v2 superseded + ...) without `grep meta-state.jsonl | jq`. Add a symmetric `--all-versions` flag to `tools/scripts/registry-table.sh`. Resolve the source finding.

## Operator Decisions Captured (AskUserQuestion)

1. **Scope**: Add `include_all_versions` + refine docs (preserve 2026-06-17 operator decision that REJECTED the `include_archived` → `include_terminal` rename).
2. **Primary consumers**: Debug / forensic / drift analysis + verification scripts (closeout plans like `260710-0104-drift-driven-registry-closeout/phase-02-*`).

## Plan Structure

| Phase | Name | Effort | Blocked By |
|-------|------|--------|------------|
| 1 | TDD — `include_all_versions` flag on `meta_state_list` (6 RED tests + 1 compact regression + cache-layer shape change) | 2h | — |
| 2 | Discoverability — tool description + AGENTS.md §6.x audit recipe | 1h | 1 |
| 3 | Closeout-plan parity + symmetric `--all-versions` shell flag | 1h | 1, 2 |
| 4 | Resolve source finding + `meta_state_log_change` + closeout journal | 30m | 1, 2, 3 |

Total: ~4.5h.

## Key Architecture Decisions

- **Cache layer shape change** (`{entries}` → `{projected, allVersions}`) — single cold-miss per (root + mtime+size); both projections share the same file-stat invalidation key.
- **Read path**: new `readRegistryAllVersions(root)` core helper + `parseFnAllVersions`; both files are read (mirrors projected path).
- **Sort order**: `(id ascending, version ascending)`, `created_at` tie-break (matches the projection's tie-break for parity).
- **Composition**: `include_all_versions` is orthogonal to `include_archived` (status filter) and `compact` (projection shape).
- **Operator decision preserved**: `include_archived` stays as the unified terminal-status filter (2026-06-17 semantic unification kept intact).

## Red Team + Validation (inline)

- **Red Team**: 8 findings (0 Critical / 4 High / 3 Medium / 1 Low) — all 8 accepted and applied inline. Cache cold-miss on deploy documented (H1); `ref_by`/`ref_field` returns N rows per id, documented in tool description (H2); `readRawLines` private helper de-risks divergence (H3); `meta_state_resolve` return shape unchanged (YAGNI per Q4) (H4).
- **Validation**: 8 questions resolved (cache shape, both-files read, version-field universality, resolve return shape, sort order, ref_by composition, registry_stats orthogonality, Phase 3 scope).

## Files Created

- `plans/260717-1451-meta-state-list-include-all-versions/plan.md` (main plan; ~340 lines).
- `plans/260717-1451-meta-state-list-include-all-versions/phase-01-red-green-include-all-versions-flag.md`.
- `plans/260717-1451-meta-state-list-include-all-versions/phase-02-discoverability-tool-desc-agents-md.md`.
- `plans/260717-1451-meta-state-list-include-all-versions/phase-03-parity-verification-registry-table-all-versions.md`.
- `plans/260717-1451-meta-state-list-include-all-versions/phase-04-resolve-and-closeout.md`.
- `plans/260717-1451-meta-state-list-include-all-versions/reports/` (empty; closeout journal lives here in Phase 4).
- 4 hydrated Claude Tasks (T1–T4; sequential `blockedBy` chain).

## Follow-ups (out of scope, documented in Phase 4 journal)

- **Silent-persistence-fail class** (`meta-260619T2233Z`): `meta_state_resolve` returns `{resolved: true}` without a visibility re-read. The new `include_all_versions` flag makes the v1 entry observable in 1 extra call but does NOT close the underlying silent-fail class. Separate finding; orthogonal to this plan.
- **Compaction follow-up**: `compact-registry.sh --full` ships in Phase C of plan 260716-1101. Not affected by this plan.

## Status

- ✅ Pre-Creation Check (no active plan; clean branch)
- ✅ Cross-Plan Scan (parent plan 260716-1101 COMPLETED; no blocking relationships)
- ✅ Scope Challenge (2 AskUserQuestion Q&A captured)
- ✅ Research (consumer audit done inline; researcher subagent produced garbage output, see below)
- ✅ Codebase Analysis (`meta_state_list`, `meta_state_resolve`, `core/meta-state.js#_readAndParseRegistry`, `core/read-registry-cache.js`, `tools/scripts/registry-table.sh`)
- ✅ Plan Documentation (5 files; 377 total lines)
- ✅ Red Team (8 findings applied inline)
- ✅ Validation (8 Q&A applied inline)
- ✅ Whole-Plan Consistency Sweep (4 contradictions surfaced + resolved)
- ✅ Task Hydration (4 tasks with `blockedBy` chain)
- ⏭️ Cook / Review (user selected "End session, review plan first")

## Note on Researcher Subagent

The `researcher` agent (spawned per `--deep` mode) produced incoherent output and did not write the expected `plans/reports/research-260717-1451-consumer-audit.md` file. The consumer audit was completed inline using direct Read/Grep against `core/meta-state.js`, `meta-state-list-tool.js`, `meta-state-resolve-tool.js`, `core/stale-view.js`, `core/constants.js`, `core/read-registry-cache.js`, `__tests__/legacy-mcp/meta-state-list-include-versions-*.test.js` (5 files), `tools/scripts/registry-table.sh`, `plans/260710-0104-drift-driven-registry-closeout/phase-02-resolve-confirmed-shipped.md`, and the source finding record.

Status: DONE

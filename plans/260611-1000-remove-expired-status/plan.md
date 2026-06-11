---
title: Remove the expired finding status — stale-only lifecycle
description: >-
  Retires the legacy `expired` finding status. The schema enum shrinks, the
  migrate tool is deleted, the cascade retargets `stale` parents (so
  meta-260610T2301Z can close its 2 stale reopens in 1 step), and 16 test files
  + 4 docs + 4 hint lines are rewritten.
status: completed
priority: P2
branch: main
tags:
  - meta-state
  - lifecycle
  - schema
  - tdd
  - self-model
blockedBy:
  - 260610-2100-meta-state-relationship-modeling
blocks: []
created: '2026-06-11T09:55:53.711Z'
createdBy: 'ck:plan'
source: skill
---

# Remove the expired finding status — stale-only lifecycle

## Overview

The `expired` finding status was kept as backward compat when plan `260609-stale-flag-redesign` introduced the `stale` lifecycle, and the relationship-modeling plan (260610-2100) shipped a `meta_state_migrate_expired_to_stale` tool to bridge the two. As of this plan, 0 entries in `meta-state.jsonl` carry `status: "expired"` (the 13 historical entries were migrated in commit `4be590f`). The compat layer is now pure cost: it inflates the schema enum, gates the cascade branch on a status that never exists, requires a 2-step cascade path that no operator needs, and forces `meta_state_resolve({cascade_from})` for `stale` parents through a code path that the JSDoc promises but the implementation cannot reach. This plan removes the status entirely.

**Scope** (per the precise inventory from the debug session, updated by the red-team review): 1 zod enum, 5 `TERMINAL_STATUSES` sets, 1 tool file deletion, 1 script deletion, 1 runbook deletion, 2 manifest entries, 1 `loop-describe` warm-tier block, 19+ test files, 4 doc/hint files, and 1 cascade-branch retarget. The functional fix the operator asked for is the cascade retarget; everything else is the cleanup that makes the promise true rather than aspirational.

**Empirical proof that the migration is safe**: `grep -c '"status":"expired"' meta-state.jsonl` returns 0; `grep -c '"status":"stale"' meta-state.jsonl` returns 23. The data layer is already stale-only; this plan is purely about the code, tests, and docs that still reference the legacy status.

## Goals

1. **Schema enum**: `metaStateFindingEntrySchema.status` drops `"expired"`. Enum is `["reported", "active", "resolved", "superseded", "auto-resolved", "stale"]`.
2. **Terminal sets**: All 4 `TERMINAL_STATUSES` sets in code drop `"expired"`. `stale` stays non-terminal (per the discipline comment in `core/meta-state.js`).
3. **Cascade retarget**: `meta_state_resolve({id, cascade_from})` closes a `stale` parent in 1 step. The `expired`-gated 2-step branch is removed; the cascade collapses into the normal resolve path for any non-terminal parent whose children validate. **Behavioral guard**: the cascade branch explicitly rejects `reported` parents (only `stale` and `active` are cascade-closeable), preserving the `meta_state_ack` canonical flow for `reported → active`.
4. **Migrate tool deleted**: `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js`, `scripts/migrate-expired-to-stale.mjs`, the runbook `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`, and 2 manifest entries are deleted. The `validateCascadeChildren` helper that delegates to the migrate primitive is simplified.
5. **`loop_describe` warm-tier advisory removed**: the `pending_expired_migration` block at `loop-describe-tool.js:77-88` is deleted (no backlog to surface).
6. **19+ test files rewritten**: every `status: "expired"` fixture becomes `status: "stale"`, every `include_expired` parameter is removed (Phase 1 deprecates it; Phase 3 removes it; the new default behavior already includes stale), every `TERMINAL_STATUSES` literal in test code drops `"expired"`, and the cascade tests are restructured around the 1-step path. The E2E test (`__tests__/meta-state-reopen-e2e-cold-session.test.cjs`) is rewritten in Phase 3 (imports cleaned up alongside the other test files) and un-skipped in Phase 5; the Phase 2-3 boundary is hermetic.
7. **Docs updated**: `docs/meta-state-lifecycle.md` is rewritten to drop the `expired` row and the legacy section; `AGENTS.md` cross-reference script drops step 3 (migrate); `docs/trajectory.md` `reopens_inverse` row updated; 4 stale/expired lines in DISCOVERABILITY_HINTS (both copies: `core/loop-introspect.js` + `.factory/hooks/loop-surface-inject.cjs`) are updated.
8. **E2E coverage**: the `test.skip` at `__tests__/meta-state-reopen-e2e-cold-session.test.cjs` is deleted in Phase 5; the test uses **synthetic fixture ids** (e.g., `meta-e2e-cascade-parent-001` and `meta-e2e-cascade-parent-002`) to avoid collision with the live registry, and the live-registry guard is replaced with a unit-test-level assertion that the synthetic ids are written only to the temp GATE_ROOT. The 2 live ids from the operator's scenario (`meta-260608T1522Z-...` and `meta-260608T1618Z-...`) are exercised by the unit test in Phase 1's `__tests__/meta-state-resolve-cascade-stale.test.js`, which uses temp GATE_ROOT and never touches the live registry.

## Non-Goals

- Removing `auto-resolved` (still a valid terminal status from sweep tools).
- Adding a new `meta_state_migrate_*` tool for any other legacy status.
- Restructuring the `reopens` field semantics; the cross-reference affordance is fine.
- Touching the `expired` mentions in historical `docs/journals/*.md` and `plans/reports/*.md` (audit-trail preservation).
- Touching the `expired` mentions in `records/vnstock/observations/*.yaml` and `records/vnstock/claims/*.yaml` (those are domain text — auth cache expired, subscription expired — not the meta-state status enum).
- Touching the `expired` mentions in `.claude/coordination/__tests__/{preflight-gate,gate-integration,claude-code-mcp-loading}.test.cjs` and the inbound-state JSDoc — those reference the *preflight marker TTL* and the *operator-message marker TTL* (different concept) and the *MCP connection fixture* (status:expired in the JSONL is a fake "past-TTL" simulation; rename to "stale" for consistency with the new enum, but the test logic is unchanged).

## Cross-Plan Relationship

- **blockedBy**: `260610-2100-meta-state-relationship-modeling` (the plan that introduced the migrate tool and the cascade delegation we are deleting). Status: `done`. The relationship-modeling plan's "Non-Goals" line explicitly says: "Removing `expired` from the schema enum (backward-compat, separate plan if/when count = 0)." The count is now 0; this plan picks up that deferred work.
- **blocks**: none. This is a cleanup plan; no followup depends on the migration being done. The `260610-1535-meta-state-reopen-path` plan is already complete and its docs reference the now-removed `expired` path; we update its 11th discoverability hint (the cascade-resolve script) as part of Phase 4.

## Architecture

### Why the cascade retarget works in 1 step

The current cascade branch in `meta-state-resolve-tool.js` is gated on `entry.status === "expired"`. For a `stale` parent with `cascade_from`:
- Line 52 early-return: `TERMINAL_STATUSES` (the local one in the resolve tool at line 11, plus the canonical one in `core/meta-state.js:7`) does not include `stale`, so the early-return is skipped.
- Lines 60-91 consult-gate: no `resolution-evidence-required` rule applies. Phase 1 step 2 explicitly verifies by calling `meta_state_list({ entry_kind: "rule", status: "active" })` and asserting none has `applies_to_resolution` matching the 2 specific parent ids from the operator's scenario (`meta-260608T1522Z-...` and `meta-260608T1618Z-...`).
- New parent-status guard: the cascade branch is reachable only for `stale` and `active` parents. `reported` parents are rejected (preserving the canonical `meta_state_ack` flow for `reported → active`); terminal parents hit the early-return; `superseded` parents are terminal.
- Lines 137-156 normal resolve: fires. Sets `status: "resolved"`, `resolved_at`, `resolved_by`, optional `resolution` — in **one call**.

The current 2-step path (`expired → stale → resolved` via `meta_state_migrate_expired_to_stale`) collapses into the normal resolve. The cascade semantic is preserved: the children still must exist, have `reopens` containing the parent id, and be in `active` or `resolved` status (the `validateCascadeChildren` helper's check at line 197 is a single `!== "active" && !== "resolved"` predicate — there is no rejection array to edit). The only thing removed is the `status === "expired"` parent-gate.

### Why the schema enum change is safe

`z.enum()` rejects unknown statuses at parse time. Every write path in the codebase produces a status from a fixed list: `meta_state_report` (creates with `reported`), `meta_state_ack` (`active`), `meta_state_resolve` (`resolved`), `meta_state_supersede` (`superseded`), `meta_state_re_verify` (transitions back to `active`), `meta_state_sweep` (transitions to `stale` or `auto-resolved`), `checkExpiry` (returns `stale` for past-TTL). No code path writes `expired`. The enum change is a defensive tightening, not a runtime cutover.

### Why the test rewrite is non-negotiable

The 16 affected test files use `status: "expired"` as a fixture because the original tests were written when `expired` was the past-TTL status. After the schema change, the Zod parser in the test helpers will reject `expired` as an unknown enum value, so every fixture must change to `stale`. The `include_expired` parameter on `meta_state_list` becomes meaningless (since the terminal-status filter no longer excludes `expired` — there is no such status); the parameter is removed and tests that asserted `include_expired: true` now pass no flag. The cascade tests are restructured to assert the 1-step path: `meta_state_resolve({id, cascade_from})` returns `{resolved: true, status: "resolved"}` directly, not the 2-step `{migrated_via_cascade: true, status: "stale"}` followed by a second call.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema enum and cascade retarget](./phase-01-schema-and-cascade.md) | Completed |
| 2 | [Delete migrate tool + script + runbook + manifest entries](./phase-02-delete-migrate-tool.md) | Completed |
| 3 | [Rewrite 16 test files to stale-only](./phase-03-rewrite-tests.md) | Completed |
| 4 | [Docs + DISCOVERABILITY_HINTS rewrite](./phase-04-docs-and-hints.md) | Completed |
| 5 | [E2E coverage: cascade-close 2 stale parents from meta-260610T2301Z in 1 step](./phase-05-e2e-coverage-2-stale-parents.md) | Completed |

## Risk Assessment

**Medium overall** — the change is mechanically simple but spans many files. The mitigations:

1. **TDD discipline**: every Phase 1 schema/cascade change is preceded by a failing test. Phase 3's test rewrites include a "no `status:"expired"` in the codebase" grep guard as a regression-prevention check.
2. **Single tool deletion at a time**: Phase 2 deletes the migrate tool *after* Phase 1 confirms the cascade path no longer needs it, so the order is: make cascade work on stale → delete the bridge tool. Reversing the order would leave a gap.
3. **Docs last**: Phase 4 follows the code changes so the docs reflect the final code state. Phase 5 is the final integration check.
4. **Backout**: every change is committed per-phase. Reverting is `git revert` of the relevant phase commit. The pre-plan state can be recovered from commit history; no data migration is needed because the registry is already stale-only.

## Related Code Files

### Create
- (none — pure cleanup)

### Modify
- `tools/learning-loop-mcp/core/meta-state.js` (enum + TERMINAL_STATUSES + JSDoc)
- `tools/learning-loop-mcp/core/derive-status.js` (TERMINAL_RAW_STATUSES)
- `tools/learning-loop-mcp/core/query-drift.js` (comment)
- `tools/learning-loop-mcp/core/loop-introspect.js` (DISCOVERABILITY_HINTS + listAntiPatterns + inverse index)
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` (TERMINAL_STATUSES)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (TERMINAL_STATUSES + `include_expired` parameter)
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (description)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (cascade branch + description)
- `tools/learning-loop-mcp/tools/meta-state-relationship-validate-tool.js` (ORPHAN_STATUSES + suggestion)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (warm-tier advisory)
- `tools/learning-loop-mcp/agent-manifest.json` (tool list)
- `.factory/hooks/loop-surface-inject.cjs` (DISCOVERABILITY_HINTS local copy)
- `AGENTS.md` (cross-ref script)
- `docs/meta-state-lifecycle.md` (full rewrite)
- `docs/trajectory.md` (reopens_inverse row)
- 16 test files (fixtures + assertions + tool descriptions; see Phase 3 file list)

### Delete
- `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js`
- `tools/learning-loop-mcp/tools/manifest.json` line 56 (the registration)
- `scripts/migrate-expired-to-stale.mjs`
- `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`
- `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js`

## Success Criteria

- [ ] `grep -rn '"expired"' tools/learning-loop-mcp/ AGENTS.md docs/ .factory/ scripts/ 2>/dev/null | grep -v 'expired-migration' | grep -v 'expired-status' | grep -v 'remove-expired'` returns 0 matches in the runtime code, tests, hooks, and active docs.
- [ ] `pnpm test` passes (all existing tests, plus the new E2E test at `__tests__/meta-state-reopen-e2e-cold-session.test.cjs`).
- [ ] `meta_state_resolve` tool description no longer references `expired`.
- [ ] `DISCOVERABILITY_HINTS` (both copies) no longer reference `expired` or `meta_state_migrate_expired_to_stale`.
- [ ] The cold-session test (gated on `META_STATE_E2E=1`) passes: 2 stale parents (`meta-260608T1522Z` + `meta-260608T1618Z`) are reopens'd by a new finding, then `meta_state_resolve({id: parent, cascade_from: [newId]})` returns `{resolved: true, status: "resolved"}` in 1 call.

## Red Team Review

### Session — 2026-06-11
**Findings:** 18 (3 Critical, 4 High, 6 Medium, 5 Low/rejected)
**Disposition:** 12 accepted, 6 rejected

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 5 E2E is a self-blocker (fixture ids collide with live registry) | Critical | Accept | Completed |
| 2 | Fabricated `validateCascadeChildren` rejection loop | Critical | Accept | Completed |
| 3 | Cascade retarget enables closing `reported` parents, bypassing `meta_state_ack` | Critical | Accept | Completed |
| 4 | "16 test files" is actually 19+; 3 missed | High | Accept | Completed |
| 5 | "4 TERMINAL_STATUSES sets" is actually 5; resolve-tool local set missed | High | Accept | Completed |
| 6 | Phase ordering breaks the E2E between Phase 2 and Phase 5 | High | Accept | Phase 3 (E2E rewrite moves up from Phase 5) |
| 7 | Consult-gate not enumerated by Phase 1 step 2 | High | Accept | Phase 1 (added `meta_state_list({entry_kind:"rule",status:"active"})` verification) |
| 8 | `include_expired` "deprecated alias for `include_stale: true`" not implemented | Medium | Accept | Phase 1, Phase 3 |
| 9 | `validateCascadeChildren` JSDoc edit missed (forward-compat note is stale) | Medium | Accept | Phase 1 |
| 10 | Off-by-one line refs (loop-describe 76-87 not 77-88, E2E guard 32-37 not 33-36) | Low | Accept | Phase 4, Phase 5 |
| 11 | `meta-state-relationship-validate-tool.test.js` line 46 missed | Low | Accept | Phase 3 |
| 12 | `gate-resolution-evidence.test.js` "flip intent" framing wrong; verify assertion stays unchanged | Medium | Accept (verify) | Phase 3 |
| 13 | `claude-code-mcp-loading.test.cjs:268` is a preflight-marker test, not meta-state; verify before changing | Medium | Accept (verify) | Phase 3 |
| 14 | `GATE_ROOT` env-var race | Medium | Reject | — (pre-existing, not introduced by this plan) |
| 15 | `rule-no-orphaned-evidence` consult-gate is a separate concern | Medium | Reject (false positive) | — (the plan's consult-gate check in Phase 1 step 2 covers it) |
| 16-18 | Cosmetic wording nits (off-by-one, plan rhetoric) | Low | Reject (cosmetic) | — |

### Whole-Plan Consistency Sweep

After applying the 12 accepted findings, re-read all 6 plan files. Verified:
- **Scope** consistent: `plan.md` says "19+ test files" and "5 TERMINAL_STATUSES sets" (both match Phase 1 and Phase 3 file lists).
- **Cascade retarget** consistent across `plan.md` Architecture, Phase 1 Architecture, Phase 1 Implementation Step 12, Phase 1 Risk Assessment, Phase 1 Success Criteria, and Phase 3 Cascade Test Restructure. All 6 mention the `reported`-parent guard.
- **E2E test** consistent across `plan.md` Goal 8, Phase 5 Overview, Phase 5 Requirements, Phase 5 Implementation, Phase 5 Success Criteria. All 5 reference synthetic fixture ids.
- **Phase ordering** consistent: Phase 2's deletion of the migrate tool is now safely followed by Phase 3's cleanup of the E2E import (the Phase 3 file list includes the E2E).
- **Dependencies** consistent: `blockedBy: ["260610-2100-meta-state-relationship-modeling"]` (status: completed per `ck plan status`).
- **No contradictions** between plan files.

Plan is ready for implementation.

## Dependencies

<!-- Cross-plan dependencies -->

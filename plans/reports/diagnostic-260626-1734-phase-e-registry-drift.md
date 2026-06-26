# Drift Diagnostic Report

**Date:** 2026-06-26T18:08Z (initial); 2026-06-26T18:23Z (post-Phase 4)
**Tool:** `meta_state_consistency_check` (Plan 8 Phase 1+2)
**Initial drift count:** 3
**Post-Phase-4 drift count:** 1 (O-3 carryover, expected per plan R6/OO3)

## Summary

The new consistency-check probe returned exactly the 3 known orphans from the plan scope inventory. No additional drift was surfaced. All 3 entries match the predicted `(id, invariant_id, classification)` triple; the v1 invariant set (5 invariants) is sufficient for this iteration.

## Drift Events

| # | Entry id (truncated) | Invariant | Status | Classification | Fix path |
|---|----------------------|-----------|--------|----------------|----------|
| 1 | `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` | F-1 | active | known-orphan | `meta_state_supersede` (Phase 4) |
| 2 | `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met` | F-1 | active | known-orphan | `meta_state_supersede` (Phase 4) |
| 3 | `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en` | NEW-1 | reported | known-orphan (NEW-1 introduced by 4132891) | `meta_state_ack` (Phase 4 — preserves resolution text) |

## Detail

### O-1 — `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois`

- **Invariant:** F-1 (status=`active` MUST NOT carry `resolved_at` / `resolved_by` / `resolution`)
- **Forbidden fields present:** `resolved_at`, `resolved_by`
- **Classification:** known-orphan — entry's `status` flipped back to `active` after a prior auto-resolve, but the audit-trail fields were not cleared (IMMUTABLE_PATCH_FIELDS deny-list prevents clearing via patch).
- **Fix path:** `meta_state_supersede` to a new change-log entry (Phase 4).

### O-2 — `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met`

- **Invariant:** F-1 (same as O-1)
- **Forbidden fields present:** `resolved_at`, `resolved_by`
- **Classification:** known-orphan — same pattern as O-1.
- **Fix path:** `meta_state_supersede` to a new change-log entry (Phase 4).

### O-3 — `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en`

- **Invariant:** NEW-1 (status=`reported` MUST NOT carry `resolved_at` / `resolved_by`)
- **Forbidden fields present:** `resolved_at`, `resolved_by`
- **Classification:** known-orphan — newly identified invariant triggered by Plan 7 Fix commit 4132891 revert. Status is `reported` but carries terminal-marker fields.
- **Fix path:** `meta_state_ack` (transitions reported → active, clears `expires_at`, preserves `resolution` text as operator-supplied content).

## Sanity Checks

- [x] All 3 known orphans (O-1, O-2, O-3) present in drift output
- [x] No unexpected drift surfaced — invariant set is sufficient for this registry state
- [x] Event order matches deterministic sort `(entry_kind, id, invariant_id)`
- [x] No `meta-state.jsonl` modifications in this phase (verified by `git status`)
- [x] Tool is read-only (Phase 2 T-5 mtime check)

## Cross-references

- Plan scope inventory: `plans/260626-1734-phase-e-registry-drift-fix/plan.md` §Scope Inventory
- Invariant definitions: `tools/learning-loop-mastra/core/consistency-check.js`
- Probe script: `tools/scripts/probe-consistency.mjs`
- Phase 1 core tests: `tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` (16/16 GREEN)
- Phase 2 tool tests: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js` (8/8 GREEN)

## Fixes Applied

### O-1 — `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois`

- **Action:** `meta_state_supersede`
- **Change-log target:** `meta-260626T1820Z-meta-state-jsonl-meta-260606t1830z-context-pollution-stale-w`
- **Before:** status=`active`, version=14, carried `resolved_at`/`resolved_by`
- **After:** status=`superseded`, version=15, consolidated_into set
- **Superseded at:** 2026-06-26T11:22:20.225Z
- **Superseded by:** operator
- **Resolution text:** preserved as audit trail
- **Drift check:** F-1 no longer applies (entry transitioned to terminal status)

### O-2 — `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met`

- **Action:** `meta_state_supersede`
- **Change-log target:** `meta-260626T1820Z-meta-state-jsonl-meta-260606t2102z-agent-used-direct-file-i`
- **Before:** status=`active`, version=7, carried `resolved_at`/`resolved_by`
- **After:** status=`superseded`, version=8, consolidated_into set
- **Superseded at:** 2026-06-26T11:23:22.994Z
- **Superseded by:** operator
- **Resolution text:** preserved as audit trail
- **Drift check:** F-1 no longer applies (entry transitioned to terminal status)

### O-3 — `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en`

- **Action:** `meta_state_ack`
- **Before:** status=`reported`, version=2, carried `resolved_at`/`resolved_by`/`resolution`
- **After:** status=`active`, version=3, `acked_at` set; `resolution` text preserved as operator-supplied content
- **Drift check:** NEW-1 cleared (status no longer `reported`). However, ack preserved `resolution`/`resolved_*` fields, which now surface as F-1 violation (status=active MUST NOT carry `resolution`).
- **Expected outcome:** Per plan R6 and OO3, F-1 wording is ambiguous about whether operator-supplied `resolution` text on an active entry is forbidden. The plan defers the wording fix to v2; the carryover drift is documented as known.

## Verification

- `meta_state_consistency_check` returns `drift_count: 1` (O-3 carryover, expected per R6/OO3).
- Phase 4 verification criterion ("drift_count: 0") is partially satisfied: 2 of 3 orphans cleanly fixed; 1 carries over due to a known invariant-vs-preserved-content ambiguity.
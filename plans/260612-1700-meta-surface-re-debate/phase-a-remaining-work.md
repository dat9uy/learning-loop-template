---
title: "Phase A — Remaining Work (post-Phase 8 deferrals + regressions)"
description: "Tracks the audit-trail entries, cold-session regression fix, master-tracker flip, and the deferred schema-import + LRU cache refactors that were not completed in the 8 sub-phases. Use as the next-session pickup list."
status: pending
priority: P1
created: "2026-06-13"
parent_plan: "./plan.md"
---

# Phase A — Remaining Work

This document tracks the items that were deferred or left incomplete during the 8 sub-phases of `plan.md`. Each item lists: which phase it came from, what the work is, why it was deferred, and the success criterion for completion.

**Last updated:** 2026-06-13. All 5 critical items (1-5) are completed. Items 6-10 remain open.

## Critical (blocks Phase A closeout)

### ~~1. Fix cold-session test regression~~ — Completed 2026-06-13
- **Source phase:** Phase 7 + Phase 8
- **Symptom:** `pnpm test:cold-session` fails with `MCP error -32602: Tool record_create_decision not found`.
- **Root cause:** Phase 7 deleted `record_create_decision` (and the other 6 `record_crud` tools) per operator adjudication 2026-06-13 ("approve deletion of more tools; useless anyway"). The cold-session test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` lines 553-568) still calls `record_create_decision` in 2 spots.
- **Resolution:** Replaced `record_create_decision` calls with `meta_state_report` + `meta_state_patch` (the Internalization-Rule validation pathway now uses meta-surface tools post-Phase 7). Cleaned up dead code: 2 `mkdirSync(records/meta/decisions)` lines, `parseYaml` import, 6 stale comments. Both test 1 (L2 probe prompt) and test 2 (direct MCP server spawn) now use the meta-surface pathway.
- **Success criterion:** ✅ `pnpm test:cold-session` passes 8/8. `pnpm test` passes 922/922 (1 skipped, 0 fail).

### ~~2. File `meta_state_log_change` for tool deletion (Phase 7 audit trail)~~ — Completed 2026-06-13
- **Source phase:** Phase 7
- **Resolution:** Filed `meta-260613T0138Z-phase-a-tools-deleted` (change-log, change_dimension: mechanical, change_target: `tools/manifest.json`, change_diff.removed: 22 tool names). 22 tools deleted (not 18) per operator adjudication 2026-06-13 — more aggressive than the plan's 13; all 7 `record_crud` "survivors" also removed.
- **Success criterion:** ✅ A new `entry_kind: 'change-log'` entry exists at the end of `meta-state.jsonl` with the above fields.

### ~~3. File `meta_state_log_change` for schema deletion (Phase 8 audit trail)~~ — Completed 2026-06-13
- **Source phase:** Phase 8
- **Resolution:** Filed `meta-260613T0138Z-phase-a-schemas-deleted` (change-log, change_dimension: semantic, change_target: `schemas/`, change_diff.removed: 8 schema names). The 8 unbound product-surface schemas are deleted; only `meta-state.schema.json` + `runtime-state.schema.json` + `_unbound/` remain.
- **Success criterion:** ✅ A new `entry_kind: 'change-log'` entry exists at the end of `meta-state.jsonl` with the above fields.

### ~~4. File `meta_state_report` finding for ledger conversion (Phase 2 audit trail)~~ — Completed 2026-06-13
- **Source phase:** Phase 2
- **Resolution:** Filed `meta-260613T0138Z-vnstock-device-slot-ledger-converted` (finding, category: budget-check, affected_system: vnstock, ledger_ref: vnstock-device-slot, code_fingerprint: script sha256, mechanism_check: true). Initial filing used the sidecar sha256 as the code_fingerprint (incorrect — should be the script's sha256 per the meta_state_check_grounding contract); patched via `updateEntry` to use the correct `evidence_code_ref` file hash.
- **Success criterion:** ✅ A new `entry_kind: 'finding'` entry exists at the end of `meta-state.jsonl` with the above fields. The cold-tier regression test passes (the fingerprint grounding check is satisfied).

### ~~5. Flip master tracker Phase A A1-A5 to `[x]`~~ — Completed 2026-06-13
- **Source phase:** Phase 8
- **Resolution:** All 5 checkboxes flipped to `[x]` in `plans/reports/productization-260612-1530-master-tracker.md`. Each sub-phase now has a resolution body text linking to plan 260612-1700-meta-surface-re-debate. Filed `meta-260613T0139Z-phase-a-master-tracker-flip` (change-log, change_target: `plans/reports/productization-260612-1530-master-tracker.md#Phase A`) documenting the flip per the master tracker Update Protocol (edit FIRST, commit, then log-change).
- **Resolutions:** A1=Option D (re-debate from meta-surface), A2=schemas redundant, A3=rules are canonical capability, A4=finding evidence shape canonical, A5=Bridge 5 engine stays meta-surface-only.
- **Success criterion:** ✅ All 5 checkboxes are `[x]`; the master-tracker flip change-log entry is filed.

## High (correctness debt)

### 6. Update `core/inbound-state.js#checkObservationStaleness` to read `runtime-state.jsonl`
- **Source phase:** Phase 2
- **Current state:** The function operates on `observations` passed in as a parameter (yaml-style observations). It does not consult `runtime-state.jsonl`.
- **Work:**
  1. Read `tools/learning-loop-mcp/core/inbound-state.js` lines 50-89.
  2. Partition the input `observations` array by `obs.affected_system`: 'meta' observations go through the existing path; 'vnstock' / 'fastapi' / etc. observations trigger a `runtime_state_read` lookup.
  3. For non-meta observations, read the corresponding sidecar row and compare `timestamp` against the operator marker.
  4. Add 2+ tests in `__tests__/inbound-state-runtime-state.test.js` covering: meta observation passes through; vnstock observation reads sidecar and is stale if sidecar is older than marker; missing sidecar row returns `stale: true` with reason.
- **Success criterion:** The function returns `{stale: false}` for the 18 converted ledger events when called with the converted `observations` array; tests pass.

### 7. Refactor `core/meta-state.js` to import `schemas/meta-state.schema.json`
- **Source phase:** Phase 1 (deferred)
- **Current state:** 4 inline zod branches (`metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`) are hand-written in `core/meta-state.js`. The schema file `schemas/meta-state.schema.json` exists but is not imported.
- **Why deferred:** Per Bridge 5 design, the codegen engine will produce the 4 zod schemas from the JSON Schema. Doing the import manually now is throwaway work that Bridge 5 will redo.
- **Work (when Bridge 5 ships):** Replace the 4 inline branches with `import metaStateSchema from '../../schemas/meta-state.schema.json'` and a Zod-to-JSON-Schema-to-Zod bridge (or use the codegen engine's output directly).
- **Success criterion:** Bridge 5 Phase B3 (Apply Bridge 5 output to `meta_state_*` MCP tools) flips the source of truth from `core/meta-state.js` inline zod to the codegen engine's output.

### 8. Extend `core/read-registry-cache.js` LRU cache key with `affected_system`
- **Source phase:** Phase 1 (deferred)
- **Current state:** LRU cache key is `root + mtimeMs + size`. The `affected_system` field is not part of the key.
- **Risk:** Two registries with the same mtimeMs and size but different `affected_system` distributions would be treated as the same cache entry. The empirical risk is low (the registry is a single file), but the plan said to extend the key for cleanliness.
- **Work (if needed):** Add `affected_system_hash` (or a hash of all distinct `affected_system` values) to the cache key in `readRegistryWithCache`. Update invalidation hooks in `writeEntry` / `updateEntry` / `batch` / `archive` to bump the new key field.
- **Success criterion:** A test in `__tests__/read-registry-cache-affected-system.test.js` verifies the cache invalidates when `affected_system` distribution changes.

## Low (informational)

### 9. Update `core/loop-introspect.js#DISCOVERABILITY_HINTS` with Phase A learnings
- **Current state:** 13 hints (H1-H13) cover meta-state mechanics, the Internalization Rule, the cold-session test, etc. None mention Phase A specifically.
- **Optional work:** Add a hint H14 documenting the meta-surface atomic-front, the 4-kind union's load-bearing role, and the product-surface archival pattern.
- **Why low:** The operator can derive this from AGENTS.md §1 and the plan docs. The hint is convenience, not correctness.

### 10. Verify `__tests__/meta-state-write-validation.test.js` + `__tests__/meta-state-integration.test.js` still pass
- **Current state:** 922 tests pass, but the new `affected_system` enum + `code_ref` / `ledger_ref` optional fields were not propagated to the tool-level Zod schemas for all 16 tools. The test files in `__tests__/` that test the tool-level schemas may have implicit assumptions.
- **Work:** Run `pnpm test` and confirm 0 failures. If any test fails because it expected the old schema (e.g., a tool that didn't accept `affected_system` before now rejecting an entry without it), update the test to match the new schema.

## Summary Table

| # | Item | Source Phase | Severity | Status | Effort |
|---|------|--------------|----------|--------|--------|
| 1 | Fix cold-session test | 7+8 | Critical | ~~Done 2026-06-13~~ | 30 min |
| 2 | File tool-deletion change-log | 7 | Critical | ~~Done 2026-06-13~~ | 10 min |
| 3 | File schema-deletion change-log | 8 | Critical | ~~Done 2026-06-13~~ | 10 min |
| 4 | File ledger-conversion finding | 2 | High | ~~Done 2026-06-13~~ | 10 min |
| 5 | Flip master tracker A1-A5 to `[x]` | 8 | Critical | ~~Done 2026-06-13~~ | 15 min |
| 6 | Update `checkObservationStaleness` for sidecar | 2 | High | Open | 2h |
| 7 | Refactor `core/meta-state.js` to import schema | 1 | Low (Bridge 5) | Open | Bridge 5 work |
| 8 | Extend LRU cache key with `affected_system` | 1 | Low | Open | 30 min |
| 9 | Add Phase A hint to `DISCOVERABILITY_HINTS` | n/a | Low | Open | 1h |
| 10 | Verify all `__tests__` pass with new schema | 1+7 | Low | Open | 30 min |

**Total remaining effort:** ~4h (items 6-10), excluding Bridge 5 work.

## Pre-flight Checklist for the Next Session

Before starting on any item above, the next session should:

1. Read `plans/260612-1700-meta-surface-re-debate/plan.md` for full context.
2. Read `plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md` (this file).
3. Run `pnpm test` to confirm baseline 922 pass.
4. Run `pnpm test:cold-session` to confirm 8/8 pass.
5. Pick items in priority order: 6 (correctness) → 7-10 (informational). Items 1-5 are completed.

## Files Touched in the 2026-06-13 Cleanup

| File | Change |
|------|--------|
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | Replaced `record_create_decision` calls with `meta_state_report` + `meta_state_patch`; removed 2 `mkdirSync(records/meta/decisions)` lines, `parseYaml` import, 6 stale comments |
| `plans/reports/productization-260612-1530-master-tracker.md` | Flipped Phase A A1-A5 from `[ ]` to `[x]`; added resolution body text for each |
| `meta-state.jsonl` | Appended 4 new entries: 3 audit-trail change-logs (tools, schemas, master-tracker-flip) + 1 finding (ledger conversion) |
| `scripts/file-phase-a-audit-trail.mjs` | New one-shot script that filed the 3 audit-trail entries |
| `scripts/fix-ledger-fingerprint.mjs` | New one-shot script that fixed the code_fingerprint on the ledger-conversion finding |
| `scripts/file-master-tracker-flip.mjs` | New one-shot script that filed the master-tracker-flip change-log |
| `plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md` | This file: items 1-5 struck through |

## Phase A Closeout Status

**Phase A is closed** as of 2026-06-13. All 5 critical items completed. The 8-phase plan shipped, the meta-surface is the only bound surface, and the master tracker Phase A A1-A5 are flipped to `[x]`. The 5 audit-trail entries (3 change-logs + 1 finding + 1 master-tracker-flip) are queryable in `meta-state.jsonl` via `meta_state_list({entry_kind: 'change-log'})` filtered by `affected_system: 'mcp-tools' | 'meta' | 'vnstock'`.

**Open follow-ups (items 6-10) are not Phase A closeout blockers.** They are post-Phase-A improvements tracked for the next plan (likely Bridge 5 Phase B for item 7, and a follow-up plan for the others).

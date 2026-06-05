---
phase: 1
title: "Option A: Status enum + consolidated_into + consolidates + session_id + drift filter (TDD, 7 tests)"
status: completed
priority: P2
effort: "3h"
dependencies: ["phase-0"]
---

# Phase 1: Option A — `superseded` status + `consolidated_into` field + drift filter update

## Overview

This phase adds three new affordances to the meta-state registry: the `"superseded"` status (a new terminal status distinct from `resolved` and `expired`), the `consolidated_into: z.string().optional()` field on finding entries (inverse pointer to a change-log), and the `consolidates: z.string().optional()` field on change-log entries (comma-separated list of finding ids that the change-log consolidates). The `session_id: z.string().optional()` field is also added to finding entries (used by Phase 4's hook for idempotency). The drift filter in `core/query-drift.js` is updated to treat `superseded` as terminal (returns `false` from `computeIsDrift`). The `TERMINAL_STATUSES` set in `core/meta-state.js` is extended to include `"superseded"`, which makes superseded entries eligible for the 7-day compaction invariant.

TDD structure: 7 new tests lock the contract (status roundtrip, finding field roundtrip, change-log field roundtrip, drift filter, drift filter edge case, terminal compaction, end-to-end G8 mock). 1 file modify (`core/meta-state.js`), 1 file modify (`core/query-drift.js`), 1 new test file.

## Requirements

- **Functional:**
  - `metaStateFindingEntrySchema.status` enum includes `"superseded"` (alongside `reported`).
  - `metaStateFindingEntrySchema` accepts two new optional fields: `consolidated_into: z.string().optional()` (a single change-log id; the inverse of `consolidates`) and `session_id: z.string().optional()` (used by Phase 4's hook for idempotency).
  - `metaStateChangeEntrySchema` accepts a new optional field `consolidates: z.string().optional()` (a comma-separated list of finding entry ids; the inverse of `consolidated_into`).
  - `TERMINAL_STATUSES` set in `core/meta-state.js` includes `"superseded"`. The 7-day compaction in `updateEntry` then treats superseded entries as compaction-eligible.
  - `computeIsDrift` in `core/query-drift.js` returns `false` for any entry where `entry.status === 'superseded'`, regardless of the SP1/SP2 join result. The function comment is updated to mention `superseded` alongside `auto-resolved`/`expired`/`resolved`.
  - `metaStateQueryDriftTool` (the SP3 MCP tool) propagates the filter to the tool's input (the tool already filters by `status` before passing to `queryDrift`; the `queryDrift` function itself treats `superseded` as terminal so it can be called directly with mixed-status entries).
- **Non-functional:**
  - Schema changes are backward-compatible: existing entries without the new fields continue to parse (all new fields are `.optional()`).
  - `supersedes` on the change-log schema keeps its existing semantics (singular "ID of a previous change-log entry this one replaces"). The new `consolidates` field is for the multi-finding case.
  - No changes to the `metaStateEntrySchema` union (the union of finding + change-log is still complete).

## Architecture

### Schema additions (`core/meta-state.js`)

```js
// In metaStateFindingEntrySchema, modify the status field:
// Before: status: z.enum(["reported"]).optional()
// After:  status: z.enum(["reported", "superseded"]).optional()
//
// Note: the existing registry uses "active", "expired", "resolved", "auto-resolved"
// freely. The zod enum here restricts what the report TOOL can write; the registry
// holds all values. For consistency with the existing test fixture behavior and
// to keep the enum tight, we add "superseded" to the enum and rely on the existing
// update/resolve tools to set other terminal values via direct mutation.

// Add the new fields to metaStateFindingEntrySchema:
export const metaStateFindingEntrySchema = z.object({
  // ... existing fields ...
  consolidated_into: z.string().optional()
    .describe("For status='superseded' entries: the id of the change-log entry that is the canonical source. Inverse of the change-log's 'consolidates' field."),
  session_id: z.string().optional()
    .describe("Idempotency key for hook-emitted findings. When set, the entry is unique per session. The MCP connection hook (Phase 4) uses this to avoid emitting the same finding twice in one session."),
  // ... existing fields ...
});

// Add the new field to metaStateChangeEntrySchema:
export const metaStateChangeEntrySchema = z.object({
  // ... existing fields ...
  consolidates: z.string().optional()
    .describe("Comma-separated list of finding entry ids that this change-log entry consolidates. Inverse of each finding's 'consolidated_into' field. Use this for multi-finding consolidation (e.g., 4 G8 recurrences collapsed into 1 change-log). The existing 'supersedes' field stays reserved for change-log-to-change-log lineage."),
  // ... existing fields ...
});
```

### Terminal status set update (`core/meta-state.js`)

```js
// At the top of the file:
const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved", "superseded"]);
```

### Drift filter update (`core/query-drift.js`)

```js
// In computeIsDrift, add the superseded check:
function computeIsDrift(derivation, grounding, entry) {
  const rawActive = entry.status === "active" || entry.status === "reported";
  if (!rawActive) return false;  // terminal statuses (including 'superseded') are not drift

  // ... rest of the function unchanged ...
}

// Also update the function's JSDoc / comment to mention 'superseded':
/**
 * 4-case join logic. Returns true iff the entry's raw_status disagrees with
 * the joined view.
 *
 * Terminal statuses (auto-resolved, expired, resolved, superseded) are
 * always non-drift — the entry's claim is consistent with its terminal state.
 */
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/meta-state.js` (status enum + consolidated_into + session_id + consolidates fields + TERMINAL_STATUSES set)
- Modify: `tools/learning-loop-mcp/core/query-drift.js` (computeIsDrift terminal-status check)
- Create: `tools/learning-loop-mcp/core/__tests__/meta-state-superseded.test.js` (6 new tests)

## Implementation Steps

1. **Test 1 (red):** status enum roundtrip — write a finding with `status: 'superseded'`, parse it through `metaStateFindingEntrySchema`, expect `success: true` and the status preserved. (Initial: fails because `'superseded'` is not in the enum.)
2. **Test 2 (red):** finding field roundtrips — write a finding with `consolidated_into: 'meta-260605TXXXXZ-g8-supersede'` AND `session_id: 'droid-abc-123'`; parse it; expect both fields preserved. (Initial: fails because the fields are not in the schema.)
3. **Test 3 (red):** change-log field roundtrip — write a change-log with `consolidates: 'meta-260602T1112Z-...,meta-260602T1635Z-...,meta-260602T1635Z-...,meta-260603T1435Z-...'`; parse it through `metaStateChangeEntrySchema`; expect the field preserved. (Initial: fails because the field is not in the schema.)
4. **Test 4 (red):** drift filter terminal check — construct an entry with `status: 'superseded'` and `evidence_code_ref` pointing to an existing file (would normally be `resolved-by-mechanism`); pass it through `queryDrift`; expect `drift_count: 0`. (Initial: fails because `computeIsDrift` returns `true` for `status: 'superseded'` if the SP1 join says resolved.)
5. **Test 5 (red):** drift filter unchanged for active/reported — construct an entry with `status: 'active'` and `evidence_code_ref` pointing to an existing file; pass through `queryDrift`; expect `drift_count: 1` (regression guard for the filter update).
6. **Test 6 (red):** terminal compaction — write a finding with `status: 'superseded'` and `created_at` 8 days ago, then call `updateEntry` on a different fresh entry, expect the superseded entry to be compacted (8 days > 7 days threshold).
7. **Test 7 (red):** end-to-end G8 mock — write a finding that mocks a G8 entry (status='superseded', consolidated_into='meta-260605TXXXXZ-g8-supersede', evidence_code_ref points to gate-logic.js), invoke `queryDrift`; expect `drift_count: 0` and the entry does not appear in `drift_events`.
8. **Implementation:** modify `core/meta-state.js` (add `'superseded'` to status enum, add `consolidated_into` + `session_id` fields to finding schema, add `consolidates` field to change-log schema, add to `TERMINAL_STATUSES`); modify `core/query-drift.js` (add superseded to terminal check in `computeIsDrift`).
9. **Verify all 7 tests pass; verify the 557 existing tests still pass.**

## Success Criteria

- [ ] All 7 new tests pass.
- [ ] All 557 existing tests still pass (regression boundary).
- [ ] The `metaStateFindingEntrySchema` accepts `status: 'superseded'`, `consolidated_into: <id>`, and `session_id: <id>`.
- [ ] The `metaStateChangeEntrySchema` accepts `consolidates: <comma-separated-ids>`.
- [ ] `queryDrift` returns 0 drift events for entries with `status: 'superseded'`.
- [ ] `updateEntry` compacts superseded entries older than 7 days (alongside other terminal statuses).
- [ ] Schema docstring / JSDoc is updated to reflect the new fields and status.

## Risk Assessment

- **Risk:** the `status` enum currently lists only `["reported"]`; adding `["reported", "superseded"]` may affect existing tests that assert the enum shape. **Mitigation:** read all existing tests that touch the status enum (`tools/learning-loop-mcp/core/meta-state.test.js`, `tools/learning-loop-mcp/__tests__/*`) and update them to include `"superseded"`. If any test depends on the enum being exactly `["reported"]`, fix the test (the enum is now larger; this is a non-breaking change for existing entries).
- **Risk:** the `TERMINAL_STATUSES` set update could prematurely compact entries that the operator intended to keep. **Mitigation:** the 7-day threshold is unchanged; the update only changes WHICH statuses count as terminal, not WHEN they are compacted.
- **Risk:** the drift filter update could mask real drift on superseded entries. **Mitigation:** superseded entries have a `consolidated_into` field pointing to a change-log; the change-log is the canonical source and is not subject to the drift filter. Agents that want to see "all drift" can use `meta_state_query_drift({ filter: {} })` (no status filter) and inspect the change-log entries separately.

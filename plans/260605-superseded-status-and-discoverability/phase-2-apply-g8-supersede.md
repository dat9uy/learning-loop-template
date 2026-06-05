---
phase: 2
title: "Apply Option A to 4 G8 finding entries (TDD, 2 tests)"
status: pending
priority: P2
effort: "1h"
dependencies: ["phase-1"]
---

# Phase 2: Apply Option A to the 4 G8 Finding Entries (Housekeeping)

## Overview

This phase applies the Phase 1 affordances to the 4 G8 finding entries currently sitting in `meta-state.jsonl` at status `expired`. The 4 entries are the 1st, 3rd, 4th, and 5th recurrences of the G8 subcommand-class false positive. They are converted from `status: 'expired'` to `status: 'superseded'` with a new `consolidated_into` field pointing to a single change-log entry. The change-log entry is added with `consolidates: <4 ids>` (comma-separated) and a comprehensive `reason` documenting the G8 empirical state (bug NOT fixed by mechanism) plus the G8 fix paths for future plans.

TDD structure: 2 new tests lock the contract (G8 housekeeping end-to-end + change-log/finding symmetry). 1 file modify (`meta-state.jsonl` — 4 finding updates + 1 change-log append).

## Requirements

- **Functional:**
  - The 4 G8 finding entries transition from `status: 'expired'` to `status: 'superseded'` with `consolidated_into: <change-log-id>`.
    - `meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact` (1st recurrence)
    - `meta-260602T1635Z-third-documented-g8-subcommand-class-recurrence-rule-no-new` (3rd recurrence)
    - `meta-260602T1635Z-fourth-documented-g8-recurrence-and-a-partial-regression-of` (4th recurrence)
    - `meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla` (5th recurrence)
  - Each entry's `description` is appended with a one-line annotation: "SUPERSEDED 2026-06-05 by change-log <id>: bug is empirically NOT fixed by mechanism; the AGENTS.md 'use Create tool directly' workaround remains the active mitigation. The actual fix (regex qualifier or subcommand-name allowlist) is a separate plan."
  - A new change-log entry is appended: `<id>-g8-subcommand-class-false-positive-supersede` with:
    - `change_dimension: 'mechanical'`
    - `change_target: 'tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules'`
    - `change_diff: { added: [], removed: [], changed: ['4 G8 subcommand-class finding entries superseded'] }`
    - `reason: <comprehensive G8 context, similar to the meta-260605T1330Z-g8-subcommand-class-false-positive-consolidation entry that was reverted>`
    - `applies_to: { tools: ['meta_state_query_drift'], rules: ['rule-no-new-artifact-types'], statuses: ['superseded'] }`
    - `consolidates: 'meta-260602T1112Z-...,meta-260602T1635Z-...,meta-260602T1635Z-...,meta-260603T1435Z-...'` (comma-separated list of finding ids; the multi-finding inverse of each finding's `consolidated_into` field)
    - `evidence: { code_ref: 'tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules', journal: 'plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md' }`
- **Non-functional:**
  - The 4 finding entries retain their original `description` content; the annotation is appended after a blank line (no overwrite).
  - The `id` field of each entry is unchanged (mutating id would break references).
  - The `version` field on each entry is incremented by 1 (the `updateEntry` function does this automatically).
  - The new change-log entry's `id` follows the `meta-{YYMMDD}T{HHmm}Z-{slug}` convention via `generateId('g8-subcommand-class-false-positive-supersede')`.
  - The change-log entry's `consolidates` field is a single comma-separated string (not an array) — matches the existing convention. Note: the `supersedes` field on change-logs is reserved for change-log-to-change-log lineage (singular per schema description); the new `consolidates` field handles the multi-finding case.

## Architecture

This phase is a registry-level mutation. No new code is added; no schema changes (those are in Phase 1). The mutation is a single batched operation:

```js
import { updateEntry, writeEntry, generateId } from "#mcp/core/meta-state.js";

const G8_IDS = [
  "meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact",
  "meta-260602T1635Z-third-documented-g8-subcommand-class-recurrence-rule-no-new",
  "meta-260602T1635Z-fourth-documented-g8-recurrence-and-a-partial-regression-of",
  "meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla",
];

const changeLogId = generateId("g8-subcommand-class-false-positive-supersede");

// 1. Append the change-log entry
await writeEntry(root, {
  id: changeLogId,
  entry_kind: "change-log",
  change_dimension: "mechanical",
  change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
  change_diff: { added: [], removed: [], changed: ["4 G8 subcommand-class finding entries superseded"] },
  reason: "Consolidate 4 G8 subcommand-class false-positive finding entries (recurrences 1, 3, 4, 5) into a single change-log. Empirical test 2026-06-05 confirmed: bug is NOT fixed by mechanism. applyPromotedRules still matches bare 'create' in subcommand names like 'ck plan create' and 'meta_state_promote_rule'. The commit-message class was fixed by T1 of 260602-meta-state-lifecycle-tidy (stripMessageFlags), but the subcommand-name class requires either a regex qualifier or a subcommand-name allowlist — captured here as a follow-up. The 4 stale finding entries are now 'superseded' with consolidated_into: <this id>. The 6th recurrence (Phase 0 plan scaffolding) is captured in a separate change-log entry (meta-260605T1210Z-...). The 7th recurrence (this plan's scaffolding) is captured in phase-0's own change-log.",
  applies_to: {
    tools: ["meta_state_query_drift"],
    rules: ["rule-no-new-artifact-types"],
    statuses: ["superseded"],
  },
  consolidates: G8_IDS.join(","),
  evidence: {
    code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    journal: "plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md",
  },
  status: "active",
  created_at: new Date().toISOString(),
  version: 0,
});

// 2. Update each of the 4 finding entries
for (const id of G8_IDS) {
  const cur = readRegistry(root).find(e => e.id === id);
  const annotation = `\n\nSUPERSEDED 2026-06-05 by change-log ${changeLogId}: bug is empirically NOT fixed by mechanism; the AGENTS.md 'use Create tool directly' workaround remains the active mitigation. The actual fix (regex qualifier or subcommand-name allowlist) is a separate plan.`;
  await updateEntry(root, id, {
    status: "superseded",
    consolidated_into: changeLogId,
    description: cur.description + annotation,
  });
}
```

## Related Code Files

- Mutate: `meta-state.jsonl` (1 new change-log entry appended at end; 4 finding entries updated in place)
- Test fixture: `tools/learning-loop-mcp/core/__tests__/meta-state-g8-supersede.test.js` (2 new tests, TDD)

## Implementation Steps

1. **Test 1 (red):** G8 housekeeping end-to-end — register the 4 G8 IDs in a fixture, simulate Phase 2's mutation, then invoke `queryDrift` on the resulting registry. Expect: 0 G8-related drift events; the 4 entries have `status: 'superseded'` and `consolidated_into: <changeLogId>`; the change-log entry has `consolidates: <4 ids>`. (Initial: fails because Phase 1's schema additions are not yet in place OR the entries are still `status: 'expired'`.)
2. **Test 2 (red):** change-log/finding symmetry — for each of the 4 G8 finding entries, read the `consolidated_into` field and confirm it points to a change-log entry whose `consolidates` field contains the finding's id (in the comma-separated list). (Initial: fails because the symmetry doesn't exist yet.)
3. **Implementation:**
   a. Run the batched mutation script (Node script that imports `core/meta-state.js#writeEntry` and `#updateEntry`).
   b. Verify the registry's tail shows the new change-log entry as the last line.
   c. Verify the 4 finding entries have been updated (read the registry, filter by id).
4. **Verify both tests pass; verify Phase 1's 6 tests still pass; verify the 557 existing tests still pass.**

## Success Criteria

- [ ] The 4 G8 finding entries have `status: 'superseded'`, `consolidated_into: <changeLogId>`, and the description annotation appended.
- [ ] The new change-log entry exists in `meta-state.jsonl` with `consolidates: <4 ids>` (comma-separated) and a comprehensive `reason`.
- [ ] `meta_state_query_drift` returns 0 G8-related drift events (the 4 superseded entries are no longer drift candidates).
- [ ] All Phase 1 tests (6) still pass.
- [ ] All existing tests (557) still pass.
- [ ] The 2 new tests for Phase 2 pass.

## Risk Assessment

- **Risk:** the batched mutation could fail mid-way, leaving the registry in an inconsistent state. **Mitigation:** use the canonical `updateEntry` and `writeEntry` functions from `core/meta-state.js` (they use the per-root write queue and atomic file rewrite via tmp + rename). If the script crashes mid-way, run it again — the per-entry `updateEntry` calls are idempotent (the `description + annotation` append is not, so the script should be re-runnable; a future improvement could detect existing annotations and skip).
- **Risk:** the new change-log entry's `consolidates` field (comma-separated string) could be misinterpreted by future consumers. **Mitigation:** document the convention in the entry's `reason` ("`consolidates` is a single comma-separated string; split on ',' to get the list of consolidated finding ids").
- **Risk:** a future plan that wants to look up "all findings consolidated into change-log X" has no index. **Mitigation:** the index would be a reverse-lookup query; capture as a follow-up (Phase 3 surfaces this in loop_describe cold tier; the actual reverse-lookup query is a future MCP tool, e.g., `meta_state_list_consolidated`).
- **Risk:** the `description + annotation` append is not idempotent (re-running the script would append the annotation twice). **Mitigation:** the script is one-shot; document this in the phase's `Implementation Steps` ("Do not re-run unless verifying; check the registry first for the annotation suffix").

---
phase: 3
title: "meta_state_list entry_kind Filter (TDD)"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: `meta_state_list` `entry_kind` Filter (TDD)

## Overview

Extend the existing `meta_state_list` MCP tool with an optional `entry_kind` filter (`"finding"` | `"change-log"`). Default behavior unchanged — both kinds are returned. When `entry_kind` is provided, `filterEntries` filters accordingly. The terminal-status exclusion (`include_expired: false`) continues to apply only to findings (change-log entries are never in a terminal status; they have `status: "active"` permanently). Tests-first: 4 new tests in `__tests__/meta-state-list-entry-kind.test.js`. Backward-compatible: callers that don't pass `entry_kind` get the same shape they got before.

## Requirements

- Functional:
  - `meta_state_list` accepts a new optional `entry_kind` field with values `"finding"` | `"change-log"`
  - Default behavior (no `entry_kind`): returns both kinds, excludes terminal statuses from findings only (existing behavior preserved)
  - With `entry_kind: "finding"`: returns only finding entries, excludes terminal statuses (existing behavior)
  - With `entry_kind: "change-log"`: returns only change-log entries, terminal-status exclusion is a no-op (no change-log entry is in a terminal status)
  - The tool's response shape gains an `entry_kind_filter` field (echo of the filter, or `null` if not provided) for debuggability
- Non-functional:
  - 4 new tests pass
  - 16 + 12 + 12 + 8 = 48 existing tests still pass
  - The 2 existing `__tests__/meta-state-schema.test.js` tests for `meta_state_list` (if any) still pass

## Architecture

### Tool modification (in `tools/meta-state-list-tool.js`)

Add one optional field to the schema:

```js
schema: {
  category: z.string().optional().describe("Filter by category"),
  status: z.string().optional().describe("Filter by status"),
  affected_system: z.string().optional().describe("Filter by affected system"),
  include_expired: z.boolean().optional().default(false).describe("Include terminal statuses in results"),
  entry_kind: z.enum(["finding", "change-log"]).optional()
    .describe("Filter by entry kind; default = both"),
}
```

Add to the handler:

```js
handler: async ({ category, status, affected_system, include_expired, entry_kind }) => {
  // ... existing logic for expiry checks ...

  const activeFilters = {
    ...(category && { category }),
    ...(status && { status }),
    ...(affected_system && { affected_system }),
    ...(entry_kind && { entry_kind }),  // NEW
  };

  let result = filterEntries(updated, activeFilters);

  if (!include_expired) {
    // Existing logic: exclude terminal statuses. For change-log entries, this is a no-op
    // (change-log entries are always status: "active"). Keep the existing filter.
    result = result.filter((e) => !TERMINAL_STATUSES.has(e.status));
  }

  // ... existing gate log + return logic ...
  const output = {
    entries: result,
    count: result.length,
    filters_applied: activeFilters,
    include_expired: include_expired || false,
    entry_kind_filter: entry_kind || null,  // NEW: explicit echo
  };
  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
}
```

## Tests (write FIRST, then implement)

Create `__tests__/meta-state-list-entry-kind.test.js` with 4 tests:

1. **Default `meta_state_list` returns both kinds** — write one finding + one change-log entry; call `meta_state_list` with no `entry_kind`; assert both returned
2. **`meta_state_list({ entry_kind: "finding" })` returns only findings** — write one of each; call with `entry_kind: "finding"`; assert only findings returned
3. **`meta_state_list({ entry_kind: "change-log" })` returns only change-log entries** — write one of each; call with `entry_kind: "change-log"`; assert only change-log returned
4. **`meta_state_list` with `entry_kind` filter still excludes terminal findings** — write one `reported` finding + one `auto-resolved` finding + one change-log; call with `entry_kind: "finding"` and `include_expired: false`; assert only the `reported` finding returned (change-log excluded by kind filter; auto-resolved excluded by terminal-status filter)

## TDD Workflow

1. **Write all 4 new tests first.** Run `pnpm test -- __tests__/meta-state-list-entry-kind.test.js`. Observe RED.
2. **Modify `tools/meta-state-list-tool.js`** to add the `entry_kind` field and the filter.
3. **Run tests.** Observe GREEN.
4. **Verify regression-safety floor:** run `pnpm test` (full suite).

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind.test.js` (the tests)
- Modify:
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (add `entry_kind` field and filter)
- Delete: none

## Implementation Steps

1. Create the test file with 4 stubbed tests.
2. Run `pnpm test -- __tests__/meta-state-list-entry-kind.test.js` — confirm RED.
3. Edit `tools/meta-state-list-tool.js`:
   - Add `entry_kind` to the zod schema
   - Add `entry_kind` to the `activeFilters` object (when provided)
   - Add `entry_kind_filter: entry_kind || null` to the output
4. Run `pnpm test -- __tests__/meta-state-list-entry-kind.test.js` — confirm GREEN.
5. Run `pnpm test` (full suite) — confirm 48 + 4 = 52 tests pass in the relevant surface.

## Success Criteria

- [x] 4 new tests written and failing (RED)
- [x] 4 new tests pass after implementation (GREEN)
- [x] 16 + 12 + 12 + 8 = 48 existing tests still pass
- [x] `meta_state_list` default behavior unchanged (no `entry_kind` → both kinds)
- [x] `entry_kind` filter correctly separates findings from change-log entries
- [x] Terminal-status exclusion still works for findings
- [x] Response shape includes `entry_kind_filter` for debuggability
- [x] `pnpm test` passes (full suite)

## Risk Assessment

- **Risk: the `entry_kind` filter breaks the `meta_state_list` response shape for existing callers.** Mitigation: the new field is additive (optional zod); existing response consumers that destructure `{entries, count, filters_applied, include_expired}` continue to work. The `entry_kind_filter` field is added, not removed.
- **Risk: the existing `meta_state_list` tests (in `__tests__/meta-state-schema.test.js` or similar) break.** Mitigation: the existing tests use the default behavior (no `entry_kind`); the default behavior is preserved.
- **Risk: the `auto-resolve` / `expired` logic in the existing handler mutates change-log entries incorrectly.** Mitigation: the existing logic checks `status === "reported"` and `expires_at`; change-log entries have `status: "active"` and no `expires_at`, so they skip the mutation. Tests cover this implicitly.

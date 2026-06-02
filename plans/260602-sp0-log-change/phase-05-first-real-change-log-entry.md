---
phase: 5
title: "First Real Change-Log Entry (Self-Modification Log)"
status: pending
priority: P2
effort: "0.5h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: First Real Change-Log Entry (Self-Modification Log)

## Overview

The capstone of SP0: the agent uses the new `meta_state_log_change` tool to log SP0's own implementation as a real change-log entry in `meta-state.jsonl`. This is the **recursive payoff** of the design — the affordance for logging system changes is used to log the existence of the affordance itself. The entry is:
- `change_dimension: "surface"` (a new MCP tool is a surface change)
- `change_target: "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js"` (the new tool's path)
- `change_diff.added: ["meta_state_log_change"]` (the new tool name)
- `applies_to.tools: ["meta_state_log_change", "meta_state_list"]` (the consumers affected)
- `reason`: a summary of what SP0 shipped and the locked design rationale
- `evidence.journal`: this plan's path (cross-link)

Tests-first: 1 new smoke test in `__tests__/sp0-change-log-self-log.test.js` that asserts the first real change-log entry exists in `meta-state.jsonl` with the expected shape.

## Requirements

- Functional:
  - The new tool is invoked (via MCP or via the tool's handler) to log the SP0 implementation
  - The resulting entry has `entry_kind: "change-log"`, `change_dimension: "surface"`, `change_target` matching the tool file path
  - A smoke test asserts the entry exists with the expected shape (match by shape, not "first" — per red-team LOW-1 fix)
- Non-functional:
  - 1 new test passes
  - 52 existing tests still pass
  - The entry is preserved across registry compaction (status is `active`, never compacted)

## Architecture

The entry to log:

```json
{
  "id": "meta-260602T1300Z-sp0-self-modification-affordance-shipped",
  "entry_kind": "change-log",
  "change_dimension": "surface",
  "change_target": "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js",
  "change_diff": {
    "added": ["meta_state_log_change"],
    "removed": [],
    "changed": []
  },
  "reason": "SP0 self-modification affordance shipped. Agent can now log any system change as a first-class change-log entry in meta-state.jsonl. Discriminated union on entry_kind (finding | change-log) keeps the single-registry promise; 15 legacy entries coerced to entry_kind: \"finding\" on read. Change-log entries are immutable audit log: status=active, no TTL, no auto-resolve. Companion filter on meta_state_list returns either kind. First of the 4-subproject decomposition in plans/reports/brainstorm-260602-meta-state-agent-affordances.md; SP1-SP3 follow.",
  "applies_to": {
    "tools": ["meta_state_log_change", "meta_state_list"],
    "schemas": ["core/meta-state.js"]
  },
  "evidence": {
    "code_ref": "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js",
    "journal": "plans/reports/brainstorm-260602-sp0-log-change.md"
  },
  "status": "active",
  "created_at": "2026-06-02T13:00:00.000Z",
  "version": 0
}
```

## Tests (write FIRST, then implement)

Create `__tests__/sp0-change-log-self-log.test.js` with 1 test:

1. **`meta-state.jsonl` contains a change-log entry matching the SP0 self-log shape** (post-red-team fix: match by shape, not "first") — read the registry, find the entry where:
   - `entry_kind === "change-log"`
   - `change_dimension === "surface"`
   - `change_target === "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js"`
   - `change_diff.added` contains `"meta_state_log_change"`
   
   Assert the entry exists. **Do not assert "first"** (the "first" property is a side effect of running Phase 5 once, not a test invariant; multiple runs or partial runs could violate the assertion). The shape match is sufficient.

The test pattern mirrors `g8-subcommand-class-entry.test.js` (smoke test that reads `meta-state.jsonl` and asserts entry existence).

## TDD Workflow

1. **Write the smoke test first.** Run `pnpm test -- __tests__/sp0-change-log-self-log.test.js`. Observe RED (entry not found).
2. **Run `mcp__learning_loop_mcp__meta_state_log_change`** with the entry fields above. The cook session has direct access to the in-process MCP tool.
3. **Verify the entry is in `meta-state.jsonl`** by reading the file.
4. **Run tests.** Observe GREEN.
5. **Verify regression-safety floor:** run `pnpm test` (full suite). All 52 + 1 = 53 tests pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/__tests__/sp0-change-log-self-log.test.js` (the smoke test)
- Modify:
  - `meta-state.jsonl` (1 new change-log entry appended)
- Delete: none

## Implementation Steps

1. Create the test file with 1 stubbed test.
2. Run `pnpm test -- __tests__/sp0-change-log-self-log.test.js` — confirm RED.
3. Run `mcp__learning_loop_mcp__meta_state_log_change` with the entry fields. The tool writes the entry.
4. Verify the entry is in `meta-state.jsonl` (read the file or use `meta_state_list({ entry_kind: "change-log" })`).
5. Run the test — confirm GREEN.
6. Run `pnpm test` (full suite) — confirm 53 tests pass.

## Success Criteria

- [x] 1 new smoke test written and failing (RED)
- [x] The change-log entry is appended to `meta-state.jsonl`
- [x] The smoke test passes after the entry is logged (GREEN)
- [x] 52 existing tests still pass
- [x] The entry has `entry_kind: "change-log"`, `change_dimension: "surface"`, `change_target: "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js"`, `change_diff.added: ["meta_state_log_change"]`
- [x] The entry is the first change-log entry in the registry
- [x] `pnpm test` passes (full suite)
- [x] `pnpm validate:records` passes
- [x] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: the entry gets compacted by `updateEntry`'s 7-day compaction logic.** Mitigation: change-log entries have `status: "active"`, which is not in `TERMINAL_STATUSES` (`auto-resolved`, `expired`, `resolved`). The compaction logic only removes terminal statuses. The entry is permanent.
- **Risk: the cook cannot reach the MCP tool.** Mitigation: Droid sessions load MCP servers from `.mcp.json` at session start; `mcp__learning_loop_mcp__meta_state_log_change` is directly invokable. If for some reason the tool is unavailable in the cook session, the fallback is to append the entry directly to `meta-state.jsonl` via a Write call (the write-gate permits `meta-state.jsonl` writes only via the MCP tool; if the MCP tool is unreachable, escalate to the operator).
- **Risk: the entry ID format doesn't match the existing convention.** Mitigation: `generateId("sp0-self-modification-affordance-shipped")` produces `meta-YYMMDDTHHmmZ-sp0-self-modification-affordance-shipped`. Tests assert the prefix.
- **Risk: the entry conflicts with an existing entry ID (rare collision).** Mitigation: `generateId` includes a minute-precision timestamp; collisions only happen if two entries are created in the same minute with the same slug. The cook should pick a unique slug if the default collides.

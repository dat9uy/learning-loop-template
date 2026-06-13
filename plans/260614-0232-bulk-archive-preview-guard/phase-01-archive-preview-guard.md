---
title: "Phase 1 — Add Preview/Confirm Guard to meta_state_archive"
description: "Implement tool-level preview/confirm guard for multi-id bulk archive overrides."
status: completed
priority: P1
effort: 2h
branch: main
tags: [mcp, meta-state, archive, guardrail]
created: 2026-06-14
---

## Context

- Debug report: `plans/reports/debugger-260614-0207-session-06085a38-meta-state-process-gaps.md`
- P1 recommendation: "Require reading the rule/change-log before bulk archive."
- Tool to modify: `tools/learning-loop-mcp/tools/meta-state-archive-tool.js`
- Test file: `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js`

## Key Insights

- The guard must only trigger on multi-id `override` arrays (length > 1). Single-id overrides bypass preview to avoid breaking existing callers.
- Preview must include `id`, `entry_kind`, `status`, and `description` (or `description_preview` truncated) so the caller can review before confirming.
- Non-finding entries (rules, change-logs, loop-designs) should be flagged in the preview with a `rejected_preview` reason so the caller sees what will be skipped.
- The tool description must be updated to document the `confirm` parameter and preview behavior.

## Requirements

### Functional

1. Add `confirm: z.boolean().optional()` to the tool schema.
2. When `override.length > 1` and `confirm !== true`:
   - Look up each id in the registry.
   - Build a `preview` array with `{ id, entry_kind, status, description?, description_preview?, rejected_reason? }`.
   - Return `{ ready: false, preview, note: "Pass confirm: true to proceed with archive." }`.
   - Do NOT archive anything.
3. When `override.length > 1` and `confirm === true`:
   - Proceed with normal archive logic for all targets.
4. When `override.length <= 1`:
   - Proceed with normal archive logic (no preview, no confirm required).
5. Update tool `description` to mention `confirm` and preview behavior.

### Non-functional

- Keep files under 200 lines.
- Follow existing code style and comment conventions.
- No new dependencies.

## Related Code Files

### Modify
- `tools/learning-loop-mcp/tools/meta-state-archive-tool.js` — add schema field, preview logic, description update
- `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` — add test cases for preview, confirm, single-id bypass, non-finding preview flag

## Implementation Steps

1. **Update schema** in `meta-state-archive-tool.js`:
   - Add `confirm: z.boolean().default(false).optional().describe("...")` to the schema object.
2. **Add preview helper** inside the handler (or as a local function):
   - Given `allEntries` and `override` array, map each id to a preview object.
   - For missing entries: `{ id, status: "not_found" }`.
   - For already-archived entries: `{ id, entry_kind, status: "archived" }`.
   - For non-finding entries: `{ id, entry_kind, status, description_preview?, rejected_reason: "not_a_finding" }`.
   - For valid findings: `{ id, entry_kind, status, description_preview? }`.
3. **Insert guard early in handler**:
   - After resolving `allEntries`, check `if (override.length > 1 && !confirm)`.
   - Build preview, return `{ ready: false, preview, note: "..." }`.
4. **Update tool description** to document the new `confirm` parameter and preview flow.
5. **Add tests** in `meta-state-archive-tool.test.js`:
   - `returns preview for multi-id override without confirm`
   - `archives multi-id override when confirm is true`
   - `single-id override bypasses preview and archives directly`
   - `preview flags non-finding entries with rejected_reason`
6. **Run existing tests** to ensure no regressions.

## Todo List

- [x] Add `confirm` schema field to `meta-state-archive-tool.js`
- [x] Implement preview builder helper in handler
- [x] Insert multi-id guard before archive loop
- [x] Update tool description string
- [x] Add preview/confirm tests to `meta-state-archive-tool.test.js`
- [x] Add single-id bypass test
- [x] Add non-finding preview flag test
- [x] Run full test suite and verify no regressions

## Success Criteria

- `meta_state_archive({ override: [id1, id2] })` returns `ready: false` + preview array, no archives.
- `meta_state_archive({ override: [id1, id2], confirm: true })` archives valid findings, returns normal result shape.
- `meta_state_archive({ override: [id1] })` archives directly without preview.
- All existing tests pass.
- New tests cover preview, confirm, bypass, and non-finding preview flag.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing MCP callers pass multi-id override without confirm | Low | High | Only changes behavior when confirm is absent; callers can add confirm:true |
| Test flakiness from temp directory cleanup | Low | Low | Use existing mkdtempSync/rmSync pattern |

## Security Considerations

- No auth changes; this is a tool-level guard within the existing MCP trust boundary.
- Preview does not expose sensitive fields beyond what `meta_state_list` already returns.

## Next Steps

- After implementation, run tests and request code review.
- No follow-up phases needed for this P1 item.

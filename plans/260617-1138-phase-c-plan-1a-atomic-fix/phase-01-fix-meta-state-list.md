---
phase: 1
title: "fix-meta-state-list"
status: pending
priority: P1
effort: "1-2h"
dependencies: ["260616-2200-phase-c-plan-2-parity"]
---

# Phase 1: fix-meta-state-list

## Overview

Fix the `meta_state_list` `include_archived` semantic gap: callers passing `include_archived: true` expect to see the full audit trail (including superseded + resolved + auto-resolved entries) but currently only `status === "archived"` rows are returned. Resolves `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` (active, expires 2026-06-17T06:52:16Z).

**Operator decision 2026-06-17:** semantic unification. `include_archived: true` surfaces all 4 terminal statuses (`superseded`, `resolved`, `auto-resolved`, `archived`) — not 2 (current behavior: only `archived`).

## Context Links

- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14, 173-182` — the bug site; `TERMINAL_STATUSES` is filtered out unconditionally; `include_archived` only filters `status !== "archived"`
- `tools/learning-loop-mcp/core/meta-state.js` — `TERMINAL_STATUSES` canonical set (4 statuses)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` § Open Q1 — semantic unification resolved
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` — Plan 1a item; this finding is independent of the CR-1 to CR-6 review

## Requirements

- **Functional:** `meta_state_list({include_archived: true})` returns all 4 terminal statuses (archived + superseded + resolved + auto-resolved); default behavior (no flag) still excludes all 4; explicit `status: "superseded"` filter still works (opt-in).
- **Non-functional:** the fix propagates to the mastra peer server via the legacy-handler-adapter (no separate fix in mastra); the change is wire-format compatible (no schema addition, just a filter unification); existing tests pass.

## Architecture

The fix is a 2-line change to `meta-state-list-tool.js`:

```js
// Current (lines 180-182):
if (!include_archived) {
  result = result.filter((e) => e.status !== "archived");
}

// Fixed:
if (include_archived) {
  // include_archived surfaces all 4 terminal statuses (audit-trail opt-in)
  // (superseded, resolved, auto-resolved, archived). The default behavior
  // (no flag) still excludes them; explicit status="..." filter still works.
} else {
  result = result.filter((e) => e.status !== "archived");
}
```

The change is purely a control-flow inversion: the `include_archived` branch now means "include all 4 terminal statuses" (semantic unification). The default branch still excludes them.

**Why not add a new `include_terminal` flag (option b)?** Operator decision 2026-06-17: semantic unification. The single `include_archived` flag is a unified "show me the audit trail" affordance. Adding `include_terminal` would split the affordance into 2 flags and require callers to know which status is "terminal vs archived" — an unnecessary distinction.

**Why is this safe (no schema addition)?** The schema's `include_archived` field is already optional with a default of `false`. The fix is purely a filter change in the handler; no caller can break unless they were relying on `include_archived: true` returning ONLY `archived` rows (an implicit contract that was never documented and was the bug).

## Related Code Files

- Modify: `tools/learning-loop-mcp/tools/meta-state-list-tool.js:180-182` (1-line filter change + comment)
- Extend: `tools/learning-loop-mcp/tools/meta-state-list-tool.test.js` (or the existing co-located test if it exists) — 1 RED assertion
- No new files. No schema changes. No mastra-side changes (handler propagates via legacy-handler-adapter).

## Implementation Steps

1. **RED test:** in `tools/learning-loop-mcp/tools/meta-state-list-tool.test.js` (or create if absent), add a test:
   - Setup: write a fixture `meta-state.jsonl` with 4 entries: 1 `active` (must be returned), 1 `superseded` (must be returned under `include_archived: true`, NOT returned under default), 1 `resolved` (same as superseded), 1 `archived` (same as superseded).
   - Assertion 1: `meta_state_list({})` returns the `active` entry only (1 row).
   - Assertion 2: `meta_state_list({include_archived: true})` returns all 4 entries.
   - Assertion 3: `meta_state_list({status: "superseded"})` returns the 1 superseded entry (explicit filter still works).
   - Run the test: should FAIL on Assertion 2 (current behavior returns only archived, not superseded/resolved/auto-resolved).
2. **GREEN fix:** in `meta-state-list-tool.js`, change the filter logic to the 2-branch form above. Re-run the test: should PASS.
3. **Regression check:** run `pnpm test` to confirm no other test broke. The legacy 9-namespace anchor must still pass; the 75-test mastra suite must still pass (the mastra peer wraps the same handler; the fix propagates automatically).
4. **Commit:** `fix(meta-state-list): unify include_archived to surface all 4 terminal statuses` (1 commit, bisect-friendly).

## Success Criteria

- [ ] RED test fails on master (current behavior is the bug)
- [ ] GREEN test passes after the fix
- [ ] `pnpm test` shows all 9 test namespaces pass (durable 9-namespace anchor) + 0 regressions
- [ ] `meta_state_list({include_archived: true})` returns entries with `status` in `{superseded, resolved, auto-resolved, archived}` (4 terminal statuses)
- [ ] `meta_state_list({})` still excludes all 4 terminal statuses (default behavior preserved)
- [ ] `meta_state_list({status: "superseded"})` still returns superseded entries (explicit opt-in preserved)
- [ ] Phase 5 calls `meta_state_resolve` on `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` with resolution note citing the PR + commit

## Risk Assessment

- **Wire-format change breaks mastra peer.** Low: the mastra peer wraps the legacy `handler`; the fix propagates automatically. Mitigation: Phase 5's `pnpm test` is the regression envelope.
- **Existing test relied on the old behavior.** Low: only callers passing `include_archived: true` and expecting ONLY `archived` rows would break. Grep confirms no such caller exists in `tools/learning-loop-mcp/`, `tools/learning-loop-mastra/`, `.claude/coordination/`, or `.factory/hooks/`.
- **TTL expires before Phase 1 lands.** Medium: the finding's `expires_at: 2026-06-17T06:52:16.966Z` is ~3h from plan author. Mitigation: Phase 1 author can call `meta_state_ack` at RED-time to extend the active lifetime to a 30-day active status. Or Phase 5 calls `meta_state_resolve` with the resolution note.

## Security Considerations

- No security impact. The fix exposes more data to callers that opt in (`include_archived: true`); no new attack surface. The mastra peer doesn't gate on this filter (read-only tool).

---
phase: 1
title: Schema enum and cascade retarget
status: completed
priority: P2
effort: 2h
dependencies: []
---

# Phase 1: Schema enum and cascade retarget

## Overview

Drop `expired` from the `metaStateFindingEntrySchema.status` enum and from all 4 `TERMINAL_STATUSES` sets. Retarget the `meta_state_resolve` cascade branch so `stale` parents close in 1 step (the `expired`-gated 2-step path is removed; the cascade collapses into the normal resolve). TDD: write the failing tests first, then make them pass.

## Requirements

- Functional:
  - `z.enum([..., "expired", ...])` in `core/meta-state.js:43` becomes `z.enum([..., "stale"])` (i.e., no `expired`).
  - `TERMINAL_STATUSES` in `core/meta-state.js:7` drops `"expired"`.
  - `TERMINAL_RAW_STATUSES` in `core/derive-status.js:22` drops `"expired"`.
  - Local `TERMINAL_STATUSES` in **all 4 tools/ locations** drop `"expired"`: `tools/meta-state-sweep-tool.js:9`, `tools/meta-state-list-tool.js:12`, `tools/meta-state-resolve-tool.js:11`, and `core/loop-introspect.js:144` (`listAntiPatterns`). (Red-team finding: the resolve-tool local set at line 11 was missed in the original plan.)
  - `meta_state_resolve` cascade branch in `tools/meta-state-resolve-tool.js` no longer gates on `entry.status === "expired"`. The branch becomes: if `cascade_from` is provided AND children validate AND `entry.status` is `stale` or `active` (NOT `reported`, NOT terminal, NOT `superseded`), set `status: "resolved"` directly (no migration primitive delegation). The `reported` exclusion preserves the canonical `meta_state_ack` flow.
  - `validateCascadeChildren` in `tools/meta-state-resolve-tool.js` keeps its current checks unchanged: child exists, has `reopens` containing parent id, status is `active` or `resolved`. The function uses a single `!== "active" && !== "resolved"` predicate at line 197 — there is no rejection array to edit. (Red-team finding: the original plan fabricated a `["reported", "expired", "stale", "superseded"]` rejection array; the actual code is a 2-element predicate.)
- Non-functional:
  - Every code change in this phase is preceded by a failing test in `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js`, `__tests__/derive-status.test.js` (if present), or a new `__tests__/meta-state-resolve-cascade-stale.test.js`.
  - `pnpm test` passes after this phase (modulo the 16 test files in Phase 3 that will be updated separately — the schema change will make them fail until Phase 3 completes, so the per-phase test pass requires `-t` to scope to the new tests only).

## Architecture

### Cascade retarget design

The current cascade branch in `meta-state-resolve-tool.js` (lines 110-136) is:
```js
if (entry.status === "expired" && cascade_from?.length > 0) {
  const childValidation = validateCascadeChildren(root, entry, cascade_from, entries);
  if (!childValidation.valid) { return ... }
  const migrateResult = await metaStateMigrateExpiredToStaleTool.handler({ id: entry.id });
  // ... 2-step: stale first, then operator calls again to close
}
```

The new branch:
```js
if (cascade_from?.length > 0) {
  const childValidation = validateCascadeChildren(root, entry, cascade_from, entries);
  if (!childValidation.valid) { return ... }
  // Parent status guard: only stale/active parents are cascade-closeable.
  // reported parents must be acked first (canonical reported -> active flow).
  if (entry.status === "reported") {
    return { content: [{ type: "text", text: JSON.stringify({ resolved: false, reason: "cascade_parent_is_reported", id: entry.id, hint: "ack the parent via meta_state_ack before cascade-resolving" }) }] };
  }
  // No migration needed: stale is non-terminal, the normal resolve path closes it.
  // Fall through to the normal resolve below (status: "resolved", resolved_at, resolved_by).
}
```

The branch now gates on the parent status explicitly. It is reached for `stale` and `active` parents only. `reported` parents are rejected with a clear `cascade_parent_is_reported` reason. Terminal parents hit the early-return at line 52; `superseded` parents are terminal. The normal resolve then sets `status: "resolved"` and returns the standard `{resolved: true, status: "resolved", ...}` shape.

### What the JSDoc says vs what the code does

Current JSDoc on `meta_state_resolve` (line 10-12) says: "Cascade path for expired parents is 2-step: cascade_from triggers migration to stale, then a second call (without cascade_from) applies the consult-gate and closes." The 2-step is described as a fact, but the implementation is gated on `expired` which never exists in the data. The new JSDoc should say: "Cascade path: when `cascade_from` is provided, the parent is closed in 1 call after validating that each child reopens it. Only `stale` and `active` parents are cascade-closeable; `reported` parents must be acked first."

The `validateCascadeChildren` JSDoc at `meta-state-resolve-tool.js:170-176` also has a "Forward-compat note: if `expired` is deprecated, this cascade becomes unreachable" sentence. After Phase 1's retarget, the cascade IS reachable (via `stale` parents), so this JSDoc is stale and must be updated. Phase 1 step 12 includes this edit.

### `metaStateMigrateExpiredToStaleTool` import removal

`tools/meta-state-resolve-tool.js:9` imports `metaStateMigrateExpiredToStaleTool` from `./meta-state-migrate-expired-to-stale-tool.js`. Phase 2 deletes the tool file. Phase 1 must remove the import (or the resolve tool will fail to load after the file is deleted). The import removal happens in Phase 1, but the import target file stays until Phase 2. The order is safe because both phases are in the same commit.

But: the E2E test file `__tests__/meta-state-reopen-e2e-cold-session.test.cjs:9` ALSO imports `metaStateMigrateExpiredToStaleTool`. Phase 2 deletes the migrate tool; between Phase 2 and Phase 5, the E2E test fails to load at module-init time. Phase 3 must clean up the E2E test's import in the same phase that rewrites the other test files. This is the only Phase 2-3 boundary concern.

## Related Code Files

### Modify
- `tools/learning-loop-mcp/core/meta-state.js:7` — `TERMINAL_STATUSES` literal
- `tools/learning-loop-mcp/core/meta-state.js:43-44` — `status` enum + JSDoc
- `tools/learning-loop-mcp/core/meta-state.js:75-76` — `reopens` field JSDoc
- `tools/learning-loop-mcp/core/meta-state.js:319-321` — compaction invariant comment
- `tools/learning-loop-mcp/core/meta-state.js:482-484` — `checkExpiry` JSDoc
- `tools/learning-loop-mcp/core/derive-status.js:22` — `TERMINAL_RAW_STATUSES`
- `tools/learning-loop-mcp/core/query-drift.js:73` — terminal-statuses comment
- `tools/learning-loop-mcp/core/loop-introspect.js:144` — `listAntiPatterns` `TERMINAL_STATUSES`
- `tools/learning-loop-mcp/core/loop-introspect.js:296-302` — reopens inverse index comment
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js:9` — `TERMINAL_STATUSES`
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:12` — `TERMINAL_STATUSES`
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:34,40,48,84,96,103` — `include_expired` parameter (deprecation: keep the param name for backward compat but rewrite its description; Phase 3 removes it entirely)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:9` — remove migrate-tool import
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:10-21` — tool description
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:11` — local `TERMINAL_STATUSES` (red-team finding: missed in original plan)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:110-136` — cascade branch retarget with `reported`-parent guard
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:170-176` — `validateCascadeChildren` JSDoc (forward-compat note is stale; red-team finding)
- `tools/learning-loop-mcp/tools/meta-state-relationship-validate-tool.js:6` — `ORPHAN_STATUSES`
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js:12` — description

### Create
- `tools/learning-loop-mcp/__tests__/meta-state-resolve-cascade-stale.test.js` — new test file for the 1-step cascade path
- `tools/learning-loop-mcp/__tests__/meta-state-schema-stale-only.test.js` — new test file for the enum change (asserts `expired` is NOT a valid status; existing `meta-state-schema.test.js` keeps its broader coverage)

### Delete
- (none — Phase 2 deletes the tool file)

## Implementation Steps

1. **TDD red**: write `meta-state-schema-stale-only.test.js` with 3 tests: (a) `metaStateFindingEntrySchema.status` enum does not include `"expired"` (parse `z.string()` for each of the 5 valid statuses; assert each parses; assert `expired` throws), (b) `TERMINAL_STATUSES` exported from `core/meta-state.js` does not include `"expired"`, (c) `validateCascadeChildren` accepts a `stale` parent (with a child whose `reopens` contains the parent id and whose status is `active` or `resolved`) and returns `{valid: true, valid_children: [childId]}`.
2. **TDD red**: write `meta-state-resolve-cascade-stale.test.js` with 5 tests: (a) `meta_state_resolve({id: staleParent, cascade_from: [childId]})` returns `{resolved: true, status: "resolved", resolved_by: "operator"}` in 1 call (not the 2-step shape), (b) the parent's registry entry is updated to `status: "resolved"` + `resolved_at` + `resolved_by`, (c) the child entry is unchanged, (d) `meta_state_resolve({id: reportedParent, cascade_from: [childId]})` returns `{resolved: false, reason: "cascade_parent_is_reported"}` (the new guard), (e) the cascade works for an `active` parent (sanity check that the existing path still works).
3. **Run the new tests; confirm RED** (the cascade test fails on the current `expired` gate; the schema test fails on the current enum that still includes `expired`).
4. **Verify consult-gate coverage**: call `meta_state_list({ entry_kind: "rule", status: "active" })` and assert (a) the 4 active rules are listed, (b) none has `applies_to_resolution` matching the 2 specific parent ids (`meta-260608T1522Z-...` and `meta-260608T1618Z-...`). If any rule targets these ids, the cascade will fail at the consult-gate; document the rule and decide whether to (i) skip the consult-gate for cascade-resolves or (ii) refresh the target's fingerprint via `meta_state_refresh_fingerprint` before running the cascade. This is a TDD red step: assert the 4 rules and their `applies_to_resolution` fields are as expected.
4. **Modify `core/meta-state.js`**: remove `"expired"` from the enum (line 43) and from `TERMINAL_STATUSES` (line 7). Update JSDoc on line 44, 75-76, 319-321, 482-484.
5. **Modify `core/derive-status.js`**: remove `"expired"` from `TERMINAL_RAW_STATUSES` (line 22).
6. **Modify `core/query-drift.js`**: rewrite the comment on line 73 to drop `expired`.
7. **Modify `core/loop-introspect.js`**: remove `"expired"` from `listAntiPatterns` `TERMINAL_STATUSES` (line 144); rewrite the reopens inverse index comment (line 296-302) to say "stale findings" instead of "expired findings".
8. **Modify `tools/meta-state-sweep-tool.js`**: remove `"expired"` from local `TERMINAL_STATUSES` (line 9).
9. **Modify `tools/meta-state-list-tool.js`**: remove `"expired"` from local `TERMINAL_STATUSES` (line 12). For `include_expired` (line 40, 48, 84, 96, 103): keep the parameter as a deprecated alias for `include_stale: true` so existing callers (and tests in Phase 3) don't crash mid-migration. Mark it `deprecated` in the Zod description.
10. **Modify `tools/meta-state-relationship-validate-tool.js`**: change `ORPHAN_STATUSES = new Set(["expired", "stale"])` (line 6) to `new Set(["stale"])`.
11. **Modify `tools/meta-state-report-tool.js`**: rewrite description on line 12 to remove the `expired` mention.
12. **Modify `tools/meta-state-resolve-tool.js`**: (a) remove the import of `metaStateMigrateExpiredToStaleTool` (line 9), (b) rewrite the tool description (line 10-21) to describe the 1-step cascade path with the `reported`-parent exclusion, (c) retarget the cascade branch (line 110-136) to drop the `status === "expired"` gate and the migrate delegation, and add an explicit `reported`-parent rejection with `cascade_parent_is_reported` reason, (d) drop `"expired"` from the local `TERMINAL_STATUSES` at line 11, (e) update the `validateCascadeChildren` JSDoc at line 170-176 to drop the "Forward-compat note: cascade becomes unreachable" sentence.
13. **Run the new tests; confirm GREEN**.
14. **Run the full test suite with `-t 'meta-state-schema-stale-only\|meta-state-resolve-cascade-stale'`** to confirm only the new tests changed behavior; existing tests still pass.
15. **Commit** with message: `feat(meta-state): drop expired status, retarget cascade to stale (phase 1)`.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/meta-state-schema-stale-only.test.js` — 3 tests pass.
- [ ] `tools/learning-loop-mcp/__tests__/meta-state-resolve-cascade-stale.test.js` — 5 tests pass (3 original + 1 `reported`-parent guard + 1 `active`-parent sanity check).
- [ ] `meta_state_list({ entry_kind: "rule", status: "active" })` returns 4 rules; none has `applies_to_resolution` matching `meta-260608T1522Z-...` or `meta-260608T1618Z-...`.
- [ ] `pnpm test -t 'meta-state-schema-stale-only|meta-state-resolve-cascade-stale'` passes.
- [ ] `grep -n '"expired"' tools/learning-loop-mcp/core/ tools/learning-loop-mcp/tools/meta-state-{sweep,list,resolve,relationship-validate,report}-tool.js` returns 0 matches.
- [ ] No regression in `pnpm test -t 'meta-state-schema|meta-state-resolve-cascade|meta-state-relationships|meta-state-relationship-validate|meta-state-list|meta-state-sweep|meta-state-report'` (the 7 most directly affected test files; Phase 3 will fix any breakage in the other 9).

## Risk Assessment

- **Risk**: the `meta_state_list` `include_expired` parameter is used by 6+ test files and possibly external callers; deprecating it in Phase 1 and removing in Phase 3 means tests will pass in both phases.
- **Mitigation**: Phase 1 keeps the parameter name in the Zod schema for backward compat but rewrites its description to mark it deprecated. The deprecation signal is the JSDoc text only; no `console.warn` is emitted. Phase 3 removes the parameter entirely.
- **Risk**: the cascade retarget might inadvertently close a `reported` finding (which has TTL pressure and should be re-verified, not resolved), bypassing the canonical `meta_state_ack` flow.
- **Mitigation**: Phase 1's cascade branch adds an explicit `reported`-parent guard. The branch returns `{resolved: false, reason: "cascade_parent_is_reported", id, hint: "ack the parent via meta_state_ack before cascade-resolving"}` if `entry.status === "reported"`. This preserves the canonical `reported → active → resolved` flow. The guard is unit-tested in the new `meta-state-resolve-cascade-stale.test.js` (test 4).

---
phase: 4
title: 'T4 — Wire-or-remove auto_resolve (YAGNI lean: remove)'
status: completed
priority: P3
effort: 0.5h
dependencies:
  - phase-03-t3-classify-entries
---

# Phase T4: Wire-or-Remove auto_resolve

## Overview

The `auto_resolve` field is exported from `core/meta-state.js`, accepted by `meta_state_report`'s zod schema, persisted on every entry, and consumed by `checkAutoResolve` — but no caller ever sets it (every entry has `auto_resolve: null` after the migration). The field is dead weight: an affordance the loop never used.

The T2 sweep tool uses `checkAutoResolve` as a side-effect, but the input data is always null. This phase makes the decision: ship a working auto-resolve companion tool (T4-wire lean) or remove the field from the schema (T4-remove lean, YAGNI).

## Requirements

- Functional (remove path, the lean):
  - Remove `auto_resolve_file` and `auto_resolve_line_range` from `metaStateEntrySchema` in `core/meta-state.js`.
  - Remove the corresponding fields from `meta_state_report` tool's handler.
  - Update the `migrate-first-rule.mjs` script (no retroactive effect on existing entries).
  - Update test fixtures that reference the field.
- Functional (wire path, alternative):
  - Ship `meta_state_check_auto_resolve` tool (operator-only, dry-run by default).
  - Add tests covering: file mtime > created_at → transition, file mtime < created_at → no transition, missing file → no transition.

## Architecture

The remove path is one schema change plus test fixture updates. The wire path is a new tool. Lean is remove; the alternative is wire. Operator decides at plan-cook time. Both paths produce tests.

## Decision Tree

```
After T3, are any active or reported entries with non-null auto_resolve? ─┐
                                                                          │
       ┌──────────────────────────────────────────────────────────────────┘
       │
       ├── YES (≥1 entry) → wire path: ship the tool. Justify with the count.
       │
       └── NO (0 entries) → remove path: YAGNI. The field is unused.
```

After T3, all 7 dispositions either resolve, re-report, or promote. None re-introduce `auto_resolve`. The migration script ran with `auto_resolve: null` for every entry. Therefore, after T3, there are 0 active or reported entries with non-null `auto_resolve`. **Lean is remove.**

## Related Code Files

### Remove path

- Modify: `tools/learning-loop-mcp/core/meta-state.js`
  - Remove `auto_resolve_file` and `auto_resolve_line_range` from `metaStateEntrySchema` (lines 30-31)
  - Decide on `checkAutoResolve` (line 142): since no entry will have `auto_resolve` set, the function is dead code. Either delete it or keep it as a no-op. Lean: delete.
- Modify: `tools/learning-loop-mcp/tools/meta-state-report-tool.js`
  - Remove `auto_resolve_file` and `auto_resolve_line_range` from handler destructuring (lines 22-23)
  - Remove the `auto_resolve` field from the entry construction (lines 42-46)
- Modify: `tools/learning-loop-mcp/scripts/migrate-first-rule.mjs`
  - Line 47 sets `auto_resolve: null` on migrated entries — remove this line (the field no longer exists on the schema)
- Read for tests: `tools/learning-loop-mcp/__tests__/meta-state-integration.test.js`
  - Lines 27 and 98 use `auto_resolve_file` as input — remove or rewrite these tests
- Read for tests: `tools/learning-loop-mcp/core/meta-state.test.js`
  - Lines 96, 113, 243 use `auto_resolve: { file_modified: ... }` in fixtures for `checkAutoResolve` tests — remove these tests if `checkAutoResolve` is deleted; otherwise rewrite to construct the field directly without going through the schema
- Read for tests: `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js`
  - Lines 37, 46, 267, 297 set `auto_resolve: null` — these are safe to keep (the field is removed but the null assignment is harmless). Verify after removal.

### Wire path (alternative, NOT recommended)

- Create: `tools/learning-loop-mcp/tools/meta-state-check-auto-resolve-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json`
- Create: `tools/learning-loop-mcp/__tests__/meta-state-check-auto-resolve.test.js`

## Implementation Steps (remove path)

1. **Verify the precondition.** Run `meta_state_list({include_expired: true})` and confirm 0 entries have `auto_resolve` set.
2. **Update `metaStateEntrySchema`.** Remove `auto_resolve_file` and `auto_resolve_line_range` from the zod schema (lines 30-31).
3. **Update `meta_state_report` handler.** Remove the two parameters from the handler destructuring (lines 22-23) and the entry construction (lines 42-46).
4. **Decide on `checkAutoResolve`.** Since no entry will have the field, the function is dead code. Delete it from `core/meta-state.js` (line 142-152) and remove its export. If T2's sweep tool still calls it, remove the call from the sweep tool.
5. **Update the migration script.** Remove `auto_resolve: null` from `migrate-first-rule.mjs:47`.
6. **Update tests.** 
   - `__tests__/meta-state-integration.test.js:27, 98` — remove or rewrite the `auto_resolve_file` inputs (the integration tests are testing the report tool's input handling, not the field itself)
   - `core/meta-state.test.js:96, 113, 243` — remove the `checkAutoResolve` tests (the function is deleted)
   - `__tests__/integration-promoted-rule.test.js:37, 46, 267, 297` — keep as-is (harmless null assignments)
7. **Add 3 new tests** verifying the schema rejection: `meta_state_report` with `auto_resolve_file` input returns zod error; `meta_state_report` without `auto_resolve_file` succeeds; `checkAutoResolve` is no longer exported.
8. **Run the test suite.** `pnpm test` should pass 424/424 (426 from T3 − 2 integration tests for `auto_resolve_file` − 3 `checkAutoResolve` tests + 3 new T4 tests) OR 427/427 if `checkAutoResolve` is kept as a no-op (2 tests removed + 3 added).
9. **Update `docs/` references.** Search for `auto_resolve` in `docs/` (excluding the journal/report from this session, which is historical).

## Implementation Steps (wire path, alternative)

1. Verify the precondition (≥1 entry with `auto_resolve` set) — if false, this path is not justified.
2. Implement `meta_state_check_auto_resolve` per the architecture above.
3. Register in `manifest.json`.
4. Add 3 tests.
5. Run the test suite.

## Success Criteria (remove path)

- [ ] `metaStateEntrySchema` no longer accepts `auto_resolve_file` or `auto_resolve_line_range`
- [ ] `meta_state_report` handler signature simplified
- [ ] Either `checkAutoResolve` is deleted (3 core tests removed) or kept as no-op (0 tests removed)
- [ ] 2 integration tests for `auto_resolve_file` input flow removed
- [ ] 3 new tests verifying the schema rejection (e.g., `meta_state_report` with `auto_resolve_file` returns zod error)
- [ ] `pnpm test` passes 424/424 (delete `checkAutoResolve`) or 427/427 (keep `checkAutoResolve`)
- [ ] `grep -r "auto_resolve_file\|auto_resolve_line_range" tools/` returns 0 matches in `core/`, `tools/`, and `scripts/`

## Success Criteria (wire path)

- [ ] `meta_state_check_auto_resolve` tool registered in `manifest.json`
- [ ] Tool returns proposed transitions with `preview: true` (default), applies with `preview: false` after operator role check
- [ ] 3 new tests pass
- [ ] `pnpm test` passes 429/429

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Removing `auto_resolve` breaks a downstream tool that reads the field | Low | `grep -r "auto_resolve" tools/` to confirm. If a reader exists, the reader is wrong (the field is always null) and should be fixed as part of T4 |
| Migration script fails on existing entries that have `auto_resolve: null` | None | The script reads `entry.auto_resolve` already; null is the expected value. The script does not write `auto_resolve` (it patches `category`, `subtype`, optionally `status` and `promoted_to_rule`) |
| Operator reverses the decision later (wants the field back) | Low | YAGNI principle: add when needed. Re-introduction is a 5-minute schema revert; the migration script doesn't need to re-add it because the field has no historical entries |
| Test fixture references to `auto_resolve_file` cause test failures | Low | Search before removing; update fixtures in the same commit |

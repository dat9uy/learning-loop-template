---
phase: 5
title: "4 — Zod validate at writeEntry + updateEntry"
status: pending
priority: P1
effort: "1h"
dependencies: ["3"]
---

# Phase 4: Zod validate at writeEntry + updateEntry

## Overview

`writeEntry` validates against `metaStateEntrySchema.safeParse` (the 4-kind union). `updateEntry` validates the patch against `metaStateEntrySchema.partial().safeParse`. Defends against future drift at the chokepoint. **GREEN:** 4 new tests pass; the 4 writer tools (already validated by their own kind) continue to work; the migration script (direct file I/O) is unaffected because it uses `readRegistry` + `updateEntry` (which now validates patches).

## Requirements

- **Functional:**
  - `writeEntry(root, entry)`: before `lines.push(JSON.stringify(entry))`, call `metaStateEntrySchema.safeParse(entry)`. If `!success`, throw `InvalidEntryError` (exported from `core/meta-state.js`) with the validation errors.
  - `updateEntry(root, id, patch)`: before `Object.assign(entry, cleanPatch)`, call `metaStateEntrySchema.partial().safeParse(patch)`. If `!success`, return `"validation_failed"` (consistent with the existing return shape: `null`, `true`, `"version_mismatch"`).
- **Non-functional:** the validation is sync (no subprocess). The error class is exported for callers to catch.

## Architecture

`writeEntry` is the canonical new-entry sink. All 4 writer tools (`meta_state_report`, `meta_state_log_change`, `meta_state_propose_design`, `meta_state_promote_rule`) funnel through it. `updateEntry` is the mutation path used by `meta_state_resolve`, `meta_state_sweep`, `meta_state_promote_rule`, and the migration scripts.

The 4-kind union `metaStateEntrySchema` is the single source of truth for shape. Catching divergence at the chokepoint stops the bleeding; Phase 3 (schema flatten) cleaned the past; this phase cleans the future.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/meta-state.js#writeEntry` (add validation)
- **Modify:** `tools/learning-loop-mcp/core/meta-state.js#updateEntry` (add patch validation)
- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` (add `InvalidEntryError` class)
- **Modify:** `tools/learning-loop-mcp/__tests__/meta-state.test.js` (4 new tests)

## Implementation Steps

1. **Add `InvalidEntryError` class.** Export from `core/meta-state.js`. Constructor: `(validationErrors: z.ZodError)`. Property: `this.errors = validationErrors.format()`. Inherits from `Error`. Used by callers to catch and translate to MCP error responses.
2. **Modify `writeEntry`.** Before `lines.push(JSON.stringify(entry))`:
   ```js
   const validation = metaStateEntrySchema.safeParse(entry);
   if (!validation.success) {
     throw new InvalidEntryError(validation.error);
   }
   ```
3. **Modify `updateEntry`.** Before `Object.assign(entry, cleanPatch)` (and after the CAS check):
   ```js
   const validation = metaStateEntrySchema.partial().safeParse(patch);
   if (!validation.success) {
     return "validation_failed";
   }
   ```
   Note: `.partial()` makes all top-level fields optional. The patch shape is a subset of the union (e.g., `{ status: "active" }`, `{ promoted_to_rule: "rule-id" }`, etc.). The 4-kind union's `.partial()` accepts any of those.
4. **Write 4 new tests in `__tests__/meta-state.test.js`:**
   - `T-1: writeEntry rejects entry missing required fields (e.g., finding with no 'category')`. Construct an entry with `entry_kind: "finding"` and no `category`. Call `writeEntry`. Expect `InvalidEntryError` thrown.
   - `T-2: writeEntry accepts valid union member (4 sub-tests, one per kind)`. Construct 4 valid entries (finding, change-log, rule, loop-design). Call `writeEntry` for each. Expect no throw; entries appear in the registry.
   - `T-3: updateEntry rejects bad patch (e.g., { category: "not-a-category" })`. Construct a valid entry; call `updateEntry` with an invalid category. Expect `"validation_failed"`.
   - `T-4: updateEntry accepts valid patch (e.g., { status: "active" })`. Construct a valid entry; call `updateEntry` with `{ status: "active" }`. Expect `true`.
5. **Run the test suite.** `pnpm test`. All 4 new tests pass; no regressions in the 4 writer tools (they already build valid entries); the migration script is unaffected.

## Success Criteria

- [ ] 4 new tests in `__tests__/meta-state.test.js` pass
- [ ] `InvalidEntryError` class is exported from `core/meta-state.js`
- [ ] `writeEntry` throws `InvalidEntryError` on invalid shape
- [ ] `updateEntry` returns `"validation_failed"` on invalid patch
- [ ] `pnpm test` passes (allow 1 pre-existing failure)

## Risk Assessment

- **Risk:** Zod union `.partial()` rejects valid patches because the patch shape doesn't match ANY union branch. **Mitigation:** test with realistic patch shapes from `meta_state_resolve`, `meta_state_sweep`, `meta_state_promote_rule`. If `.partial()` is too strict, use `z.object({}).passthrough()` for the patch (accepts any top-level field).
- **Risk:** A migration script (e.g., `migrate-rule-entry-kind.mjs`, `backfill-mechanism-check.mjs`) writes invalid entries via `updateEntry`. **Mitigation:** those scripts use `updateEntry` (which validates patches), not `writeEntry` (which validates full entries). The patch shape `{ promoted_to_rule: "rule-id" }` is a valid `.partial()` for any of the 4 union branches. No regression expected.
- **Risk:** A future writer tool's handler builds an entry that's missing a required field (e.g., a finding without `category`). **Mitigation:** the validation in `writeEntry` catches this at write time. The writer tool receives the `InvalidEntryError` and can return a clear error message to the agent.
- **Risk:** Performance regression from sync Zod validation in the hot path (`updateEntry` is called per-entry in `meta_state_sweep`). **Mitigation:** Zod's `.safeParse` is fast (~microseconds for small objects). The 30-entry migration + daily sweep are not performance-sensitive. Acceptable.

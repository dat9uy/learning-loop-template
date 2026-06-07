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

`writeEntry` validates against `metaStateEntrySchema.safeParse` (the 4-kind union). `updateEntry` validates the patch against `metaStateEntryPatchSchema.safeParse` (a `z.object({}).passthrough()` that accepts any top-level key). Defends against future drift at the chokepoint. **GREEN:** 5 new tests pass; the 4 writer tools (already validated by their own kind) continue to work; the migration script (direct file I/O) is unaffected because it uses `readRegistry` + `updateEntry` (which now validates patches).

## Requirements

- **Functional:**
  - `writeEntry(root, entry)`: before `lines.push(JSON.stringify(entry))`, call `metaStateEntrySchema.safeParse(entry)`. If `!success`, throw `InvalidEntryError` (exported from `core/meta-state.js`) with the validation errors.
  - `updateEntry(root, id, patch)`: before `Object.assign(entry, cleanPatch)`, call `metaStateEntryPatchSchema.safeParse(patch)`. `metaStateEntryPatchSchema` is a `z.object({}).passthrough()` that accepts any top-level key (all patch shapes are subsets of the union). If `!success`, return `"validation_failed"` (consistent with the existing return shape: `null`, `true`, `"version_mismatch"`).
- **Non-functional:** the validation is sync (no subprocess). The error class is exported for callers to catch.

## Architecture

`writeEntry` is the canonical new-entry sink. All 4 writer tools (`meta_state_report`, `meta_state_log_change`, `meta_state_propose_design`, `meta_state_promote_rule`) funnel through it. `updateEntry` is the mutation path used by `meta_state_resolve`, `meta_state_sweep`, `meta_state_promote_rule`, and the migration scripts.

The 4-kind union `metaStateEntrySchema` is the single source of truth for shape. Catching divergence at the chokepoint stops the bleeding; Phase 3 (schema flatten) cleaned the past; this phase cleans the future.

**Important:** `metaStateEntrySchema` does NOT use `.strict()` (Zod strips unknown keys by default). Before `writeEntry` validation can safely reject invalid entries, the 7 missing fields that exist in the registry (`expires_at`, `acked_at`, `resolved_at`, `resolved_by`, `resolution`, `promoted_to_rule`, `auto_resolve`) must be added to the relevant branch schemas. Otherwise `writeEntry` will silently strip them.

For `updateEntry` patches, `metaStateEntrySchema.partial()` is impossible because `z.union()` does not expose `.partial()`. Instead, use a dedicated `metaStateEntryPatchSchema = z.object({}).passthrough()` — patches are partial by definition and may contain any top-level key.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` (add missing 7 fields to branch schemas; add `metaStateEntryPatchSchema`; add `InvalidEntryError` class)
- **Modify:** `tools/learning-loop-mcp/core/meta-state.js#writeEntry` (add validation)
- **Modify:** `tools/learning-loop-mcp/core/meta-state.js#updateEntry` (add patch validation)
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-write-validation.test.js` (5 new tests)

## Implementation Steps

1. **Add missing fields to branch schemas.** Before adding validation, add the 7 fields that exist in the registry but are missing from schemas:
   - `metaStateFindingEntrySchema`: add `expires_at`, `acked_at`, `resolved_at`, `resolved_by`, `resolution`, `promoted_to_rule`, `auto_resolve` (all optional strings/booleans).
   - `metaStateChangeEntrySchema`: add `version` (already present), `expires_at` (optional, for forward-compat).
   - `metaStateRuleEntrySchema`: add `refined_at`, `refined_by`, `refinement_reason` (already present).
   - Verify: `node -e "..."` scan of all 58 entries should show 0 fields missing from the union.
2. **Add `InvalidEntryError` class.** Export from `core/meta-state.js`. Constructor: `(validationErrors: z.ZodError)`. Property: `this.errors = validationErrors.format()`. Inherits from `Error`. Used by callers to catch and translate to MCP error responses.
3. **Add `metaStateEntryPatchSchema`.** Export from `core/meta-state.js`:
   ```js
   export const metaStateEntryPatchSchema = z.object({}).passthrough();
   ```
   This accepts any top-level key-value pairs, which is correct for patches (partial entries).
4. **Modify `writeEntry`.** Before `lines.push(JSON.stringify(entry))`:
   ```js
   const validation = metaStateEntrySchema.safeParse(entry);
   if (!validation.success) {
     throw new InvalidEntryError(validation.error);
   }
   ```
5. **Modify `updateEntry`.** Before `Object.assign(entry, cleanPatch)` (and after the CAS check):
   ```js
   const validation = metaStateEntryPatchSchema.safeParse(patch);
   if (!validation.success) {
     return "validation_failed";
   }
   ```
6. **Write 4 new tests in `__tests__/meta-state-write-validation.test.js` (new file):
   - `T-1: writeEntry rejects entry missing required fields (e.g., finding with no 'category')`. Construct an entry with `entry_kind: "finding"` and no `category`. Call `writeEntry`. Expect `InvalidEntryError` thrown.
   - `T-2: writeEntry accepts valid union member (4 sub-tests, one per kind)`. Construct 4 valid entries (finding, change-log, rule, loop-design). Call `writeEntry` for each. Expect no throw; entries appear in the registry.
   - `T-3: updateEntry rejects bad patch (e.g., { category: "not-a-category" })`. Construct a valid entry; call `updateEntry` with an invalid category. Expect `"validation_failed"`.
   - `T-4: updateEntry accepts valid patch (e.g., { status: "active" })`. Construct a valid entry; call `updateEntry` with `{ status: "active" }`. Expect `true`.
   - `T-5: updateEntry accepts promoted_to_rule patch`. Construct a valid finding; call `updateEntry` with `{ promoted_to_rule: "rule-id" }`. Expect `true`. (Regression guard for `metaStatePromoteRuleTool`.)
7. **Run the test suite.** `pnpm test`. All 5 new tests pass; no regressions in the 4 writer tools (they already build valid entries); the migration script is unaffected.

## Success Criteria

- [ ] 5 new tests in `__tests__/meta-state-write-validation.test.js` pass
- [ ] `InvalidEntryError` class is exported from `core/meta-state.js`
- [ ] `metaStateEntryPatchSchema` is exported from `core/meta-state.js`
- [ ] `writeEntry` throws `InvalidEntryError` on invalid shape
- [ ] `updateEntry` returns `"validation_failed"` on invalid patch
- [ ] 7 missing fields added to branch schemas; registry scan shows 0 missing fields
- [ ] `pnpm test` passes (0 failures expected)

## Risk Assessment

- **Risk:** `metaStateEntrySchema` silently strips unknown keys (Zod default). **Mitigation:** add the 7 missing registry fields to branch schemas before enabling validation. Verify with a registry scan.
- **Risk:** A migration script (e.g., `migrate-rule-entry-kind.mjs`, `backfill-mechanism-check.mjs`) writes invalid entries via `updateEntry`. **Mitigation:** those scripts use `updateEntry` (which validates patches via `metaStateEntryPatchSchema`), not `writeEntry` (which validates full entries). `metaStateEntryPatchSchema` is `z.object({}).passthrough()` — it accepts any top-level key. No regression expected.
- **Risk:** A future writer tool's handler builds an entry that's missing a required field (e.g., a finding without `category`). **Mitigation:** the validation in `writeEntry` catches this at write time. The writer tool receives the `InvalidEntryError` and can return a clear error message to the agent.
- **Risk:** Performance regression from sync Zod validation in the hot path (`updateEntry` is called per-entry in `meta_state_sweep`). **Mitigation:** Zod's `.safeParse` is fast (~microseconds for small objects). The 30-entry migration + daily sweep are not performance-sensitive. Acceptable.

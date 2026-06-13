---
phase: 3
title: "B2-1 Codegen: buildPatchSchemaFor (inline in core/meta-state.js)"
status: completed
priority: P1
effort: "1h"
dependencies: ["phase-02-b2-0-tdd-derived-schema-tests"]
---

# Phase 3: B2-1 Codegen: buildPatchSchemaFor (inline in core/meta-state.js)

## Overview

Add `buildPatchSchemaFor(kind)` and `PATCH_KINDS` to `core/meta-state.js` (inlined near `metaStateEntrySchema`, NOT in a new `core/schema-to-zod.js` file). The function reads the 4 per-kind Zod schemas, returns each as `.partial().strict()` so patches are partial AND unknown keys are rejected. This closes typo/unknown-field pollution through `Object.assign` at `core/meta-state.js:378` (updateEntry). Note: `.strict()` does NOT reject `__proto__` via `JSON.parse` (JS engine absorbs it into prototype chain before Zod sees it — runtime-verified); explicit `delete cleanPatch.__proto__` at line 376 provides real defense. Line 483 (`metaStateBatch`) is NOT covered — `meta-state-batch-tool.js:17` still uses `.passthrough()`.

The new function is the new source of truth for the patch tool's input schema.

**Why inline, not a new file:** `core/schema-to-zod.js` was DELETED in commit `05bea00` (2026-06-13) with the note "Plan 260613-1000 incorrectly classified these as live... zero live importers". Recreating the file recreates recently-removed dead code. Inlining keeps the derivation co-located with the source schemas (single file, easier to read, no import cycle).

## Requirements

- Functional: `buildPatchSchemaFor('finding')` returns `metaStateFindingEntrySchema.partial().strict()` — same keys, all optional, no extra keys allowed
- Functional: same for `'change-log'`, `'rule'`, `'loop-design'`
- Functional: throws on unknown kind
- Non-functional: additions to `core/meta-state.js` stay under 30 lines (the file is already 620 lines; +30 is fine per `development-rules.md`'s 200-line target on the added chunk)
- Non-functional: NO new file is created at `core/schema-to-zod.js`

## Architecture

The function is a small switch over the 4 per-kind schemas. The `.partial()` call marks all fields optional (patches are partial). The `.strict()` call (NOT in the original plan) rejects unknown keys. The function is imported by the patch tool in Phase 4 (B2-2).

The patch tool's `schema` field becomes a per-kind union computed at module load:
```js
import { buildPatchSchemaFor, PATCH_KINDS } from "#mcp/core/meta-state.js";
const patchSchema = z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k)));
```
This is a single expression; no precomputed export from `core/meta-state.js`. The expression is evaluated once at module load.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` (~30 lines added near `metaStateEntrySchema` at line 240; export the 2 new symbols)
- **Read (for the per-kind schemas):** `tools/learning-loop-mcp/core/meta-state.js` lines 56-225 (`metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`)
- **Read (for the pattern):** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` (already uses `metaStateLoopDesignSchema` directly)

## Implementation Steps

1. **Open** `tools/learning-loop-mcp/core/meta-state.js` and locate the line right after `metaStateEntrySchema` is defined (line 240, just before `metaStateEntryPatchSchema` at line 246).

2. **Add** the new exports:
   ```js
   /**
    * Derive the list of patchable kinds from the entry_kind enum in
    * meta-state-patch-tool.js. Single source of truth — no separate
    * hardcoded array to drift.
    *
    * NOTE: change-log is handler-level immutable (meta-state-patch-tool.js:56-59
    * rejects all change-log patches with reason "change_log_immutable"), but
    * the schema is still included so the union covers all 4 kinds. The handler
    * guard is the enforcement; the schema is permissive.
    */
   export const PATCH_KINDS = ["finding", "change-log", "rule", "loop-design"];

   /**
    * Derive a per-kind patch schema from the 4 per-kind source-of-truth
    * schemas. Patches are partial (.partial() marks all fields optional);
    * unknown keys are rejected (.strict() closes typo/unknown-field
    * pollution via Object.assign at the updateEntry boundary).
    *
    * IMPORTANT: .strict() does NOT reject __proto__ via JSON.parse (JS
    * engine absorbs it into prototype chain before Zod sees it). The real
    * defense is the explicit `delete cleanPatch.__proto__` at
    * core/meta-state.js:376.
    *
    * This is a pure projection: any change to the per-kind schemas in
    * this file is reflected here automatically. Tests in
    * __tests__/meta-state-patch-derived-schema.test.js assert the round-trip
    * behavior end-to-end.
    */
   export function buildPatchSchemaFor(kind) {
     switch (kind) {
       case "finding":    return metaStateFindingEntrySchema.partial().strict();
       case "change-log": return metaStateChangeEntrySchema.partial().strict();
       case "rule":       return metaStateRuleEntrySchema.partial().strict();
       case "loop-design": return metaStateLoopDesignSchema.partial().strict();
       default:
         throw new Error(
           `buildPatchSchemaFor: unknown kind "${kind}". Expected one of: ${PATCH_KINDS.join(", ")}`
         );
     }
   }
   ```

3. **Do NOT** add a `patchSchemaUnion` export. The patch tool computes the union inline (Phase 4 step 2).

4. **Do NOT** create `__tests__/schema-to-zod-patch.test.js`. The 3 stdio tests in `__tests__/meta-state-patch-derived-schema.test.js` (Phase 2) cover the round-trip end-to-end; a separate 1-line-passthrough test is library-testing, not plan-testing. Per Scope Critic Finding 3.

5. Run `pnpm test` and confirm:
   - The 2 RED tests in `__tests__/meta-state-patch-derived-schema.test.js` from Phase 2 (Tests 1-2, wrapped input rejection) are STILL RED (the patch tool still uses the passthrough schema; this phase only adds the derivation)
   - No unrelated tests broke (862 baseline; 0 expected change yet)

## Success Criteria

- [x] `PATCH_KINDS` and `buildPatchSchemaFor` exported from `core/meta-state.js`
- [x] Each per-kind branch returns `.partial().strict()` (NOT `.partial()` alone)
- [x] Note: `.strict()` rejects unknown keys but NOT `__proto__` — real defense is explicit `delete` at `core/meta-state.js:376` (added in Phase 4)
- [x] Unknown kind throws with a useful error message
- [x] No `core/schema-to-zod.js` file is created
- [x] No `patchSchemaUnion` precomputed export
- [x] 2 RED tests from Phase 2 still RED (the fix is in Phase 4)
- [x] No unrelated tests broke

## Risk Assessment

- **Risk: `.partial()` + `.strict()` on `z.literal` discriminators** — the per-kind schemas have `entry_kind: z.literal('finding')` etc. `.partial()` marks them optional. **Mitigation:** the patch tool's existing handler-level `entry_kind !== entry.entry_kind` check (line 44 of `meta-state-patch-tool.js`) catches any drift. The literal inside `patch` is redundant but harmless.
- **Risk: `.partial()` does not preserve `z.default([])` on inner arrays** — change-log's `change_diff` has inner `z.array().default([])`; `.partial()` does not preserve defaults. **Mitigation:** the handler rejects `entry_kind === 'change-log'` patches outright (line 56-60 of `meta-state-patch-tool.js`); the schema permissiveness is moot.
- **Risk: SP3 mid-implementation schema change** — if `metaStateFindingEntrySchema` is edited between Phase 2 and Phase 3, the test might fail. **Mitigation:** the test reads the schema dynamically; a divergence fails the test, which is the correct signal. Re-run after schema edits.
- **Risk: `.strict()` rejects legitimate non-strict callers** — the old `metaStateEntryPatchSchema` (passthrough) accepted any key, including `_expected_version`. The new derived union is `.strict()` and would reject `_expected_version`. **Mitigation:** `_expected_version` is a top-level sibling of `patch` in the tool's input schema (line 30 of `meta-state-patch-tool.js`), NOT inside `patch`. The handler destructures it separately at line 33. The derived union's strictness only applies to `patch` itself; `_expected_version` is validated by `z.number().optional()` at the top level. No regression.

## TDD Discipline

This phase adds no new test of its own. The 2 RED tests from Phase 2 (Tests 1-2, wrapped input rejection) cover the round-trip end-to-end. Phase 4 (B2-2) is what turns them green.

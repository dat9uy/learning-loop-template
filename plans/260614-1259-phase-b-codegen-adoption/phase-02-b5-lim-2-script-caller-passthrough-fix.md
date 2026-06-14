---
phase: 2
title: "B5 LIM-2 script-caller passthrough fix"
status: pending
priority: P2
effort: "1h"
dependencies: ["phase-01-b3-b4-codegen-adoption-and-verification"]
---

# Phase 2: B5 LIM-2 script-caller passthrough fix

## Overview

Fix the bug where script callers (Python `meta-state-tool.py` and any future automation) can't pass `_expected_version`, `mechanism_check`, or `code_fingerprint` through the patch tool's input schema. The B2 inline approach in `core/meta-state.js#buildPatchSchemaFor` uses `.partial().strict()` — strict typing rejects these fields because they're script-caller-only (not part of the entry's stored shape). The fix: extend the patch schema to accept these script-caller fields via `z.intersection` with a small passthrough object, scoped to the script-caller subset.

## Context Links

- **LIM-2 description:** `plans/reports/productization-260612-1530-master-tracker.md` (table row, "Suggested session: B5 (re-scoped 2026-06-14)")
- **B2 inline function:** `tools/learning-loop-mcp/core/meta-state.js:269-280` (`buildPatchSchemaFor(kind)` — returns `.partial().strict()`)
- **B2 patch tool consumer:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:32-35` (the union schema, plus `_expected_version` as a separate top-level field — this is the manual workaround)
- **Hand-written passthrough (current, wrong):** `tools/learning-loop-mcp/core/meta-state.js:286` (`metaStateEntryPatchSchema = z.object({}).passthrough()` — this is the B2 design's "patch validator" but it's only used for top-level validation, not the per-kind patch shape)
- **Script-caller fields (the bug surface):**
  - `_expected_version` — CAS field, optional, used by the patch tool's handler
  - `mechanism_check` — opt-in flag for fingerprint tracking, used by `meta_state_report` and other writers
  - `code_fingerprint` — SHA-256 fingerprint, set by `meta_state_refresh_fingerprint` via `meta_state_patch`
- **YAGNI disposition for LIM-1:** full `core/schema-to-zod.js` recreation is parked as Bridge 7 `loop-design` dependency (per 2026-06-14 scoping decision); this phase does NOT recreate it.

## Requirements

- **Functional:** Script callers (Python `meta-state-tool.py`, future automation) can pass `_expected_version`, `mechanism_check`, `code_fingerprint` through the patch tool without schema rejection. The fix is scoped to the script-caller subset (3 fields), not a wholesale schema widening.
- **Non-functional:**
  - The strict-typed per-kind patch shape is preserved (the B2 invariant). Script-caller fields are a separate passthrough layer, not a relaxation of the entry-shape strictness.
  - All 864+ tests pass (B3 baseline + the new B5 tests).
  - The fix is a single targeted change in `core/meta-state.js#buildPatchSchemaFor` (or a new exported function consumed by the patch tool), not a global `.passthrough()` rollback.

## Architecture

**The bug:**

```javascript
// core/meta-state.js:269-280 (B2 inline)
export function buildPatchSchemaFor(kind) {
  switch (kind) {
    case "finding":    return metaStateFindingEntrySchema.partial().strict();
    // ...
  }
}

// patch tool (line 32-35) — manual workaround for _expected_version at the tool level
schema: {
  id: z.string().describe(...),
  entry_kind: z.enum([...]).describe(...),
  patch: z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k))).describe(...),
  _expected_version: z.number().optional().describe(...),  // ← tool-level escape hatch
}
```

Script callers can pass `_expected_version` at the tool level (it accepts arbitrary top-level fields), but they cannot pass `mechanism_check` or `code_fingerprint` because those live INSIDE the `patch` object and the per-kind patch schema is strict-typed. The hand-written `metaStateEntryPatchSchema = z.object({}).passthrough()` at line 286 is a different schema (the top-level entry validator, not the per-kind patch shape) and doesn't help here.

**The fix — `z.intersection` of the strict per-kind shape with a scoped passthrough:**

```javascript
// core/meta-state.js — new export
export const SCRIPT_CALLER_PATCH_FIELDS = z.object({
  mechanism_check: z.boolean().optional()
    .describe("Opt-in flag for fingerprint tracking; not persisted on the entry itself"),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("SHA-256 of evidence_code_ref; set by meta_state_refresh_fingerprint"),
}).passthrough();  // passthrough for any future script-caller fields

// Updated buildPatchSchemaFor (or new helper buildScriptCallerPatchSchema)
export function buildPatchSchemaFor(kind) {
  const strict = (() => {
    switch (kind) {
      case "finding":    return metaStateFindingEntrySchema.partial().strict();
      case "change-log": return metaStateChangeEntrySchema.partial().strict();
      case "rule":       return metaStateRuleEntrySchema.partial().strict();
      case "loop-design": return metaStateLoopDesignSchema.partial().strict();
      default: throw new Error(`buildPatchSchemaFor: unknown kind "${kind}"`);
    }
  })();
  return z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS);
}
```

The `z.intersection` produces a schema that:
- Accepts all per-kind entry fields (strict, partial — B2 invariant preserved)
- ALSO accepts the 3 script-caller fields (`_expected_version` is handled at the tool level; `mechanism_check` and `code_fingerprint` are accepted here)
- The 3 fields are NOT persisted on the entry (they're handler-side; the entry shape is unchanged)

**Alternative (rejected):** wholesale `.passthrough()` on the per-kind shape. This re-introduces the B2 blocker (the structural reason B2 fixed it in the first place). Reject.

**Alternative (rejected):** keep `_expected_version` at the tool level and add `mechanism_check` + `code_fingerprint` at the tool level too. Inconsistent (3 fields handled in 2 places) and grows the tool's surface area. Reject.

## Related Code Files

- **Modify (1 file):**
  - `tools/learning-loop-mcp/core/meta-state.js`
    - Add `SCRIPT_CALLER_PATCH_FIELDS` constant (~10 lines)
    - Update `buildPatchSchemaFor` to return `z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS)` (~5 lines)
- **Create (1 test file):**
  - `tools/learning-loop-mcp/__tests__/meta-state-script-caller-passthrough.test.js` (3-5 tests, see Implementation Step 2)
- **No other files modified** — the patch tool's existing `_expected_version` field at line 34 stays (it's a tool-level field, not in the `patch` object).

## Implementation Steps

**Step 1 — RED: write failing tests (~20 min)**

In `__tests__/meta-state-script-caller-passthrough.test.js`:

1. Test: `metaStatePatchTool.schema` accepts `{ id, entry_kind: 'finding', patch: { mechanism_check: true, code_fingerprint: 'sha256:abc...' }, _expected_version: 0 }` and round-trips without rejection.
2. Test: `metaStatePatchTool.schema` rejects unknown fields inside `patch` (the strict-typed invariant from B2) — e.g., `{ patch: { bogus_field: 'x' } }` is rejected.
3. Test: `metaStatePatchTool.schema` accepts `mechanism_check: false` (explicit opt-out) and `code_fingerprint` with the `sha256:` prefix regex.
4. Test: `metaStatePatchTool.schema` accepts `code_fingerprint: undefined` (script caller doesn't always set it; the optional `.optional()` is preserved).
5. Test: the underlying entry shape (post-patch) does NOT persist `mechanism_check` or `code_fingerprint` on the entry — they remain handler-side (run a real write + read-back and assert the entry has neither field).

Run `pnpm test __tests__/meta-state-script-caller-passthrough.test.js` — all 5 tests should fail (RED).

**Step 2 — GREEN: implement the fix (~15 min)**

1. Add `SCRIPT_CALLER_PATCH_FIELDS` to `core/meta-state.js` (the snippet from the Architecture section above).
2. Update `buildPatchSchemaFor` to return `z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS)`.
3. Run `pnpm test __tests__/meta-state-script-caller-passthrough.test.js` — all 5 tests should pass (GREEN).
4. Run `pnpm test` — full suite passes (864+ tests, 0 fail).

**Step 3 — Verify the B2 invariant (~10 min)**

1. Run the 4 B2 stdio regression tests: `pnpm test __tests__/wire-format-top-level-coercion.test.js __tests__/wire-format-coercion-fix.test.js __tests__/wire-format-patch-recursion.test.js __tests__/meta-state-patch-derived-schema.test.js`. All pass.
2. Re-read the B2 plan's `phase-04-b2-2-wire-patch-tool-to-derived-schema.md` to confirm no behavioral change. The intersection adds 3 fields to the accepted set; it does NOT remove any.
3. Confirm the `meta_state_patch` tool's runtime schema still matches the per-kind source of truth (the §3.6 byte-for-byte parity test from B2 still holds; the intersection is additive).

**Step 4 — Commit + closeout (~10 min)**

1. Commit: `fix(mcp): accept mechanism_check + code_fingerprint in meta_state_patch via z.intersection (LIM-2)`. Single commit, ~30 lines + tests.
2. Resolve the LIM-2 row in the master tracker (update the LIM table to mark LIM-2 as `Resolved 2026-06-14 via Phase 2 of plan 260614-1259-phase-b-codegen-adoption`).
3. File a `meta_state_log_change` entry documenting the fix: `change_dimension: 'semantic'`, `change_target: 'tools/learning-loop-mcp/core/meta-state.js#buildPatchSchemaFor'`, `reason: 'LIM-2 fix: script callers can now pass mechanism_check + code_fingerprint through meta_state_patch via z.intersection with a scoped passthrough. The strict-typed per-kind patch shape (B2 invariant) is preserved.'`.

## Success Criteria

- [ ] `pnpm test` passes (864+ tests, 0 fail; the 5 new tests + the existing baseline).
- [ ] The 4 B2 stdio regression tests pass (verifies the B2 invariant is preserved).
- [ ] The §3.6 byte-for-byte parity test from B2 still holds (the per-kind source-of-truth shape is unchanged; the intersection is additive).
- [ ] The `meta_state_patch` handler's behavior is unchanged for entry-shape fields (test: round-trip a normal patch with no script-caller fields; the result is identical to pre-fix).
- [ ] Script callers can pass `mechanism_check: true/false` and `code_fingerprint: 'sha256:...'` without schema rejection (test 1 from Step 1).
- [ ] The entry shape post-patch does NOT persist `mechanism_check` or `code_fingerprint` (test 5 from Step 1 — the B2 invariant: entry shape unchanged, script-caller fields are handler-side).
- [ ] A `meta_state_log_change` audit-trail entry is filed for the fix.
- [ ] The master tracker's LIM table is updated to mark LIM-2 as resolved.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `z.intersection` widens the schema in a way that breaks the B2 strict-typed invariant | low | The intersection is additive — it adds 3 fields, removes none. The per-kind shape is still `.partial().strict()`; the strictness is the INNER shape, and the intersection is the outer merge. |
| Script-caller fields leak into the persisted entry (data integrity regression) | low | Test 5 explicitly asserts the entry post-patch does NOT have these fields. The patch tool's handler already filters fields at writeEntry time; no new filter needed. |
| Future script-caller fields are added but not enumerated in `SCRIPT_CALLER_PATCH_FIELDS` | low | The constant uses `.passthrough()` to allow arbitrary fields; the explicit `.describe()` on `mechanism_check` + `code_fingerprint` is for documentation + Zod-level validation (regex on the sha256 prefix). New fields get accepted silently; update the constant when the script caller grows. |
| The intersection breaks the per-kind shape's ability to detect field-typo errors (e.g., `mechanism_chek` typo) | low | The inner `.strict()` rejects unknown fields per-kind; the outer passthrough accepts anything at the script-caller layer. Typo on `mechanism_check` would be rejected at the inner layer (since `mechanism_check` is not an entry field) — wait, actually it would be ACCEPTED at the outer passthrough. **This is a real risk** — typo on `mechanism_check` would not be caught. Mitigation: document the 3 fields explicitly in the constant, and add a stricter `.strict()` (no passthrough) for the 3 fields. Update the constant to use `.strict()` instead of `.passthrough()`. |
| The 3 fields get added to the entry's stored shape (audit-trail bloat) | none | The fields are not in `metaStateFindingEntrySchema` etc. (verified in Step 3's re-read of the B2 source-of-truth). The handler's existing field-filter strips them at writeEntry time. |

**Risk re-evaluation after fix design:** the "typo not caught" risk is real. Update `SCRIPT_CALLER_PATCH_FIELDS` to use `.strict()` instead of `.passthrough()`. New script-caller fields require updating the constant; that's the intended discipline.

```javascript
// Final design — .strict() to catch typos
export const SCRIPT_CALLER_PATCH_FIELDS = z.object({
  mechanism_check: z.boolean().optional().describe(...),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional().describe(...),
}).strict();  // ← changed from .passthrough() to .strict()
```

`_expected_version` stays at the tool level (in the patch tool's top-level schema, not in the `patch` object) — it's a CAS field, not a script-caller passthrough field.

## Next Steps

- **After Phase 2 ships:** Phase 3 (B6 flip) starts. The flip is trivial (one `meta_state_patch` on the loop-design entry) and requires green CI from PR #1 + #2 + #3 (Phase 1) + this phase's commit.
- **If LIM-2 surfaces additional bugs** (e.g., a script caller passes a field we didn't anticipate): file a follow-up `meta_state_report` finding and add the field to `SCRIPT_CALLER_PATCH_FIELDS`. The `.strict()` discipline means typos are caught; the constant is the enumeration source of truth.
- **Bridge 7 dependency (LIM-1):** the full `core/schema-to-zod.js` recreation is parked as a `loop-design` entry behind Bridge 7. When Bridge 7 un-pauses (product-surface binding), revisit the loop-design; if the script-caller field set has grown by then, the constant moves into the schema-to-zod derivation.

---
phase: 2
title: "B5 LIM-2 script-caller passthrough fix"
status: completed
priority: P2
effort: "1h"
dependencies: ["phase-01-b3-b4-codegen-adoption-and-verification"]
---

# Phase 2: B5 LIM-2 script-caller passthrough fix

## Overview

Re-triage and fix the LIM-2 bug where script callers (Python `meta-state-tool.py` and future automation) cannot pass script-caller fields through `meta_state_patch`. The original plan proposed `z.intersection` in `buildPatchSchemaFor`, but red-team review proved that `ZodIntersection` has no `.shape` and therefore breaks the `coerceParamsToSchema` wire-format coercion pipeline. This phase replaces that design with a coercion-safe approach.

**Key facts from code review:**
- `_expected_version` is already a top-level field in the patch tool schema (`meta-state-patch-tool.js:34-35`).
- `mechanism_check` and `code_fingerprint` are already part of `metaStateFindingEntrySchema` (`core/meta-state.js:87-90`), so the finding patch schema already accepts them inside `patch`.
- `code_fingerprint` is in `IMMUTABLE_PATCH_FIELDS` (`meta-state-patch-tool.js:15`), so the handler rejects patches that try to change it.
- These fields do not exist on change-log, rule, or loop-design schemas.

Therefore the LIM-2 bug may be narrower than originally described, or may be a documentation/tool-caller issue rather than a schema issue. This phase starts with a reproduction against the actual Python script caller, then applies the smallest coercion-safe fix.

## Context Links

- **LIM-2 description:** `plans/reports/productization-260612-1530-master-tracker.md` (table row, "Suggested session: B5 (re-scoped 2026-06-14)")
- **B2 inline function:** `tools/learning-loop-mcp/core/meta-state.js:269-280` (`buildPatchSchemaFor(kind)` — returns `.partial().strict()`)
- **B2 patch tool consumer:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:32-35` (the union schema plus `_expected_version` at the tool level)
- **Script-caller fields (the bug surface):**
  - `_expected_version` — CAS field, optional, already at tool level.
  - `mechanism_check` — opt-in flag for fingerprint tracking; already in `metaStateFindingEntrySchema`.
  - `code_fingerprint` — SHA-256 fingerprint; immutable by design; refreshed via `meta_state_refresh_fingerprint`.
- **Red-team adjudication:** `plans/260614-1259-phase-b-codegen-adoption/reports/from-code-reviewer-to-planner-red-team-adjudication-report.md` § Findings 1, 2

## Requirements

- **Functional:** Identify the exact field(s) the script caller cannot pass, then implement a coercion-safe fix. Do not use `z.intersection`.
- **Non-functional:**
  - Preserve the B2 strict-typed per-kind patch shape invariant.
  - Preserve wire-format coercion for ALL patch fields (arrays, booleans, numbers, nested objects).
  - The current baseline (870 pass / 1 skip) must not regress.
  - The fix is the smallest change that resolves the verified bug.

## Architecture

**Rejected design — `z.intersection`:**

```javascript
// DO NOT USE — breaks coerceParamsToSchema
return z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS);
```

`coerceParamsToSchema` at `tool-registry.js:78-80` reads `schema.shape` and recurses only on `ZodObject`. `ZodIntersection` has no `.shape` and is not handled by `unwrapTypeName` (`tool-registry.js:6-22`). Using it would regress stdio round-trips for every field inside `patch`.

**Preferred designs (choose after reproduction):**

1. **Tool-level passthrough fields** (if the caller sends them outside `patch`):
   Add `mechanism_check` and `code_fingerprint` as top-level optional fields in the patch tool schema, alongside `_expected_version`. The handler forwards them into the `patch` object only for `entry_kind: "finding"`. This keeps `buildPatchSchemaFor` unchanged and coercion-safe.

2. **No code change + documentation** (if the caller can already pass them inside `patch` for findings):
   Update the script-caller documentation to show the correct nesting: `patch: { mechanism_check: true }` for finding entries. `code_fingerprint` remains immutable; use `meta_state_refresh_fingerprint` instead.

3. **Per-kind schema extension** (only if the fields genuinely need to be patchable on other kinds):
   Add `mechanism_check` / `code_fingerprint` as optional fields to the relevant per-kind entry schemas. This is the least preferred option because it pollutes the source of truth.

The reproduction step determines which design is applied.

## Related Code Files

- **Modify (0-1 file):**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (if tool-level fields are needed)
  - OR no code change (if documentation-only fix)
- **Create (1 test file):**
  - `__tests__/meta-state-script-caller-passthrough.test.js` (3-5 tests, see Implementation Steps)
- **Read for context:**
  - `tools/learning-loop-mcp/tool-registry.js:6-136` (wire-format coercion)
  - `tools/learning-loop-mcp/core/meta-state.js:269-280` (`buildPatchSchemaFor`)
  - Any script caller (e.g., `meta-state-tool.py` if it exists)

## Implementation Steps

**Step 0 — Reproduce the bug (~15 min)**

1. Locate the script caller (`meta-state-tool.py` or equivalent) and identify how it calls `meta_state_patch`.
2. Run a failing call that the script caller would make (e.g., `meta_state_patch` with `mechanism_check` or `code_fingerprint` at the position the caller uses).
3. Record the exact rejection reason (schema error vs. handler error vs. wire-format coercion error).

**Step 1 — RED: write failing tests (~15 min)**

In `__tests__/meta-state-script-caller-passthrough.test.js`:

1. Test the verified failure case from Step 0.
2. Test that normal finding patches still work without script-caller fields.
3. Test that wire-format coercion still works for nested array fields inside `patch`.
4. Test that unknown fields inside `patch` are still rejected (B2 invariant).

Run `pnpm test __tests__/meta-state-script-caller-passthrough.test.js` — all tests should fail (RED).

**Step 2 — GREEN: implement the smallest coercion-safe fix (~20 min)**

Based on the reproduction:

- If the caller sends fields at tool level → add them as top-level optional fields in `meta-state-patch-tool.js` and forward them into `patch` for finding entries only.
- If the caller sends fields inside `patch` and they are rejected → verify whether the rejection is from schema or handler; fix the narrowest layer.
- If the fields already work → remove the failing test for that field and convert the phase to documentation-only.

Do NOT modify `buildPatchSchemaFor` to return anything other than a plain `ZodObject`. Do NOT use `z.intersection`.

Run `pnpm test __tests__/meta-state-script-caller-passthrough.test.js` — all tests pass (GREEN).
Run `pnpm test` — full suite passes (870 pass / 1 skip).

**Step 3 — Verify the B2 invariant (~10 min)**

1. Run the 4 B2 stdio regression tests: `pnpm test __tests__/wire-format-top-level-coercion.test.js __tests__/wire-format-coercion-fix.test.js __tests__/wire-format-patch-recursion.test.js __tests__/meta-state-patch-derived-schema.test.js`. All pass.
2. Confirm the per-kind source-of-truth shape is unchanged.

**Step 4 — Commit + closeout (~10 min)**

1. Commit: `fix(mcp): resolve LIM-2 script-caller passthrough via <chosen approach>`.
2. Resolve the LIM-2 row in the master tracker.
3. File a `meta_state_log_change` entry documenting the fix.

## Success Criteria

- [ ] `pnpm test` passes (870 pass / 1 skip baseline, 0 fail).
- [ ] The 4 B2 stdio regression tests pass (B2 invariant preserved).
- [ ] The per-kind source-of-truth shape is unchanged.
- [ ] `meta_state_patch` handler behavior for entry-shape fields is unchanged.
- [ ] Script callers can pass the verified field(s) without schema rejection.
- [ ] A `meta_state_log_change` audit-trail entry is filed for the fix.
- [ ] The master tracker's LIM table is updated to mark LIM-2 as resolved.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `z.intersection` regression if reintroduced | high | Explicitly forbid `z.intersection` in this phase; use tool-level fields or documentation instead. |
| Wire-format coercion breaks for nested patch fields | medium | The 4 B2 stdio regression tests are the gate. `buildPatchSchemaFor` remains a plain `ZodObject`. |
| Script-caller fields leak into non-finding entries | low | If tool-level fields are added, the handler forwards them only for `entry_kind: "finding"`. |
| LIM-2 bug is narrower than expected → phase scope collapses | low | Acceptable. The phase becomes documentation-only if the fields already work. |

## Next Steps

- **After Phase 2 ships:** Phase 3 (B6 flip) starts. The flip requires green CI from Phase 1 + Phase 2.
- **If LIM-2 surfaces additional bugs:** file a follow-up `meta_state_report` finding and add the field to the tool-level schema or documentation.

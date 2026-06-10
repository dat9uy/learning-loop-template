---
phase: 2
title: "Green (implementation)"
status: completed
priority: P1
effort: "0.5h"
dependencies: [1]
---

# Phase 2: Green (implementation)

## Overview

Implement minimal code to make the 4 red tests from Phase 1 pass. Touch ONLY `tools/learning-loop-mcp/tool-registry.js`. Add 1 helper (`unwrapItemWrap`) with 3-iter bound inlined, and 1 wire-in call inside `coerceParamsToSchema`. **No constant changes** — `MAX_RECURSION_DEPTH` stays at 2 (depth bump dropped per red-team amendment 2) and `MAX_UNWRAP_ITERATIONS` is inlined in the helper (YAGNI per red-team amendment 2). Do NOT touch `meta-state-patch-tool.js`. Do NOT touch `core/gate-logic.js`.

## Requirements

- Functional:
  - `coerceParamsToSchema` must unwrap `{item: X}` chains (max 3 iterations) when the target field is declared as `ZodArray` or `ZodObject`
  - `coerceParamsToSchema` must recurse into nested `ZodObject` values up to depth 2 (UNCHANGED — depth bump dropped per red-team amendment 2)
  - `unwrapItemWrap` must be typeName-gated: only unwraps when `typeName === "ZodArray"` or `typeName === "ZodObject"`
  - Helper must fail-safe: if the bound (3 iterations) is hit, return the value as-is
  - Helper must log `item_wrap_unwrapped` audit event per unwrap (best-effort, swallow logging errors)
- Non-functional:
  - Helper signature: `unwrapItemWrap(value, typeName)` returns `{ value, unwrapped: <count> }` (count is 0 if no unwrap)
  - No new dependencies
  - No new constants (3-iter bound inlined; `MAX_RECURSION_DEPTH` unchanged)
  - No changes to `meta-state-patch-tool.js`
  - No changes to `core/gate-logic.js`

## Architecture

**File to modify:** `tools/learning-loop-mcp/tool-registry.js`

**No constant changes.** `MAX_RECURSION_DEPTH` stays at 2 (verified: `tools/learning-loop-mcp/tool-registry.js` line 4). The 3-iter bound on the `{item: X}` chain is inlined in the helper — these are orthogonal concerns (the unwrap handles wire-format envelopes; the recursion handles nested ZodObject values).

**New helper (above `coerceParamsToSchema`):**

```js
/**
 * Unwrap {item: X} envelopes produced by MCP SDK wire framing.
 * TypeName-gated: only unwraps when target type is ZodArray or ZodObject.
 * Bounded to 3 iterations to prevent infinite loops on self-referential
 * passthrough schemas.
 *
 * @param {*} value - The value to potentially unwrap
 * @param {string} typeName - The Zod type name of the target field
 * @returns {{ value: *, unwrapped: number }} - The (potentially) unwrapped value and count
 */
function unwrapItemWrap(value, typeName) {
  if (typeName !== "ZodArray" && typeName !== "ZodObject") {
    return { value, unwrapped: 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, unwrapped: 0 };
  }

  let cur = value;
  let depth = 0;
  while (depth < 3) {
    const keys = Object.keys(cur);
    if (keys.length !== 1 || keys[0] !== "item") break;
    cur = cur.item;
    depth++;
  }
  return { value: cur, unwrapped: depth };
}
```

**Wire into `coerceParamsToSchema` (after the existing `coerceValue` call, BEFORE the `ZodObject` recursion block):**

Current code (approximate location):
```js
const next = coerceValue(value, typeName);
if (next !== undefined) {
  coerced[key] = next;
  didCoerce = didCoerce || next !== value;
}

// ... (existing ZodObject recursion block follows)
```

New code (add the unwrap call after the `coerceValue` block):
```js
const next = coerceValue(value, typeName);
if (next !== undefined) {
  coerced[key] = next;
  didCoerce = didCoerce || next !== value;
}

// NEW: Unwrap {item: X} envelopes (MCP SDK wire framing artifact)
const unwrapResult = unwrapItemWrap(coerced[key], typeName);
if (unwrapResult.unwrapped > 0) {
  coerced[key] = unwrapResult.value;
  didCoerce = true;
  if (root) {
    try {
      appendGateLog(root, {
        action: "item_wrap_unwrapped",
        field: key,
        depth: unwrapResult.unwrapped,
      });
    } catch { /* logging is best-effort */ }
  }
}

// ... (existing ZodObject recursion block follows)
```

**Sequence rationale:** the unwrap runs AFTER `coerceValue` (which handles string-to-array/boolean/number coercion) and BEFORE the ZodObject recursion (which descends into nested ZodObject values). This order matters: if `coerceValue` turned a string into a parsed array, the unwrap is a no-op (the value is no longer a `{item: X}` shape).

**Known limitation (per red-team High #4):** the ZodObject recursion block (line 78–88 of `tool-registry.js`) reads `value` (the pre-coercion original), not `coerced[key]` (the post-unwrap value). This is a pre-existing decoupling in the recursion logic. The fix is in Bridge 5 (where `passthrough` is replaced with schema-derived schemas). For this plan, the unwrap runs on the top-level field, which is the documented symptom; the recursion layer decoupling is a separate concern.

## Related Code Files

- **Modify:**
  - `tools/learning-loop-mcp/tool-registry.js` (+25 lines: 1 helper, 1 wire-in block; NO constant changes)
- **UNCHANGED (do NOT touch in this phase):**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (passthrough stays until Bridge 5)
  - `tools/learning-loop-mcp/core/gate-logic.js` (fix stays in registry layer)
  - `tools/learning-loop-mcp/core/meta-state.js` (no new core logic)
  - `tools/learning-loop-mcp/tool-registry.js#MAX_RECURSION_DEPTH` (stays at 2; depth bump dropped per red-team amendment 2)

## Implementation Steps

1. Read `tools/learning-loop-mcp/tool-registry.js` end-to-end to confirm current structure (already done in brainstorm; refresh if needed).
2. Add the `unwrapItemWrap` helper function above `coerceParamsToSchema` (after the `coerceValue` helper, before the `coerceParamsToSchema` export). The 3-iter bound is inlined.
3. Add the wire-in block inside `coerceParamsToSchema` after the existing `coerceValue` call, BEFORE the existing `ZodObject` recursion block.
4. **Do NOT** add a new constant for `MAX_UNWRAP_ITERATIONS` (inlined; YAGNI).
5. **Do NOT** bump `MAX_RECURSION_DEPTH` (stays at 2; depth bump dropped per red-team amendment 2).
6. Run `pnpm test` from the project root. Confirm all 4 new tests from Phase 1 now pass.
7. Confirm NO existing tests regress (898 existing tests still pass).
8. Commit: `git add tools/learning-loop-mcp/tool-registry.js && git commit -m "fix(meta): unwrap {item:[...]} in coerceParamsToSchema for array/object types"`.

## Success Criteria

- [x] `tools/learning-loop-mcp/tool-registry.js` has the new `unwrapItemWrap` helper (3-iter bound inlined)
- [x] `MAX_RECURSION_DEPTH` is **UNCHANGED** (stays at 2; no depth bump)
- [x] No new constants added (verified by `git diff tools/learning-loop-mcp/tool-registry.js` showing no `const.*=.*3` additions)
- [x] `unwrapItemWrap` is wired into `coerceParamsToSchema` after the `coerceValue` call
- [x] `pnpm test` shows all 4 new tests passing
- [x] All 898 existing tests still pass
- [x] `meta-state-patch-tool.js` is UNCHANGED (git diff shows zero changes)
- [x] `core/gate-logic.js` is UNCHANGED (git diff shows zero changes)
- [x] Git commit records the production code change
- [x] `pnpm check` passes (validate records + extract index + tests)

## Risk Assessment

### Risk: The wire-in block breaks the identity preservation contract

The existing helper returns `args` (identity) when no coercion happened. Adding the unwrap branch could cause the helper to return a new object reference even when only the unwrap happened (and the inner `coerceValue` was a no-op).

**Mitigation:** the wire-in block only sets `didCoerce = true` when `unwrapResult.unwrapped > 0`. The existing `if (didCoerce) return coerced; return args;` pattern at the end of the helper preserves identity when nothing changed. Verify with: `grep -A2 "didCoerce ? coerced : args" tools/learning-loop-mcp/tool-registry.js` (or equivalent).

### Risk: ZodDefault / ZodEffects / ZodLazy unwrapping chain not preserved

The existing `unwrapTypeName` helper unwraps `ZodOptional`, `ZodNullable`, `ZodDefault`, `ZodEffects`, `ZodTransform`, `ZodLazy` to find the inner type. The new `unwrapItemWrap` receives the unwrapped `typeName` (e.g., "ZodArray"). If the field is `z.array(z.string()).default([])`, the `typeName` after `unwrapTypeName` is "ZodArray", which is correct.

**Mitigation:** verify the `typeName` parameter passed to `unwrapItemWrap` is the post-`unwrapTypeName` value (not the raw ZodOptional type). Trace the call site: `coerceParamsToSchema` calls `unwrapTypeName(fieldSchema)` once and stores the result in `typeName`. The wire-in block uses this same `typeName`. No double-unwrap.

### Risk: The audit log call throws in tests

`appendGateLog` writes to `gate.log`. In test environments, the root may be a temp directory and the log file may not be writable, or the log may not be readable for assertions.

**Mitigation:** the wire-in block wraps `appendGateLog` in a try/catch with `/* logging is best-effort */`. Phase 1's tests should NOT assert against `gate.log` content (the success criteria explicitly says "if `gate.log` location is not stable, drop the `gate.log` assertion and rely on the registry round-trip assertion only"). The audit log is for production visibility, not test verification.

### Risk (NEW per red-team High #4): ZodObject recursion uses `value`, not `coerced[key]`

The ZodObject recursion block (line 78–88 of `tool-registry.js`) reads `value` (the original pre-coercion args value), not `coerced[key]` (the post-unwrap value). So if `coerceValue` produces a new value, OR if `unwrapItemWrap` produces a new value, the recursion operates on the pre-coercion, pre-unwrap data. The unwrap and the recursion are decoupled.

**Mitigation:** this is a pre-existing issue; the plan's Test 1.5 (empty arrays) and Test 2 (unit test) cover the unwrap directly, and the recursion decoupling is documented as a known limitation. The fix is in Bridge 5 (where `passthrough` is replaced with schema-derived schemas). For this plan, the unwrap runs on the top-level field, which is the documented symptom.

# Code Review: Coerce-Layer Zod-Native Migration

**Scope:** 40 tool schemas, 2 core helpers, 1 factory, 8 test files, 2 new core files
**Branch:** 260618-0029-coerce-layer-zod-native-migration
**Commit:** f2f7577 (plan) + implementation delta
**Tests:** 1067 pass / 0 fail / 1 skip

---

## Overall Assessment

Implementation is structurally correct and follows the plan. All 3 phases executed:
- Phase 1: 40 tool schemas migrated (13 boolean, 10 number, 17 envelope-array, 3 envelope-object)
- Phase 2: coerce layer deleted (wire-format-coercion.js, parity-harness.js, coerceScalar/wrapSchema helpers)
- Phase 3: 8 tests migrated (4 mcp-side renamed, 4 mastra-side deleted, 1 new boolean-semantic-guards test)

**One blocking issue found:** JSON Schema description loss in `schema-parity.js` `withMeta` function. Zod 4.4.3 stores descriptions in `globalRegistry` keyed by instance identity; `withMeta` reads from `_zod.bag` which is always empty. Rebuilt schemas lose all `.describe()` text, regressing the MCP `tools/list` output.

---

## Critical Issues (Blocking)

### C1: Description loss in `schema-parity.js` `withMeta` (Zod 4.4.3 API mismatch)

**File:** `tools/learning-loop-mastra/schema-parity.js:119-125`

**Problem:** `withMeta` reads `original._zod.bag?.description` which is always `{}` in Zod 4.4.3. Descriptions are stored in `globalRegistry.get(schema)` (a WeakMap-like registry keyed by instance identity). When `buildParitySchema` rebuilds a schema, the new instance has a different identity, so the description is lost.

**Impact:** All tool schemas that use `.describe()` on guarded-boolean or preprocessed fields lose their descriptions in the JSON Schema output. This affects MCP `tools/list` responses and any client that reads field descriptions.

**Fix:** Replace `withMeta` to use `globalRegistry`:

```javascript
import { globalRegistry } from "zod";

function withMeta(rebuilt, original) {
  const meta = globalRegistry.get(original);
  if (meta && (meta.description || meta.deprecated)) {
    globalRegistry.add(rebuilt, meta);
  }
  return rebuilt;
}
```

**Verified:** Pre-migration preserves descriptions; post-migration loses them. Fix restores them.

---

## High Priority (Non-blocking)

### H1: `create-loop-tool.js` still imports `z` from "zod" but only uses it in `normalizeInputSchema`

**File:** `tools/learning-loop-mastra/create-loop-tool.js:2`

The `z` import is used only in `normalizeInputSchema` (line 26: `z.object(inputSchema)`). This is correct but the import could be moved closer to usage. Minor.

### H2: `schema-parity.js` missing `brand`, `catch`, `readonly`, `refine`, `superRefine` handling

**File:** `tools/learning-loop-mastra/schema-parity.js`

The parity builder handles primitives, objects, arrays, unions, tuples, records, discriminated unions, optionals, defaults, nullable, and pipes. It does NOT handle:
- `z.brand()` — would fall through to `return schema` (preserves the brand but may not be parity-clean)
- `z.catch()` — same
- `z.readonly()` — same
- `z.refine()` / `z.superRefine()` — same

These are not used in the current tool schemas, so no immediate impact. Document as known limitation.

---

## Medium Priority (Non-blocking)

### M1: `boolean-semantic-guards.test.js` uses `z.number()` in `makeGuardedBoolean()` but production schemas only use `z.boolean()` and `z.string()`

**File:** `tools/learning-loop-mcp/__tests__/boolean-semantic-guards.test.js:11`

The test helper includes `z.number()` in the union, but the actual tool schemas use `z.union([z.boolean(), z.string()])`. The test is slightly broader than production. This is safe (the guard handles numbers correctly), but a mismatch between test contract and production contract.

### M2: `zod-optional-coerce.test.js` uses `node:assert` (non-strict) instead of `node:assert/strict`

**File:** `tools/learning-loop-mcp/__tests__/zod-optional-coerce.test.js:2`

All other test files use `node:assert/strict`. Minor inconsistency.

### M3: `zod-coerce-top-level.test.js` stdio smoke test shares server instance across 2 sub-tests

**File:** `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js:124`

The test bundles mechanism_check coercion + tools/list schema preservation into one `withMcpServer` call. If the first assertion fails, the second is skipped (harder to diagnose). Consider splitting into 2 sequential server spawns or adding intermediate assertions.

---

## Low Priority (Non-blocking)

### L1: `meta-state.jsonl` is dirty from tests (70-line diff)

Per constraints, this is expected and should not be treated as an intentional change. Consider adding to `.gitignore` or cleaning post-test.

### L2: `coerce-correctness.test.js` comment says "empty string -> 0" but the test asserts `deepEqual({ count: 0 })`

**File:** `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:23`

The comment is correct (`Number("") === 0`), but the behavior may surprise callers. Documented in the test, so acceptable.

---

## Positive Observations

1. **Clean deletion of coerce layer:** No production callers remain; grep verified.
2. **Envelope stripper is undefined-safe:** Correctly handles `optional-after-preprocess` (red-team 7a).
3. **Boolean semantic guards are strict:** Only `true`/`"true"` -> `true`; everything else -> `false`.
4. **JSON Schema parity for types is correct:** `z.preprocess` emits identical JSON Schema to non-preprocess for arrays, objects, and passthroughs.
5. **Test coverage is comprehensive:** 1067 tests pass; boolean guards, envelope stripping, coerce behavior, and stdio smoke all covered.
6. **Plan adherence is strong:** All 3 phases followed; deviations (`z.preprocess` vs `z.union`, `evidence_missing` skip) are documented and justified.

---

## Acceptance Criteria Verification

| Criterion | Status | Notes |
|---|---|---|
| AC1: All 40 tool inputSchemas byte-for-byte JSON Schema parity | **PARTIAL** | Type parity correct; description parity broken (C1) |
| AC2: All existing tests pass (1067/0/1) | **PASS** | Verified |
| AC3: z.coerce.* and z.preprocess replace wire-format-coercion | **PASS** | No regressions in parse behavior |
| AC4: Strict boolean guards reject "false"/"0"/"yes" on HIGH/CRITICAL gates | **PASS** | 6 guarded fields verified |

---

## Recommended Actions

1. **Fix C1 (blocking):** Update `withMeta` in `schema-parity.js` to use `globalRegistry`.
2. **Re-run tests** after fix to confirm no regressions.
3. **Verify descriptions** in a sample `tools/list` MCP call post-fix.
4. **Consider H2:** Add `brand`/`catch`/`readonly` passthrough to `buildParitySchema` for future-proofing.
5. **Clean M1:** Align `boolean-semantic-guards.test.js` union with production (`z.boolean(), z.string()` only).

---

## Unresolved Questions

None blocking.

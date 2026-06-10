---
phase: 3
title: "Patch Error Discoverability (TDD)"
status: pending
priority: P2
effort: "0.75h"
dependencies: ["1"]
---

# Phase 3: Patch Error Discoverability (TDD)

## Overview

When `meta_state_patch` rejects a patch because the field is in `IMMUTABLE_PATCH_FIELDS`, the current error response only includes `denied_fields` (the offending subset). The operator cannot enumerate the full deny-list from a single error response, forcing a trial-and-error discovery cycle (the trigger for the original `meta-260610T1504Z-...` finding). Fix: add `immutable_fields: [...IMMUTABLE_PATCH_FIELDS]` to the error response so the operator sees the complete deny-list in one call. Also export the `IMMUTABLE_PATCH_FIELDS` Set so the new test can import the same source of truth (prevents drift between deny-list and test).

This phase = brainstorm step 4.

## Requirements

**Functional**:
- `meta_state_patch` error response on `immutable_field` rejection includes both `denied_fields` (offending subset, unchanged) and `immutable_fields` (full deny-list, new).
- `immutable_fields` is an array (not a Set) — the MCP wire layer requires JSON-serializable types.
- The order of `immutable_fields` matches the insertion order of `IMMUTABLE_PATCH_FIELDS` (deterministic; Set preserves insertion order in JS).
- `IMMUTABLE_PATCH_FIELDS` is exported from `meta-state-patch-tool.js` so tests can import the source of truth.

**Non-functional**:
- Backward compat: existing tests asserting `denied_fields` still pass.
- The deny-list itself is unchanged (it's a feature, not a bug). Only the error response shape changes.
- No new deny-list fields added/removed.

## Architecture

```
IMMUTABLE_PATCH_FIELDS (Set, meta-state-patch-tool.js:6-19)
  ↓ export it
  ↓
handler: when patch denied → result.immutable_fields = [...IMMUTABLE_PATCH_FIELDS]
  ↓
test imports the same exported Set → drift-proof
```

## Related Code Files

**Create**:
- `tools/learning-loop-mcp/__tests__/meta-state-patch-immutable-fields.test.js` — new test file (~25 lines, 3 scenarios)

**Modify**:
- `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` — export `IMMUTABLE_PATCH_FIELDS` Set; add `immutable_fields` to error response (+2 lines, +1 export)

**Delete**: none

## Implementation Steps (TDD red → green → verify)

### Step 1: TDD RED — error includes full deny-list
**File**: `tools/learning-loop-mcp/__tests__/meta-state-patch-immutable-fields.test.js` (NEW)

```js
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { metaStatePatchTool, IMMUTABLE_PATCH_FIELDS } from "../tools/meta-state-patch-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
// ... set GATE_ROOT to temp dir, report a finding, attempt patch on `id` field ...

test("immutable_field error response includes full IMMUTABLE_PATCH_FIELDS list", async () => {
  // Setup: GATE_ROOT-isolated temp dir
  // Report a finding via metaStateReportTool
  // Attempt: meta_state_patch({id, entry_kind: "finding", patch: {id: "different"}})
  // Expected: result.patched === false
  //           result.reason === "immutable_field"
  //           result.denied_fields deep-equals ["id"] (backward compat)
  //           Array.isArray(result.immutable_fields) === true
  //           [...result.immutable_fields].sort() deep-equals [...IMMUTABLE_PATCH_FIELDS].sort()
});
```

**Expected**: FAIL — `result.immutable_fields` is `undefined`.

### Step 2: TDD RED — backward compat for `denied_fields`
Same file. Add test:
```js
test("immutable_field error response still includes denied_fields (backward compat)", async () => {
  // Same setup as Step 1
  // Assert: Array.isArray(result.denied_fields)
  //         result.denied_fields.includes("id")
});
```

**Expected**: PASS even before the implementation (the existing code at `meta-state-patch-tool.js:62-69` already returns `denied_fields`). This test is a regression guard for the future.

### Step 3: TDD RED — `immutable_fields` is an array
Same file. Add test (or fold into Step 1):
```js
assert.ok(Array.isArray(result.immutable_fields), "immutable_fields must be an array (wire-format safe)");
```

### Step 4: TDD GREEN — export the Set and add to error response
**File**: `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`

1. Change line 6 from:
   ```js
   const IMMUTABLE_PATCH_FIELDS = new Set([...]);
   ```
   to:
   ```js
   export const IMMUTABLE_PATCH_FIELDS = new Set([...]);
   ```

2. At line 62-72, extend the result object:
   ```js
   const result = {
     patched: false,
     reason: "immutable_field",
     id,
     denied_fields: deniedFields,
     immutable_fields: [...IMMUTABLE_PATCH_FIELDS],
   };
   ```

Run Step 1's test — should pass. Step 2's test should still pass (regression guard).

### Step 5: Run full test suite
```bash
pnpm test
```

Verify zero regressions. New tests pass. Existing `denied_fields` assertions in `meta-state-patch-tool.test.js:212-239` still pass.

## Success Criteria

- [ ] Step 1 immutable_fields test passes
- [ ] Step 2 denied_fields backward-compat test passes
- [ ] Step 3 array-shape test passes
- [ ] `pnpm test` shows 0 regressions
- [ ] `IMMUTABLE_PATCH_FIELDS` is exported (verify with grep: `export const IMMUTABLE_PATCH_FIELDS`)
- [ ] The deny-list itself is UNCHANGED (12 fields, same names)
- [ ] No new dependencies

## Risk Assessment

- **Test drift** — if the test inlines its own copy of the deny-list and the source Set is updated, the test will pass falsely. **Mitigation**: Step 1 imports `IMMUTABLE_PATCH_FIELDS` from the tool file. The test asserts the imported Set matches the response — drift fails the test loud.
- **Wire-format safety** — Set is not JSON-serializable via MCP stdio. **Mitigation**: `[...IMMUTABLE_PATCH_FIELDS]` converts to array before adding to the response.
- **Response size** — adding 12 string field names to a rejection response is negligible (~250 bytes). No concern.
- **Operator UX** — exposing the full deny-list in error responses is an information disclosure concern only if the list contains secrets. **Mitigation**: all 12 fields are operational metadata (identity, audit-trail, version). No secrets. The discoverability win outweighs any theoretical concern.

## Security Considerations

- The deny-list is operational metadata only. No secrets, no PII, no security-sensitive identifiers.
- The full deny-list is already implicitly documented in the tool's description (line 23 of `meta-state-patch-tool.js`) and in the JSDoc on the Set. Making it explicit in the error response is consistency, not new exposure.

## Next Steps

After Phase 3 ships and CI passes, proceed to Phase 4 (hint + backfill + ack). Phase 4 is the operator-facing closeout: discoverability hint, real-registry backfill, and acking the two findings that triggered this work.

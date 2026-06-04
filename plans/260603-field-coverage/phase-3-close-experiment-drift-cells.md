---
phase: 3
title: "Close 9 experiment drift cells (writer + tools + bridge-2)"
status: pending
priority: P2
effort: "0.5d"
dependencies: [0, 1, 2]
---

# Phase 3: Close 9 experiment drift cells (writer + tools + bridge-2)

## Overview

The biggest-closure phase. Closes 9 of the 13 drift cells (all 9 experiment cells from the verification report's enumeration). The fixes are 1-3 lines each but span 3 layers (writer, tool, bridge). The most important cell is the SP2 cook gap (`experiment.verification.assertion_refs`): the writer, the update tool's `verification` block, and the bridge-2 draft builder must all populate this field. After this phase, `field-drift-exceptions.yaml` shrinks from 13 → 4 (the 3 risk cells + 1 observation value-set cell, all closed in Phase 4).

TDD-first: 1 new test in `__tests__/bridge-2-unit.test.js` (asserting `draft.verification.assertion_refs`) is added first. The bridge-2 path is updated. The writer is updated. The update tool is updated. The full test suite passes at each step.

## Why This Phase Exists

The 9 experiment cells are the loudest drift. The SP2 cook hit cell 7 (`verification.assertion_refs`) and the cook journal documented the deferred fix. This phase ships the fix and the 8 silent cells. The bridge-2 path is fixed in lockstep because R5 from the verification report showed that fixing only the writer would leave the draft-preview (`auto_create: false` mode) inconsistent with the persisted record.

The `experimentDimensions` change (cell 9) is the most complex: it requires adding `"product"` to the validator's Set and adding per-dimension handling for product (which connects to decision approval, not experiment proof). The verification report's R2 noted that the validator's `continue` on unknown dimensions silently hides drift; the new test pins the new behavior.

## Requirements

### Functional

- 9 cells fixed:
  1. `experiment.notes` (writer + create tool)
  2. `experiment.scope` (update tool)
  3. `experiment.claim_refs` (top, update tool)
  4. `experiment.risk_refs` (top, update tool)
  5. `experiment.output_level` (update tool)
  6. `experiment.output_capture` (remove from schema OR add passthrough; decision deferred)
  7. `experiment.verification.assertion_refs` (writer + update tool + bridge-2) [SP2 GAP]
  8. `experiment.assertion_refs` (top, update tool)
  9. `experiment.verification.proves.dimension` (update tool + validator) [NEW]
- `core/experiment-writer.js#buildExperimentYaml` populates `verification.assertion_refs` from top-level `assertion_refs`.
- `core/candidate-to-experiment/experiment-draft-builder.js` populates `verification.assertion_refs` in the draft.
- `tools/update-experiment-record-tool.js`'s `verification` block exposes `assertion_refs`.
- `tools/update-experiment-record-tool.js`'s top-level exposes `scope, claim_refs, risk_refs, output_level, assertion_refs`.
- `tools/create-experiment-record-tool.js` exposes `notes`.
- `core/claim-verification-rules.js#experimentDimensions` includes `"product"`.
- `core/claim-verification-rules.js#validateExperimentProves` handles the product dimension (decision approval, not experiment proof).
- `__tests__/bridge-2-unit.test.js` asserts `draft.verification.assertion_refs`.

### Non-Functional

- 1 new assertion in the existing bridge-2 test (test count unchanged; new assertion added to existing `it` block).
- 0 new test files in this phase.
- 573 pre-existing + 19 Phase 0 + 5 Phase 2 = 597 tests still pass.
- The 9 cells are removed from `field-drift-exceptions.yaml` (13 → 4).

## Architecture

### Cell 1: `experiment.notes`

`core/experiment-writer.js#buildExperimentYaml` currently does not have a `notes` key. Add:

```js
...(notes ? { notes } : {}),
```

`tools/create-experiment-record-tool.js` schema block: add:

```js
notes: z.string().optional().describe("Additional notes to append"),
```

(The Phase 1 refactor of the create tool already exposes `notes` via the sidecar; the cook just needs to ensure the writer accepts it.)

### Cell 2-5, 8: `experiment.scope`, `claim_refs`, `risk_refs`, `output_level`, `assertion_refs` (top-level) on update tool

`tools/update-experiment-record-tool.js` schema block currently does not expose these top-level fields. After Phase 1's refactor, the schema-derived input includes them; the cook just needs to confirm the handler accepts them. (The Phase 1 `composeUpdateSchema` helper should preserve the top-level fields.)

If Phase 1's refactor inadvertently strips them, the cook adds a `composeUpdateSchema` adjustment. The fix is 1 line per field in the helper.

### Cell 6: `experiment.output_capture` (dormant)

Two options:
- **Option A (preferred):** Remove `output_capture` from the schema (`schemas/experiment.schema.json`, lines 99-110). The field is forward-declared but unused. Removing it also removes the only negative fixture that uses it (`fixtures/negative/invalid-output-capture/`).
- **Option B:** Add a writer passthrough + tool exposure (3 lines). The field becomes usable.

The decision is deferred to the cook: if the operator has plans for `output_capture` in the near term, Option B; otherwise Option A. The plan's success criterion is "either fix"; the test must pass either way.

### Cell 7: `experiment.verification.assertion_refs` (SP2 GAP, the loudest)

Three layers must change:

1. **`core/experiment-writer.js#buildExperimentYaml`:** in the `verification:` block, add:
   ```js
   assertion_refs: assertion_refs || [],
   ```
   (alongside the existing `claim_refs: claim_refs || []`).

2. **`tools/update-experiment-record-tool.js` `verification` block:** add `assertion_refs` to the `zodObjectForProperties` call:
   ```js
   verification: zodObjectForProperties(
     schemas.experiment.properties.verification.properties,
     schemas.experiment.properties.verification.required,
   ).optional().describe("Updated verification block"),
   ```
   The schema-derived zod for the `verification` block now includes `assertion_refs` (it's in the schema's `verification.properties`).

3. **`core/candidate-to-experiment/experiment-draft-builder.js`:** in the `verification:` block (lines 60-67), add:
   ```js
   assertion_refs: [`record:${assertionId}`],
   ```
   (mirroring the top-level `assertion_refs` assignment at line 67).

4. **`__tests__/bridge-2-unit.test.js:154`:** add an assertion after the existing `draft.assertion_refs` check:
   ```js
   assert.deepStrictEqual(result.draft.assertion_refs, ["record:assertion-valid"]);
   assert.deepStrictEqual(result.draft.verification.assertion_refs, ["record:assertion-valid"]);  // NEW
   ```

### Cell 9: `experiment.verification.proves.dimension` (NEW)

`core/claim-verification-rules.js:4`:
```js
export const experimentDimensions = new Set(["static", "install", "runtime", "product"]);
```

`core/claim-verification-rules.js:95` (the silent-skip):
```js
for (const proof of verification.proves) {
  if (!experimentDimensions.has(proof.dimension)) continue;  // OLD: silent skip
  // After the Set update (adding "product"), this `continue` is NOT reached for "product";
  // the existing logic runs and is correct for the product dimension:
  // - validateHumanApproval returns immediately (humanApprovedDimensions has only install+runtime)
  // - No other dimension-specific check matches "product" (static, install, runtime branches)
  // - The product proof is silently accepted; the claim-side validator (validateTargetDimensions)
  //   enforces the decision-approval requirement for product-dimension claims.
  if (proof.dimension === "static" && proof.scope !== undefined) { ... }
  // ... rest unchanged
}
```

The change is **the Set update only** (adding `"product"` to `experimentDimensions`). No new code is needed for the validator; the existing `validateHumanApproval` correctly returns for `"product"` (the `humanApprovedDimensions` set contains only `["install", "runtime"]`), and the product-dimension validation lives in `validateTargetDimensions` (line 124+) on the claim side. Per red-team m1, the explicit `if (proof.dimension === "product") continue;` line shown in earlier drafts is **NOT needed** — the Set update alone is correct.

`tools/update-experiment-record-tool.js` line 30: add `"product"` to the `dimension` enum:
```js
dimension: z.enum(["static", "install", "runtime", "product"]).describe("Verification dimension"),
```

The Phase 1 refactor of the update tool already derives the enum from the schema (which has 4 values). The cook just needs to confirm the schema's enum is the source of truth; no manual change needed if Phase 1 is correct.

## TDD Workflow

### Step 1: Bridge-2 test extension (RED)

Read `__tests__/bridge-2-unit.test.js` (line 154). Add 1 assertion after the existing `draft.assertion_refs` check. The assertion is:
```js
assert.deepStrictEqual(result.draft.verification.assertion_refs, ["record:assertion-valid"]);
```

Run the bridge-2 test: it FAILS (the draft builder doesn't populate `verification.assertion_refs` yet). This is the RED state.

### Step 2: Update `core/candidate-to-experiment/experiment-draft-builder.js` (GREEN)

Add `assertion_refs: [`record:${assertionId}`]` to the draft's `verification` block (line 60-67). Run the bridge-2 test: it PASSES.

### Step 3: Update `core/experiment-writer.js#buildExperimentYaml` (no new test; regression-safety)

Add `assertion_refs: assertion_refs || []` to the `verification` block. Run the full test suite: still 597 pass (the change is additive; the writer accepts the top-level `assertion_refs` from the create tool, and now also populates `verification.assertion_refs`).

### Step 4: Confirm the update tool's `verification` block (no new test; regression-safety)

After Phase 1's refactor, the `verification` block is derived from the schema's `verification.properties` via `zodObjectForProperties(...)`. The schema has `assertion_refs` in `verification.properties`, so the tool already exposes it. No manual change.

If Phase 1's refactor is missing the `assertion_refs` field, the cook adds it. The fix is 1 line in the `composeUpdateSchema` helper (or wherever the verification block is constructed).

### Step 5: Close cells 1-6, 8, 9 (regression-safety only)

For each cell:
- Apply the 1-3 line fix.
- Run the full test suite to confirm no regression.
- The `__tests__/field-coverage.test.js` exceptions-count test must still pass (it asserts 13 entries; we don't remove them yet).

### Step 6: Update `field-drift-exceptions.yaml`

Remove the 9 experiment cells. The exceptions list shrinks from 13 → 4. Update the `EXPECTED_EXCEPTIONS` constant in `__tests__/field-coverage.test.js` to 4. Run the test: PASSES.

### Step 7: Verify

- `pnpm test` — confirm 597 pass, 0 fail (no new tests; the 9 fixes are atomic).
- `pnpm validate:records` — confirm 183 records, 0 errors. (The cook can now successfully create a new experiment record with `assertion_refs` and have it validate.)
- `pnpm validate:plan-loop` — confirm 74 plans, 0 violations.

## Implementation Steps

1. Read `__tests__/bridge-2-unit.test.js` (line 154) to find the insertion point.
2. Add 1 assertion: `assert.deepStrictEqual(result.draft.verification.assertion_refs, ["record:assertion-valid"]);`.
3. Run `pnpm test -- __tests__/bridge-2-unit.test.js` — confirm 1 test FAILS (RED).
4. Read `core/candidate-to-experiment/experiment-draft-builder.js` (lines 56-72).
5. Add `assertion_refs: [`record:${assertionId}`]` to the `verification` block.
6. Run the bridge-2 test — confirm it PASSES (GREEN).
7. Read `core/experiment-writer.js` (lines 16-50).
8. Add `assertion_refs: assertion_refs || []` to the `verification` block.
9. Run `pnpm test` — confirm 597 pass, 0 fail.
10. (Optional, if needed) Add `notes` to the writer's output and the create tool's schema.
11. (Optional, if needed) Confirm the update tool's top-level `scope, claim_refs, risk_refs, output_level, assertion_refs` are exposed (Phase 1's refactor should handle this; the cook verifies).
12. (Optional, if needed) Add `"product"` to `experimentDimensions` in `core/claim-verification-rules.js:4`.
13. (Optional, if needed) Confirm the update tool's `dimension` enum includes `"product"` (Phase 1's refactor should handle this).
14. (Decision: Option A or B for `output_capture`) Apply the chosen fix.
15. Update `schemas/field-drift-exceptions.yaml`: remove the 9 experiment entries.
16. Update `__tests__/field-coverage.test.js`: change `EXPECTED_EXCEPTIONS` from 13 to 4.
17. Run `pnpm test` — confirm 597 pass, 0 fail.
18. Run `pnpm validate:records` — confirm 183 records, 0 errors. Try a `record_create_experiment` with `assertion_refs` — should now succeed.
19. Run `pnpm validate:plan-loop` — confirm 74 plans, 0 violations.

## Related Code Files

### Modify (5 files)
- `tools/learning-loop-mcp/core/experiment-writer.js` (add `assertion_refs: assertion_refs || []` to verification block; optionally add `notes`)
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` (add `assertion_refs` to draft's verification block)
- `tools/learning-loop-mcp/core/claim-verification-rules.js` (add `"product"` to `experimentDimensions`)
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` (Phase 1 refactor; verify `notes` is exposed)
- `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` (Phase 1 refactor; verify all 5 top-level fields + `verification.assertion_refs` are exposed; verify `dimension` enum has 4 values)
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` (add 1 assertion)
- `schemas/field-drift-exceptions.yaml` (remove 9 entries)
- `__tests__/field-coverage.test.js` (update `EXPECTED_EXCEPTIONS` to 4)
- (Optional) `schemas/experiment.schema.json` (Option A: remove `output_capture` lines 99-110; Option B: no change)

### Read
- `tools/learning-loop-mcp/core/experiment-writer.js` (lines 16-50)
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` (lines 56-72)
- `tools/learning-loop-mcp/core/claim-verification-rules.js` (lines 1-120)
- `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` (lines 13-37, especially the `verification` zod block)
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` (lines 11-22, after Phase 1's refactor)
- `schemas/experiment.schema.json` (lines 99-110 for `output_capture`; lines 121-128 for `verification.assertion_refs`)

### Delete
- (Optional, Option A only) `tools/learning-loop-mcp/fixtures/negative/invalid-output-capture/` (and remove the entry from `core/negative-fixture-runner.js#cases`)

## Success Criteria

- [ ] All 9 experiment drift cells are fixed
- [ ] `__tests__/bridge-2-unit.test.js` asserts `draft.verification.assertion_refs`
- [ ] The new assertion passes
- [ ] 597 pre-existing tests still pass
- [ ] `pnpm test` shows 597 pass, 0 fail
- [ ] `field-drift-exceptions.yaml` has 4 entries (was 13)
- [ ] `__tests__/field-coverage.test.js` exceptions-count test passes with 4
- [ ] `pnpm validate:records` passes; a test `record_create_experiment` call with `assertion_refs` succeeds
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The bridge-2 unit test extension may fail if the writer change is not also made. | The writer change is in Step 8; the test passes once both the draft builder AND the writer are updated. The full test suite runs after each step. |
| The `experimentDimensions` Set change may break existing records that have a `product` proof. | No current record has a product proof (the schema allowed it; the tool did not). The Set change is additive. |
| The `output_capture` decision (Option A vs B) affects the negative fixture `invalid-output-capture/`. | If Option A is chosen, the fixture is deleted and the runner's `cases` entry is removed. The runner test count drops by 1 (to 27 negative fixtures); the count test in the runner's test file may need updating. |
| The writer's `verification` block change (adding `assertion_refs`) may break records that have `verification.proves` with non-empty entries — the new `assertion_refs` would be empty for those. | The validator's `validateExperimentProves` already accepts `verification.assertion_refs` falling back to `verification.claim_refs` (line 75 of claim-verification-rules.js). Empty `assertion_refs` is allowed when `claim_refs` is non-empty. The 183 existing records are unaffected. |
| The `composeUpdateSchema` helper from Phase 1 may not preserve all 5 top-level fields (`scope, claim_refs, risk_refs, output_level, assertion_refs`). | The cook verifies the helper's output by running the field-coverage test. If the test fails, the helper is fixed (1-2 lines). |
| The `experiment.notes` field is required by the schema but is not in the writer's output today. Removing the `required` constraint is one option; adding the writer passthrough is another. | The cook adds the writer passthrough (`...(notes ? { notes } : {})`). The schema's `required` is not modified. |
| The `output_capture` Option A (schema removal) breaks the 1 negative fixture that depends on it. | The runner's cases list is updated to remove the entry. The 27 remaining negative fixtures continue to pass. |
| The `experimentDimensions` Set change to include `"product"` may need a corresponding `validateProductDimension` function for experiment-side validation. | The product-dimension validation is on the CLAIM side (validateTargetDimensions, line 124+). Experiments with a product proof are forward-declarations; the claim-side validator handles the actual approval. No new experiment-side validation is needed. |
| The 9 fixes are applied in 9 atomic steps; the test suite must pass after each. | The cook runs `pnpm test` after each fix. If a regression appears, the fix is rolled back. |
| The `__tests__/field-coverage.test.js` EXPECTED_EXCEPTIONS constant change is a code review decision. | The constant change is a single line; the diff is reviewable. The test fails loudly if the constant is wrong. |
| The bridge-2 test currently uses `assertion-valid` as the assertion ID. The new assertion uses the same ID. | The test data is consistent; the new assertion is a copy of the existing one with `verification.` prefix. |

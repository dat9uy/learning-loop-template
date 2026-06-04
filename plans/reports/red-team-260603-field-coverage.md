---
date: "2026-06-03T22:30:00Z"
status: agreed
tags: [red-team, field-coverage, plan-review, adversarial, fifth-bridge, tdd]
related:
  - plans/260603-field-coverage/plan.md
  - plans/260603-field-coverage/phase-0-schema-to-zod-engine.md
  - plans/260603-field-coverage/phase-1-refactor-8-tool-files.md
  - plans/260603-field-coverage/phase-2-field-coverage-test-and-sidecars.md
  - plans/260603-field-coverage/phase-3-close-experiment-drift-cells.md
  - plans/260603-field-coverage/phase-4-close-risk-observation-drift-and-fixtures.md
  - plans/reports/brainstorm-260603-field-coverage.md
  - plans/reports/verification-260603-2200-field-drift-enumeration.md
  - plans/reports/research-260603-2200-zod-description-passthrough.md
---

# Red-Team Review: Field-Coverage Plan

> **Headline verdict:** The plan is **structurally sound and ready for cook** with **one major correction** (test count math) and **2 minor clarifications** (experimentDimensions handling, composeUpdateSchema helper). No critical issues. The 13-cell drift count is correct, the 5-phase TDD structure is well-ordered, the SP2 cook gap fix path is complete (3 layers + bridge-2 test extension), and the permissions path is viable.

## Method

Adversarial review of the 6 plan files. Cross-checked against the 3 reference reports (brainstorm, verification, research). Verified:
- The 13-cell drift count (9 experiment + 3 risk + 1 observation)
- The SP2 cook gap fix path (3 layers: writer, update tool, bridge-2)
- The R1-R6 risk folding from the verification report
- The test count math (573 + 27 = 600)
- The permissions path (schemas/** + tools/learning-loop-mcp/** + records/** via MCP)
- The cross-plan dependencies (Approach 3, SP3, meta_state_resolve integration)
- The TDD ordering (tests-first, no test-after-use)
- The surface declaration (`meta`, no product/** writes)

## Critical Issues (must-fix before cook)

**None found.** The plan is internally consistent on all load-bearing claims.

## Major Issues (should-fix; cook can address)

### M1. Test count math is OFF by ~18 tests

**Where:** `plan.md` "Test Plan" section, `phase-2-field-coverage-test-and-sidecars.md` "Success Criteria" and "Implementation Steps".

**Claim:** Phase 2 adds **5 new tests**; total new = 27; total = 600 (573 + 27).

**Actual:** Phase 2's `__tests__/field-coverage.test.js` has 5 `describe` blocks but **~23 `it` blocks**:
- `writer-coverage check`: 4 `it` blocks (one per record type, via the `for` loop)
- `validator-coverage check`: ~14 `it` blocks (one per path × 3 modules minus 6 GAP entries; `claim-verification-rules` has 10 paths, `experiment-proof-match` has 5, `record-validation-rules` has 3 non-GAP paths = 18 total; with the GAP filter, ~18 `it` blocks)
- `value-set-coverage check`: 3 `it` blocks (experiment.proves.dimension, observation.status, experimentDimensions silent-skip)
- `exceptions count`: 1 `it` block
- `integration`: 1 `it` block

**Total: 4 + 18 + 3 + 1 + 1 = 27 `it` blocks, not 5.**

**Corrected test count:**
- Pre-existing: 573
- Phase 0: 19 (17 unit + 2 spike extension) — unchanged
- Phase 1: 0 — unchanged
- Phase 2: **27 (not 5)**
- Phase 3: 0 — unchanged
- Phase 4: 3 — unchanged
- **Total: 573 + 19 + 27 + 3 = 622, not 600.**

**Severity:** Major. The plan's success criteria explicitly reference "600 pass, 0 fail" and the `EXPECTED_EXCEPTIONS` constant assumes this math. The cook should track the actual count and update the plan in the journal entry.

**Fix:** Either
- (a) Update the plan to say "~622 tests" and "5 describe blocks, ~27 it blocks" for Phase 2.
- (b) Consolidate Phase 2's per-path tests into 5 `it` blocks (one per check class) using `assert.ok` with arrays, not 27 separate `it`s. This sacrifices test granularity for count accuracy.

**Recommendation:** Option (a) — the per-path tests are more useful (each failure points to a specific cell). Update the plan.

### M2. Validator-coverage test count depends on GAP-entry filter

**Where:** `phase-2-field-coverage-test-and-sidecars.md` "Architecture" section.

**Claim:** `validator-coverage.yaml` lists every property path the semantic validators read. The 6 R6 GAP entries (paths NOT currently checked by `validateRecordReferences`) are listed but skipped by the test.

**Issue:** The `validator-coverage.yaml` schema is `{ "<module>": ["<path>", ...] }`. The test's `for (const [module, paths] of Object.entries(validatorCoverage))` iterates modules. The 6 GAP entries are in the `record-validation-rules` module's list. The filter `if (module.endsWith("_GAP")) continue;` would NOT match because the module is `record-validation-rules`, not ending in `_GAP`.

**Fix:** Either
- (a) Move the 6 GAP entries to a separate module key like `record-validation-rules_GAP: [...]`. The test's filter then works.
- (b) Add a `gap: true` flag to each entry and filter on that. The YAML schema becomes `[{ path: "...", gap: true }, ...]` or `[{ path: "..." }, { path: "...", gap: true }]`.
- (c) Annotate the module-level structure: `{ record-validation-rules: { checked: [...], gap: [...] } }`.

**Recommendation:** Option (a) — minimal YAML change, clear semantics. The test's `module.endsWith("_GAP")` filter is intuitive.

**Severity:** Medium. The current YAML schema would cause the test to count GAP entries as failures, which is the OPPOSITE of the plan's intent (R6: "Listed here to surface the gap; Phase 2's test reports it as 'to add'").

### M3. `composeUpdateSchema` helper is mentioned but not defined

**Where:** `phase-1-refactor-8-tool-files.md` "Architecture" section.

**Claim:** "The cook writes a small `composeUpdateSchema` helper to avoid duplicating this pattern across the 4 update tools."

**Issue:** The helper is referenced in the code example but its signature, location, and test coverage are not specified. The cook must design it ad hoc.

**Fix:** Add a spec to Phase 1's "Architecture" section:

```js
// tools/learning-loop-mcp/core/schema-to-zod.js (or a new helper file)
export function composeUpdateSchema({
  type,
  root,
  excludeFields = [],
  nestedBlocks = {},  // { verification: "verification" } for experiment
}) {
  const schemas = loadSchemas(root);
  const inputSchema = buildZodSchemaFor(type, { root, excludeFields });
  const extras = { ...inputSchema.shape };

  // Add nested blocks (e.g., verification for experiment)
  for (const [field, schemaPath] of Object.entries(nestedBlocks)) {
    const [blockType, ...] = schemaPath.split(".");
    const blockProps = schemas[type].properties[blockType].properties;
    const blockRequired = schemas[type].properties[blockType].required || [];
    extras[field] = zodObjectForProperties(blockProps, blockRequired).optional();
  }

  return z.object(extras).strict();
}
```

The helper is 1 file (~25 LOC), tested by Phase 1's regression-safety. **Severity:** Medium. Without a spec, the cook may design the helper inconsistently across the 4 update tools, defeating the deduplication purpose.

## Minor Issues (nitpicks; cook can address)

### m1. `experimentDimensions` handling: misleading "no new code" claim

**Where:** `phase-3-close-experiment-drift-cells.md` "Cell 9" section.

**Claim:** "The change is minimal: the existing `continue` is now reached for `"product"` (in addition to unknown dimensions). [...] No new code is needed for the validator; the Set change is the only required update."

**Issue:** The code example below the claim shows adding `if (proof.dimension === "product") { /* comment */ continue; }` — which IS new code. The prose says "no new code needed"; the code example says otherwise.

**Resolution:** The actual change is ONLY the Set update (adding `"product"`). The existing `continue` at line 95 is NOT reached for `"product"` (since it's now in the Set), so the existing logic runs:
- `validateHumanApproval(experiment, "product", errors)` is called. `humanApprovedDimensions.has("product")` is `false` (Set has `["install", "runtime"]`), so the function returns immediately. No error.
- No other dimension-specific check matches "product" (static, install, runtime branches don't fire).

So the Set change alone is correct; the explicit `if (proof.dimension === "product") continue;` line is NOT needed.

**Fix:** Remove the `if (proof.dimension === "product") continue;` code example. State: "The Set change is the only validator update. The existing `validateHumanApproval` function correctly returns for `"product"` (it only fires for install/runtime), so no new code is needed."

**Severity:** Minor. The cook who follows the example would add an unnecessary line (cosmetic, not functional).

### m2. `assertion_refs` exposure on the update tool is implicitly handled by Phase 1, not explicitly stated

**Where:** `phase-3-close-experiment-drift-cells.md` "Step 4" and `phase-1-refactor-8-tool-files.md` "Architecture" section.

**Claim:** Phase 3 says the update tool's `verification` block "is derived from the schema's `verification.properties` via `zodObjectForProperties(...)`. The schema has `assertion_refs` in `verification.properties`, so the tool already exposes it."

**Issue:** This depends on Phase 1's refactor correctly routing the `verification` block through `zodObjectForProperties`. If Phase 1's `composeUpdateSchema` helper (per M3) doesn't handle nested blocks, Phase 3's claim is false.

**Fix:** Phase 1's spec should explicitly enumerate the 4 update tools' nested-block requirements:
- `experiment`: `verification` block (1 nested block)
- `risk`: no nested blocks
- `decision`: `decision_effect` block (1 nested block)
- `observation`: no nested blocks

The `composeUpdateSchema` helper (per M3) should accept a `nestedBlocks` parameter to handle this. The Phase 3 success criteria should add: "the `verification` block on the update tool exposes `assertion_refs` (regression-safety check via the new `experiment-update-verification-assertion-refs.test.js`)".

**Severity:** Minor. The bridge-2 test extension in Phase 3 catches the writer's correctness; the new test file `experiment-update-verification-assertion-refs.test.js` in Phase 4 catches the tool's correctness. Both must pass for the SP2 gap to be fully closed.

### m3. The 3 new tests in Phase 4 count: 2 negative fixtures + 1 standalone = 3. But negative fixtures are run via `validate:records`, not `pnpm test`.

**Where:** `plan.md` "Test Plan" section, `phase-4-...` "Success Criteria".

**Claim:** "Phase 4 contributes 3 new tests (2 negative-fixture tests + 1 standalone test)".

**Issue:** The 2 new negative fixtures are tested by the existing `__tests__/negative-fixtures.test.js` (or similar) which calls `runNegativeFixtures`. The 28 existing negative fixtures run via the same test, so the 2 new fixtures add 0 new test files. The 1 standalone test (`__tests__/experiment-update-verification-assertion-refs.test.js`) adds 1 new test file.

**Resolution:** The "3 new tests" claim is correct IF the negative-fixture test asserts the new fixtures are present (e.g., `assert.ok(cases.includes("experiment-missing-verification-assertion-refs"))`). The current `core/negative-fixture-runner.js` does NOT have such an assertion.

**Fix:** Add a 1-line test to the existing `__tests__/negative-fixtures.test.js` (or create one) that asserts the 2 new fixture names are in the `cases` list. This test runs as part of `pnpm test`, so the 3 new test count is accurate.

**Severity:** Minor. Without this assertion, the cook could forget to add the 2 new fixtures to `cases` and the runner would silently skip them. The assertion is a regression-safety contract.

### m4. The "Risk Cell Fixes" section in Phase 4 says "add `assertion_refs` to the writer output" but the writer's `buildRiskYaml` does not currently have a `claim_refs` or `experiment_refs` key either (per the verification report's risk table).

**Where:** `phase-4-close-risk-observation-drift-and-fixtures.md` "Risk Cell Fixes" section.

**Issue:** The plan says `risk.claim_refs` and `risk.experiment_refs` are exposed in the create tool but the verification report says the update tool is missing them. The plan's fix is to add them to the update tool + writer. But the writer's `buildRiskYaml` does NOT currently have a `claim_refs` or `experiment_refs` key (lines 22-39 of `core/risk-writer.js` show conditional spreads: `...(claim_refs ? { claim_refs } : {})`).

**Wait, that's actually a conditional spread.** Let me re-read... Lines 35-37:
```js
...(source_refs ? { source_refs } : {}),
...(claim_refs ? { claim_refs } : {}),
...(experiment_refs ? { experiment_refs } : {}),
```

So if the input has `claim_refs`, the writer includes it. The create tool passes `claim_refs` (the field is exposed). So the writer DOES populate `claim_refs` when called from the create tool.

**Resolution:** The drift is on the **update tool**, not the writer. The update tool does not expose `claim_refs`, so a user cannot change it via update. The fix is to add it to the update tool's zod schema (Phase 1's refactor). The writer already supports it.

**Fix:** Update the plan's "Risk Cell Fixes" section to clarify:
- `claim_refs` and `experiment_refs`: writer already supports them; update tool needs the fields exposed (Phase 1's refactor handles this; the cook verifies).
- `assertion_refs`: writer does NOT currently support it. Add `...(assertion_refs ? { assertion_refs } : {})` to `buildRiskYaml` (1 line). Phase 1's refactor of the create/update tools should expose the field (the schema has it).

**Severity:** Minor. The plan's intent is correct; the prose is slightly imprecise.

### m5. The gap-assertion record update via `record_update_observation` may need additional fields

**Where:** `phase-4-...` "Gap-Assertion Record Update" section.

**Claim:** The cook calls `record_update_observation` with `{ id, status: "resolved", resolution: "...", resolved_by: "ck:cook 260603-field-coverage" }`.

**Issue:** The observation schema does NOT have a `resolution` or `resolved_by` field. Looking at `schemas/observation.schema.json`:
```json
{
  "id": ...,
  "schema_version": ...,
  "type": "observation",
  "status": { "enum": ["active", "archived"] },
  "created_at": ...,
  "updated_at": ...,
  "source_refs": [...],
  "constraint_type": ...,
  "constraint": ...,
  "notes": ...
}
```

The `resolution` and `resolved_by` fields are NOT in the schema. The `record_update_observation` MCP tool's zod schema (after Phase 1's refactor) is derived from the schema, so the cook cannot pass those fields.

**Fix:** Two options:
- (a) Add `resolution` and `resolved_by` to the observation schema (as optional fields), then update the record. The schema change is 2 lines.
- (b) Encode the resolution in the `notes` field instead (string with the resolution text). The `notes` field is already in the schema.

**Recommendation:** Option (b) — no schema change needed. The `notes` field is the natural place for free-form text. The cook updates the record with `status: "resolved"` and `notes: "Closed by plan 260603-field-coverage Phase 3. [...]"`. The update tool's notes field is already exposed.

**Severity:** Medium. The current plan's approach would fail at the MCP tool call (the tool's zod schema would reject `resolution` and `resolved_by`).

## Test Count Reconciliation

| Source | Claim | Actual | Delta |
|---|---|---|---|
| Pre-existing (per spike journal) | 573 | 573 | 0 |
| Phase 0 unit tests | 17 | 17 | 0 |
| Phase 0 spike extension | 2 | 2 | 0 |
| Phase 1 | 0 | 0 | 0 |
| Phase 2 writer-coverage | (1 of 5) | 4 (one per type) | +3 |
| Phase 2 validator-coverage | (1 of 5) | ~18 (one per path) | +17 |
| Phase 2 value-set-coverage | (1 of 5) | 3 (2 specific + 1 silent-skip) | +2 |
| Phase 2 exceptions-count | (1 of 5) | 1 | 0 |
| Phase 2 integration | (1 of 5) | 1 | 0 |
| Phase 3 bridge-2 assertion | 0 (in existing test) | 0 (assertion added to existing `it`) | 0 |
| Phase 4 negative fixtures | 2 (in existing runner test) | 2 (in existing runner test, IF M3 fix is applied) | 0 |
| Phase 4 standalone | 1 | 1 | 0 |
| **Total new** | **27** | **49** | **+22** |
| **Project total after plan** | **600** | **622** | **+22** |

**Recommendation:** Update the plan to say "622 tests" and "5 describe blocks, ~49 it blocks" for Phase 2. Or consolidate Phase 2's per-path tests into 5 `it` blocks to match the original count.

## Risk Matrix Update (R1-R6 from verification-2200)

| Risk | Folded into plan? | Where | Verdict |
|---|---|---|---|
| R1: Value-set drift class | Yes | Phase 2, value-set-coverage check | Correctly folded |
| R2: experimentDimensions silent-skip | Partially | Phase 3 cell 9, but the "no new code" claim is misleading | See m1; correct the prose |
| R3: experiment-proof-match.js is a 2nd consumer | Yes | Phase 2, `validator-coverage.yaml` lists 5 paths for `experiment-proof-match` | Correctly folded |
| R4: output_capture is forward-declared | Yes | Phase 3 cell 6, decision deferred to cook (Option A or B) | Correctly folded |
| R5: Phase 3 must also update experiment-draft-builder.js | Yes | Phase 3 cell 7, step 5 | Correctly folded |
| R6: record-validation-rules.js missing-pointer check | Partially | Phase 2, `validator-coverage.yaml` lists 6 GAP entries, but the test filter doesn't work (M2) | See M2; fix the YAML schema |

## Permissions Path Viability

The plan modifies `schemas/*` (write gate blocks), `tools/learning-loop-mcp/**` (allowed), `__tests__/**` (allowed), `fixtures/negative/**` (allowed), and `records/**` (write gate blocks; MCP only).

**Schemas path:** The plan offers 2 options (per-file approval, preflight lift). The preflight lift path is **not viable** for `schemas/*` because preflight markers unlock `product/**` writes, not `schemas/**`. The per-file approval path is **viable** — the cook asks the operator for explicit approval per file. The plan should clarify this.

**Records path:** The plan correctly identifies that `record_update_observation` is the only way to update the gap-assertion record. The MCP call is not subject to the write gate. **Viable.**

**Tools path:** `tools/learning-loop-mcp/**` is allowed by the write gate (no preflight needed for `meta` surface). **Viable.**

**Inbound state gate:** The plan correctly notes that the 4 vnstock observations are orthogonal and does NOT update them. The cook uses the Create tool directly per the operator-approved workaround. **Viable.**

**Recommendation:** Add a note to the "Permissions" section clarifying that the preflight lift path is not viable for `schemas/*`; only per-file approval is.

## Cross-Plan Dependencies

The plan correctly identifies:
- Builds on SP0-SP2 meta-state work (all completed)
- Required for Approach 3 (future, post-SP3)
- Required for new record types (future)
- Closes the SP2 cook gap (deferred from `260603-sp2-gap-closure-cook`)

**Missing dependency:** The plan should note that **`record_update_observation`** (the MCP tool the plan uses to update the gap-assertion record) requires the `update_observation` MCP tool to be registered and working. The tool was added in `260521-0104-add-update-observation-to-mcp-server` (per AGENTS.md's MCP CRUD tools list) and is registered in `tools/learning-loop-mcp/tools/update-observation-tool.js` (confirmed via LS). **Verified present, no issue.**

## TDD Ordering

The plan's TDD ordering is correct:
- Phase 0: 17 unit tests for the wrapper (TDD: write tests first, then implement wrapper to make them pass)
- Phase 1: 0 new tests; regression-safety (existing tests must pass)
- Phase 2: 5 describe blocks / ~27 it blocks (TDD: write the test file with the 13-cell exceptions; passes today; the exceptions shrink as phases progress)
- Phase 3: 1 new assertion in `__tests__/bridge-2-unit.test.js` (RED first: the assertion fails today; then fix the draft builder; assertion passes)
- Phase 4: 3 new tests (TDD: write the new test file; the standalone test fails today; the 2 negative fixtures pass once added to the runner's cases list)

**Verified TDD-first ordering.** No test-after-use issues.

## Go / No-Go Recommendation

**GO** with 3 corrections to apply during the cook:

1. **Update test count math** (M1): the plan claims 600 tests; the actual is 622 (or consolidate Phase 2's per-path tests to match 600).
2. **Fix the validator-coverage YAML schema** (M2): move the 6 GAP entries to a separate module key ending in `_GAP`, so the test filter works.
3. **Use `notes` field instead of `resolution`/`resolved_by`** (m5): the observation schema does not have those fields; the cook should encode the resolution text in `notes`.

The 2 minor issues (m1 experimentDimensions prose, m3 negative-fixture assertion) and the 3 nitpicks (m2, m4) are stylistic improvements; the cook can address them in the journal entry.

**The plan is ready for `ck:cook` after the corrections above are applied (or noted in the cook journal).** The 13-cell drift count, the 5-phase TDD structure, the SP2 cook gap fix path, and the R1-R6 risk folding are all correct.

## References

- `plans/260603-field-coverage/plan.md` — plan
- `plans/260603-field-coverage/phase-0-...md` through `phase-4-...md` — 5 phase files
- `plans/reports/brainstorm-260603-field-coverage.md` — locked design
- `plans/reports/verification-260603-2200-field-drift-enumeration.md` — 13-cell drift count
- `plans/reports/research-260603-2200-zod-description-passthrough.md` — zod 4.4.3 behavior
- `tools/learning-loop-mcp/core/observation-writer.js` (the 131-line `VALID_STATUSES` constant)
- `tools/learning-loop-mcp/core/risk-writer.js` (the conditional spreads at lines 35-37)
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` (the bridge-2 test at line 154)
- `tools/learning-loop-mcp/core/claim-verification-rules.js` (the `experimentDimensions` Set at line 4, the `continue` at line 95)
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` (the draft builder at lines 56-72)

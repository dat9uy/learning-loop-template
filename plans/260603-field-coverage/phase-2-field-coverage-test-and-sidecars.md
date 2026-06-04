---
phase: 2
title: "`__tests__/field-coverage.test.js` + 2 sidecars (TDD, locks the contract)"
status: pending
priority: P2
effort: "0.5d"
dependencies: [0, 1]
---

# Phase 2: `__tests__/field-coverage.test.js` + 2 sidecars (TDD, locks the contract)

## Overview

The contract-locking phase. Adds `schemas/field-drift-exceptions.yaml` (initial 13 cells) and `schemas/validator-coverage.yaml` (enumerates every property path the semantic validators MUST check), and a new `__tests__/field-coverage.test.js` test that asserts the contract on 3 dimensions: writer-coverage, validator-coverage, and value-set-coverage. TDD-first: the 5 new tests are written first, the sidecars are populated, the test passes on the current code with the 13-cell exceptions list.

The phase ships the test infrastructure for Phase 3 and Phase 4 (which fix the 13 cells). After Phase 4, the test passes with an empty `field-drift-exceptions.yaml`. Until then, the exceptions file shrinks from 13 → 0 as phases progress.

## Why This Phase Exists

The plan's central insight: the 4-layer drift class (schema, tool-zod, writer, validator) is detectable by a single test. After Phase 1's refactor, the tool-zod layer is provably consistent with the schema (the wrapper derives it). The remaining 3 layers (writer, tool-zod in special cases, validator) are checked by `field-coverage.test.js`. A new field added to a schema without touching the writer or validator fails the test.

The pre-plan verification report (`verification-260603-2200-field-drift-enumeration.md`) flagged that the brainstorm's framework detects **field-presence drift** but not **value-set drift** (e.g., `experiment.verification.proves.dimension` enum missing `"product"`). The new test's **value-set check** catches the 2 new drift cells. R6 (record-validation-rules.js missing-pointer check) is folded into the `validator-coverage.yaml` sidecar; the test asserts the validator's source matches the declared contract.

## Requirements

### Functional

- `__tests__/field-coverage.test.js` has 5 tests (1 per check class + 1 integration + 1 exceptions-count).
- `schemas/field-drift-exceptions.yaml` is initialized with 13 cells (per the verification report's enumeration).
- `schemas/validator-coverage.yaml` enumerates every property path the semantic validators read.
- The writer-coverage check asserts: for every property in the schema, the writer's `build<Type>Yaml` populates it (or it's in the exceptions file).
- The validator-coverage check asserts: for every property path in `validator-coverage.yaml`, the writer populates the path (or it's in the exceptions file).
- The value-set-coverage check asserts: for every `properties.X.enum` in the schema, the corresponding zod schema in the tool (or the validator's Set constant) declares the exact same set of values (or it's in the exceptions file).
- The exceptions-count test asserts `exceptions.length === 13` (catches silent additions).
- The integration test runs the full coverage matrix and reports the result.

### Non-Functional

- 5 new tests added.
- 573 pre-existing + 19 Phase 0 = 592 tests still pass.
- The new test file is < 350 LOC.
- The sidecars are < 100 LOC combined.

## Architecture

### Sidecar: `schemas/field-drift-exceptions.yaml`

```yaml
# Each entry is { type, path, layer, reason, fixed_in_phase }.
# The list shrinks as phases fix cells; the test asserts the list is empty at end of plan.
#
# type: experiment | risk | decision | observation
# path: dot-separated JSON path to the property (e.g., "verification.assertion_refs")
# layer: which layer is drifting (writer | tool | validator | value-set | all)
# reason: short explanation
# fixed_in_phase: 3 | 4 | null (null = open question, defer to a follow-up)

- { type: experiment, path: notes, layer: create-tool, reason: "no create input", fixed_in_phase: 3 }
- { type: experiment, path: scope, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: claim_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: risk_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: output_level, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: output_capture, layer: all, reason: "dormant; forward-declared", fixed_in_phase: 3 }
- { type: experiment, path: "verification.assertion_refs", layer: writer+update-tool+bridge, reason: "SP2 cook gap", fixed_in_phase: 3 }
- { type: experiment, path: assertion_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: "verification.proves.dimension", layer: update-tool+validator, reason: "missing 'product' in tool enum; validator silent-skip", fixed_in_phase: 3 }
- { type: risk, path: claim_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 4 }
- { type: risk, path: experiment_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 4 }
- { type: risk, path: assertion_refs, layer: all, reason: "dormant; no validator reads it yet", fixed_in_phase: 4 }
- { type: observation, path: status, layer: value-set, reason: "writer allows 'inactive', schema enum is 2 values", fixed_in_phase: 4 }
```

### Sidecar: `schemas/validator-coverage.yaml`

```yaml
# Property paths consumed by the semantic validators. The field-coverage test
# asserts the writer populates every path here (or it's in the exceptions file).
#
# Schema: each top-level key is a module name. Keys ending in "_GAP" are
# paths the validator SHOULD check but does NOT (per R6 from verification-2200).
# The test skips "_GAP" modules (intentional; they are surfaced for future work).

claim-verification-rules:
  - "experiment.verification.assertion_refs"   # PRIMARY reader
  - "experiment.verification.claim_refs"        # fallback
  - "experiment.verification.proves[*].dimension"
  - "experiment.verification.proves[*].scope"
  - "experiment.verification.proves[*].output_level"
  - "experiment.verification.requires_human_approval"
  - "experiment.verification.approval_status"
  - "decision.decision_effect.action"
  - "decision.decision_effect.scope"
  - "decision.decision_effect.affected_refs"
experiment-proof-match:
  - "experiment.verification.assertion_refs"
  - "experiment.verification.claim_refs"
  - "experiment.verification.proves[*].dimension"
  - "experiment.verification.proves[*].scope"
  - "experiment.verification.proves[*].output_level"
record-validation-rules:
  - "decision.decision_effect.affected_refs"
  - "experiment.verification.claim_refs"
  - "experiment.verification.proves[*].claim_ref"
# R6 (verification-2200): the next 6 are NOT currently checked by
# validateRecordReferences. Listed here to surface the gap; the test
# filters out keys ending in "_GAP" so these are NOT counted as failures.
record-validation-rules_GAP:
  - "experiment.claim_refs"
  - "experiment.risk_refs"
  - "experiment.assertion_refs"
  - "risk.claim_refs"
  - "risk.experiment_refs"
  - "risk.assertion_refs"
```

The 6 GAP entries are intentional and live in a separate module key ending in `_GAP`. The test's filter `if (module.endsWith("_GAP")) continue;` correctly skips them. A future plan can add the missing validator checks and remove the `_GAP` key.

### Test: `__tests__/field-coverage.test.js` (~250 LOC)

The test has 5 sub-tests, each in its own `it` block:

```js
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadSchemas } from "#mcp/core/schema-loader.js";
import { buildExperimentYaml } from "#mcp/core/experiment-writer.js";
import { buildRiskYaml } from "#mcp/core/risk-writer.js";
import { buildDecisionYaml } from "#mcp/core/decision-writer.js";
import { buildObservationYaml } from "#mcp/core/observation-writer.js";

const root = join(import.meta.dirname, "..", "..", "..");
const schemas = loadSchemas(root);
const exceptions = parseYaml(readFileSync(join(root, "schemas", "field-drift-exceptions.yaml"), "utf8"));
const validatorCoverage = parseYaml(readFileSync(join(root, "schemas", "validator-coverage.yaml"), "utf8"));

const EXPECTED_EXCEPTIONS = 13;

const writers = {
  experiment: buildExperimentYaml,
  risk: buildRiskYaml,
  decision: buildDecisionYaml,
  observation: buildObservationYaml,
};

const MINIMAL_INPUTS = {
  experiment: { goal: "test", hypothesis: "test", method: ["step"], success_metrics: ["pass"] },
  risk: { risk_statement: "test" },
  decision: { question: "test?", decision: "yes" },
  observation: { constraint_type: "test", constraint: "test", description: "test" },
};

describe("field-coverage — writer-coverage check", () => {
  for (const type of Object.keys(writers)) {
    it(`${type}: every schema property is in writer output (or exceptions)`, () => {
      const writer = writers[type];
      const minimal = MINIMAL_INPUTS[type];
      const result = writer({ ...minimal, surface: "test" });
      const resultKeys = Object.keys(result);
      const schemaKeys = Object.keys(schemas[type].properties || {});
      const typeExceptions = exceptions.filter((e) => e.type === type);
      const missing = [];
      for (const key of schemaKeys) {
        if (key in result) continue;
        if (typeExceptions.some((e) => e.path === key)) continue;
        missing.push(key);
      }
      assert.deepStrictEqual(missing, [], `${type} writer missing: ${missing.join(", ")}`);
    });
  }
});

describe("field-coverage — validator-coverage check", () => {
  for (const [module, paths] of Object.entries(validatorCoverage)) {
    if (module.endsWith("_GAP")) continue;  // skip the R6 gap entries
    for (const path of paths) {
      it(`${module}: writer populates ${path} (or exceptions)`, () => {
        const [type, ...rest] = path.split(".");
        // ... walk the path, assert the writer output has the leaf
        // ... or it's in the exceptions file
      });
    }
  }
});

describe("field-coverage — value-set-coverage check (R1 from verification-2200)", () => {
  it("experiment.verification.proves.dimension: tool enum includes 'product'", () => {
    // Read update-experiment-record-tool.js, find the `dimension:` enum, assert "product" is in it
  });

  it("observation.status: tool refine and writer accept the same set as the schema enum", () => {
    // Read update-observation-tool.js and observation-writer.js, compare to schema
  });

  // ... 1 more test for the experimentDimensions silent-skip (R2)
});

describe("field-coverage — exceptions count", () => {
  it(`field-drift-exceptions.yaml has exactly ${EXPECTED_EXCEPTIONS} entries`, () => {
    assert.strictEqual(exceptions.length, EXPECTED_EXCEPTIONS,
      `Expected ${EXPECTED_EXCEPTIONS} exceptions, found ${exceptions.length}. Update the constant if intentional.`);
  });
});

describe("field-coverage — integration", () => {
  it("runs all 3 check classes and reports pass/fail per cell", () => {
    // Smoke test: runs the full coverage matrix and prints a summary.
    // Asserts no unhandled errors.
  });
});
```

The 5 tests give the phase its 5 new test count. The "integration" test is a smoke test; the real assertion is in the per-class tests.

## TDD Workflow

### Step 1: Create the 2 sidecars (RED: the test file fails because the sidecars don't exist)

Create `schemas/field-drift-exceptions.yaml` and `schemas/validator-coverage.yaml` with the content above.

### Step 2: Write the 5 tests in `__tests__/field-coverage.test.js` (RED: tests fail because the file doesn't exist)

Create the test file with the 5 `it` blocks.

### Step 3: Run the test file (RED)

Run `pnpm test -- __tests__/field-coverage.test.js`. The first run may fail with import errors or assertion failures. Iterate until the tests pass on the current code with the 13-cell exceptions list.

### Step 4: Run the full suite (RED, then GREEN as the test passes)

Run `pnpm test`. Confirm 597 pass, 0 fail (573 + 19 Phase 0 + 5 Phase 2).

### Step 5: Verify validators

Run `pnpm validate:records` (183 records) and `pnpm validate:plan-loop` (74 plans). Both pass.

## Implementation Steps

1. Create `schemas/field-drift-exceptions.yaml` with the 13-cell content.
2. Create `schemas/validator-coverage.yaml` with the validator-read paths.
3. Create `tools/learning-loop-mcp/__tests__/field-coverage.test.js` with the 5 tests.
4. Run `pnpm test -- __tests__/field-coverage.test.js` — confirm 5 pass, 0 fail.
5. Run `pnpm test` — confirm 597 pass, 0 fail.
6. Run `pnpm validate:records` — confirm 183 records, 0 errors.
7. Run `pnpm validate:plan-loop` — confirm 74 plans, 0 violations.

## Related Code Files

### Create (3 new files)
- `schemas/field-drift-exceptions.yaml` (NEW, 13-cell initial list)
- `schemas/validator-coverage.yaml` (NEW, validator-read paths enumeration)
- `tools/learning-loop-mcp/__tests__/field-coverage.test.js` (NEW, 5 tests)

### Read
- `tools/learning-loop-mcp/core/{experiment,risk,decision,observation}-writer.js` (the 4 writer functions)
- `tools/learning-loop-mcp/core/{claim-verification-rules,experiment-proof-match,record-validation-rules}.js` (the 3 validator files)
- `schemas/{experiment,risk,decision,observation}.schema.json` (the 4 schemas)
- `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` (for value-set check)
- `tools/learning-loop-mcp/tools/update-observation-tool.js` (for value-set check)
- `tools/learning-loop-mcp/core/observation-writer.js` (for value-set check)

### Modify
- None

### Delete
- None

## Success Criteria

- [ ] `schemas/field-drift-exceptions.yaml` has 13 entries
- [ ] `schemas/validator-coverage.yaml` enumerates every validator-read path (plus the 6 R6 GAP entries)
- [ ] `__tests__/field-coverage.test.js` has 5 tests, all pass
- [ ] 573 pre-existing + 19 Phase 0 = 592 tests + 5 new = 597 tests pass
- [ ] `pnpm test` shows 597 pass, 0 fail
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes
- [ ] The value-set-coverage check is included (R1 from verification-2200)
- [ ] The exceptions-count test catches silent additions
- [ ] The integration test runs all 3 check classes without error

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The writer-coverage test fails because the writer's output uses a different property path than the schema (e.g., writer's `verification.claim_refs` is a nested object, schema's `claim_refs` is top-level). | The test walks the schema's `properties` recursively (for nested objects), but accepts writer output as-is. The exceptions file is the escape hatch for ambiguous cases. |
| The validator-coverage test fails because the validator reads a path that the writer never populates. | The exceptions file lists these as "validator-must-add" or "writer-must-add". The test reports both. |
| The value-set-coverage test requires AST inspection of tool files. | A small `walk` function (~30 LOC) finds `dimension:` enum, `z.enum([...])`, and `Set([...])` declarations. The function is tested with 2 known cases (one for tool enum, one for validator Set). |
| The exceptions-count test fails when a future plan adds an entry to the exceptions file. | The expected count is a constant in the test (e.g., `const EXPECTED_EXCEPTIONS = 13;`). Updating it is a deliberate code review decision. |
| The 6 R6 GAP entries in `validator-coverage.yaml` are intentional and should not be counted as failures. | The test's `validator-coverage` block skips entries with names ending in `_GAP`. A future plan can add the missing validator checks. |
| The new test file uses `loadSchemas(root)` which requires the project root. | The test passes `root: process.cwd()` (matches the spike's pattern at `__tests__/schema-to-zod-spike.test.js`). |
| The exceptions file may be edited concurrently by Phase 3 and Phase 4. | The phases edit the file in 2 atomic steps: Phase 3 removes 9 entries (9 → 4), Phase 4 removes 4 entries (4 → 0). The count test catches a typo. |
| Phase 2's test is the first test that loads the YAML sidecars. A bug in `loadSchemas` or `parseYaml` would surface here. | The YAML sidecars use only flat key-value pairs (no anchors, no references). `parseYaml` from the `yaml` package handles this trivially. |
| The `validator-coverage.yaml` R6 GAP entries list 6 paths that the validator does NOT currently check. A future plan must add the checks. | The test reports them as "to add" (not as failures). A comment in the YAML explains. |

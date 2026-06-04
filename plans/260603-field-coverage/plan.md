---
title: "Field-Coverage Mechanism: Schema as Source of Truth (Approach 2)"
description: "Implements Approach 2 from plans/reports/brainstorm-260603-field-coverage.md. Builds a thin `core/schema-to-zod.js` wrapper around zod 4.4.3's built-in `z.fromJSONSchema()` (spike-validated at __tests__/schema-to-zod-spike.test.js), refactors 8 hand-written record-CUD tool zod schemas to use it, adds a `__tests__/field-coverage.test.js` that catches writer/validator/value-set drift, and closes 13 drift cells (9 experiment + 3 risk + 1 observation) + 1 bridge-2 unit-test gap. Net effect: 4-layer drift class (schema/tool-zod/writer/validator) becomes impossible for 4 active record types (experiment, risk, decision, observation) and the 3 known experiment gaps are fixed. TDD structure preserves the 573 pre-existing tests. Surface: `meta`."
status: in-progress
priority: P2
branch: "main"
tags: [field-coverage, schema-truth, drift-prevention, code-organization, gap-closure, tdd, fifth-bridge, approach-2, meta, fromJSONSchema]
blockedBy: []
blocks: ["260603-approach-3-schema-driven-builder (future, post-SP3)"]
related:
  - plans/reports/brainstorm-260603-field-coverage.md (locked design, 2026-06-03T15:55:00Z; Approach 2)
  - plans/reports/research-260603-1600-json-schema-to-zod-libraries.md (3 candidate libraries; spike-first recommendation)
  - plans/reports/research-260603-2200-zod-description-passthrough.md (description passthrough verified; sidecar RECOMMENDED; `additionalProperties: false` REQUIRED)
  - plans/reports/verification-260603-2200-field-drift-enumeration.md (13 drift cells, not 11; 2 missed; 5 risks the brainstorm did not capture)
  - tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js (the viability spike; 16 tests, 0 fail, all 7 active schemas round-trip)
  - tools/learning-loop-mcp/core/schema-loader.js (loadSchemas; the loader to wrap)
  - tools/learning-loop-mcp/core/claim-verification-rules.js (semantic validator; the secondary `verification.assertion_refs || verification.claim_refs` reader is at experiment-proof-match.js:4)
  - tools/learning-loop-mcp/core/record-validation-rules.js (shape validator; AJV 2020-12, strict mode)
  - tools/learning-loop-mcp/core/experiment-writer.js (the SP2-cook writer; line 16-50)
  - tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js (bridge-2; lines 56-67)
  - tools/learning-loop-mcp/tools/manifest.json (8 hand-written record-CUD tool files enumerated)
  - schemas/{experiment,risk,decision,observation}.schema.json (4 active record types; experiment + observation + risk have drift; decision is clean)
  - docs/trajectory.md ("Fifth Bridge: Schema as Source of Truth" framing)
  - docs/journals/260603-sp2-gap-closure-cook.md (the originating journal; surfaces the SP2 cook gap)
  - records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml (the original gap assertion; will be updated by Phase 3)
  - tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js (the bridge-2 test that only checks top-level `assertion_refs`; needs an additional assertion)
created: "2026-06-03T22:00:00Z"
createdBy: "ck:plan --hard --tdd (design locked in brainstorm; 2 pre-plan research and verification reports)"
source: skill
---

# Field-Coverage Mechanism: Schema as Source of Truth (Approach 2)

## Overview

This plan ships the migration from 4 hand-written "field catalogues" (schema, tool-zod, writer, validator) to a single source of truth: the JSON Schema. Per the locked design in `brainstorm-260603-field-coverage.md`, Approach 2 has two parts: (a) make the **tool-zod layer** mathematically consistent with the schema by deriving it from the schema at runtime, and (b) add a **field-coverage test** that catches drift on the remaining two layers (writer and validator). The plan also closes the 13 known drift cells surfaced by the verification report, with the SP2 cook gap (`experiment.verification.assertion_refs`) as the loudest.

The viability of the engine (`z.fromJSONSchema()` from zod 4.4.3) was proven by the 16-test spike at `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` (573/573 tests still pass). The pre-plan research confirmed two follow-on points: (1) description passthrough works for required fields but is broken for optional fields (zod 4 design), so the sidecar `schemas/tool-descriptions.yaml` is **recommended but optional**; (2) the converter passes through `additionalProperties` as `passthrough()` when the schema omits the field, so all 7 active schemas need an explicit `additionalProperties: false` to match today's strip behavior.

The pre-plan verification report (1 of 2 reports produced for this plan) re-derived the drift matrix from current code and found **2 new drift cells the brainstorm missed**: `experiment.verification.proves.dimension` enum missing `"product"` in the update tool + validator silent-skip, and `observation.status` value-set drift (writer allows `"inactive"`, schema enum is `["active", "archived"]`). Corrected total: **13 drift cells** (9 experiment + 3 risk + 1 observation; decision is clean). The verification also flagged **5 risks the brainstorm did not capture** (R1-R6); they are folded into the phase designs below.

**Why TDD:** the schema-to-zod engine is the load-bearing piece. The spike tested the engine's structural viability; this plan tests the wrapper's behavior (description post-pass, additionalProperties strict, excludeFields) before any tool refactor. The field-coverage test is itself a regression-safety contract — it locks the schema-writer-validator contract for future schema additions. The 13 drift fixes are individually trivial (1-3 lines each) but together form a contract that must not regress.

**Surface:** `meta` (changes the loop's own machinery; no `product/**` writes, no preflight marker needed).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Schema-to-zod engine + 7-schema `additionalProperties: false` upgrade (TDD)](./phase-0-schema-to-zod-engine.md) | completed |
| 1 | [Refactor 8 record-CUD tool files to schema-derived zod (TDD, regression-safety)](./phase-1-refactor-8-tool-files.md) | in_progress |
| 2 | [`__tests__/field-coverage.test.js` + 2 sidecars (TDD, locks the contract)](./phase-2-field-coverage-test-and-sidecars.md) | pending |
| 3 | [Close 9 experiment drift cells (writer + tools + bridge-2)](./phase-3-close-experiment-drift-cells.md) | pending |
| 4 | [Close 3 risk drift cells + 1 observation value-set drift + 3 new negative fixtures + gap-assertion update](./phase-4-close-risk-observation-drift-and-fixtures.md) | pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | SP0-SP2 meta-state work | **completed** | The 4 meta-state tools (`report`, `list`, `ack`, `promote_rule`) and the SP2 grounding tools ship in the parent meta-state work; this plan's `meta_state_report` calls during cook follow the same pattern. |
| Builds on | `260602-sp1-derive-status` | **completed** | The SP1 `meta_state_derive_status` derivation pattern is reused in the cook's first-use of the new tools. |
| Builds on | `260602-sp2-check-grounding` | **completed** | The SP2 `meta_state_check_grounding` will be used to verify the new tool files (mechanism-check) are live after refactor. |
| Required for (future) | Approach 3 (schema-driven builder) | not started | The brainstorm defers Approach 3 ("full codegen, future work after SP3") to a follow-up brainstorm. This plan's Phase 0-1 builds the prerequisite `schema-to-zod` module. |
| Required for (future) | New record types (e.g., convention, assertion) | not started | When a new record type is added, the schema alone defines the tool surface. The `field-coverage.test.js` enforces the contract. |
| Closes | The SP2 cook gap (SP2 journal's "Post-Cook Experiment Record (deferred to a follow-up)" section) | — | Phase 3 fixes the writer + bridge-2 + tool surface. The stale gap-assertion record is updated to reflect the new gap shape. |
| Closes | The 4 known G8 recurrences (subcommand-class false positives) | — | This plan uses the Create tool directly per the operator-approved workaround in `meta-state.jsonl` lines 17-19; no recurrence. The plan does NOT fix the G8 root cause (out of scope). |

## Resolved Decisions (from brainstorm + pre-plan research and verification)

1. **Engine: `z.fromJSONSchema()` from zod 4.4.3 (pinned).** Already in `package.json`. The 16-test spike at `__tests__/schema-to-zod-spike.test.js` proves it converts all 7 active schemas, round-trips minimal records, and rejects invalid enums/consts/patterns. The deprecated `claim.schema.json` ($ref/$defs) was also tested; the strict-ref test rejected `verification.static.status: "BOGUS"` correctly. **No new dependency.**

2. **Wrapper API: 3 functions in `core/schema-to-zod.js` (~50 LOC total).**
   - `zodFromSchema(jsonSchema)` — pass-through to `z.fromJSONSchema()`. Re-exported for symmetry with the spike.
   - `buildZodSchemaFor(type, { excludeFields, name })` — composes the per-type schema: `loadSchemas(root)[type]`, removes writer-generated fields via `excludeFields`, applies descriptions from the sidecar, calls `.strict()` to override the converter's `passthrough()` default. The per-type `excludeFields` lists are an audit-friendly config: `["id", "schema_version", "type", "status", "created_at", "updated_at"]` for the 4 hand-written record types.
   - `zodObjectForProperties(properties, required)` — lower-level helper for nested blocks (e.g., the `verification` block on the update tool). Used when a tool needs a subset of the full schema.

3. **Sidecar `schemas/tool-descriptions.yaml` is RECOMMENDED (Option A from research-2200).** Reason: the 7 active schemas have NO `description` fields today, and optional-field descriptions are broken in `z.fromJSONSchema()` (the wrapper's parent-chain is severed by `.optional()`). The sidecar is the project's natural place for operator-tuned one-liner strings and is robust against zod 4.x experimental-API churn. The schema-to-zod wrapper applies sidecar descriptions **only for fields that have a sidecar entry** (additive — never removes default behavior).

4. **`additionalProperties: false` is REQUIRED for all 7 active schemas.** Per research-2200, the converter maps `additionalProperties: false` → `.strict()`, schema object → `.catchall(...)`, undefined/`true` → `.passthrough()`. Our schemas omit the field, so today the converter would silently accept extras — a behavior change from the hand-written `z.object({...})` (default strip). Adding `additionalProperties: false` makes the schema-to-zod schemas equivalent to the hand-written ones.

5. **Drift count is 13, not 11.** Per verification-2200: 9 experiment cells (the brainstorm's 8 + 1 new "product" enum drift in `experiment.verification.proves.dimension`) + 3 risk cells (reproduced) + 1 observation cell (the new `observation.status` value-set drift). Decision and deprecated-claim are unchanged. The `field-drift-exceptions.yaml` sidecar is initialized with all 13 cells; the plan's Phase 2-4 shrink the list to 0.

6. **Phase 3 MUST also update `core/candidate-to-experiment/experiment-draft-builder.js`.** Per R5 from verification-2200: the bridge-2 path writes a draft object (lines 56-67), then the workflow tool passes that draft through `createExperiment`. If Phase 3 fixes only `buildExperimentYaml` to bridge `assertion_refs`, the draft-preview returned by `workflow_candidate_to_experiment` (when `auto_create: false`) would still show `verification.assertion_refs: undefined`. The fix is symmetric: `experiment-draft-builder.js` must set `verification.assertion_refs` directly in the draft. The current unit test (`__tests__/bridge-2-unit.test.js:154-155`) asserts only top-level; Phase 3 must add a `verification.assertion_refs` assertion.

7. **Phase 2's `__tests__/field-coverage.test.js` has 3 check classes, not 2.** Per R1 from verification-2200: the brainstorm's framework detects **field-presence drift** (does layer X reference field Y?) but does not detect **value-set drift** (does layer X accept the same enum as the schema?). The new `experiment.verification.proves.dimension` and `observation.status` drifts are value-set drifts. The test must assert enum value equality, not just field presence. Specifically: for every `properties.X.enum` in every schema, assert that the corresponding zod schema in the tool (or the validator's Set constant) declares the exact same set of values.

8. **R6 (record-validation-rules.js missing-pointer check) is folded into Phase 2.** The verification report flagged that `validateRecordReferences` (lines 211-225) checks `evidence_refs`, `supersedes`, `superseded_by`, `experiment_refs` — but not `claim_refs`, `risk_refs`, or `assertion_refs`. The new `validator-coverage.yaml` sidecar (Phase 2) lists every property path the validator MUST check, and the test asserts that list against the validator's source. This is **not a drift cell** in the brainstorm's framework (all layers agree the field exists), but it is a related defect; the new test pins it for future audit.

9. **TDD structure preserved: 1 new spike-extension test + ~17 new schema-to-zod unit tests + ~5 new field-coverage tests + 3 new negative-fixture tests.** The 573 pre-existing tests must all still pass at every phase boundary. The spike's 16 tests are kept as a permanent regression suite (TDD-intent: lock the engine contract).

10. **The gap-assertion record `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` is updated in Phase 4, not Phase 3.** Rationale: Phase 3 closes the writer + tool + bridge-2 cells; Phase 4 is where the contract is locked in (fixtures + sidecar) and the journal-style audit record is updated to reflect the closed state. The record is updated to `status: resolved` with a reference to the new plan's Phase 3 and the new fixtures.

## Architecture

### Module: `core/schema-to-zod.js` (NEW, ~50 LOC)

```js
// tools/learning-loop-mcp/core/schema-to-zod.js
import { z } from "zod";
import { loadSchemas } from "./schema-loader.js";
import { loadDescriptions } from "./schema-description-loader.js";

/**
 * Pass-through to zod 4.4.3's built-in z.fromJSONSchema(). The spike at
 * __tests__/schema-to-zod-spike.test.js proves it converts all 7 active
 * schemas; this wrapper adds project-specific concerns (excludeFields,
 * optional description sidecar, strict-mode override).
 *
 * The deprecated claim.schema.json is NOT routed through this module; it
 * remains on its hand-written zod schema in tools/update-claim-tool.js.
 * Reason: $ref/$defs is silently dropped by z.fromJSONSchema() in 4.4.3
 * (per the spike's strict-ref test note). Routing the active 7 through
 * z.fromJSONSchema() avoids the $ref edge case entirely.
 */
export function zodFromSchema(jsonSchema) {
  return z.fromJSONSchema(jsonSchema);
}

/**
 * Build the zod schema for a record-type tool input.
 * - Loads the schema via loadSchemas(root)
 * - Strips writer-generated fields via excludeFields
 * - Applies sidecar descriptions (only for fields with a sidecar entry)
 * - Forces .strict() to match the project's existing strip behavior
 *   (the converter otherwise produces .passthrough() when the schema
 *   omits additionalProperties)
 */
export function buildZodSchemaFor(type, { root, excludeFields = [], name } = {}) {
  const schemas = loadSchemas(root);
  const jsonSchema = schemas[type];
  if (!jsonSchema) throw new Error(`schema-to-zod: unknown type "${type}"`);

  let zodSchema = zodFromSchema(jsonSchema);

  // Apply strict mode regardless of the source schema's additionalProperties.
  // (The 7 active schemas will gain additionalProperties: false in Phase 0;
  // this call is defensive in case a future schema omits it.)
  zodSchema = zodSchema.strict();

  // Strip writer-generated fields. The user's tool contract is "what can I supply",
  // not "what does the writer produce".
  if (excludeFields.length) {
    const shape = { ...zodSchema.shape };
    for (const field of excludeFields) delete shape[field];
    zodSchema = z.object(shape).strict();
  }

  // Apply sidecar descriptions (additive; never removes default).
  // (See description below.)
  const descriptions = loadDescriptions();
  const typeDescriptions = descriptions[type] || {};
  if (Object.keys(typeDescriptions).length) {
    const newShape = { ...zodSchema.shape };
    for (const [key, description] of Object.entries(typeDescriptions)) {
      if (newShape[key] && description) {
        // Re-apply on the optional wrapper too (the .optional() gap from
        // research-2200). Both required and optional fields are covered.
        newShape[key] = newShape[key].describe(description);
      }
    }
    zodSchema = z.object(newShape).strict();
  }

  return zodSchema;
}

/**
 * Lower-level helper for nested blocks (e.g., the `verification` object on
 * the update tool). Same compose pattern as buildZodSchemaFor, but operates
 * on a properties map rather than a full record-type schema.
 */
export function zodObjectForProperties(properties, required = [], { descriptions = {} } = {}) {
  let obj = zodFromSchema({ type: "object", properties, required });
  obj = obj.strict();
  if (Object.keys(descriptions).length) {
    const newShape = { ...obj.shape };
    for (const [key, description] of Object.entries(descriptions)) {
      if (newShape[key] && description) newShape[key] = newShape[key].describe(description);
    }
    obj = z.object(newShape).strict();
  }
  return obj;
}
```

### Module: `core/schema-description-loader.js` (NEW, ~10 LOC)

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

let cache = null;
export function loadDescriptions() {
  if (cache) return cache;
  const path = join(process.cwd(), "schemas", "tool-descriptions.yaml");
  try {
    cache = parseYaml(readFileSync(path, "utf8")) || {};
  } catch {
    cache = {};
  }
  return cache;
}

export function clearDescriptionsCache() {
  cache = null;
}
```

### Sidecar: `schemas/tool-descriptions.yaml` (NEW)

Keyed by `<type>.<field>`. Initial population is OPTIONAL: the project's 7 active schemas have no `description` fields today, and the hand-written zod descriptions in the 8 tool files are the source of truth. Phase 1 migrates the descriptions into the sidecar; the new `core/schema-to-zod.js` wrapper applies them.

```yaml
experiment:
  surface: "Surface/scope this experiment applies to (e.g., 'product', 'api')"
  goal: "What the experiment aims to determine"
  # ... (full list; see Phase 1 spec)
risk:
  surface: "..."
  # ...
decision:
  surface: "..."
  # ...
observation:
  constraint_type: "..."
  constraint: "..."
  description: "..."  # description→notes in writer; see observation-writer.js
```

### Sidecar: `schemas/field-drift-exceptions.yaml` (NEW, 13 initial entries)

```yaml
# Each entry is { type, path, layer, reason, fixed_in_phase }.
# The list shrinks as phases fix cells; the test asserts the list is empty at end.

- { type: experiment, path: notes, layer: create-tool, reason: "no create input", fixed_in_phase: 3 }
- { type: experiment, path: scope, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: claim_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: risk_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: output_level, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: output_capture, layer: all, reason: "dormant; forward-declared", fixed_in_phase: 3-or-4 }
- { type: experiment, path: "verification.assertion_refs", layer: writer+update-tool+bridge, reason: "SP2 cook gap", fixed_in_phase: 3 }
- { type: experiment, path: assertion_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 3 }
- { type: experiment, path: "verification.proves.dimension", layer: update-tool+validator, reason: "missing 'product' in tool enum; validator silent-skip", fixed_in_phase: 3 }
- { type: risk, path: claim_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 4 }
- { type: risk, path: experiment_refs, layer: update-tool, reason: "not exposed in update", fixed_in_phase: 4 }
- { type: risk, path: assertion_refs, layer: all, reason: "dormant; no validator reads it yet", fixed_in_phase: 4 }
- { type: observation, path: status, layer: value-set, reason: "writer allows 'inactive', schema enum is 2 values", fixed_in_phase: 4 }
```

### Sidecar: `schemas/validator-coverage.yaml` (NEW)

Enumerates every property path the semantic validators MUST check. Initial population from the verification report's file:line reference index.

```yaml
claim-verification-rules:
  - "experiment.verification.assertion_refs"   # PRIMARY
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
  # Per R6 from verification-2200: the next 3 are NOT currently checked.
  # Listed here to surface the gap; Phase 2's test reports it as "to add".
  - "experiment.claim_refs"      # GAP: not in validateRecordReferences
  - "experiment.risk_refs"       # GAP
  - "experiment.assertion_refs"  # GAP
  - "risk.claim_refs"            # GAP
  - "risk.experiment_refs"       # GAP
  - "risk.assertion_refs"        # GAP
```

### Test: `__tests__/field-coverage.test.js` (NEW, ~250 LOC)

Three check classes, run for every record type:

1. **Writer-coverage:** for every property in the schema, the writer's `build<Type>Yaml({ <prop>: <value> })` must produce a record that, after JSON round-trip, contains `<prop>` at the same level. **Initial pass with the 13-cell exceptions file.**

2. **Validator-coverage:** for every property path consumed by a semantic validator (per `validator-coverage.yaml`), the writer populates the path OR the path is in the exceptions file. **Asserts that the validator's behavior matches its declared contract.**

3. **Value-set-coverage (NEW per R1):** for every `properties.X.enum` in the schema, the corresponding zod schema in the tool (or the validator's Set constant) declares the exact same set of values. **Catches the 2 new value-set drifts.**

The test has 3 pass criteria:
- All 3 checks pass (or the path is in the exceptions file).
- The exceptions file is loadable.
- The exceptions file count matches the assertions (assert `exceptions.length === expectedCount` to catch silent additions).

## Test Plan

| File | New describe blocks | New it blocks | Total it after |
|---|---|---|---|
| `__tests__/schema-to-zod.test.js` (NEW) | 1 | 17 | 17 |
| `__tests__/schema-to-zod-spike.test.js` (existing, extended with 2 tests) | +1 | 2 | 18 |
| `__tests__/field-coverage.test.js` (NEW) | 5 | ~27 | ~27 |
| `__tests__/bridge-2-unit.test.js` (existing, extended with 1 assertion) | 0 | 0 (assertion added to existing `it`) | (unchanged) |
| `__tests__/experiment-update-verification-assertion-refs.test.js` (NEW) | 1 | 1 | 1 |
| 2 new negative fixtures (asserted via existing runner test) | 0 | 2 (assertion in existing runner test) | (unchanged runner test) |
| **Total new it blocks** | | | **~50** |
| **Existing it blocks (regression-safety floor)** | | | 573 (preserved unchanged) |
| **Project total after plan** | | | **~623** |

**Reconciliation note (per red-team-260603-field-coverage.md M1):** the plan's "600 total" claim assumes 5 `it` blocks for Phase 2. The actual is ~27 `it` blocks (the validator-coverage check has 1 `it` per path × ~18 non-GAP paths, the writer-coverage has 4, the value-set has 3, plus 1 exceptions-count + 1 integration). The corrected total is **~623 tests** (573 + 19 + ~27 + 3 = ~622). The cook tracks the actual count in the journal entry.

**Phase 0 contributes** 19 new it blocks (17 unit + 2 spike extension). **Phase 1 contributes** 0 (regression-safety; existing 573 + Phase 0's 19 must pass). **Phase 2 contributes** ~27 new it blocks (the 5 describe blocks above). **Phase 3 contributes** 0 new it blocks (the existing bridge-2 test is extended with 1 assertion; field-coverage test shrinks the exceptions count from 13 to 4). **Phase 4 contributes** 3 new it blocks (1 standalone + 2 negative-fixture assertions in the runner's regression-safety test).

## Related Code Files

### Create (8 new files)
- `tools/learning-loop-mcp/core/schema-to-zod.js` (NEW, ~50 LOC)
- `tools/learning-loop-mcp/core/schema-description-loader.js` (NEW, ~10 LOC)
- `schemas/tool-descriptions.yaml` (NEW, sidecar)
- `schemas/field-drift-exceptions.yaml` (NEW, 13-cell initial list)
- `schemas/validator-coverage.yaml` (NEW, validator-read paths enumeration)
- `tools/learning-loop-mcp/__tests__/schema-to-zod.test.js` (NEW, 17 unit tests)
- `tools/learning-loop-mcp/__tests__/field-coverage.test.js` (NEW, 5 tests)
- 3 new negative fixtures (under `tools/learning-loop-mcp/fixtures/negative/`)

### Modify (15 files)
- 7 active JSON Schemas: add `additionalProperties: false`
- 8 record-CUD tool files: replace hand-written zod with `buildZodSchemaFor`
- `tools/learning-loop-mcp/core/experiment-writer.js`: bridge `assertion_refs` to `verification.assertion_refs`; add `notes` to writer output
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js`: set `verification.assertion_refs` in draft
- `tools/learning-loop-mcp/core/claim-verification-rules.js`: add `"product"` to `experimentDimensions`; add per-dimension handling for product
- `tools/learning-loop-mcp/core/negative-fixture-runner.js`: add 3 new fixture names to the cases list
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js`: add 1 assertion for `draft.verification.assertion_refs`
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js`: add 2 tests for description passthrough + strict mode

### Read
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (pattern reference for `mkdtempSync` + env-restoration)
- `tools/learning-loop-mcp/tools/manifest.json` (8 record-CUD tools enumerated)
- `tools/learning-loop-mcp/core/record-validation-rules.js` (the validator that Phase 2's coverage test asserts)

### Update
- `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` (status: resolved; reference to this plan's Phase 3 + the 3 new fixtures)

### Delete
- None

## Success Criteria

- [ ] 573 pre-existing tests still pass at every phase boundary
- [ ] `pnpm test` shows **~623 pass, 0 fail** (573 + ~50 new; corrected per red-team-260603-field-coverage.md M1)
- [ ] `pnpm validate:records` passes (no schema regression on the 183 records)
- [ ] `pnpm validate:plan-loop` passes (74 plans, 0 violations)
- [ ] `core/schema-to-zod.js` is < 60 LOC (KISS)
- [ ] All 8 hand-written zod tool schemas in `tools/create-*-record-tool.js` and `tools/update-*-record-tool.js` (and `record-observation-tool.js` + `update-observation-tool.js`) are removed (replaced by `buildZodSchemaFor` calls)
- [ ] All 7 active JSON Schemas have `additionalProperties: false`
- [ ] `__tests__/field-coverage.test.js` passes with empty `field-drift-exceptions.yaml` at end of plan (0 cells remaining)
- [ ] `__tests__/field-coverage.test.js` includes a value-set check (R1 from verification-2200)
- [ ] `schemas/validator-coverage.yaml` lists every property path the semantic validators read (initial population per verification-2200 file:line index)
- [ ] The bridge-2 unit test (`__tests__/bridge-2-unit.test.js`) asserts `draft.verification.assertion_refs` (R5)
- [ ] The 3 new negative fixtures (experiment-missing-verification-assertion-refs, risk-missing-assertion-refs, experiment-update-verification-assertion-refs-blocked) are picked up by `runNegativeFixtures` and pass
- [ ] The gap-assertion record `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` is updated to `status: resolved` with references to Phase 3 and the 3 new fixtures
- [ ] The plan cook produces a journal entry mirroring the SP0/SP1/SP2/SP2-gap-closure cook pattern (header, steps, deviations, success metrics, references)
- [ ] No `ck plan create` invocations (the operator-approved workaround per meta-state.jsonl lines 17-19 is the Create tool)

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `z.fromJSONSchema()` is documented experimental; a future zod minor could change behavior. | medium | The 16-test spike + 2 extension tests stay as a permanent regression suite. The spike's "zod >= 4.2" assertion (line 232 of `__tests__/schema-to-zod-spike.test.js`) catches a drop of the function itself. A silent semantic change in metadata propagation is harder to catch; the description-extension tests (Phase 0) lock the easy case. |
| The `additionalProperties: false` addition to 7 active schemas could break the AJV shape validator (AJV 2020-12, strict mode). | low | AJV with `additionalProperties: false` on the source schema rejects any record with an extra property. The 183 existing records do not have extras (validated by the current `validateRecords`); the addition is a no-op for them. New records created after the change will benefit from the strict enforcement. |
| The 3 new negative fixtures must be picked up by `runNegativeFixtures` and pass. | low | The runner's `cases` array is the addition point (Phase 4). The fixture names follow the existing convention. A new test at the end of the runner's `it` block asserts the new fixtures are present. |
| The bridge-2 unit test extension (R5) requires a writer change in `experiment-writer.js` to be effective. | low | The writer change is in Phase 3 (the same phase that extends the test). If Phase 3 fails the bridge-2 test, the cook rolls back both. |
| The `claim-verification-rules.js` change to add `"product"` to `experimentDimensions` requires per-dimension handling (product connects to decision approval, not experiment proof). | medium | The new test for product-dimension proof (Phase 3) asserts the validator's behavior matches the new shape. A regression-safety test in `__tests__/claim-verification-rules.test.js` (or the existing test file if one exists) pins the new behavior. |
| The value-set-coverage test (R1) requires loading 2 different sources of truth (the schema enum + the tool's zod enum + the validator's Set constant). | medium | The test reads the schemas at runtime via `loadSchemas(root)` and uses AST inspection (a small `walk` function) to find enum values in tool files and `Set` declarations in validator files. The walk is small (~30 LOC) and tested with 2 known cases. |
| The `experiment.output_capture` drift cell is "dormant" (schema-only field, no layer reads/writes it). | low | The field is forward-declared in the schema for a future use. The fix in Phase 3 is to either (a) remove the field from the schema (1 line), or (b) add a writer passthrough + tool exposure (3 lines). Decision is deferred to Phase 3 spec; the plan's success criterion is "either fix" (not "both"). |
| The schema-to-zod wrapper's `excludeFields` is hand-maintained; a future schema addition that is writer-generated but not in the list would leak. | low | The test `__tests__/schema-to-zod.test.js` includes a "writer-generated fields are stripped" test that asserts the 5 standard fields (`id, schema_version, type, status, created_at, updated_at`) are absent from the result. A future field added to the schema that is writer-generated is a code review concern, not a tool concern. |
| The `meta_state_derive_status` first-use entry (optional Phase 1 follow-up) might hit the G8 false positive on its way to the gate log. | low | Phase 1's cook is a TDD cook with no `ck plan create` invocations. The optional follow-up entry is a `meta_state_derive_status` call (not a `ck plan create`); the bash gate does not block on the tool's internal args. |
| The plan touches `schemas/**` (write gate blocks direct writes). | medium | All 7 schema additions are atomic YAML edits in a single commit. The Phase 0 spec includes the diff (1 line per schema, added at the same level as `properties`). The plan's cook uses the Edit tool per-file; each file is its own atomic edit. The schemas are validated by `pnpm validate:records` at every phase boundary. |
| The `experiment.notes` field in `create-experiment-record-tool.js` requires the writer to ALSO accept it. | low | The fix is 2 lines (1 in writer, 1 in create tool). Phase 3 is atomic. The `record_update_experiment` already accepts `notes` (line 34 of the tool file). |
| The `risk.assertion_refs` field is dormant; no validator reads it. The fix adds it to 3 layers (create tool, update tool, writer), but the validator-side check is `if (config.status === "verified" && !refs.length)` — adding `assertion_refs` to the risk writer does not change validator behavior. | low | The 3-line fix is correct per the schema. The dormant state is preserved (no new validator rule). The Phase 4 test asserts the field is exposed and round-trip-able; the validator-side assertion is a future plan. |
| The bridge-2 unit test at `__tests__/bridge-2-unit.test.js:154-155` may need to be re-read to find the exact insertion point. | low | Phase 3's spec reads the test file first, then adds 1 assertion immediately after the existing `draft.assertion_refs` check. The test count is unchanged (the new assertion is added to an existing `it` block). |
| The pre-plan research confirmed `z.fromJSONSchema()` is "experimental" in zod 4.4.3. A zod minor bump (4.5+) could break the engine. | medium | The spike's zod-version assertion is the canary. The plan pins zod to 4.4.3 in `package.json` (already pinned per the verification report). A `pnpm install` that bumps zod would fail the spike at `pnpm test` time, surfacing the breaking change before it reaches production. |
| Phase 1's 8-file refactor is the largest single change in the plan. A regression in any of the 8 tool files could break MCP tool behavior. | medium | The cook runs the full test suite at every phase boundary. The 8 tool files are refactored one at a time, with the test suite re-run after each. A regression in one tool is caught immediately. |
| The `field-coverage.test.js` exceptions count test (assert `exceptions.length === expectedCount`) could fail if the exceptions file is updated without a test change. | low | The expected count is a constant in the test (e.g., `const EXPECTED_EXCEPTIONS = 13;`); updating it is a deliberate code review decision. The test fails loudly if the file is updated without updating the constant. |
| The plan modifies `schemas/*.schema.json` (write gate blocked; Edit tool allowed). | low | Per the write-gate, `schemas/**` is blocked. The Edit tool is a write tool that would be blocked. **This is a real blocker.** The plan must use the `Edit` tool via the MCP server's `index_validate` flow, OR the plan must request operator approval to unblock the schemas path. **See "Permissions" section below.** |

## Permissions

**The plan modifies `schemas/*` and `tools/learning-loop-mcp/**` extensively.** Per the project's gate policy:
- `tools/learning-loop-mcp/**` is **allowed** by the write gate (no preflight required; the surface is `meta`).
- `schemas/**` is **blocked** by the write gate ("Schema changes require validation. Run pnpm validate:records first, then approve."). The plan's cook must use the Edit tool per-file, each with an explicit operator approval per the gate's "approve" affordance, OR the cook must ask the operator to lift the gate for the duration of the plan.
- `records/**` is **blocked** by the write gate and **only reachable via MCP tools**. The plan's cook calls `record_update_observation` to update the gap-assertion record's status. The 4 vnstock observations in the inbound-state-gate reminder are NOT modified by this plan (they are orthogonal; see "Inbound State Acknowledgement" below).
- `__tests__/**` and `fixtures/negative/**` are allowed (under `tools/learning-loop-mcp/`).

**Cook workflow for `schemas/*`:**
1. The cook preflight-checks via `pnpm validate:records` (must pass on current state).
2. The cook asks the operator for explicit per-file approval for each `schemas/*.schema.json` edit (the gate surfaces a "validate first, then approve" affordance).
3. The cook runs `pnpm validate:records` after each file to confirm no regression.

If the operator prefers a one-time lift, the cook can use the `mark_preflight_complete` MCP tool for the `meta` surface (which unlocks `tools/learning-loop-mcp/**` for 30 min) and request operator approval for the `schemas/**` block to be lifted for the duration of the plan.

## Inbound State Acknowledgement

The session opened with an inbound state gate message noting that 4 vendor-API observations (vnstock-device-slot-ledger, vnstock-import-reactivates-cleared-device, vnstock-resource-budget, vnstock-side-effect-import) may be stale. Inspection of the project state:

- All 4 observations have `updated_at` from 2026-05-15 to 2026-05-18 (~16-19 days old).
- The 4 observations track vendor-API state (vnstock device slot ledger, import side effects, resource budget, side-effect-import rule). They are **operationally active** (the budget is at 1/1, the import rule is a hard-gate constraint).
- **None of the 4 observations are on the critical path of this plan.** The plan touches `tools/learning-loop-mcp/**` (the loop's own machinery), `schemas/*` (record shapes), and `__tests__/**` (test files). No vendor-API code is touched.
- The plan does **not** update or archive the 4 observations. They remain active; the next time a vendor-API experiment runs, the operator or agent will re-verify them and update if needed.
- The plan's `__tests__/field-coverage.test.js` does NOT check observation freshness; that is a separate concern (covered by the existing `inbound-state-gate` hook + meta-state agents).

**No action required for the inbound state gate.** Proceeding with the plan.

## Out of Scope (per the brainstorm + research + verification)

- Implementing Approach 3 (full schema-driven builder). Deferred to a follow-up brainstorm after SP3 ships.
- Refactoring `claim-verification-rules.js` to be schema-driven. The current rules have 3 derived_statuses, 4 derivation kinds, and 4 recommendations that cannot be 100% derived from JSON Schema; some hand-written logic remains.
- Centralizing the 9 schema files into one. They already share `$defs` patterns.
- Generating `record_create_*` and `record_update_*` MCP tool *registrations* from the schema. The tool list in `tools/manifest.json` is a separate concern; it would be a follow-up.
- Pinning zod to a tighter version range. Already at 4.4.3; the spike's metadata test catches drops below 4.2.
- Updating the deprecated `claim.schema.json` to use the schema-derived zod. The $ref/$defs support is unverified; the spike's strict-ref test was informational only. The hand-written zod in `update-claim-tool.js` stays.
- Fixing the G8 subcommand-class false positive (the 5 documented recurrences). The plan uses the Create tool directly per the operator-approved workaround; the regex fix is out of scope.
- Bumping zod to 4.5+ to test if the optional-wrapper parent-chain gap is fixed. Out of scope; pin stays at 4.4.3.

## Phase 0: Schema-to-zod engine + 7-schema `additionalProperties: false` upgrade

See [`phase-0-schema-to-zod-engine.md`](./phase-0-schema-to-zod-engine.md) for the full phase spec.

## Phase 1: Refactor 8 record-CUD tool files

See [`phase-1-refactor-8-tool-files.md`](./phase-1-refactor-8-tool-files.md) for the full phase spec.

## Phase 2: `__tests__/field-coverage.test.js` + 2 sidecars

See [`phase-2-field-coverage-test-and-sidecars.md`](./phase-2-field-coverage-test-and-sidecars.md) for the full phase spec.

## Phase 3: Close 9 experiment drift cells

See [`phase-3-close-experiment-drift-cells.md`](./phase-3-close-experiment-drift-cells.md) for the full phase spec.

## Phase 4: Close 3 risk + 1 observation + 3 fixtures + gap-assertion update

See [`phase-4-close-risk-observation-drift-and-fixtures.md`](./phase-4-close-risk-observation-drift-and-fixtures.md) for the full phase spec.

## References

### Design Artifacts

- `plans/reports/brainstorm-260603-field-coverage.md` — locked design (Approach 2)
- `plans/reports/research-260603-1600-json-schema-to-zod-libraries.md` — 3 candidate libraries; `z.fromJSONSchema()` recommended first try
- `plans/reports/research-260603-2200-zod-description-passthrough.md` — description passthrough behavior; sidecar RECOMMENDED; `additionalProperties: false` REQUIRED
- `plans/reports/verification-260603-2200-field-drift-enumeration.md` — 13 drift cells (not 11); 2 new cells; 5 risks the brainstorm missed (R1-R6)
- `docs/trajectory.md` — "Fifth Bridge: Schema as Source of Truth" framing
- `docs/journals/260603-sp2-gap-closure-cook.md` — originating journal; surfaces the SP2 cook gap
- `docs/journals/260602-sp0-log-change-planning.md` — G8 3rd-4th recurrence documentation; the operator-approved workaround
- `meta-state.jsonl` line 19 (`meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla`) — G8 5th recurrence; Create-tool workaround is canonical

### Code References

- `schemas/{experiment,risk,decision,observation,index-entry,capability,claim}.schema.json` — 7 active + 1 deprecated
- `tools/learning-loop-mcp/core/{experiment,decision,risk,observation}-writer.js` — 4 writer files
- `tools/learning-loop-mcp/tools/{create,update}-{experiment,risk,decision}-record-tool.js` — 6 record-CUD tool files (2 per type)
- `tools/learning-loop-mcp/tools/record-observation-tool.js` + `update-observation-tool.js` — 2 observation tools
- `tools/learning-loop-mcp/core/claim-verification-rules.js` — semantic validator (the 1st consumer of `verification.assertion_refs`)
- `tools/learning-loop-mcp/core/experiment-proof-match.js` — semantic validator (the 2nd consumer)
- `tools/learning-loop-mcp/core/record-validation-rules.js` — shape validator (AJV 2020-12, strict)
- `tools/learning-loop-mcp/core/negative-fixture-runner.js` — fixture runner
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` — bridge-2 source
- `tools/learning-loop-mcp/tools/manifest.json` — tool registry (8 record-CUD tools)
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` — viability spike (16 tests, 0 fail; permanent regression suite)
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` — bridge-2 test; needs `draft.verification.assertion_refs` assertion
- `tools/learning-loop-mcp/fixtures/negative/` — 28 existing negative fixtures

### Pattern References

- `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` — most recent cook pattern (1 test + 1 JSON patch; TDD-first; journal-style cook)
- `docs/journals/260603-sp2-gap-closure-cook.md` — cook journal pattern to mirror
- `docs/journals/260602-sp1-derive-status-planning.md` — the operational first-use pattern (Phase 1 follow-up)
- `plans/260602-sp2-check-grounding/plan.md` — TDD structure for MCP-tool + pure-function combo (28 unit + 11 tool + 2 acceptance = 41 new tests)
- `plans/260602-sp1-derive-status/plan.md` — sibling TDD plan (28 unit + 11 tool = 39 new tests)

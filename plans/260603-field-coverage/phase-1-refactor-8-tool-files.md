---
phase: 1
title: "Refactor 8 record-CUD tool files to schema-derived zod (TDD, regression-safety)"
status: pending
priority: P2
effort: "0.5d"
dependencies: [0]
---

# Phase 1: Refactor 8 record-CUD tool files to schema-derived zod (TDD, regression-safety)

## Overview

The largest single change in the plan. Replaces the hand-written zod schemas in 8 record-CUD tool files with calls to `buildZodSchemaFor(type, { excludeFields, root })` (from Phase 0). The 4 record types are `experiment`, `risk`, `decision`, `observation`; the 8 tool files are `create-<type>-record-tool.js` + `update-<type>-record-tool.js` for each (with `observation` using the existing `record-observation-tool.js` + `update-observation-tool.js` filenames). The sidecar `schemas/tool-descriptions.yaml` is populated in this phase; Phase 0's wrapper applies the descriptions on top of the schema-derived zod.

TDD structure: the cook runs the full test suite after each tool file is refactored. If a regression appears, the file is rolled back. The full test suite must pass at the phase boundary; 0 new tests added in this phase (regression-safety is the contract).

## Why This Phase Exists

The plan's core architectural change: 8 hand-written zod schemas are replaced by schema-derived ones. The drift class on the tool-zod layer becomes impossible by construction — a new field added to the schema appears in the tool automatically. This is the "schema as source of truth" promise of Approach 2.

The risk is high (8 files, each with non-trivial surface), but the test count is the safety net: 573 existing tests, plus the 19 new Phase 0 tests, must all pass. A regression in any tool file is caught immediately. The 8 files are refactored one at a time, with the test suite re-run after each.

The sidecar descriptions are populated in this phase, NOT in Phase 0. Reason: the descriptions are currently the hand-written `.describe(...)` strings in the 8 tool files. The natural workflow is to read each tool's existing descriptions, copy them into the sidecar, then refactor the tool. The cook is iterative per file.

## Requirements

### Functional

- All 8 tool files use `buildZodSchemaFor(...)` for their `schema:` property.
- The 4 create tools use `buildZodSchemaFor("experiment" | "risk" | "decision", { root, excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"] })`.
- The 4 update tools use a similar pattern, with the additional `verification` (and any other nested blocks) re-built via `zodObjectForProperties(...)`.
- `schemas/tool-descriptions.yaml` is populated with the descriptions from the 8 hand-written tools.
- The `record-observation-tool.js` and `update-observation-tool.js` follow the same pattern (with `observation` as the type).
- The update tools' `verification` block (for experiment) and any other nested blocks use `zodObjectForProperties(...)`.

### Non-Functional

- 0 new tests added (regression-safety is the contract).
- 573 pre-existing tests + 19 Phase 0 tests = 592 tests still pass.
- `pnpm validate:records` passes (no schema regression).
- `pnpm validate:plan-loop` passes.
- The hand-written `.describe(...)` strings are migrated to the sidecar, not duplicated in code.

## Architecture

### Tool Refactor Pattern

For a `create-<type>-record-tool.js` file, the change is:

```diff
- import { z } from "zod";
+ import { buildZodSchemaFor } from "#mcp/core/schema-to-zod.js";
  import { create<Type> } from "#mcp/core/<type>-writer.js";
  import { appendGateLog } from "#lib/gate-logging.js";
  import { resolveRoot } from "#lib/resolve-root.js";
  // (other imports)

  export const recordCreate<Type>Tool = {
    name: "record_create_<type>",
    description: "...",
-   schema: {
-     surface: z.string().describe("..."),
-     goal: z.string().describe("..."),
-     ...
-   },
+   schema: buildZodSchemaFor("<type>", {
+     root: resolveRoot(),
+     excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"],
+   }),
    handler: async ({ surface, ... }) => { ... },
  };
```

For an `update-<type>-record-tool.js` file, the change is similar but the `verification` (and other nested blocks) need a slightly different shape:

```js
import { buildZodSchemaFor, zodObjectForProperties } from "#mcp/core/schema-to-zod.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";

const root = resolveRoot();
const schemas = loadSchemas(root);
const experimentSchemas = schemas.experiment;

const experimentInputSchema = buildZodSchemaFor("experiment", { root, excludeFields: [...] });
const verificationBlockSchema = zodObjectForProperties(
  experimentSchemas.properties.verification.properties,
  experimentSchemas.properties.verification.required,
);

export const recordUpdateExperimentTool = {
  name: "record_update_experiment",
  description: "...",
  schema: {
    ...experimentInputSchema.shape,
    experiment_id: z.string().describe("ID of the experiment record to update"),
    verification: verificationBlockSchema.optional().describe("Updated verification block"),
  },
  handler: async ({ ... }) => { ... },
};
```

The `z.object({ ...experimentInputSchema.shape, ... }).strict()` wrapper is the final compose step. The cook writes a small `composeUpdateSchema` helper to avoid duplicating this pattern across the 4 update tools.

### Helper: `composeUpdateSchema` (~25 LOC, in `core/schema-to-zod.js` or a new `core/schema-to-zod-helpers.js`)

Per red-team M3, the helper signature is:

```js
/**
 * Compose a tool's update schema from the type's schema + nested blocks.
 * - type: record type ("experiment" | "risk" | "decision" | "observation")
 * - root: project root (for loadSchemas)
 * - excludeFields: writer-generated fields to strip
 * - nestedBlocks: map of { <field_name>: <schema_property_path> }
 *   e.g., { verification: "verification" } for experiment
 *        or { decision_effect: "decision_effect" } for decision
 * Returns a z.object({...}).strict() with the type's input fields + nested blocks + tool-only fields.
 */
export function composeUpdateSchema({
  type,
  root,
  excludeFields = [],
  nestedBlocks = {},
  toolOnlyFields = {},  // { experiment_id: z.string().describe("...") }
}) {
  const schemas = loadSchemas(root);
  const inputSchema = buildZodSchemaFor(type, { root, excludeFields });
  const shape = { ...inputSchema.shape };

  // Add nested blocks (e.g., verification for experiment, decision_effect for decision)
  for (const [fieldName, schemaPath] of Object.entries(nestedBlocks)) {
    const blockProps = schemas[type].properties[schemaPath].properties;
    const blockRequired = schemas[type].properties[schemaPath].required || [];
    shape[fieldName] = zodObjectForProperties(blockProps, blockRequired).optional();
  }

  // Add tool-only fields (e.g., experiment_id, risk_id)
  Object.assign(shape, toolOnlyFields);

  return z.object(shape).strict();
}
```

**Per-record-type nested-block requirements (per red-team m2):**
- `experiment`: 1 nested block — `verification` (exposes `assertion_refs` after Phase 3)
- `risk`: 0 nested blocks
- `decision`: 1 nested block — `decision_effect` (exposes `action, scope, affected_refs, boundaries`)
- `observation`: 0 nested blocks

The `composeUpdateSchema` helper is tested by Phase 1's regression-safety: the existing 4 update tools' tests must pass with the helper-driven schema. The new `__tests__/experiment-update-verification-assertion-refs.test.js` (Phase 4) is a deeper regression-safety test for the experiment's verification block.

### Sidecar Population: `schemas/tool-descriptions.yaml`

The 8 hand-written tools' `.describe(...)` strings are migrated to the sidecar. Initial population:

```yaml
# Per-type descriptions keyed by field name. The schema-to-zod wrapper
# applies these on top of the schema-derived zod.
experiment:
  surface: "Surface/scope this experiment applies to (e.g., 'product', 'api')"
  goal: "What the experiment aims to determine"
  hypothesis: "The hypothesis being tested"
  method: "Steps to execute the experiment"
  success_metrics: "Criteria for success"
  source_refs: "Source references"
  scope: "Scope of the experiment"
  output_level: "Expected output granularity"
  claim_refs: "Claims this experiment validates"
  risk_refs: "Risks this experiment addresses"
  assertion_refs: "Assertion references this experiment validates (e.g., record:assertion-vnstock-data-install-...)"
  # Update-only fields:
  experiment_id: "ID of the experiment record to update"
  status: "New status"
  result: "Experiment result (e.g., 'supports', 'does-not-support', 'inconclusive')"
  agent_outcome: "Agent's assessment of the outcome"
  product_outcome: "Product impact of the outcome"
  observations: "Observations recorded during experiment"
  promotion_review: "Promotion review notes"
  notes: "Additional notes to append"
  # Verification block fields:
  verification.claim_refs: "Claims this experiment validates"
  verification.proves: "What this experiment proves"
  verification.proves.dimension: "Verification dimension"
  verification.proves.scope: "Scope of verification"
  verification.proves.output_level: "Output granularity proven"
  verification.requires_human_approval: "Whether human approval is required"
  verification.approval_status: "Current approval status"
risk:
  surface: "Surface/scope this risk applies to (e.g., 'product', 'api')"
  risk_statement: "Clear statement of the risk"
  category: "Risk category"
  severity: "Impact severity if risk materializes"
  likelihood: "Probability of risk occurring"
  confidence: "Confidence in the assessment"
  source_refs: "Source references"
  claim_refs: "Claims this risk relates to"
  experiment_refs: "Experiments that address this risk"
  mitigation: "Mitigation measures"
decision:
  surface: "Surface/scope this decision applies to (e.g., 'product', 'api')"
  question: "The question this decision answers"
  decision: "The decision made"
  rationale: "Reasoning behind the decision"
  alternatives: "Alternatives considered"
  tradeoffs: "Tradeoffs of the decision"
  source_refs: "Source references"
  supersedes: "Decisions this one supersedes"
  decision_effect: "The effect of the decision"
observation:
  constraint_type: "Type of constraint (e.g., sudo, docker, device_limit)"
  constraint: "Short kebab-case slug describing the constraint"
  description: "Human-readable description of the observation"
  source_refs: "Source references (e.g., record:..., local:...)"
  # Update-only:
  status: "New status (active | archived)"
  reason: "Reason for the status change"
```

The cook reads each tool's current `.describe(...)` strings and copies them into the sidecar. The wrapper applies them via `loadDescriptions()`. The exact wording is preserved (no rewrite), to keep the diff minimal and reviewable.

## TDD Workflow

This phase has 0 new tests. The contract is: **the 573 pre-existing tests + 19 Phase 0 tests still pass at every step.**

### Cook Protocol

1. **Refactor one tool file at a time.** The 8 files are independent; each can be refactored, tested, and (if it passes) merged before moving to the next.
2. **Run `pnpm test` after each file.** A regression in any file surfaces immediately.
3. **For update tools, refactor the top-level first, then the nested `verification` block.** A nested-block regression is harder to debug; the cook can isolate it.
4. **Migrate descriptions to the sidecar per file.** The cook reads the file's current descriptions, adds them to the sidecar, then refactors.
5. **Run `pnpm validate:records` after each file.** The schema is unchanged; the tool surface is unchanged; AJV still passes.

If a regression appears, the cook rolls back the affected file and re-examines. The 8 files are independent commits; the cook can ship Phase 1 in 8 atomic commits.

### Suggested File Order (least risky first)

1. `record-observation-tool.js` (simplest, no nested blocks)
2. `update-observation-tool.js` (no nested blocks, but `status` is special)
3. `create-decision-record-tool.js` (no nested blocks)
4. `update-decision-record-tool.js` (no nested blocks)
5. `create-risk-record-tool.js` (no nested blocks)
6. `update-risk-record-tool.js` (no nested blocks)
7. `create-experiment-record-tool.js` (no nested blocks)
8. `update-experiment-record-tool.js` (has the `verification` nested block; refactor last)

The order minimizes risk: each refactor builds on the previous; the experiment tool is the most complex and is done last when the cook is warmed up.

## Implementation Steps

1. Read `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` (canonical example).
2. Read `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` (canonical nested-block example).
3. Read `tools/learning-loop-mcp/tools/create-risk-record-tool.js`, `update-risk-record-tool.js`, `create-decision-record-tool.js`, `update-decision-record-tool.js`, `record-observation-tool.js`, `update-observation-tool.js` (the 6 other tools).
4. Create `schemas/tool-descriptions.yaml` with the 8 tools' descriptions (Step 1 above).
5. For each of the 8 tool files (in the order above):
   a. Refactor the `schema:` block to use `buildZodSchemaFor(...)` (and `zodObjectForProperties(...)` if needed).
   b. Run `pnpm test` — confirm all 592 tests still pass.
   c. Run `pnpm validate:records` — confirm 183 records, 0 errors.
6. Run `pnpm test` — final verification, 592 pass, 0 fail.
7. Run `pnpm validate:records` — final verification.
8. Run `pnpm validate:plan-loop` — final verification.

## Related Code Files

### Create (1 new file)
- `schemas/tool-descriptions.yaml` (NEW, sidecar with descriptions for 4 record types × ~15-20 fields each)

### Modify (8 files)
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` (replace zod schema, including nested `verification` block)
- `tools/learning-loop-mcp/tools/create-risk-record-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/update-risk-record-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/create-decision-record-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/update-decision-record-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/record-observation-tool.js` (replace zod schema)
- `tools/learning-loop-mcp/tools/update-observation-tool.js` (replace zod schema)

### Read
- `tools/learning-loop-mcp/core/schema-to-zod.js` (Phase 0's wrapper)
- `tools/learning-loop-mcp/core/schema-loader.js` (the `loadSchemas` to use)
- `tools/learning-loop-mcp/core/schema-description-loader.js` (the sidecar loader)
- `schemas/*.schema.json` (the 4 active schemas)
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` (regression-safety for bridge-2 path)

### Delete
- None

## Success Criteria

- [ ] All 8 tool files use `buildZodSchemaFor(...)` for their `schema:` property
- [ ] `update-experiment-record-tool.js` uses `zodObjectForProperties(...)` for the `verification` block
- [ ] `schemas/tool-descriptions.yaml` is populated with all 8 tools' descriptions
- [ ] 573 pre-existing tests + 19 Phase 0 tests = 592 tests still pass
- [ ] `pnpm test` shows 592 pass, 0 fail
- [ ] `pnpm validate:records` passes (183 records)
- [ ] `pnpm validate:plan-loop` passes (74 plans)
- [ ] No `.describe(...)` strings remain in the 8 tool files (migrated to sidecar)
- [ ] The 8 hand-written zod schemas are removed (replaced by `buildZodSchemaFor` calls)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| A regression in any of the 8 tool files could break MCP tool behavior. | high | The full test suite runs after each file; a regression is caught immediately. The cook is incremental. |
| The `zodObjectForProperties` helper is new and untested. | medium | Phase 0's 17 unit tests include a smoke test for `zodObjectForProperties` (test #16). The cook runs the full suite after the first nested-block use. |
| The sidecar descriptions may diverge from the original `.describe(...)` strings during migration. | low | The cook copies the strings verbatim (no rewrite). The diff is small and reviewable. |
| The `verification` block in `update-experiment-record-tool.js` is a nested object with its own `required` array; the helper must respect the nested `required` to avoid false-strict behavior. | low | `zodObjectForProperties(properties, required)` accepts both arguments; the cook passes `experimentSchemas.properties.verification.required` explicitly. |
| A new field added to a schema between Phase 0 and Phase 1 would appear in the tool automatically; the cook may not notice. | low | This is the desired behavior (schema is source of truth). The cook can run `pnpm test` to see the new field's behavior. |
| The 8-file refactor is the largest single change in the plan. If the cook loses momentum or hits a complex case, the phase may stall. | low | The 8 files are independent; the cook can ship them in 8 commits. The order is least-risky-first; the experiment tool is last. |
| The `observation` tools have a `description` parameter (mapped to `notes` in the writer). The schema's `notes` field has a description, but the tool's `description` parameter does not (it's a tool input, not a schema field). The sidecar should not apply a description to the tool's `description` parameter. | low | The sidecar is keyed by schema field name; the tool's `description` parameter is named `description` (matching), but the schema's `notes` field is named `notes`. The mapping is preserved: the tool's `description` parameter has a hand-written `.describe()` (or the writer's `description → notes` rename keeps working without a sidecar entry). |
| The `update-observation-tool.js` has a `reason` parameter that is appended to `notes` (per line 177-179). This is a tool-only field, not a schema field. | low | The tool's `reason` parameter is not in the schema; `buildZodSchemaFor` does not include it. The cook adds `reason` to the update tool's schema with a hand-written `.describe()` (acceptable; this is the "what can I supply" contract). |
| Phase 1 may temporarily break the SP1-derive-status test that uses `record_update_observation` with `status: "inactive"` (per Phase 4's value-set fix). | low | Phase 1 is BEFORE Phase 4; the `inactive` status is still accepted by the tool today. Phase 4 changes the schema enum; the test file is updated in Phase 4. |
| The Phase 0 wrapper's `.strict()` call may reject inputs that the hand-written tools currently accept (e.g., a `surface` field at top level that the hand-written tool strips). | low | The hand-written `z.object({...})` schemas default to strip, so extras are removed silently. The new `.strict()` schemas reject them. If a regression appears, the cook either (a) updates the schema to declare the field, or (b) accepts the stricter behavior. |

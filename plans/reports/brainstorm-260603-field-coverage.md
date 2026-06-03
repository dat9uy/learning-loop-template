---
date: "2026-06-03T15:55:00Z"
status: agreed
tags: [brainstorm, field-coverage, schema-truth, drift-prevention, code-organization, gap-closure]
related:
  - docs/journals/260603-sp2-gap-closure-cook.md (the originating journal entry)
  - records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml (the original gap assertion, now stale)
  - schemas/experiment.schema.json
  - schemas/risk.schema.json
  - schemas/decision.schema.json
  - schemas/observation.schema.json
  - schemas/claim.schema.json
  - schemas/index-entry.schema.json
  - schemas/capability.schema.json
  - tools/learning-loop-mcp/core/schema-loader.js
  - tools/learning-loop-mcp/core/experiment-writer.js
  - tools/learning-loop-mcp/core/claim-verification-rules.js
  - tools/learning-loop-mcp/core/record-validation-rules.js
  - tools/learning-loop-mcp/core/negative-fixture-runner.js (28 existing fixtures)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (precedent for runtime-first-use)
---

# Field-Coverage Mechanism: Centralize Schema, Prevent Code Drift

## Pre-Plan Validation: `z.fromJSONSchema()` Spike

> **Status: passed (2026-06-03).** Before this report was handed to a follow-up `ck:plan` session, a 1-day spike validated the load-bearing assumption: that zod 4's built-in `z.fromJSONSchema()` can serve as the engine of `core/schema-to-zod.js`. The spike is at `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` (16 tests, 0 fail; full suite: **573/573 pass**, 557 prior + 16 new).
>
> **What the spike proved:**
> - All 7 active schemas convert without throwing.
> - All 7 active schemas round-trip a hand-built minimal record and reject an invalid enum / const / pattern.
> - The deprecated `claim.schema.json` also converts, and its `$ref`/`$defs` chain is **strictly enforced** at parse time. The strict-ref test rejected `verification.static.status: "BOGUS"` with the exact enum from the `$def`'d `proof_dimension` and the error path correctly traversed `verification → static → status`.
> - Array-of-strings with nested `pattern` (e.g. `experiment.assertion_refs: ["record:assertion-..."]`) is enforced correctly — the pattern is propagated through the array's `items` schema.
> - zod 4.4.3 is in use; `z.fromJSONSchema()` requires zod >= 4.2 (the spike asserts this so a future zod bump that drops the function fails loudly).
>
> **Implication for Phase 0 of the plan:** the originally-specified "convert JSON Schema to zod for the subset used by `schemas/*.json`" task is **no longer a from-scratch implementation**. `core/schema-to-zod.js` is a thin wrapper (~30 LOC) around `z.fromJSONSchema()` that adds project-specific concerns: `excludeFields` for writer-generated fields, optional sidecar description lookup, error-message formatting.
>
> **Open question for the follow-up plan (not answered by the spike):** the spike did not test `description` passthrough. Zod 4 carries `description` through metadata, but this should be verified before the sidecar `schemas/tool-descriptions.yaml` is designed. If `z.fromJSONSchema()` carries descriptions automatically, the sidecar is optional (only for fields where the schema's description is unhelpful or missing). If not, the sidecar is required and must be populated as a separate Phase 0 task.
>
> **References:**
> - Spike: `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js`
> - Research that motivated the spike: `plans/reports/research-260603-1600-json-schema-to-zod-libraries.md`
> - This report: `plans/reports/brainstorm-260603-field-coverage.md`

> **Status: agreed.** Brainstorm only — no code change. Recommends Approach 2 (schema-derived zod tool schemas + coverage test) as a ~1 week follow-up plan, with Approach 3 (full schema-driven builder) sketched as future work after SP3.

## Problem Statement

The record system has **four parallel "field catalogues"** for every record type. Each is hand-written and none of them are cross-checked:

| Layer | Where | Authored by | Example: where is `assertion_refs` declared for an experiment? |
|---|---|---|---|
| **Schema** | `schemas/<type>.schema.json` | hand-written JSON Schema (Draft 2020-12) | top-level `assertion_refs` AND inside `verification.assertion_refs` |
| **Tool input** | `tools/create-<type>-record-tool.js` zod schema | hand-written zod | top-level `assertion_refs` only |
| **Writer output** | `core/<type>-writer.js#build<Type>Yaml` | hand-written JS object | top-level `assertion_refs`; `verification.assertion_refs` **not populated** |
| **Validator input** | `core/claim-verification-rules.js#validateExperimentProves` | hand-written | reads `verification.assertion_refs` (with fallback to `verification.claim_refs`) |

Every layer is internally correct in isolation. The system as a whole produces an invalid record. The SP2 cook session hit this exact bug: the cook's experiment record had top-level `assertion_refs`, the writer never bridged it to `verification.assertion_refs`, the validator read from the inner level, and the bridge-2 unit test only checked the top level. The record was rejected by `validate:records`. Soft-deleted.

The user's question is meta: **how do we know we don't miss/add a field that doesn't exist / need to exist?** Equivalently: how do we make divergence between these four layers impossible to merge? The system needs the **schema to be the single source of truth** and the code to be **prevented from drifting** away from it.

### Failure modes of the class

1. **Writer-drops** — schema declares a field, the writer never populates it. (`experiment.verification.assertion_refs`, `risk.assertion_refs`, `experiment.output_capture`.)
2. **Tool-doesn't-expose** — schema and writer agree, but the MCP tool's zod schema doesn't surface the field, so agents can never supply it. (`record_update_experiment.verification.assertion_refs` is missing the field; `record_create_risk` and `record_update_risk` are missing `assertion_refs` entirely.)
3. **Validator-mismatch** — schema has the field, writer populates it, but at a *different level* than the validator reads. (Experiment `claim_refs` / `assertion_refs` / `risk_refs` exist at both top-level and inside `verification.*`; only the writer bridges top-level to `verification.claim_refs`; nothing bridges `assertion_refs`.)

All three were present in the SP2 cook record. The bridge-2 test caught none.

### Why the existing safety net missed it

- **AJV JSON-Schema validation** checks shape (presence, type, enum, pattern). It cannot detect "the writer silently dropped this field" because the dropped field is `additionalProperties: false`-allowed-as-omitted.
- **28 hand-authored negative fixtures** in `tools/learning-loop-mcp/fixtures/negative/` each test one specific failure mode. Adding a new field requires hand-writing a new fixture; the drift between "field added" and "fixture added" is the same problem one level up.
- **The 4 unit tests** for `bridge-2` and `workflow_candidate_to_experiment` only check `draft.assertion_refs` (top-level). They never check `draft.verification.assertion_refs` or `draft.verification.claim_refs`.
- **The gap-assertion record** (`assertion-meta-static-mcp-experiment-verification-block.yaml`) was written when the gap was "writer doesn't populate `verification.claim_refs` / `verification.proves`". After the bridge-2 `assertion_refs` addition, the writer now populates `verification.claim_refs` (from top-level) and `verification.proves: []` (empty default). The assertion's text is now stale; the gap has shifted to `verification.assertion_refs`.

## Evaluated Approaches

### Approach 1 — Schema-anchored coverage test (detection only)

**Scope:** Add a single test `__tests__/field-coverage.test.js` (~200 LOC) that, for every record type, reads the JSON schema and asserts a coverage matrix:

- For every `properties.*` path, assert the writer's `build<Type>Yaml` has a matching key (param-name or AST match).
- For every `properties.*` path consumed by a semantic validator (`claim-verification-rules.js`, `record-validation-rules.js` non-shape rules), assert the writer populates it OR there's a documented `x-validator-computed` annotation in a sidecar manifest.
- For every property in the schema, assert at least one MCP tool (`create_*` or `update_*`) exposes it via its zod schema.

A new field added to a schema without touching the writer/tool will fail the test. The test is the single detector.

| Pros | Cons |
|---|---|
| Smallest change (~1 new test file) | **Still detection, not prevention** — drift can be merged if the test is skipped or the sidecar is wrong |
| No refactor of existing writers/tools | AST-matching is fragile; new writers may need hand-declared params |
| Catches all 3 failure modes (writer-drops, tool-doesn't-expose, validator-mismatch) | Doesn't enforce ordering, defaults, or semantic meaning |
| Fits existing test pattern (28 negative fixtures already exist) | The sidecar manifest can itself drift |

**Verdict:** Useful but does not answer "how to not make the code drift". Detection ≠ prevention.

### Approach 2 — Recommended: Schema-derived zod tool schemas + coverage test

**Scope (2 changes):**

1. **New module `core/schema-to-zod.js`** that converts a JSON Schema (Draft 2020-12 subset used by `schemas/*.json`) to a zod schema. Handles: `string`, `number`, `integer`, `boolean`, `enum`, `array`, `object`, `pattern`, `required`, `const`. Replace the hand-written zod schemas in all 8 record-CUD tool files with `zodFromSchema(loadSchemas(root).<type>.properties, { descriptionOverrides })`. Human-authored descriptions live in a sidecar `schemas/tool-descriptions.yaml`, keyed by `<type>.<field>`.

2. **Coverage test `__tests__/field-coverage.test.js`** (same intent as Approach 1, but smaller scope) that checks only the **two remaining layers**: writer → schema and validator → schema. The tool-zod layer is now derived and provably consistent by construction. ~50% of the test logic is removed.

A new field added to a schema:
- Automatically appears in the tool-zod (no code change).
- Fails the coverage test if the writer doesn't populate it.
- Fails the coverage test if the validator doesn't read it.

| Pros | Cons |
|---|---|
| **Tool-zod layer is mathematically consistent with the schema** — drift on that layer is impossible | Doesn't fix the writer layer (writers stay hand-written; covered by the test, not by codegen) |
| Coverage test shrinks; remaining checks target the actual problem | `additionalProperties` is the unverified edge. The spike proved `enum`, `const`, `pattern`, nested `array.items` with `pattern`, and `$ref`/`$defs` work for our subset. `additionalProperties: false` is NOT set in our schemas; the plan must decide whether to inject it (zod 4 `z.object` defaults to strict, but `z.fromJSONSchema()` may pass through the schema's unset/permissive default). |
| Existing tool descriptions can be preserved via sidecar | Tool descriptions are maintained in a sidecar file (lighter drift surface but not zero) |
| Foundational: future tools (e.g. `record_bulk_create`) get the same treatment for free | Refactor of 8 tool files plus 1 new module plus 1 sidecar |
| Closes the 3 known experiment gaps as a side effect of the writer-coverage check | |
| No risk to existing 183 records (writers and tests stay green) | |

**Verdict:** Sweet spot. Prevents the largest drift surface (8 hand-written zod schemas) and detects the rest. ~1 week. Foundational for Approach 3.

### Approach 3 — Schema-driven record builder (full codegen, future work after SP3)

**Scope (3 changes):**

1. **New module `core/schema-builder.js`** exposes `buildRecord(type, params, overrides?)`. It reads the schema's `properties`, `required`, and a small `x-writer` extension (for defaults, derived fields, computed paths) and returns a fully-populated record.

2. **All 4 writers** become 1-line wrappers: `export const buildExperimentYaml = (p) => buildRecord('experiment', p)`.

3. **Tool zod schemas** are derived (Approach 2).

4. **Semantic validators** (`claim-verification-rules.js`) get a "required-derived-fields" check from the schema, so any `verification.*.assertion_refs` style field that the schema requires the writer to populate is automatically checked.

A new field added to a schema: every layer is updated by the buildRecord caller, or the schema is wrong.

| Pros | Cons |
|---|---|
| **Drift on the writer layer is impossible by construction** | Big refactor: 4 writer files, 8 tool files, 1 semantic validator, 9 schemas need `x-writer` extension entries |
| Cross-record-type by default; new record types just need a new schema | The `x-writer` extension is itself a small DSL that can drift |
| Single point of auditability: "what does an experiment record look like?" → read the schema | Existing semantic rules (claim-verification-rules.js) cannot be 100% derived from JSON Schema; some hand-written logic remains |
| Future schemas (e.g., new dimension types) need no code change beyond the schema | High risk of breaking the 183 existing records if migration is wrong; needs careful parity tests |

**Verdict:** End-state, but not now. Per the operator's directive ("only we finish the SP3 at least"), Approach 3 is the destination — Approach 2 is the migration step that builds the prerequisite `schema-to-zod` module and proves the sidecar-description pattern. Approach 3 is the next `brainstorm` after SP3 ships.

## Final Recommended Solution

**Approach 2: Schema-derived zod tool schemas + coverage test.**

### Phase sketch (for a follow-up `ck:plan`)

#### Phase 0: `core/schema-to-zod.js` thin wrapper + unit tests

**Engine:** `z.fromJSONSchema()` from zod 4.2+ (pre-validated by the spike; see "Pre-Plan Validation" at the top of this report). The wrapper is project glue, not a from-scratch converter.

- Re-export `zodFromSchema(jsonSchema)` as a thin pass-through to `z.fromJSONSchema(jsonSchema)`.
- Add `buildZodSchemaFor(type, { excludeFields, name })`:
  - Loads the schema via `loadSchemas(root)`.
  - Calls `zodFromSchema(schemas[type])`.
  - For tool inputs: `excludeFields` removes writer-generated fields (`id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`) from the surface so the tool schema matches the user-input contract. Per-type `excludeFields` lists are a small, audit-friendly config.
  - For tool inputs: optional fields that the writer initializes (e.g. `source_refs` defaults to `["local:learning-loop-mcp"]` in the existing handlers) are kept — they're inputs the user *may* supply.
- Add `zodObjectForProperties(properties, required)` for the case where a tool only needs a subset (e.g. the `verification` block on the update tool).
- **Description handling:** investigate whether `z.fromJSONSchema()` carries `description` through to `z.describe()`. If yes, the sidecar `schemas/tool-descriptions.yaml` is optional (only for fields where the schema's description is unhelpful or missing). If no, the sidecar is required and must be populated.
- **Unit tests:** `__tests__/schema-to-zod.test.js` covers (a) every property in every schema passes through unchanged when wrapped by `buildZodSchemaFor`, (b) `excludeFields` works, (c) the spike's 16 tests stay green as a permanent regression suite.
- **Pin zod in `package.json`:** the plan must pin zod to a known-working minor (currently 4.4.3) to detect experimental-API drift on `pnpm install`. The spike's metadata test (`logs the zod version this spike is testing against`) asserts `zod >= 4.2`; this assertion is the canary.

#### Phase 1: Replace hand-written zod in 8 tool files

- `tools/create-experiment-record-tool.js`
- `tools/update-experiment-record-tool.js`
- `tools/create-risk-record-tool.js`
- `tools/update-risk-record-tool.js`
- `tools/create-decision-record-tool.js`
- `tools/update-decision-record-tool.js`
- `tools/record-observation-tool.js` (create)
- `tools/update-observation-tool.js`

Each becomes:

```js
import { buildZodSchemaFor } from "#mcp/core/schema-zod-bridge.js";
// ...
schema: buildZodSchemaFor("experiment", { excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"] }),
```

The `excludeFields` list captures the writer-generated fields that are not user inputs. `buildZodSchemaFor` internally calls `z.fromJSONSchema(loadSchemas(root).experiment)` (the spike-validated engine) and strips the excluded fields from the resulting zod object.

For the `verification` block on update tools (a subset of the full schema), use the lower-level `zodObjectForProperties(properties, required)`:

```js
schema: z.object({
  ...otherFields,
  verification: zodObjectForProperties(schemas.experiment.properties.verification.properties, schemas.experiment.properties.verification.required),
}),
```

#### Phase 2: Coverage test `__tests__/field-coverage.test.js`

For each record type, for every property in the schema:

1. **Writer-coverage check.** The writer's `build<Type>Yaml({ <prop>: <value> })` must produce a record that, after JSON round-trip, contains the same `<prop>` at the same level. (A field that the writer silently drops fails this.)
2. **Validator-coverage check.** For every property path consumed by a semantic validator (manually enumerated in a `validator-coverage.yaml` sidecar, e.g., `claim-verification-rules.js` consumes `verification.assertion_refs`, `verification.claim_refs`, `verification.proves[*].dimension`, `verification.proves[*].scope`, `verification.proves[*].output_level`, `verification.requires_human_approval`, `verification.approval_status`; `record-validation-rules.js` consumes `verification.*.claim_refs`, `verification.*.proofs[*].claim_ref`, `decision_effect.affected_refs`), assert that the writer populates the path OR the path is marked as `x-validator-computed: true` in the schema (and a fixture exists proving the validator's behavior on a record with the path missing).
3. **Initial run.** The test must pass on the **current** code with the **known drifted fields** documented in `schemas/field-drift-exceptions.yaml` (a sidecar of "I know this is wrong; I'm tracking it"). The exceptions file shrinks as the writer is fixed.

#### Phase 3: Close the 3 known experiment gaps

- Extend `core/experiment-writer.js#buildExperimentYaml` to populate `verification.assertion_refs` from top-level `assertion_refs` when present.
- Extend `tools/update-experiment-record-tool.js` (now schema-derived) — **automatically exposed** by the codegen since the field is in the schema. No manual change.
- Extend `core/candidate-to-experiment/experiment-draft-builder.js` to populate `verification.assertion_refs` in the draft (the writer change above flows through).
- Update the gap-assertion record `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` to reflect the new gap shape and resolution.

#### Phase 4: Add 3 negative fixtures

- `experiment-missing-verification-assertion-refs` — top-level `assertion_refs: [...]`, `verification.claim_refs: []`, `verification.assertion_refs` absent, `verification.proves: [{dimension: "install", scope: "sandbox", output_level: "metadata-only"}]`. Expected error: "verification.assertion_refs must name at least one assertion or claim".
- `risk-missing-assertion-refs` — risk with `assertion_refs: []` in writer output where the assertion is in scope. Expected error: a semantic-rule message (or a "writer is not the source" note if not enforced).
- `experiment-update-verification-assertion-refs-blocked` — proves the update tool can now accept `verification.assertion_refs` and the field round-trips.

### File touchpoints

| File | Change |
|---|---|
| `core/schema-to-zod.js` | **NEW**. Thin wrapper around `z.fromJSONSchema()` (~30 LOC). Adds `excludeFields`, optional name, and (if needed) sidecar description lookup. |
| `core/schema-zod-bridge.js` | **NEW**. Thin helper that composes `zodFromSchema` with the per-type `excludeFields` and (if needed) `loadDescriptions`. |
| `core/schema-description-loader.js` | **OPTIONAL**. Loads `schemas/tool-descriptions.yaml`. Only needed if `z.fromJSONSchema()` does not pass `description` through automatically (open question; see "Pre-Plan Validation"). |
| `schemas/tool-descriptions.yaml` | **OPTIONAL**. Sidecar: human-authored zod `.describe(...)` strings, keyed by `<type>.<field>`. Only needed if the schema's built-in `description` is unhelpful. |
| `schemas/field-drift-exceptions.yaml` | **NEW**. Initial population enumerating the 11 drift cells (8 experiment + 3 risk) from the Appendix below. |
| `schemas/validator-coverage.yaml` | **NEW**. Lists every property path consumed by a semantic validator (per record type). |
| `tools/create-experiment-record-tool.js` | Replace zod schema with `buildZodSchemaFor("experiment", ...)`. |
| `tools/update-experiment-record-tool.js` | Same. |
| `tools/create-risk-record-tool.js` | Same. |
| `tools/update-risk-record-tool.js` | Same. |
| `tools/create-decision-record-tool.js` | Same. |
| `tools/update-decision-record-tool.js` | Same. |
| `tools/record-observation-tool.js` | Same. |
| `tools/update-observation-tool.js` | Same. |
| `core/experiment-writer.js` | Populate `verification.assertion_refs` from top-level `assertion_refs`. |
| `core/candidate-to-experiment/experiment-draft-builder.js` | Populate `verification.assertion_refs` in the draft. |
| `__tests__/field-coverage.test.js` | **NEW**. Writer-coverage + validator-coverage checks. |
| `__tests__/schema-to-zod.test.js` | **NEW**. Unit tests for the conversion. |
| `tools/learning-loop-mcp/fixtures/negative/experiment-missing-verification-assertion-refs/` | **NEW**. |
| `tools/learning-loop-mcp/fixtures/negative/risk-missing-assertion-refs/` | **NEW**. |
| `tools/learning-loop-mcp/fixtures/negative/experiment-update-verification-assertion-refs-blocked/` | **NEW**. |
| `core/negative-fixture-runner.js` | Add the 3 new fixture names to the cases list. |
| `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` | Update assertion text to reflect the new gap shape and resolution. |

### Validation strategy

- The current full test suite (573 tests as of 2026-06-03, after the spike; was 557 before) must still pass at every phase boundary.
- The new `field-coverage.test.js` must pass on the **current** code with all 11 known drift cells documented in `schemas/field-drift-exceptions.yaml` (see Appendix: 8 experiment + 3 risk; decision and observation are clean).
- After Phase 3, the exceptions file shrinks from 11 to 0 (assuming Phase 0–2 of the follow-up plan is the mechanism and Phase 3 is the actual fix).
- AJV strict mode (`strict: true, allErrors: true`) already in `core/record-validation-rules.js` — the new tool-zod schemas must be AJV-compatible.
- The 3 new negative fixtures must be picked up by `runNegativeFixtures` and pass.
- The 16-test spike at `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` stays as a **permanent regression test**. A future zod minor that silently drops `$ref`/`$defs` support (or the `z.fromJSONSchema()` function itself) will fail this test loudly, surfacing the breaking change at `pnpm test` time rather than at agent runtime.

### Out of scope (this report)

- Implementing Approach 2. The operator chose "report only" for this brainstorm.
- Implementing Approach 3. Deferred to a follow-up brainstorm after SP3 ships.
- Updating existing experiment records that already failed validation due to the SP2 gap.
- Refactoring semantic validators (`claim-verification-rules.js`) to be schema-driven.
- Centralizing the 9 schema files into one (separate refactor; they already share `$defs` patterns).
- Generating `record_create_*` and `record_update_*` MCP tool *registrations* from the schema (the tool list in `tools/manifest.json` is a separate concern; it would be a follow-up).

### Acceptance criteria for this report

- Names the 4 layers (schema, tool-zod, writer, validator) and the gaps on each layer.
- Presents 3 approaches with trade-offs and a recommendation.
- Specifies file touchpoints, validation strategy, and out-of-scope items.
- Enumerates every known drifted field (see Appendix) so a follow-up plan can use it as a checklist.
- Can be handed to a follow-up `ck:plan` session and produce a working plan.

---

## Appendix: Field-by-Field Drift Enumeration

For each record type with a hand-written tool, the table shows whether each schema field is exposed in the create/update tool, written by the writer, and read by a validator. **Cells marked `[—]` mean that layer does not (or should not) reference the field**; cells marked `[no]` mean the layer exists but does not reference the field; cells marked `[yes]` mean the layer does reference the field. **Bold `[no]` cells are drift.**

### Experiment (12 schema fields, 8 drift cells)

| Schema field | Create tool | Update tool | Writer output | Validator reads | Drift? |
|---|---|---|---|---|---|
| `id` | `[—]` (writer-generated) | `[—]` (immutable) | yes | no | OK |
| `schema_version` | `[—]` | `[—]` | yes | no | OK |
| `type` | `[—]` | `[—]` | yes | no | OK |
| `status` | `[—]` (writer-default `draft`) | yes | yes | no | OK |
| `created_at` | `[—]` | `[—]` | yes | no | OK |
| `updated_at` | `[—]` | `[—]` | yes | no | OK |
| `source_refs` | yes | yes (append-only) | yes | no | OK |
| `notes` | no | yes | no | no | **drift** — update sets it, but no layer initializes it; if a record is created with `notes`, the writer drops it |
| `goal` | yes | yes | yes | no | OK |
| `hypothesis` | yes | yes | yes | no | OK |
| `method` | yes | yes | yes | no | OK |
| `success_metrics` | yes | yes | yes | no | OK |
| `result` | no | yes | yes | no | OK (write-once, not in create) |
| `agent_outcome` | no | yes | yes | no | OK |
| `product_outcome` | no | yes | yes | no | OK |
| `observations` | no | yes | yes | no | OK |
| `promotion_review` | no | yes | yes | no | OK |
| `scope` | yes | **no** | yes | no | **drift** — update can't change scope after creation |
| `claim_refs` (top-level) | yes | **no** | yes | no | **drift** — update can't change top-level claim_refs |
| `risk_refs` (top-level) | yes | **no** | yes | no | **drift** — update can't change top-level risk_refs |
| `output_level` | yes | **no** | yes | no | **drift** — update can't change output_level |
| `output_capture` | no | no | no | no | **drift** — schema has the field, no layer ever sets it |
| `verification` (block) | (via `claim_refs`, `assertion_refs`) | yes | yes | yes | partial |
| `verification.claim_refs` | (only as top-level) | yes | yes (bridged from top-level) | yes (fallback) | OK (writer bridges) |
| `verification.proves` | no | yes | empty array | yes | OK (proves is filled by update) |
| `verification.requires_human_approval` | no | yes | true | yes | OK |
| `verification.approval_status` | no | yes | "not-required" | yes | OK |
| `verification.assertion_refs` | **no** (top-level only) | **no** (update verification block missing it) | **no** (writer never populates) | **yes** (PRIMARY read) | **drift (the SP2 gap)** |
| `assertion_refs` (top-level) | yes | **no** | yes | no | **drift** — update can't change top-level assertion_refs |

**Drift count for experiment: 8** (the SP2 gap `verification.assertion_refs` is the loudest; the other 7 are silent because no current record exercises them).

### Risk (12 schema fields, 3 drift cells)

| Schema field | Create tool | Update tool | Writer output | Drift? |
|---|---|---|---|---|
| `id` | `[—]` | `[—]` | yes | OK |
| `schema_version` | `[—]` | `[—]` | yes | OK |
| `type` | `[—]` | `[—]` | yes | OK |
| `status` | `[—]` (writer-default) | yes | yes | OK |
| `created_at` | `[—]` | `[—]` | yes | OK |
| `updated_at` | `[—]` | `[—]` | yes | OK |
| `source_refs` | yes | (not in update schema) | yes | OK (update would re-append; not exposed) |
| `notes` | no | yes | no | OK (update path handles it) |
| `risk_statement` | yes | yes | yes | OK |
| `category` | yes | yes | yes | OK |
| `severity` | yes | yes | yes | OK |
| `likelihood` | yes | yes | yes | OK |
| `confidence` | yes | yes | yes | OK |
| `claim_refs` | yes | **no** | yes | **drift** — update can't change claim_refs |
| `experiment_refs` | yes | **no** | yes | **drift** — update can't change experiment_refs |
| `mitigation` | yes | yes | yes | OK |
| `assertion_refs` | **no** | **no** | **no** | **drift** — schema has it, no layer ever sets it; dormant because no validator reads it yet |

**Drift count for risk: 3.**

### Decision (14 schema fields, 1 drift cell)

| Schema field | Create tool | Update tool | Writer output | Drift? |
|---|---|---|---|---|
| `id` | `[—]` | `[—]` | yes | OK |
| `schema_version` | `[—]` | `[—]` | yes | OK |
| `type` | `[—]` | `[—]` | yes | OK |
| `status` | `[—]` (writer-default) | yes | yes | OK |
| `created_at` | `[—]` | `[—]` | yes | OK |
| `updated_at` | `[—]` | `[—]` | yes | OK |
| `source_refs` | yes | yes (append-only) | yes | OK |
| `notes` | no | yes | no | OK (update handles it) |
| `question` | yes | yes | yes | OK |
| `decision` | yes | yes | yes | OK |
| `rationale` | yes | yes | yes | OK |
| `alternatives` | yes | yes | yes | OK |
| `tradeoffs` | yes | yes | yes | OK |
| `supersedes` | yes | yes | yes | OK |
| `decision_effect` | yes | yes | yes | OK |
| `decision_effect.action` | (via decision_effect) | (via decision_effect) | yes | OK |
| `decision_effect.scope` | (via decision_effect) | (via decision_effect) | yes | OK |
| `decision_effect.affected_refs` | (via decision_effect) | (via decision_effect) | yes | OK |
| `decision_effect.boundaries` | (via decision_effect) | (via decision_effect) | yes (if present) | OK |

**Drift count for decision: 0.** Decision is the cleanest record type. (The 1 cell that might have been drift is `notes`, but the update path handles it via `updateRecordFile`'s merge.)

### Observation (8 schema fields, 0 drift cells)

| Schema field | Create tool | Update tool | Writer output | Drift? |
|---|---|---|---|---|
| `id` | `[—]` | `[—]` | yes | OK |
| `schema_version` | `[—]` | `[—]` | yes | OK |
| `type` | `[—]` | `[—]` | yes | OK |
| `status` | `[—]` (writer-default `active`) | yes | yes | OK |
| `created_at` | `[—]` | `[—]` | yes | OK |
| `updated_at` | `[—]` | `[—]` | yes | OK |
| `source_refs` | yes | (immutable per `IMMUTABLE_FIELDS`) | yes | OK |
| `constraint_type` | yes | (immutable) | yes | OK |
| `constraint` | yes | (immutable) | yes | OK |
| `notes` | (passed as `description` param) | no (notes field is updated to include reason) | yes (from `description`) | OK (the description→notes rename is intentional; tool param is human-friendly, writer stores as schema field) |

**Drift count for observation: 0.** Observation is clean.

### Claim (deprecated — no create tool; `index_update_claim` updates one dimension at a time)

The `index_update_claim` tool is dimension-targeted (updates `verification.<dimension>.*`) rather than a general field update. The claim schema's `verification` block is per-dimension (`static`, `install`, `runtime`, `product`) and the tool only touches one dimension per call. This is an architectural difference, not a drift.

**Drift count for claim: N/A** (different update pattern; covered separately by the deprecated-claim lifecycle).

### Extracted-assertion (no create tool — machine-extracted by `extract-index.js`)

Created by `tools/extract-index-cli.js` → `core/extract-index/extract-index.js` → `core/extract-index/index-entry-builder.js#buildIndexEntry`. The schema is enforced by AJV; the builder reads the schema (in effect) by mapping `frontmatter.capability`, `frontmatter.dimension`, etc.

**Drift count for extracted-assertion: 0** (machine-extracted; no hand-written tool/writer).

### Capability (no create tool — generated by `generate-capabilities.js`)

Schema is enforced by AJV. Generation is owned by the capability-generator pipeline.

**Drift count for capability: 0** (machine-generated; no hand-written tool/writer).

---

## Summary

| Record type | Total schema fields | Drift cells | Loudest gap |
|---|---|---|---|
| experiment | 30 (incl. nested) | 8 | `verification.assertion_refs` (the SP2 cook gap) |
| risk | 17 (incl. nested) | 3 | `assertion_refs` (dormant — no validator reads it yet) |
| decision | 18 (incl. nested) | 0 | — |
| observation | 10 | 0 | — |
| claim | (deprecated, dimension-targeted update) | N/A | — |
| extracted-assertion | (machine-extracted) | 0 | — |
| capability | (machine-generated) | 0 | — |
| **Total hand-written layers** | | **11 drift cells** | |

**The 11 drift cells are the unit-testable surface that the new `field-coverage.test.js` (Phase 2 of the follow-up plan) would catch on day 1 of adoption.** With Phase 0–1 (the `schema-to-zod` codegen) handling the largest drift surface (8 tool-zod files), and Phase 3 closing the experiment-writer's `verification.assertion_refs` gap directly, the field-drift class is reduced to 0 cells by the end of the follow-up plan. The new fixtures in Phase 4 then lock the contract against regression.

---

## References

- `plans/reports/research-260603-1600-json-schema-to-zod-libraries.md` — the research that motivated the spike (3 candidate libraries compared, spike-first recommendation)
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` — the 16-test spike that validated the engine (pre-Plan)
- `docs/trajectory.md` — the "Fifth Bridge: Schema as Source of Truth" section that frames Approach 2 as the big leap
- `docs/journals/260603-sp2-gap-closure-cook.md` — the originating journal entry that surfaced the 4-layer drift class
- `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` — the original gap assertion (now stale; Phase 3 of the plan updates it)

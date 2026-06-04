---
date: "2026-06-03T22:00:00Z"
status: verified
tags: [verification, field-drift, schema-truth, drift-prevention, gap-closure]
related:
  - plans/reports/brainstorm-260603-field-coverage.md (the source brainstorm, 2026-06-03T15:55:00Z)
  - schemas/experiment.schema.json
  - schemas/risk.schema.json
  - schemas/decision.schema.json
  - schemas/observation.schema.json
  - tools/learning-loop-mcp/core/experiment-writer.js
  - tools/learning-loop-mcp/core/risk-writer.js
  - tools/learning-loop-mcp/core/decision-writer.js
  - tools/learning-loop-mcp/core/observation-writer.js
  - tools/learning-loop-mcp/tools/create-experiment-record-tool.js
  - tools/learning-loop-mcp/tools/update-experiment-record-tool.js
  - tools/learning-loop-mcp/tools/create-risk-record-tool.js
  - tools/learning-loop-mcp/tools/update-risk-record-tool.js
  - tools/learning-loop-mcp/tools/create-decision-record-tool.js
  - tools/learning-loop-mcp/tools/update-decision-record-tool.js
  - tools/learning-loop-mcp/tools/record-observation-tool.js
  - tools/learning-loop-mcp/tools/update-observation-tool.js
  - tools/learning-loop-mcp/core/claim-verification-rules.js
  - tools/learning-loop-mcp/core/record-validation-rules.js
  - tools/learning-loop-mcp/core/experiment-proof-match.js
  - tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js
  - tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js
---

# Verification: Field-Drift Enumeration

## Verdict

The brainstorm's 11-drift-cell count is **partially correct**. The 8 experiment cells and 3 risk cells are reproduced verbatim. **2 additional drift cells exist** that the brainstorm missed — one in `experiment.verification.proves.dimension` (tool enum), one in `observation.status` (writer/tool vs. schema enum). The corrected total is **13 drift cells** (8 experiment + 3 risk + 1 new experiment + 1 new observation).

The SP2 cook gap (`experiment.verification.assertion_refs`) is still the loudest drift cell, and the bridge-2 (`workflow_candidate_to_experiment` + `experiment-draft-builder.js`) still does not populate `verification.assertion_refs`. Nothing has changed in the code since the brainstorm was written.

## Method

Re-derived the drift matrix from the current code (no trust in the brainstorm's appendix). Read in full:

- 4 schemas: `schemas/{experiment,risk,decision,observation}.schema.json`
- 4 writers: `core/{experiment,decision,risk,observation}-writer.js`
- 8 tool files: `tools/{create,update}-{experiment,risk,decision}-record-tool.js`, `tools/record-observation-tool.js`, `tools/update-observation-tool.js`
- 2 validators: `core/claim-verification-rules.js`, `core/record-validation-rules.js`
- Bridge: `core/candidate-to-experiment/experiment-draft-builder.js` and `tools/workflow-candidate-to-experiment-tool.js`
- Supporting: `core/experiment-proof-match.js`, `core/record-writer.js` (for update behavior)

All drift cells were verified by reading the actual file lines cited.

## Reproduced Drift Matrix (re-derived from current code)

### Experiment (schema: 18 top-level + 7 verification sub-properties = 25 cells; 8 drift cells — all reproduce)

| Schema field | Create tool | Update tool | Writer output | Validator reads | Drift? |
|---|---|---|---|---|---|
| `id` | `[—]` (writer-generated) | `[—]` (immutable) | yes (line 21) | no | OK |
| `schema_version` | `[—]` | `[—]` | yes (line 22) | no | OK |
| `type` | `[—]` | `[—]` | yes (line 23) | no | OK |
| `status` | `[—]` (writer-default `draft`, line 24) | yes (line 16) | yes (line 24) | no | OK |
| `created_at` | `[—]` | `[—]` | yes (line 25) | no | OK |
| `updated_at` | `[—]` | `[—]` | yes (line 26) | no | OK |
| `source_refs` | yes (line 17) | yes (line 26) | yes (line 27) | no | OK |
| `notes` | **no** | yes (line 34) | **no** (writer has no `notes` key, lines 21-50) | no | **DRIFT** |
| `goal` | yes (line 13) | yes (line 17) | yes (line 28) | no | OK |
| `hypothesis` | yes (line 14) | yes (line 18) | yes (line 29) | no | OK |
| `method` | yes (line 15) | yes (line 19) | yes (line 30) | no | OK |
| `success_metrics` | yes (line 16) | yes (line 20) | yes (line 31) | no | OK |
| `result` | **no** | yes (line 21) | yes (line 32) | no | OK (write-once) |
| `agent_outcome` | **no** | yes (line 22) | yes (line 33) | no | OK |
| `product_outcome` | **no** | yes (line 23) | yes (line 34) | no | OK |
| `observations` | **no** | yes (line 24) | yes (line 35) | no | OK |
| `promotion_review` | **no** | yes (line 25) | yes (line 36) | no | OK |
| `scope` | yes (line 18) | **no** | yes (line 38) | no | **DRIFT** |
| `claim_refs` (top) | yes (line 19) | **no** | yes (line 39) | no | **DRIFT** |
| `risk_refs` (top) | yes (line 20) | **no** | yes (line 40) | no | **DRIFT** |
| `output_level` | yes (line 19) | **no** | yes (line 42) | no | **DRIFT** |
| `output_capture` | **no** | **no** | **no** (no key in writer output) | **no** | **DRIFT** (dormant; schema-only field) |
| `verification.claim_refs` | (via top-level) | yes (line 28) | yes (line 44, bridged) | yes (fallback, line 75) | OK |
| `verification.proves` | **no** | yes (line 29) | empty array (line 45) | yes (line 77) | OK |
| `verification.proves.dimension` | (n/a) | yes (line 30), but enum is `["static", "install", "runtime"]` — **missing `"product"`** | n/a | yes (3-dim, line 6 of experiment-proof-match.js) | **NEW DRIFT** |
| `verification.proves.scope` | (n/a) | yes (line 31) | n/a | yes (line 95) | OK |
| `verification.proves.output_level` | (n/a) | yes (line 32) | n/a | yes (line 102) | OK |
| `verification.requires_human_approval` | (n/a) | yes (line 33) | true (line 46) | yes (line 116) | OK |
| `verification.approval_status` | (n/a) | yes (line 34) | "not-required" (line 47) | yes (line 116) | OK |
| `verification.assertion_refs` | **no** | **no** (update's verification block has no `assertion_refs` field, lines 28-35) | **no** (writer lines 44-48 has no `assertion_refs` in verification) | **yes (PRIMARY)** (line 73-76) | **DRIFT (the SP2 gap)** |
| `assertion_refs` (top) | yes (line 21) | **no** | yes (line 41) | no | **DRIFT** |

**Experiment drift count: 8 + 1 new = 9.**

### Risk (schema: 14 properties; 3 drift cells — all reproduce)

| Schema field | Create tool | Update tool | Writer output | Drift? |
|---|---|---|---|---|
| `id` | `[—]` | `[—]` | yes (line 23) | OK |
| `schema_version` | `[—]` | `[—]` | yes (line 24) | OK |
| `type` | `[—]` | `[—]` | yes (line 25) | OK |
| `status` | `[—]` (writer-default) | yes (line 13) | yes (line 26) | OK |
| `created_at` | `[—]` | `[—]` | yes (line 27) | OK |
| `updated_at` | `[—]` | `[—]` | yes (line 28) | OK |
| `source_refs` | yes (line 19) | (not exposed) | yes (line 35) | OK |
| `notes` | **no** | yes (line 22) | **no** (lines 22-39, no `notes` key) | OK (update handles) |
| `risk_statement` | yes (line 13) | yes (line 14) | yes (line 29) | OK |
| `category` | yes (line 14) | yes (line 15) | yes (line 30) | OK |
| `severity` | yes (line 15) | yes (line 16) | yes (line 31) | OK |
| `likelihood` | yes (line 16) | yes (line 17) | yes (line 32) | OK |
| `confidence` | yes (line 17) | yes (line 18) | yes (line 33) | OK |
| `claim_refs` | yes (line 20) | **no** | yes (line 36) | **DRIFT** |
| `experiment_refs` | yes (line 21) | **no** | yes (line 37) | **DRIFT** |
| `mitigation` | yes (line 22) | yes (line 19) | yes (line 38) | OK |
| `assertion_refs` | **no** | **no** | **no** | **DRIFT (dormant)** |

**Risk drift count: 3 (unchanged).**

### Decision (schema: 14 top-level + 4 decision_effect sub-properties = 18 cells; 0 drift cells — reproduces)

Verified all fields:
- Create tool (lines 14-25): exposes `surface, question, decision, rationale, alternatives, tradeoffs, source_refs, supersedes, decision_effect` (and decision_effect's nested `action, scope, affected_refs, boundaries`).
- Update tool (lines 14-30): exposes the same plus `status` and `notes`.
- Writer (`core/decision-writer.js#buildDecisionYaml`, lines 16-32): populates all 13 fields (8 with values + decision_effect conditionally). `notes` is not in writer output but is handled by update.
- Validators: `record-validation-rules.js` reads `decision_effect.affected_refs` (line 78); `claim-verification-rules.js` reads `decision_effect` for product-dimension approval (lines 42-46). All paths covered.

**Decision drift count: 0 (unchanged).**

### Observation (schema: 10 properties; 1 NEW drift cell — value-set mismatch, not in brainstorm)

| Schema field | Create tool | Update tool | Writer output | Drift? |
|---|---|---|---|---|
| `id` | `[—]` (writer-generated) | `[—]` (immutable, line 134) | yes (line 49) | OK |
| `schema_version` | `[—]` | `[—]` | yes (line 50) | OK |
| `type` | `[—]` | `[—]` | yes (line 51) | OK |
| `status` | `[—]` (writer-default `active`) | yes (line 10) | yes (line 52); writer also accepts `"inactive"` in update (line 131, `VALID_STATUSES = ["active", "inactive", "archived"]`) | **NEW DRIFT** — schema enum is `["active", "archived"]` (line 28 of schema); writer allows `"inactive"` (line 131) and update tool refines to allow it (line 10). Update would succeed at writer level, then fail at AJV `validateRecords` time. |
| `created_at` | `[—]` | `[—]` | yes (line 53) | OK |
| `updated_at` | `[—]` | `[—]` | yes (line 54) | OK |
| `source_refs` | yes (line 15) | (immutable) | yes (line 55) | OK |
| `constraint_type` | yes (line 12) | (immutable) | yes (line 57) | OK |
| `constraint` | yes (line 13) | (immutable) | yes (line 58) | OK |
| `notes` | (via `description` param, line 14) | no direct field, but `reason` is appended (line 177-179) | yes (line 56, from `description`) | OK |

**Observation drift count: 0 → 1 new (value-set drift).**

The brainstorm's "0 drift cells" verdict for observation is technically correct under its own field-presence framework, but it missed a real value-set drift. This is a different drift class — see "Risks the brainstorm missed" below.

### Summary of reproduced count

| Record type | Brainstorm's count | Re-derived count | Delta |
|---|---|---|---|
| experiment | 8 | 9 | +1 (new tool-enum drift) |
| risk | 3 | 3 | 0 |
| decision | 0 | 0 | 0 |
| observation | 0 | 1 | +1 (new value-set drift) |
| **Total** | **11** | **13** | **+2** |

## Diff Against Brainstorm

### Cells that the brainstorm correctly identified (11)

All 8 experiment cells and all 3 risk cells are reproduced from the current code. The file:line references in the brainstorm's appendix are accurate as of 2026-06-03T22:00:00Z.

### New drift cells (2)

#### NEW #1 — `experiment.verification.proves.dimension` enum (tool)

- **File:** `tools/learning-loop-mcp/tools/update-experiment-record-tool.js:30`
- **Current code:** `dimension: z.enum(["static", "install", "runtime"]).describe("Verification dimension")`
- **Schema:** `["static", "install", "runtime", "product"]` (`schemas/experiment.schema.json`, the `verification.proves.dimension` enum)
- **Validator:** `experimentDimensions = new Set(["static", "install", "runtime"])` (`core/claim-verification-rules.js:4`). The validator silently ignores `proof.dimension === "product"` because of `if (!experimentDimensions.has(proof.dimension)) continue;` (line 95). So the validator side is also a 3-of-4 drift, though it's tolerated by the silent-skip.

The brainstorm's appendix notes `verification.proves` as "OK" (Update: yes, Validator: yes) — but did not dig into the sub-field. The sub-field `dimension` is itself a 3-vs-4 drift in the update tool and the validator. Both layers reject what the schema allows.

**Fix complexity:**
- Tool: 1 line in `update-experiment-record-tool.js:30` (add `"product"` to the enum).
- Validator: 1 line in `claim-verification-rules.js:4` (add `"product"` to `experimentDimensions` set) — but this changes validator behavior (it currently `continue`s on unknown, silently). Must add per-dimension handling for `product` (which connects to decision approval, not experiment proof).
- **Severity:** medium. A cook that wants to set `verification.proves: [{dimension: "product", ...}]` (legitimate per schema) is blocked at the tool surface. The validator's silent-skip hides this, so no current record has hit it.

#### NEW #2 — `observation.status` enum mismatch (writer/tool vs. schema)

- **Files:**
  - Schema: `schemas/observation.schema.json` (line 28): `"status": { "enum": ["active", "archived"] }`
  - Update tool: `tools/learning-loop-mcp/tools/update-observation-tool.js:10`: `z.string().refine((val) => ["active", "inactive", "archived"].includes(val), ...)`
  - Writer: `tools/learning-loop-mcp/core/observation-writer.js:131`: `const VALID_STATUSES = ["active", "inactive", "archived"];`
- **Conflict:** schema allows only `active`/`archived`; tool and writer allow `active`/`inactive`/`archived`. An `update_observation` call with `status: "inactive"` would succeed at the writer layer (returns `updated: true`) but fail at AJV `validateRecords` time because `"inactive"` is not in the schema enum.

**Fix complexity:**
- Two equally valid directions:
  - **Add `"inactive"` to schema enum** — 1 line in `schemas/observation.schema.json`. Authoritative.
  - **Drop `"inactive"` from tool + writer** — 2 lines. Assumes `inactive` is dead code.
- **Severity:** low to medium. No current record has hit it (grep shows no observation YAMLs with status `inactive`); the dormant state is a vestige. But it's a real footgun: the writer would happily persist an invalid record.

**Recommendation:** add `"inactive"` to the schema enum. The writer's logic of accepting `inactive` is intentional (the tool's `refine` allows it); the schema was probably the one that drifted when `inactive` was added to the tool's status vocabulary.

### Cells whose status is ambiguous

- **`experiment.notes`**: the brainstorm says "no layer initializes it". Verified — the writer's `buildExperimentYaml` (lines 21-50) has no `notes` key, and the create tool (lines 11-22) has no `notes` key. So even if a user wanted to create an experiment with `notes`, they cannot. The drift is real but its impact depends on whether `notes` is meant to be settable at create time. If yes, the fix is 2 lines (1 in writer, 1 in create tool). If no, the schema could be tightened (notes → not in `required`, currently is).
- **`experiment.output_capture`**: the brainstorm says "no layer ever sets it". Verified. The only thing that ever reads `output_capture` is the negative fixture `invalid-output-capture` (which tests AJV shape rejection). This is intentionally dormant — the field is forward-declared but unused. Could be removed from the schema; doesn't need a writer passthrough.

### Cells fixed since the brainstorm

**None.** The most recent commit touching the drift-relevant code is `a0a5626` (soft-delete of the broken experiment record, 2026-06-03 — earlier than the brainstorm). The drift cells are stable.

## SP2 Cook Gap — Confirmed Still Loudest

The cell `experiment.verification.assertion_refs` is still the only drift cell that:
1. Schema declares it (line 121-128 of `experiment.schema.json`).
2. Create tool does not expose it (no field, line 11-22 of `create-experiment-record-tool.js`).
3. Update tool does not expose it inside the `verification` object (lines 27-35 of `update-experiment-record-tool.js` — `verification` zod object has only `claim_refs, proves, requires_human_approval, approval_status`).
4. Writer does not populate it (`buildExperimentYaml` lines 44-48 has `verification: { claim_refs, proves, requires_human_approval, approval_status }` — no `assertion_refs`).
5. **Validator reads it (line 73-76 of `claim-verification-rules.js`).** This is the active failure path.

When a record is created with top-level `assertion_refs` (e.g., via the SP2 cook path), the writer persists the record with `assertion_refs` at top level but `verification.assertion_refs` is undefined. `validateExperimentProves` reads `verification.assertion_refs` → undefined → falls back to `verification.claim_refs` (also empty by default) → error: `"verification.assertion_refs must name at least one assertion or claim"`.

`experiment-proof-match.js:4` has the same fallback: `verification.assertion_refs || verification.claim_refs`. Both layers need `verification.assertion_refs` to be populated.

## Bridge-2 (`workflow_candidate_to_experiment` + `experiment-draft-builder.js`) — Confirmed Still Drops It

Verified:

- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js:60-67`:
  ```js
  verification: {
    claim_refs: [],
    proves: [...],
    requires_human_approval: true,
    approval_status: "not-required",
    // NO assertion_refs
  }
  ```
  The draft sets `assertion_refs` only at top level (line 67).

- `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js:88-95`:
  ```js
  const createResult = createExperiment({
    ...
    assertion_refs: draft.assertion_refs,  // top-level only
  });
  ```
  The workflow tool passes `assertion_refs` to `createExperiment` at the top level, which the writer persists at top level but never bridges to `verification.assertion_refs`.

- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js:154`:
  ```js
  assert.deepStrictEqual(result.draft.assertion_refs, ["record:assertion-valid"]);
  ```
  The unit test asserts `draft.assertion_refs` (top-level) only. It does not assert `draft.verification.assertion_refs`. This is exactly the gap the brainstorm identified.

So the bridge-2 path is unchanged and still does not populate `verification.assertion_refs`.

## Fix-Complexity Assessment Per Drift Cell

| # | Cell | Layer(s) | Fix | Effort |
|---|---|---|---|---|
| 1 | `experiment.notes` (create missing) | writer + create tool | 1 line writer (add `...(notes ? { notes } : {})`) + 1 line create tool (add `notes: z.string().optional()`) | trivial |
| 2 | `experiment.scope` (update missing) | update tool | 1 line | trivial |
| 3 | `experiment.claim_refs` (top, update missing) | update tool | 1 line | trivial |
| 4 | `experiment.risk_refs` (top, update missing) | update tool | 1 line | trivial |
| 5 | `experiment.output_level` (update missing) | update tool | 1 line | trivial |
| 6 | `experiment.output_capture` (dormant) | n/a | Remove from schema, OR add to all 3 layers | schema-only OR 3-line multi-layer |
| 7 | `experiment.verification.assertion_refs` (the SP2 gap) | writer + update tool + bridge | 1 line writer + 1 line update tool (inside `verification` zod) + 1 line experiment-draft-builder | medium — the SP2 cook fix |
| 8 | `experiment.assertion_refs` (top, update missing) | update tool | 1 line | trivial |
| 9 | `risk.claim_refs` (update missing) | update tool | 1 line | trivial |
| 10 | `risk.experiment_refs` (update missing) | update tool | 1 line | trivial |
| 11 | `risk.assertion_refs` (dormant) | create tool + update tool + writer | 3 lines (one per layer) | small |
| 12 | `experiment.verification.proves.dimension` (NEW, tool missing "product") | update tool + validator | 1 line update tool (add "product" to enum) + 1 line validator (add to `experimentDimensions` Set) + decision logic for product dimension | small-to-medium |
| 13 | `observation.status` (NEW, value-set drift) | schema + update tool + writer | Either add "inactive" to schema enum (1 line) OR drop "inactive" from tool + writer (2 lines) | trivial |

**11 of 13 cells are trivial (1-3 lines).** The SP2 gap (cell 7) is the highest-priority because it's the active failure path. Cell 12 (the new "product" enum) is the only one that requires validator-side behavioral change.

## Risks the Brainstorm Missed

### R1. Value-set drift class is not covered by the brainstorm's framework

The brainstorm's framework detects **field-presence drift** (does layer X reference field Y at all?). It does not detect **value-set drift** (does layer X accept the same enum as the schema?). The new observation.status drift (#13) and the new experiment.verification.proves.dimension drift (#12) are both value-set drifts. The follow-up plan's `field-coverage.test.js` (Phase 2 of the brainstorm) should also assert **enum value equality**, not just field presence.

**Specific test pattern:** for every `properties.X.enum` in every schema, assert that the corresponding zod schema in the tool (or the validator's Set constant) declares the exact same set of values.

### R2. `experimentDimensions` silent-skip hides drift in the validator

`claim-verification-rules.js:95`: `if (!experimentDimensions.has(proof.dimension)) continue;` — silently skips unknown dimensions rather than erroring. This means:
- A drift in `verification.proves.dimension` enum (cell 12) is undetectable from validator output.
- The `experimentDimensions` Set (line 4) is a hand-maintained subset of the schema's enum, with no test asserting they stay in sync.

The follow-up plan should add a coverage test that asserts `experimentDimensions` matches the schema's `verification.proves.dimension.enum` (or, if intentional, an `x-validator-supported` annotation).

### R3. `experiment-proof-match.js` is a second consumer of `verification.assertion_refs`

The brainstorm focuses on `claim-verification-rules.js` as the validator, but `core/experiment-proof-match.js:4` also reads `verification.assertion_refs` (with fallback to `verification.claim_refs`). The SP2 gap fix must keep both consumers satisfied. The coverage test should assert that *every* module that reads `verification.*` is enumerated.

### R4. The `invalid-output-capture` negative fixture is the only live evidence that `output_capture` is schema-enforced

If `output_capture` is removed from the schema in a future cleanup, this fixture will become a false-positive failure (the runner checks AJV rejection at `/output_capture type: must be object`, which only triggers when the field exists in the schema). The follow-up plan should either:
- Add an `x-deprecated` annotation to the schema field and a test that asserts "writer does not produce this field", OR
- Remove both the schema field and the fixture.

### R5. The follow-up plan's Phase 3 ("extend `core/experiment-writer.js#buildExperimentYaml` to populate `verification.assertion_refs` from top-level `assertion_refs`") must also update `experiment-draft-builder.js`

The bridge-2 path writes a draft object (lines 56-67), then the workflow tool passes that draft through `createExperiment` (which calls `buildExperimentYaml`). If Phase 3 fixes only `buildExperimentYaml` to bridge `assertion_refs`, the writer fix would work, but the draft-preview returned by `workflow_candidate_to_experiment` (when `auto_create: false`) would still show `verification.assertion_refs: undefined`. The fix is symmetric: `experiment-draft-builder.js` must set `verification.assertion_refs` directly in the draft (line 60-67) so the preview matches the persisted record.

The current unit test (`bridge-2-unit.test.js:154-155`) only checks top-level `draft.assertion_refs` and `draft.verification.requires_human_approval`. Phase 3 must add an assertion for `draft.verification.assertion_refs`.

### R6. `record-validation-rules.js` does not validate `claim_refs`, `risk_refs`, or `assertion_refs` for missing-record-pointer

`validateRecordReferences` (lines 211-225) checks `evidence_refs`, `supersedes`, `superseded_by`, `experiment_refs` — but not `claim_refs`, `risk_refs`, or `assertion_refs`. So if a top-level `claim_refs: ["record:does-not-exist"]` is persisted, `validateRecords` does not catch it. This is a **validator-coverage gap** not captured by the brainstorm's table (which focused on writer-drops and tool-doesn't-expose).

This is not a drift cell in the brainstorm's framework (all layers agree the field exists), but it is a related defect. The follow-up plan's validator-coverage sidecar (`schemas/validator-coverage.yaml`, Phase 2) should list every property path the validator MUST check, and assert that list against the validator's source.

## File:Line Reference Index (for the plan to cite)

- `schemas/experiment.schema.json` — `verification.assertion_refs` declared at lines 121-128; `verification.proves.dimension` enum at lines ~149-156; `output_capture` declared at lines ~99-110.
- `schemas/observation.schema.json` — `status` enum at line 28 (`["active", "archived"]`).
- `tools/learning-loop-mcp/core/experiment-writer.js` — `buildExperimentYaml` lines 16-50; `verification` block at lines 44-48 (no `assertion_refs`); `notes` not present anywhere in the writer output.
- `tools/learning-loop-mcp/core/risk-writer.js` — `buildRiskYaml` lines 17-40; `assertion_refs` not present (lines 22-39, no `assertion_refs` key).
- `tools/learning-loop-mcp/core/observation-writer.js` — `VALID_STATUSES` at line 131 (`["active", "inactive", "archived"]`); `buildObservationYaml` at line 47.
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` — `schema` lines 11-22 (no `notes` field).
- `tools/learning-loop-mcp/tools/update-experiment-record-tool.js` — `schema` lines 13-37; `verification` zod object at lines 27-35 (no `assertion_refs`); `verification.proves.dimension` enum at line 30 (missing "product"); update tool's zod also has no top-level `scope`, `claim_refs`, `risk_refs`, `output_level`, `assertion_refs`.
- `tools/learning-loop-mcp/tools/create-risk-record-tool.js` — `schema` lines 11-22 (no `assertion_refs`).
- `tools/learning-loop-mcp/tools/update-risk-record-tool.js` — `schema` lines 11-22 (no `claim_refs`, `experiment_refs`, `assertion_refs`).
- `tools/learning-loop-mcp/tools/update-observation-tool.js` — line 10 `refine` allows `"inactive"`.
- `tools/learning-loop-mcp/core/claim-verification-rules.js` — `validateExperimentProves` lines 71-108; `verification.assertion_refs` read at lines 73-76 (primary); `verification.claim_refs` read as fallback at line 75; `experimentDimensions` set at line 4 (missing "product"); `verification.proves` read at line 77; `verification.requires_human_approval` + `verification.approval_status` read at line 116.
- `tools/learning-loop-mcp/core/experiment-proof-match.js` — `verification.assertion_refs || verification.claim_refs` at line 4; same `verification.proves` reads.
- `tools/learning-loop-mcp/core/record-validation-rules.js` — `decision_effect.affected_refs` read at line 78; `verification.claim_refs` and `verification.proves[*].claim_ref` at lines 84-95; `validateRecordReferences` lines 211-225 (does not check `claim_refs`, `risk_refs`, `assertion_refs`).
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` — draft object at lines 56-72; `verification` block at lines 60-67 (no `assertion_refs`).
- `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js` — `createExperiment` call at lines 88-95; passes `assertion_refs: draft.assertion_refs` (top-level only).
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js:154-155` — asserts `draft.assertion_refs` and `draft.verification.requires_human_approval` only; no assertion for `draft.verification.assertion_refs`.

## Acceptance-Test Implication for the Plan

If the follow-up plan uses the 11-cell brainstorm table as its acceptance test for the `field-coverage.test.js`, the test will:
- Pass on the current code (all 11 cells are still drifted).
- Pass after Phase 0-1 (codegen replaces the 8 hand-written zod tool schemas; field presence is preserved by `z.fromJSONSchema()`).
- Pass after Phase 2 (the coverage test runs and finds 0 new drift if the sidecar `field-drift-exceptions.yaml` lists all 11).
- Pass after Phase 3 (writer fix for `verification.assertion_refs`; but only the 3 experiment cells directly affected; the 5 risk cells and 2 new cells still drift).
- Reach 0 only if the plan also closes the other 10 cells.

With the corrected 13-cell count, the plan's Phase 2 (initial-run) acceptance test must list all 13 cells, and Phase 3 must close the SP2 gap (cell 7) plus enumerate the close-out of the other 12.

The new "product" enum drift (#12) and the new observation.status drift (#13) are not blocking the SP2 cook fix but should be tracked as a follow-up to keep the coverage test honest.

---

## References

- `plans/reports/brainstorm-260603-field-coverage.md` — source brainstorm (2026-06-03T15:55:00Z), Appendix: Field-by-Field Drift Enumeration
- `docs/trajectory.md` — "Fifth Bridge: Schema as Source of Truth" framing
- `docs/journals/260603-sp2-gap-closure-cook.md` — originating journal entry for the SP2 cook gap
- `records/meta/index/assertion-meta-static-mcp-experiment-verification-block.yaml` — the original gap assertion (now stale; will be updated by Phase 3 of the follow-up plan)

---
phase: 1
title: "Operator-Guide Convention And Decision Records"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Operator-Guide Convention And Decision Records

## Overview

Land the `experiment.result` convention in `docs/operator-guide.md` and pair it with two decision YAMLs that codify the convention itself and the prospective-application rule. This phase implements M6 from the next-steps report and absorbs M7 (schema-enum deferral) as a `blocked_actions` clause on the first decision.

## Context Links

- `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (Meta Plan Scoping > Phases > M6).
- `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (R-Q4 resolution, O15).
- `schemas/experiment.schema.json` line 20: `"result": { "type": "string" }` — confirms convention-only is the right fit.
- `records/decisions/decision-20260508-loop-dimension-model.yaml` (decision schema reference).
- `records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml` (decision schema reference).

## Requirements

- Functional: `docs/operator-guide.md` documents the `experiment.result` convention and a clearly-named "Convention Application" rule for handling historical records. Two decision YAMLs codify the convention and the prospective-application rule. Both YAMLs validate against `schemas/decision.schema.json`.
- Non-functional: No schema enum constraint added. No edits to records, evidence, experiments, claims, packs, or schemas. `pnpm validate:records` and `pnpm check` pass after each YAML lands.

## Architecture

The convention lives in `docs/operator-guide.md`. The decision YAMLs live in `records/decisions/`. The convention text references the first decision YAML by ID for traceability; the second decision YAML's `source_refs` references the first for ordering.

Placement in operator-guide: after the existing "Self-Improvement Flow" subsection and before "Agent Anti-Confusion Checklist". This keeps related self-improvement content together.

Decision YAML schema fields used (per existing decisions in repo): `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`, `notes`, `question`, `decision`, `rationale`, `alternatives`, `tradeoffs`, `supersedes`, `decision_effect.action`, `decision_effect.scope`, `decision_effect.affected_refs`, `decision_effect.boundaries.allowed_actions`, `decision_effect.boundaries.blocked_actions`, `decision_effect.boundaries.required_gates`.

## Related Code Files

- Modify: `docs/operator-guide.md`
- Create: `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml`
- Create: `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml`

## Implementation Steps

1. Read `docs/operator-guide.md` end-to-end. Locate the "Self-Improvement Flow" subsection and the "Agent Anti-Confusion Checklist" subsection. Plan the insertion point between them.
2. Add a new H2 section to `docs/operator-guide.md` titled `## Experiment Result Convention` with body:
   ```
   Experiment YAMLs use `result` as one of:

   - `supports` — outcome supports the hypothesis.
   - `does-not-support` — outcome contradicts the hypothesis.
   - `inconclusive` — outcome did not produce a clear answer (vendor gate, env failure, operator interrupt, indeterminate result).

   Pair with sibling `result_reason` (free text) for disambiguation, especially for `inconclusive`.

   The convention is not enforced by `experiment.schema.json` — `result` remains an unconstrained `string`. Schema enum hardening is deferred until at least three distinct experiments use the convention without semantic strain (per `record:decision-20260509T192448Z-experiment-result-convention`).

   ### Convention Application

   New conventions apply prospectively unless an explicit migration is approved. A historical experiment authored before a convention lands does not need to be rewritten for cosmetic alignment; per-experiment immutability beats convention uniformity. Convert only when the operator approves a migration plan that documents the conversion mode (Migration / Structuring; see "Evidence-MD to Experiment-YAML Conversion").

   See `record:decision-20260509T192449Z-prospective-convention-application` for the policy decision.
   ```
3. Author `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml` with content:
   ```yaml
   id: decision-20260509T192448Z-experiment-result-convention
   schema_version: "1.0"
   type: decision
   status: approved
   created_at: "2026-05-09"
   updated_at: "2026-05-09"
   source_refs:
     - local:plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md
     - local:plans/reports/next-steps-20260509-vnstock-product-and-meta.md
   notes: Meta loop convention; not domain evidence.
   question: How should experiments report their outcome?
   decision: Use `result: supports | does-not-support | inconclusive` with sibling free-text `result_reason`. Codify as convention in operator-guide; do not enum-constrain the schema yet.
   rationale: `inconclusive` covers the necessary semantic gap (blocked-by-gate, indeterminate-on-merits, ran-out-of-disk, operator-interrupted) without proliferating special-purpose values. Convention before schema avoids early ossification while N is still small.
   alternatives:
     - Add a fourth literal value `blocked` distinct from `does-not-support` and `inconclusive`.
     - Enum-constrain immediately in `experiment.schema.json`.
     - Leave the field unconstrained and undocumented.
   tradeoffs:
     - One historical experiment (run-1 vnstock install) keeps `result: does-not-support` against the new convention; accepted as historical drift per the prospective-application decision.
     - Convention discoverability depends on operator-guide reading; agents must consult it.
     - Schema enum is a future change once N >= 3 experiments use the convention.
   supersedes: []
   decision_effect:
     action: approve
     scope: schema-improvement
     affected_refs:
       - local:docs/operator-guide.md
     boundaries:
       allowed_actions:
         - Use `supports`, `does-not-support`, or `inconclusive` for new experiment YAMLs.
         - Pair with `result_reason` when ambiguous.
       blocked_actions:
         - Adding a schema enum constraint to `experiment.schema.json` before N >= 3 distinct experiments use the convention.
         - Rewriting historical experiment YAMLs solely for cosmetic alignment.
       required_gates:
         - pnpm validate:records
         - pnpm check
   ```
4. Author `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml` with content:
   ```yaml
   id: decision-20260509T192449Z-prospective-convention-application
   schema_version: "1.0"
   type: decision
   status: approved
   created_at: "2026-05-09"
   updated_at: "2026-05-09"
   source_refs:
     - local:plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md
     - local:plans/reports/next-steps-20260509-vnstock-product-and-meta.md
     - record:decision-20260509T192448Z-experiment-result-convention
   notes: Meta loop policy; not domain evidence.
   question: When a new convention lands, must historical records be rewritten to match?
   decision: New conventions apply prospectively. Historical records authored before the convention do not need rewriting for cosmetic alignment. Migration of historical records requires an explicit migration plan (see Migration / Structuring modes in operator-guide).
   rationale: Per-experiment immutability and audit-trail integrity beat convention uniformity at the cost of one stale value. Forcing in-place rewrites violates the immutability principle established for run-1 / run-2 evidence and experiment YAMLs.
   alternatives:
     - Always rewrite historical records to match new conventions (uniformity-first).
     - Always preserve historical records exactly as authored, with no migration path (immutability-first).
     - Decide case-by-case with no general rule.
   tradeoffs:
     - Some historical records will visibly diverge from current convention.
     - Migration-when-approved preserves an escape hatch for cases where divergence is harmful.
     - Reviewer/agent must read the convention's "Convention Application" clause to interpret historical drift.
   supersedes: []
   decision_effect:
     action: approve
     scope: schema-improvement
     affected_refs:
       - local:docs/operator-guide.md
       - record:decision-20260509T192448Z-experiment-result-convention
     boundaries:
       allowed_actions:
         - Apply new conventions only to records authored after the convention lands.
         - Migrate historical records via an approved Migration / Structuring plan.
       blocked_actions:
         - In-place edits to frozen historical records solely for cosmetic alignment.
         - Schema-enum-only enforcement that fails-closed against historical records.
       required_gates:
         - pnpm validate:records
         - pnpm check
   ```
5. Run `pnpm validate:records`. Confirm both new decision YAMLs pass schema validation.
6. Run `pnpm check`. Confirm overall validation passes.
7. If validation fails: read the validator output, fix the YAML, re-run. Do not bypass.
8. Stop. Report process and outcome to operator using the dual-axis pattern from Phase 4 (process-complete vs experiment-outcome).

## Todo List

- [x] Read operator-guide.md and confirm insertion point.
- [x] Add "Experiment Result Convention" section with "Convention Application" subsection.
- [x] Author decision-20260509T192448Z-experiment-result-convention.yaml.
- [x] Author decision-20260509T192449Z-prospective-convention-application.yaml.
- [x] Run `pnpm validate:records`; pass.
- [x] Run `pnpm check`; pass.
- [x] Report process completion and validation outcome.

## Success Criteria

- [x] `docs/operator-guide.md` contains the "Experiment Result Convention" section with the three values, `result_reason` clause, and "Convention Application" subsection that references both decision YAMLs by record ID.
- [x] Both decision YAMLs exist at the specified paths with the specified IDs.
- [x] Each decision YAML cites the next-steps report and the review report in `notes` because validator rules disallow `local:plans/reports/...` in `source_refs`.
- [x] The first decision YAML's `blocked_actions` includes the schema-enum-deferral clause.
- [x] The second decision YAML cites the first via `record:` ref in `source_refs`.
- [x] `pnpm validate:records` passes.
- [x] `pnpm check` passes.
- [x] No edits to records other than the two new decision YAMLs.

## Risk Assessment

- **Risk:** Decision YAML schema mismatch (e.g., missing required field, wrong field name).
  - **Mitigation:** Mirror the field set used by the two existing decision YAMLs in the repo; run `pnpm validate:records` before considering the phase complete.
- **Risk:** Operator-guide insertion at the wrong section (breaks reading flow).
  - **Mitigation:** Insert after "Self-Improvement Flow" specifically; do not insert mid-flow inside an existing subsection.
- **Risk:** Decision YAML timestamp collision with an existing record.
  - **Mitigation:** Verify no `decision-20260509T192448Z-*` or `decision-20260509T192449Z-*` already exists in `records/decisions/` before authoring; if collision, increment seconds.

## Security Considerations

- No secrets, credentials, raw data, or local config touched.
- No package install, runtime call, or live service interaction.
- Edits scoped to one doc file and two decision YAMLs.

## Next Steps

- Phase 4 (M5) depends on this phase: it references `inconclusive` semantics from the convention.
- Phase 2 (M2) is independent and may run in parallel.

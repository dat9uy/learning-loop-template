# Product Build Prompt Blueprints

For product-build orchestration, use `workflow_product_build`.

MCP tool: `workflow_product_build` decomposes product requests into assertions, risks, experiments, and decisions mechanically.

## Pre-Build Record Authoring

```text
Task: Prepare records for a product-build experiment.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- docs/operator-guide.md
- docs/artifact-concepts.md
- relevant records and evidence

Goal:
- Author claims, risks, experiments, and decisions needed before application code exists.
- Identify any capability records that cite `local:product/<stack>/capabilities/...`.

Constraints:
- Do not create application code.
- Do not cite `local:product/<stack>/capabilities/...` from non-capability records.
- Use qualified terms: runtime probe, capability record, Runtime Probe Experiment.
- Before any implementation phase, encode all architectural decisions (envelope pattern, gate naming, fetch strategy) as `records/<surface>/decisions/` artifacts with scoped `decision_effect`.
- Do not proceed to implementation until decision records exist for every Key Decision.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
```

## Skill-Phase Constraint Prompt

```text
Task: Implement only the approved product-build phase.

Work context: /home/datguy/codingProjects/learning-loop-template

Allowed scope:
- Approved stack and surface from the decision record.
- Existing runtime probes under `product/<stack>/capabilities/` as reference substrate only.
- Allowed scope is bounded by the approved decision record's `decision_effect`. Do not expand beyond allowed actions.

Forbidden actions:
- Do not expand product scope beyond the approved decision.
- Do not capture raw external data, credentials, private config, or local vendor metadata.
- Do not edit frozen historical records.

Validation:
- Run stack validators and repo validators.
```

## Plan Structure

Product-build plans MUST include Phase 0: Loop Pre-Flight before implementation phases.
Phase 0 declares surfaces, lists required decision records, and provides a pre-flight checklist.
Reference: `tools/learning-loop-mcp/references/plan-phase-0-template.md`

Phase 0 is advisory — the gate (phase 1) enforces mechanically; the template guides the operator.
Both work together: template prevents mistakes, gate catches them.

## Pre-Implementation Checklist

```text
- [ ] Phase 0 completed: surfaces declared, decision records confirmed
- [ ] All plan Key Decisions have corresponding `records/<surface>/decisions/` artifacts
- [ ] Decision records cite source evidence and required gates
- [ ] No implementation phase proceeds without decision coverage
- [ ] Evidence creation is delegated to operator; agent drafts only
```

## Post-Build Verification Prompt

```text
Task: Close the product-build verification loop.

Work context: /home/datguy/codingProjects/learning-loop-template

Goal:
- Capture safe metadata-only results.
- Update experiment observations and claim verification proof refs.
- Keep capability-record source refs locked to `local:product/<stack>/capabilities/...`.

Constraints:
- Agent may draft evidence findings; operator must author the evidence file under `records/evidence/`. The write gate blocks agent writes to this path.
- Do not update `validation_status` to `passed` without operator confirmation.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
- Report unresolved questions last.
```

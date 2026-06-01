# Bridge 2 — Candidate-to-Experiment Mapping Closeout

## Summary

Completed all 6 phases of Bridge 2 (Candidate → Experiment Plan). Built a dimension-driven mapping convention, an MCP tool that generates experiment drafts from candidate assertions, and documented the promotion workflow (candidate → pending_approval → active). The system now closes the gap between "know what to test" (candidate assertion) and "know how to test it" (runnable experiment).

## Changes

### Core Modules
- `tools/learning-loop-mcp/core/candidate-to-experiment/template-registry.js` — 4 dimension-specific templates (install, runtime, static, product). Each template maps a candidate assertion to experiment fields (goal, hypothesis, method, success_metrics, scope, output_level).
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` — Reads candidate from disk, validates `status === "candidate"`, selects template by dimension, builds experiment draft with `source_refs` and `assertion_refs` pointing to the candidate.

### MCP Tool
- `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js` — `workflow_candidate_to_experiment` MCP tool
  - Input: `assertion_id`, `surface`, `template_override` (optional), `auto_create` (optional, default false)
  - Output: experiment draft for human review, or created experiment record ID
  - Safety: `auto_create` defaults to `false`; experiment always has `status: draft` and `requires_human_approval: true`
  - Registered in `manifest.json` (41 tools total)

### Schema Changes
- `schemas/experiment.schema.json` — added `assertion_refs` field (array of strings, pattern `^record:assertion-[a-z0-9-]+-(static|install|runtime|product)-[a-z0-9-]+$`). Also added `product` to the `verification.proves[].dimension` enum (was `static`, `install`, `runtime`).
- `tools/learning-loop-mcp/core/experiment-writer.js` — `buildExperimentYaml` and `createExperiment` now accept `assertion_refs` parameter.
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` — added `assertion_refs` to zod schema and handler.

### Promotion Workflow Documentation
- `docs/artifact-concepts.md` — added "Candidate Promotion Workflow" section documenting the status chain (`candidate → pending_approval → active`), transition triggers, and failure path.

### Tests
- `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` — 12 tests (8 template-registry + 4 draft-builder)
- `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.test.js` — 8 tests covering all 4 dimensions, error paths, auto_create, and template overrides
- `candidate-block.test.js` — already covers `pending_approval` reference being allowed (existing test)
- Full suite: 347 tests pass (52 suites), 0 failures

## Verification

- `pnpm validate:records` — passes (183 records, no validation errors)
- `pnpm validate:plan-loop` — passes (66 plans, 0 violations)
- `pnpm extract:index --dry-run` — passes (114 entries, 0 written, all unchanged)
- `pnpm test` — passes (347/347 tests)
- MCP server: 41/41 tools registered

## Notable Decisions

1. `assertion_refs` is a dedicated field (not overloaded into `source_refs`) following the `claim_refs`/`risk_refs` precedent. It enables AJV-level pattern validation and queryability.
2. `auto_create` defaults to `false` — human review is mandatory. Even with `auto_create=true`, the experiment is created as `draft` with `requires_human_approval: true`.
3. Promotion workflow is intentionally minimal for v1. Both transitions (`candidate → pending_approval` and `pending_approval → active`) require explicit human action. Full automation is Bridge 3/4 territory.
4. No live candidates exist yet (all 79 assertions are `active` or `superseded`). The tool uses synthetic test data for validation. End-to-end testing with real candidates requires exercising Bridge-1 first.

## Deferred Work

- `assertion_refs` dangling-reference validation is not yet checked in `validateCandidateConsumption` (record-validation-rules.js). The existing validation covers `source_refs`, `experiment_refs`, `claim_refs`, etc. but not `assertion_refs`.
- `rejected` status is not in the `index-entry.schema.json` enum. Failed evidence + skipped extraction is the v1 failure path.
- MCP tool for `record_update_assertion_status` (operator_confirmation-driven status update) is deferred to a future version.

## Post-Implementation Reflections

### Tool Build Reflections

**What worked.** The template-dimension mapping is explicit and bounded — four templates (`install`, `runtime`, `static`, `product`) each route a candidate assertion to a specific experiment shape. No heuristics, no LLM, no ambiguity. The `auto_create` default of `false` is the correct safety posture for a system that has not yet earned trust on real data. Schema migration is backward-compatible (`assertion_refs` is additive, not overloaded). Test coverage is comprehensive: 20 new tests (12 unit + 8 tool) with zero regressions in the full suite (347/347 pass).

**What didn't work.** The templates are starting points, not proven plans — they are educated guesses about what a real experiment should look like. The draft builder does not validate operational feasibility (budget, device slots, scope alignment). `assertion_refs` dangling-reference validation is missing from Layer 5 (`record-validation-rules.js`). Most importantly, there is no bridge from "draft exists" to "experiment runs" — Bridge 3 (class-level approval) does not exist, so the full workflow is still entirely human.

**Root cause.** The loop tests tools, not workflows. Every new MCP tool gets isolated unit tests (mock candidate, mock template, mock filesystem), but no end-to-end workflow test exists covering candidate → draft → review → promotion → experiment → evidence → index. Real candidates are scarce because Bridge 1 (doc → candidate) is also unexercised — all 79 existing assertions are `active` or `superseded`. Bridge 2's "unexercised" status is a symptom of Bridge 1's "unexercised" status.

### Operational Gap Reflections

**Unified-UI snapshot migration deferred.** The pipeline is complete and tested but not exercised on real data. The `records/vnstock/evidence/unified-ui-snapshot/` contains reference shape documentation (API schemas), not `## Findings` evidence capsules. `extract-index` cannot parse these files — they lack the `## Findings` bullet format. Creating candidates from snapshots requires hand-authoring `extracted-assertion` records or running `workflow_vendor_doc_assist` on a markdown rendering of the snapshots.

**What the migration would involve:**
1. Read snapshot files (5+ domain layers) to identify discrete assertions
2. Hand-author candidate assertions or use vendor doc assist tool
3. Generate experiment drafts via `workflow_candidate_to_experiment`
4. Review and promote to `pending_approval` (human decision)
5. Run experiments (requires budget check, vendor API calls, device slot management)
6. Promote to `active` after evidence passes

**Decision:** This is a separate operational workstream. It is a Bridge-1 exercise (candidate creation), not a Bridge-2 follow-up. It should get its own plan in `plans/`, verify budget observations, and use `gate_mark_preflight` for the vnstock surface. It should be a dedicated session, not shoehorned into the Bridge-2 implementation session.

**What the gap means for autonomy.** The trajectory document says the destination is "an autonomous verification loop." Bridge 2 is a load-bearing component of that loop. But the loop's autonomy is bounded by the weakest exercised component. Today: Bridge 1 is not exercised on real data; Bridge 2 is not exercised on real data; Bridge 3 does not exist; Bridge 4 is implemented but not exercised. The loop is a pipeline of unproven components. The risk is that the first real end-to-end run will surface integration failures that no unit test can catch. This systemic pattern is documented as a meta risk: `record:risk-meta-260601T1328Z-bridge-components-tested-in-isolation-without-end-to-end-exercise`.

**Next steps for snapshot migration:**
- Create plan: `plans/260601-vnstock-unified-ui-snapshot-candidate-migration/`
- Verify budget observation: `observation-vnstock-resource-budget`
- Verify device slot observation: `observation-vnstock-device-slot-ledger`
- Run `gate_mark_preflight` for surface `vnstock`
- Exercise Bridge-1 pipeline on snapshot files (or hand-author candidates)
- Exercise Bridge-2 pipeline on generated candidates
- Run experiments and collect evidence

**Meta references:**
- Brainstorm report: `local:plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md`
- Meta risk record: `record:risk-meta-260601T1343Z-bridge-components-tested-in-isolation-without-end-to-end-exercise`
- Meta-state entries: `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz`, `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th`

## Risks Addressed

- Critical: No autonomous experiment approval. `auto_create` defaults to false; experiments are always `draft`.
- Medium: Templates are starting points, not final experiments. `template_override` allows customization.
- Low: Schema changes are backward-compatible (`additionalProperties` is not set to `false` in Draft 2020-12).

# Brainstorm: Bridge 2 — Candidate-to-Experiment Closeout Meta-Reflection

- date: 2026-06-01
- source: `/ck:brainstorm` session on `docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md`
- input: request to expand Post-Implementation Reflections from snapshot-migration deferral to full meta-process reflection
- status: approved, ready for `/ck:plan`
- **status (2026-06-12):** **VOIDED BY RE-DEBATE, 2026-06-12.** Per the operator reframe in `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8.2 and the consistency report at `plans/reports/consistency-260612-1300-mastra-research-report.md`, the candidate-to-experiment pipeline this report was validating is **product-surface design** that needs re-debate. The report's own self-flag (line 101: "Bridge 2 is marketed as 'complete' while untested end-to-end") is consistent with the operator reframe. The engineering content (the 4 dimension templates, the MCP tool, the schema changes, the promotion workflow) remains in the repo as historical record, but the *status* ("approved, ready for /ck:plan") and the *contract* (the pipeline as built) are voided. Do not act on this report as a build spec. See §3.8.2 of the Mastra research report for the full list of voided reports.

## Problem Statement

Bridge 2 (candidate → experiment plan) is complete and tested but never exercised on real data. The pipeline has 4 dimension templates, an MCP tool, schema changes, and a promotion workflow — all validated against synthetic fixtures. The system knows *how* to map a candidate to an experiment draft, but it has not yet been asked to do so for a real vendor-sourced assertion.

The closeout journal documents this gap as "Unified-UI snapshot migration deferred" but treats it as a scheduling issue rather than a structural one. The deeper question is: what does it mean for a bridge to be "built" when no real data has ever crossed it? And what risks does that create for the broader trajectory toward autonomy?

## Tool Build Reflections

### What Worked

**1. Template-dimension mapping is explicit and bounded.**
Four templates (`install`, `runtime`, `static`, `product`) each map a candidate assertion to a specific experiment shape. The registry is a plain JS object, not a rules engine. The dimension is the only routing key — no heuristics, no LLM, no ambiguity. A cleared-context agent can read `template-registry.js` and know exactly what experiment shape `workflow_candidate_to_experiment` will produce for any given dimension.

**2. `auto_create` defaults to false.**
The MCP tool always produces a draft for human review. Even with `auto_create=true`, the experiment is created with `status: draft` and `requires_human_approval: true`. This is the correct safety posture for a system that has not yet earned trust on real data. The tool is proposal-only, not execution.

**3. Schema migration is backward-compatible.**
`assertion_refs` is additive (not overloaded into `source_refs`), following the `claim_refs`/`risk_refs` precedent. The `product` dimension is added to the enum. Neither change breaks existing records. The `experiment.schema.json` and `index-entry.schema.json` both permit additional properties.

**4. Test coverage is comprehensive.**
12 unit tests (template-registry + draft-builder) + 8 tool tests (all dimensions, error paths, auto_create, template overrides) = 20 new tests. The tool tests exercise the full MCP tool surface, not just the core modules. The existing test suite (347/347 pass) includes these without regressions.

### What Didn't Work

**1. Templates are starting points, not proven plans.**
The `install` template assumes a sandbox install with temp directory and cleanup. The `runtime` template assumes metadata-only output with a fake/mocked substrate. The `product` template assumes a product-build decision after experiment success. None of these templates have been validated against a real candidate — they are educated guesses about what the experiment should look like. The template override mechanism (`template_override`) exists because the authors knew the templates would need tuning.

**2. The draft builder does not validate the experiment's feasibility.**
It reads the candidate, selects the template, fills fields. It does not check whether the candidate's `scope` (if any) matches the template's expected scope. It does not check whether the candidate's `source_refs` point to actual files. It does not check whether the surface's observation state (budget, device slots) would permit the experiment. The draft is structurally correct but operationally blind.

**3. `assertion_refs` dangling-reference validation is missing.**
`record-validation-rules.js` validates `source_refs`, `experiment_refs`, `claim_refs`, `risk_refs`, but not `assertion_refs`. This is a deferred gap. The validation layer hard-block on `candidate` status (Layer 5) prevents the worst case — a product record referencing a candidate — but it does not validate that an experiment's `assertion_refs` point to real, existing assertions. This is a schema-level gap that will bite the first real experiment.

**4. No bridge from template to experiment execution.**
Bridge 2 ends at "draft experiment exists." Bridge 3 (class-level approval) does not exist. The operator must manually review the draft, promote the candidate to `pending_approval`, run the experiment, capture evidence, and run `extract:index`. The tool is a proposal generator, not a workflow orchestrator. The gap between "draft exists" and "experiment runs" is still entirely human.

### Root Causes

**The loop tests tools, not workflows.**
Every new MCP tool gets a test file that validates its happy path and error paths. But the test exercises the tool in isolation — mock candidate, mock template, mock filesystem. The test does not exercise the *workflow*: candidate → draft → review → promotion → experiment → evidence → index update. Workflow tests are expensive (they require real records, real surfaces, real observations), so they are deferred. The result is a pipeline of well-tested components with no end-to-end validation.

**Real candidates are scarce because Bridge 1 is not exercised.**
All 79 existing assertions are `active` or `superseded`. No candidate assertions exist in production because the vendor doc assist tool (`workflow_vendor_doc_assist`) is also not exercised on real data. Bridge 2's "unexercised" status is a symptom of Bridge 1's "unexercised" status. The pipeline is dry because the upstream tap is closed.

## Operational Gap Reflections

### Why Snapshot Migration Was Deferred

The `records/vnstock/evidence/unified-ui-snapshot/` directory contains reference shape documentation (API schemas), not `## Findings` evidence capsules. The `extract-index` tool cannot parse these files — they lack the `## Findings` bullet format. Converting them to candidate assertions requires either:

- Hand-authoring `extracted-assertion` records from the snapshot content, or
- Running `workflow_vendor_doc_assist` on a markdown rendering of the snapshots.

Both paths require human effort. The snapshot files are not in a machine-ingestible format. The bridge from "snapshot exists" to "candidate exists" is a data-formatting problem, not a pipeline problem.

**Decision:** The snapshot migration is a separate operational workstream. It should get its own plan, verify budget observations, and use `gate_mark_preflight` for the `vnstock` surface. It is a candidate-creation exercise, not a bridge-2 exercise.

### What the Gap Means for Autonomy

The trajectory document says the destination is "an autonomous verification loop." Bridge 2 is a load-bearing component of that loop. But the loop's autonomy is bounded by the weakest exercised component. Today:

- Bridge 1 (doc → candidate): not exercised on real data.
- Bridge 2 (candidate → experiment): not exercised on real data.
- Bridge 3 (class-level approval): not implemented.
- Bridge 4 (candidate-vs-validated status): implemented but not exercised.

The loop is a pipeline of unproven components. Each bridge is tested in isolation. The risk is that the first real end-to-end run (vendor doc → candidate → experiment → evidence → index) will surface integration failures that no unit test can catch. The closeout journal's "Deferred Work" section lists these gaps. The reflection section should record what that means for the trajectory.

### Recommendations

1. **Exercise Bridge 1 before claiming Bridge 2 is validated.** The upstream tap must open. Run `workflow_vendor_doc_assist` on a real vendor document (e.g., a markdown rendering of the unified-ui snapshots) to produce the first real candidate assertions. This validates the doc → candidate path and produces the data Bridge 2 needs.

2. **Add workflow-level test coverage.** The existing tests are tool-level. Add a test that exercises the full pipeline: mock candidate → `workflow_candidate_to_experiment` → draft review → promotion → `extract:index` with passed evidence → active assertion. This is a structural test, not a runtime test. It validates the state machine transitions, not the vendor API.

3. **Add `assertion_refs` validation to Layer 5.** The validation layer already validates `source_refs` and `experiment_refs`. Adding `assertion_refs` is a one-line change in `record-validation-rules.js` and a corresponding test. This closes the dangling-reference gap before the first real experiment.

4. **Document the "unexercised bridge" risk as a meta risk record.** The loop has a pattern of building and testing components without exercising them end-to-end. This is a systemic risk. It should be captured in `records/evidence/meta/` and optionally as a `risk` record under the `product` surface (since it affects the loop's ability to validate product claims).

5. **Defer snapshot migration to a dedicated plan.** The snapshot migration is not a bridge-2 follow-up. It is a bridge-1 exercise. Create `plans/260601-vnstock-unified-ui-snapshot-candidate-migration/` with its own phases, budget checks, and surface preflight.

## Implementation Considerations

- The workflow-level test (recommendation 2) requires mocking the MCP tool surface and the filesystem. It does not require vendor API access or budget checks. It can be written as a unit test in the existing test suite.
- The `assertion_refs` validation (recommendation 3) is a small schema-level change. It should not affect existing records because no existing experiments use `assertion_refs` yet.
- The meta risk record (recommendation 4) should reference this brainstorm report and the closeout journal. It should classify the risk as `medium` (not critical) because the loop still has human-in-the-loop gates at every transition.
- The snapshot migration plan (recommendation 5) should be created with `/ck:plan` and should include budget verification (`observation-vnstock-resource-budget`) and device slot verification (`observation-vnstock-device-slot-ledger`) as Phase 0 gates.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Template quality is unproven on real candidates | medium | Template override mechanism exists; real data will expose gaps |
| `assertion_refs` validation gap allows dangling references | low | Add to Layer 5 before first real experiment |
| Bridge 2 is marketed as "complete" while untested end-to-end | medium | This brainstorm report and the meta risk record make the gap explicit |
| Snapshot migration is treated as Bridge 2 follow-up, not Bridge 1 | low | Dedicated plan with correct scope boundary |
| Bridge 1 scarcity persists; no real candidates ever appear | medium | Exercise `workflow_vendor_doc_assist` on real vendor docs as a priority |

## Success Criteria

- Bridge 1 exercised on real vendor data: at least one real `candidate` assertion exists in `records/vnstock/index/`.
- Bridge 2 exercised on real candidate: at least one experiment draft produced by `workflow_candidate_to_experiment` from a real candidate, reviewed and promoted to `pending_approval`.
- Workflow-level test exists: test file covering candidate → draft → promotion → active state machine.
- `assertion_refs` validation added to Layer 5.
- Meta risk record exists documenting the "unexercised bridge" systemic risk.
- Snapshot migration has its own plan with correct scope and budget verification.

## Next Steps

1. **Invoke `/ck:plan` for snapshot migration** (`plans/260601-vnstock-unified-ui-snapshot-candidate-migration/`). This is a Bridge 1 exercise, not Bridge 2.
2. **Invoke `/ck:plan` for Bridge 2 exercise** (`plans/260601-bridge-2-end-to-end-validation/`). Scope: workflow-level test + `assertion_refs` validation + one real candidate → experiment run.
3. **Create meta risk record** after this brainstorm report is approved.
4. **Update closeout journal** to reference this brainstorm report and the meta risk record.

## Unresolved Questions

1. Should the workflow-level test be a unit test (mocked) or an integration test (real records, temp filesystem)? The unit test is faster; the integration test is more realistic.
2. Should the template registry support a `version` field so templates can evolve without breaking existing drafts? The current registry is a flat object.
3. If Bridge 1 and Bridge 2 both require exercise, should they be combined into a single end-to-end plan (doc → candidate → experiment), or kept separate for clarity?
4. The `rejected` status is not in the `index-entry.schema.json` enum. Should it be added as part of the Bridge 2 exercise, or deferred until a real rejection occurs?
5. How does the loop track "exercise status" per bridge? A meta observation record? A field in the trajectory document? A dedicated `meta` evidence file?

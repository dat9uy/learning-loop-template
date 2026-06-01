---
phase: 2
title: "Design"
status: pending
effort: "2h"
dependencies: [1]
---

# Phase 2: Design

## Overview

Design the mapping convention, MCP tool schema, and promotion workflow. The output of this phase is a design doc that answers: given a `candidate` assertion, what experiment template should be generated? How does the human operator review and approve it? How does the assertion get promoted from `candidate` → `pending_approval` → `active`?

## Requirements

- Functional: Define a mapping convention from `candidate` assertion fields (capability, dimension, topic_tag, assertion text) to experiment fields (goal, hypothesis, method, success_metrics, scope, output_level)
- Functional: Design the `workflow_candidate_to_experiment` MCP tool schema and behavior
- Functional: Design the promotion workflow (candidate → pending_approval → active) with at least one MCP tool
- Non-functional: Design must be human-reviewable — no autonomous experiment approval
- Non-functional: Design must reuse existing experiment writer and schema where possible

## Architecture

### Candidate-to-Experiment Mapping Convention

The convention is dimension-driven. Each dimension has a default template:

| Dimension | Default Goal Template | Default Method Template | Default Success Metrics |
|-----------|----------------------|------------------------|------------------------|
| `install` | `Verify that {assertion} can be installed in {scope}` | `1. Prepare substrate: {substrate-class}. 2. Run installer. 3. Capture exit code and metadata. 4. Verify import smoke test.` | `Installer exits 0. Import succeeds. No host state leakage.` |
| `runtime` | `Verify that {assertion} returns expected shape under {scope}` | `1. Prepare runtime environment. 2. Execute API call. 3. Capture response metadata. 4. Validate shape against assertion.` | `Response matches expected shape. No exceptions. Metadata captured.` |
| `static` | `Verify that {assertion} is documented and consistent` | `1. Read vendor docs. 2. Cross-check against reference snapshot. 3. Note divergence.` | `Doc claims match assertion. Divergence list complete.` |
| `product` | `Verify that {assertion} is safe for product consumption` | `1. Review assertion against product scope. 2. Check decision coverage. 3. Validate with capability record.` | `Product scope approved. Decision coverage verified.` |

The template uses the candidate assertion's fields:
- `{assertion}` → `candidate.assertion`
- `{capability}` → `candidate.capability`
- `{dimension}` → `candidate.dimension`
- `{topic_tag}` → `candidate.topic_tag`
- `{scope}` → `candidate.scope` (or default `sandbox`)

### MCP Tool: `workflow_candidate_to_experiment`

**Name:** `workflow_candidate_to_experiment`
**Input:**
- `assertion_id`: string — the candidate assertion ID to map
- `surface`: string — the surface where the experiment will be created
- `template_override`: optional object — `{ goal, hypothesis, method, success_metrics }` to override defaults
- `auto_create`: optional boolean — default false. When true, creates the experiment record via `record_create_experiment`. When false, returns the experiment draft for human review.

**Output:**
```json
{
  "experiment_draft": {
    "id": "experiment-vnstock-install-api-methods-20260601...",
    "goal": "Verify that Unified UI provides a single entry point for all data types",
    "hypothesis": "The API call returns a DataFrame with expected columns",
    "method": ["Prepare substrate...", "Run installer...", "Capture metadata..."],
    "success_metrics": ["Installer exits 0", "Import succeeds", "No host state leakage"],
    "scope": "sandbox",
    "output_level": "metadata-only",
    "source_refs": ["record:assertion-vnstock-data-runtime-api-methods"],
    "verification": {
      "claim_refs": [],
      "proves": [{"dimension": "runtime", "scope": "sandbox", "output_level": "metadata-only"}],
      "requires_human_approval": true,
      "approval_status": "not-required"
    }
  },
  "template_used": "runtime",
  "overrides_applied": false,
  "created": false,
  "review_message": "Experiment draft ready for human review. Call with auto_create=true to create the record."
}
```

**Behavior:**
1. Read the candidate assertion from `records/<surface>/index/<id>.yaml`
2. Validate `status === "candidate"`. If not, return error.
3. Select template by `candidate.dimension`
4. Substitute template fields with candidate assertion values
5. If `auto_create: false`, return draft only (human review step)
6. If `auto_create: true`, call `record_create_experiment` with the draft fields
7. Return the created experiment record ID and path

### Promotion Workflow

Three statuses, one transition each:

```
candidate → pending_approval → active
```

**Transition 1: candidate → pending_approval**
- Trigger: Human operator reviews the experiment draft and decides the assertion is worth testing.
- Action: Human updates the assertion YAML `status` from `candidate` to `pending_approval`.
- Tool: `record_update_observation` (for observation-style updates) or manual edit. Actually, this is a record update, not an observation. Use `record_update_observation` is wrong. Better: a new MCP tool or manual edit.
- Actually, for first version, we should keep this simple. The human edits the YAML directly. The validation layer (Layer 5) already allows `pending_approval` references.

**Transition 2: pending_approval → active**
- Trigger: Experiment runs successfully and evidence is recorded with `validation_status: passed`.
- Action: `extract-index` runs and updates the assertion `status` to `active` (already works — `STATUS_MAP.passed → active`)
- Tool: `pnpm extract:index` (already exists)

The promotion workflow for Bridge 2 is intentionally minimal. The full automation (auto-promotion on experiment success) is Bridge 3/4 territory.

## Related Code Files

- Modify: `docs/artifact-concepts.md` — add mapping convention documentation
- Create: `tools/learning-loop-mcp/core/candidate-to-experiment/` — mapping logic
  - `template-registry.js` — dimension-specific templates
  - `experiment-draft-builder.js` — builds experiment draft from candidate + template
- Create: `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js` — MCP tool
- Modify: `tools/learning-loop-mcp/tools/manifest.json` — add tool entry

## Implementation Steps

1. Write the mapping convention table and add it to `docs/artifact-concepts.md`
2. Define the template registry in `template-registry.js` (4 dimension templates)
3. Define the experiment draft builder in `experiment-draft-builder.js`
4. Define the MCP tool handler in `workflow-candidate-to-experiment-tool.js`
5. Define the promotion workflow as a minimal human-driven process (no new tools for v1)

## Success Criteria

- [ ] Mapping convention documented in `docs/artifact-concepts.md`
- [ ] Template registry has 4 dimension templates (install, runtime, static, product)
- [ ] MCP tool schema designed with `assertion_id`, `surface`, `template_override`, `auto_create`
- [ ] Promotion workflow defined (candidate → pending_approval → active) with clear human decision points
- [ ] Design doc reviewed and approved (operator sign-off)

## Risk Assessment

- **Template is too rigid for real assertions:** Medium — template override field allows customization. Templates are starting points, not final experiments.
- **Auto_create bypasses human review:** Critical — `auto_create` defaults to false. The tool always returns a draft first. Even with `auto_create: true`, the experiment status is `draft` and requires human approval before it can be executed.
- **Promotion workflow is underspecified:** Medium — v1 is intentionally manual. Automation comes later.
- **Schema field `assertion_refs` vs `source_refs`:** Low — decision from Phase 1 determines which field to use. If `source_refs` is sufficient, no schema change needed.

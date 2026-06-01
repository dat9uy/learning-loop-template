---
phase: 3
title: "Mapping Tool"
status: completed
effort: "3h"
dependencies: [2]
---

# Phase 3: Mapping Tool

## Overview

Implement the `workflow_candidate_to_experiment` MCP tool and its core modules. The tool reads a candidate assertion, selects a dimension-specific template, substitutes fields, and optionally creates a draft experiment record.

## Requirements

- Functional: Tool reads candidate assertion from `records/<surface>/index/*.yaml`
- Functional: Tool validates `status === "candidate"`; returns error otherwise
- Functional: Tool selects template by `dimension` (install, runtime, static, product)
- Functional: Tool substitutes `{assertion}`, `{capability}`, `{dimension}`, `{topic_tag}`, `{scope}` into template
- Functional: Tool accepts `template_override` for customization
- Functional: Tool with `auto_create: false` returns a draft experiment object
- Functional: Tool with `auto_create: true` creates an experiment record via `record_create_experiment` and returns the record ID
- Non-functional: Tool completes in <2 seconds
- Non-functional: Tool does NOT approve the experiment — status is always `draft`

## Architecture

### Core Modules

- `tools/learning-loop-mcp/core/candidate-to-experiment/template-registry.js` — dimension templates
- `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js` — builds experiment draft
- `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js` — MCP tool definition

### Template Registry

```js
export const TEMPLATES = {
  install: {
    goal: "Verify that {assertion} can be installed in {scope}",
    hypothesis: "The installer completes without errors and the package is importable",
    method: [
      "Prepare substrate: fresh container or clean environment",
      "Run installer for {capability}",
      "Capture exit code and sanitized output",
      "Verify import smoke test succeeds",
      "Check for host state leakage outside declared boundary"
    ],
    success_metrics: [
      "Installer exits with code 0",
      "Import smoke test succeeds",
      "No host state leakage detected",
      "Sanitized output contains expected status lines"
    ],
    scope: "sandbox",
    output_level: "metadata-only"
  },
  runtime: {
    goal: "Verify that {assertion} returns expected shape under {scope}",
    hypothesis: "The API call produces a response matching the documented shape",
    method: [
      "Prepare runtime environment with {capability} installed",
      "Execute the API call described in the assertion",
      "Capture response metadata (status, shape, timing)",
      "Validate response shape against assertion text",
      "Record any divergence or exceptions"
    ],
    success_metrics: [
      "Response matches expected shape",
      "No exceptions thrown during execution",
      "Metadata captured for all observed dimensions",
      "Divergence list is complete if any"
    ],
    scope: "sandbox",
    output_level: "metadata-only"
  },
  static: {
    goal: "Verify that {assertion} is documented and consistent",
    hypothesis: "The vendor documentation and reference snapshot agree with the assertion",
    method: [
      "Read vendor documentation for {capability}",
      "Cross-check against reference snapshot if available",
      "Note any divergence between docs and assertion",
      "Record the version or commit of the docs checked"
    ],
    success_metrics: [
      "Doc claims match the assertion text",
      "Divergence list is complete and justified",
      "Version/commit of checked docs is recorded"
    ],
    scope: "meta-tooling",
    output_level: "docs-only"
  },
  product: {
    goal: "Verify that {assertion} is safe for product consumption",
    hypothesis: "The assertion is within the approved product scope and has decision coverage",
    method: [
      "Review the assertion against product scope boundaries",
      "Check that decision records exist for the affected surface",
      "Validate with capability records if applicable",
      "Confirm no candidate assertions are referenced"
    ],
    success_metrics: [
      "Product scope is approved by decision record",
      "Decision coverage verified for affected surface",
      "Capability records generated if required",
      "No unverified candidate assertions in dependency chain"
    ],
    scope: "product",
    output_level: "docs-only"
  }
};
```

### Experiment Draft Builder

```js
export function buildExperimentDraft(candidate, template, overrides = {}) {
  const subs = {
    assertion: candidate.assertion,
    capability: candidate.capability,
    dimension: candidate.dimension,
    topic_tag: candidate.topic_tag,
    scope: candidate.scope || "sandbox"
  };

  function substitute(templateStr) {
    return templateStr.replace(/\{(\w+)\}/g, (_, key) => subs[key] || `{${key}}`);
  }

  const goal = overrides.goal || substitute(template.goal);
  const hypothesis = overrides.hypothesis || substitute(template.hypothesis);
  const method = overrides.method || template.method.map(substitute);
  const success_metrics = overrides.success_metrics || template.success_metrics.map(substitute);
  const scope = overrides.scope || template.scope;
  const output_level = overrides.output_level || template.output_level;

  return {
    goal,
    hypothesis,
    method,
    success_metrics,
    scope,
    output_level,
    source_refs: [`record:${candidate.id}`],
    verification: {
      claim_refs: [],
      proves: [{ dimension: candidate.dimension, scope: candidate.scope || "sandbox", output_level }],
      requires_human_approval: true,
      approval_status: "not-required"
    }
  };
}
```

## Related Code Files

- Create: `tools/learning-loop-mcp/core/candidate-to-experiment/template-registry.js`
- Create: `tools/learning-loop-mcp/core/candidate-to-experiment/experiment-draft-builder.js`
- Create: `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` — add tool entry
- Create: `tools/learning-loop-mcp/__tests__/candidate-to-experiment.test.js` — tests

## Implementation Steps

1. Create `template-registry.js` with the 4 dimension templates above.
2. Create `experiment-draft-builder.js` with `buildExperimentDraft` and `substitute` helpers.
3. Create `workflow-candidate-to-experiment-tool.js`:
   - Schema: `assertion_id` (string), `surface` (string), `template_override` (optional object), `auto_create` (optional boolean, default false)
   - Handler: read candidate assertion → validate status → select template → build draft → if auto_create, call `createExperiment` → return result
4. Register tool in `manifest.json`.
5. Create tests:
   - Test with synthetic candidate assertion → draft generated
   - Test with invalid status (active) → error
   - Test with template_override → override applied
   - Test with auto_create=true → experiment record created
   - Test with auto_create=false → draft returned, no write
6. Run `pnpm test` to verify.

## Success Criteria

- [x] `workflow_candidate_to_experiment` tool registered in manifest and callable
- [x] Tool reads candidate assertion and returns structured experiment draft
- [x] Draft includes substituted goal, hypothesis, method, success_metrics
- [x] Draft `source_refs` includes `record:<candidate-id>`
- [x] Draft `verification.requires_human_approval` is `true`
- [x] Tool with `auto_create: true` creates an experiment record
- [x] Tool with `auto_create: false` does NOT create a record
- [x] Tool rejects non-candidate assertions with error
- [x] Tests cover all 4 dimensions
- [x] `pnpm test` passes
- [x] `pnpm check` passes

## Risk Assessment

- **Template substitution breaks on complex assertion text:** Low — assertions are plain text; substitution is simple string replacement.
- **Auto_create=true creates duplicate experiments:** Medium — `experiment-writer.js` already has deduplication (`atomicWriteYaml`). If the same assertion is mapped twice, the second write will be rejected.
- **Dimension not in template registry:** Low — falls back to `static` template with a warning note.
- **Tool reads non-index files:** Low — the tool only reads from `records/<surface>/index/*.yaml`.
- **Test flakiness due to filesystem:** Low — uses synchronous operations where possible.

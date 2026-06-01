---
phase: 1
title: "Research"
status: pending
effort: "2h"
dependencies: []
---

# Phase 1: Research

## Overview

Survey the current state of candidate assertions, experiment templates, and existing experiment records to understand what mapping conventions already exist implicitly and what gaps need filling.

## Requirements

- Functional: Identify all existing `candidate` assertions in the repo (currently zero — confirm this)
- Functional: Identify all existing experiment records and their common `method`/`success_metrics` patterns per dimension
- Functional: Determine if `experiment.schema.json` needs `assertion_refs` field or if `source_refs` is sufficient
- Non-functional: Research completes in <2 hours

## Research Questions

1. **Are there any live `candidate` entries?** Search `records/**/index/*.yaml` for `status: candidate`. If none, note that the first `candidate` must be created via Bridge-1 pipeline before Bridge-2 can be tested end-to-end.
2. **What experiment patterns exist per dimension?** Review existing experiments in `records/vnstock/experiments/` (install, runtime, product) and `records/meta/experiments/` (schema-improvement) to extract common `method` and `success_metrics` templates.
3. **Can `source_refs` hold `record:<assertion-id>`?** Yes — `source_refs` already accepts `record:` prefixes. The question is whether experiment records should have a dedicated `assertion_refs` field for better queryability and validation.
4. **What is the experiment template?** `records/meta/evidence/install-experiment-template-candidate.md` defines the evidence template. The experiment YAML template is implicit in `tools/learning-loop-mcp/core/experiment-writer.js`.

## Related Code Files
- Read: `records/**/experiments/*.yaml` (sample 5-10 records per dimension)
- Read: `schemas/experiment.schema.json`
- Read: `records/meta/evidence/install-experiment-template-candidate.md`
- Read: `tools/learning-loop-mcp/core/experiment-writer.js`
- Read: `docs/trajectory.md` § Bridge 2

## Implementation Steps

1. Run `grep -r "status: candidate" records/` to confirm zero live candidates.
2. Run `grep -r "dimension: install" records/vnstock/experiments/` and collect `method`/`success_metrics` patterns.
3. Run `grep -r "dimension: runtime" records/vnstock/experiments/` and collect patterns.
4. Run `grep -r "scope: schema-improvement" records/meta/experiments/` and collect patterns.
5. Compare `source_refs` vs `assertion_refs` — if `source_refs` is already used for assertions, `assertion_refs` is a schema addition. If `source_refs` is only used for evidence files, `assertion_refs` is justified.
6. Document findings in a research summary (add to `plans/260601-bridge-2-candidate-to-experiment/research-output.md`).

## Success Criteria

- [ ] Live candidate count confirmed (expected: 0)
- [ ] Experiment patterns per dimension documented (at least 3 dimensions: install, runtime, product)
- [ ] Decision recorded on whether to add `assertion_refs` to experiment schema or reuse `source_refs`
- [ ] Research summary written to `research-output.md`

## Risk Assessment

- **No candidate entries exist:** Expected — Bridge-1 is complete but no vendor doc has been ingested yet. Mitigation: synthetic test data in e2e tests.
- **Experiment patterns are too varied:** Medium — install and runtime experiments have very different shapes. Mitigation: dimension-specific templates with override capability.
- **Schema change needed:** Low — adding `assertion_refs` is a non-breaking addition if `additionalProperties: true` (which it is).

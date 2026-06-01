---
phase: 5
title: "Test"
status: pending
effort: "2h"
dependencies: [3, 4]
---

# Phase 5: Test

## Overview

Build comprehensive tests for the mapping tool, the promotion workflow, and the full end-to-end pipeline. Bridge-2 testing covers the path from candidate assertion to experiment creation to validation and promotion.

## Requirements

- Functional: Unit tests for `template-registry.js` (all 4 dimensions)
- Functional: Unit tests for `experiment-draft-builder.js` (substitution, overrides, edge cases)
- Functional: Unit tests for `workflow-candidate-to-experiment-tool.js` (handler, schema, auto_create)
- Functional: Integration test for full pipeline: candidate → draft → experiment → validate → promotion
- Functional: Regression test for `validateRecords` — `pending_approval` references allowed, `candidate` references blocked
- Non-functional: All tests run in <10 seconds total
- Non-functional: Tests use tmp directories for isolation

## Architecture

### Test File: `candidate-to-experiment.test.js`

Tests for the core modules:
- `template-registry` — all 4 dimensions have templates, unknown dimension falls back
- `experiment-draft-builder` —
  - Substitution works for all template fields
  - Override fields are applied correctly
  - Unknown dimension falls back gracefully
  - `source_refs` includes `record:<candidate-id>`
- `workflow-candidate-to-experiment-tool` —
  - Returns draft for valid candidate
  - Returns error for non-candidate status
  - Creates experiment when `auto_create: true`
  - Does not create experiment when `auto_create: false`

### Test File: `bridge-2-promotion.test.js`

Tests for the promotion workflow:
- `validateRecords` allows `pending_approval` references
- `validateRecords` blocks `candidate` references
- `extract-index` maps `passed → active` (via existing test or synthetic evidence)
- Full pipeline: candidate → draft → experiment → pending_approval → active

### Test File: `bridge-2-e2e.test.js`

End-to-end test using tmp directory:
1. Create synthetic candidate assertion
2. Call `workflow_candidate_to_experiment` → get draft
3. Create experiment record with `auto_create: true`
4. Validate records — candidate reference should be blocked (experiment is draft, not yet approved)
5. Simulate promotion: update candidate to `pending_approval`
6. Validate records — should pass (pending_approval is allowed)
7. Create evidence with `validation_status: passed`
8. Run `extract-index` → candidate becomes `active`
9. Validate records — should pass (active is allowed)

## Related Code Files

- Create: `tools/learning-loop-mcp/__tests__/candidate-to-experiment.test.js`
- Create: `tools/learning-loop-mcp/__tests__/bridge-2-promotion.test.js`
- Create: `tools/learning-loop-mcp/__tests__/bridge-2-e2e.test.js`
- Existing: `tools/learning-loop-mcp/__tests__/candidate-block.test.js` — add `pending_approval` test case

## Implementation Steps

1. Create `candidate-to-experiment.test.js` with unit tests for template-registry and draft-builder.
2. Create `bridge-2-promotion.test.js` with validation and promotion tests.
3. Create `bridge-2-e2e.test.js` with full pipeline test.
4. Add `pending_approval` test case to existing `candidate-block.test.js`.
5. Run `pnpm test` to verify all tests pass.
6. Run `pnpm check` to verify full suite.

## Success Criteria

- [ ] `candidate-to-experiment.test.js` has ≥10 tests covering all dimensions and overrides
- [ ] `bridge-2-promotion.test.js` has ≥5 tests covering promotion workflow
- [ ] `bridge-2-e2e.test.js` has ≥1 full pipeline test (candidate → active)
- [ ] `candidate-block.test.js` updated with `pending_approval` reference test
- [ ] All tests pass
- [ ] `pnpm test` passes
- [ ] `pnpm check` passes
- [ ] Test coverage includes error paths (non-candidate status, missing assertion, invalid dimension)

## Risk Assessment

- **Test flakiness with tmp directories:** Low — use `mkdtempSync` and clean up after each test.
- **Tests too slow:** Low — all operations are local filesystem; no network calls.
- **E2E test depends on extract-index:** Medium — extract-index is tested separately. E2E test validates the integration, not the extraction logic.
- **Missing edge cases:** Medium — test unknown dimension, empty assertion text, very long assertion text.

---
phase: 5
title: "Test"
status: completed
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

### Test Files

- `bridge-2-unit.test.js` — 12 tests covering template-registry (8) and draft-builder (4)
- `workflow-candidate-to-experiment-tool.test.js` — 8 tests covering MCP tool handler
- `candidate-block.test.js` — existing test, already covers `pending_approval` reference being allowed

### Test Coverage

- `template-registry` — all 4 dimensions, unknown dimension, substitution, field mapping
- `experiment-draft-builder` — missing candidate, non-candidate status, valid candidate, overrides
- `workflow-candidate-to-experiment-tool` — draft, auto_create, error paths, all 4 dimensions
- `candidate-block.test.js` — `pending_approval` allowed, `candidate` blocked

## Related Code Files

- Create: `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` (12 tests)
- Create: `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.test.js` (8 tests)
- Existing: `tools/learning-loop-mcp/__tests__/candidate-block.test.js` — already covers `pending_approval`

## Implementation Steps

1. Create `bridge-2-unit.test.js` with unit tests for template-registry and draft-builder.
2. Create `workflow-candidate-to-experiment-tool.test.js` with MCP tool tests.
3. Run `pnpm test` to verify all tests pass.
4. Run `pnpm check` to verify full suite.

## Success Criteria

- [x] `bridge-2-unit.test.js` has ≥10 tests covering all dimensions and overrides
- [x] `workflow-candidate-to-experiment-tool.test.js` has ≥8 tests covering promotion workflow
- [x] `candidate-block.test.js` already covers `pending_approval` reference test
- [x] All tests pass
- [x] `pnpm test` passes
- [x] `pnpm check` passes
- [x] Test coverage includes error paths (non-candidate status, missing assertion, invalid dimension)

## Risk Assessment

- **Test flakiness with tmp directories:** Low — use `mkdtempSync` and clean up after each test.
- **Tests too slow:** Low — all operations are local filesystem; no network calls.
- **E2E test depends on extract-index:** Medium — extract-index is tested separately. E2E test validates the integration, not the extraction logic.
- **Missing edge cases:** Medium — test unknown dimension, empty assertion text, very long assertion text.

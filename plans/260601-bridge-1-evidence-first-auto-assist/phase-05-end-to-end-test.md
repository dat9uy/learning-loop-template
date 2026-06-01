---
phase: 5
title: "End-to-End Test"
status: completed
priority: P1
effort: "2h"
dependencies: [3, 4]
---

# Phase 5: End-to-End Test

## Overview

Run a full end-to-end test of the Bridge 1 pipeline: place a vendor doc in `vendor-docs/`, call `workflow_vendor_doc_assist`, write evidence from suggestions, run `extract-index`, verify the entry is `candidate`, then verify `validate_records` blocks product consumption and `list-verified` filters it out.

## Requirements

- Functional: A synthetic vendor doc placed in `records/vnstock/vendor-docs/` produces suggestions via `workflow_vendor_doc_assist`.
- Functional: The suggestions can be turned into a valid evidence file with `## Findings`.
- Functional: `extract-index` produces a `candidate` entry from the evidence.
- Functional: `validate_records` rejects a product experiment that references the `candidate` entry.
- Functional: `list-verified` does not include the `candidate` entry by default.
- Functional: `search-index` with `include_candidates: true` returns the `candidate` entry.
- Non-functional: All steps complete in <30 seconds total.
- Non-functional: Test is idempotent — can be run multiple times without side effects.

## Architecture

The e2e test uses a temporary directory (via `mkdtempSync`) to avoid polluting the real `records/` tree. It exercises the pipeline through the core functions directly, not through the MCP server (to avoid stdio transport overhead).

### Test Pipeline

1. **Create synthetic vendor doc** in tmp dir `records/vnstock/vendor-docs/test-doc.md`.
2. **Call `workflow_vendor_doc_assist`** core function (or parse doc + run suggestion engine).
3. **Write evidence** from suggestions to `records/vnstock/evidence/test-evidence.md`.
4. **Run `extract-index`** via `runExtraction(tmpRoot, { dryRun: false })`.
5. **Validate the produced index entry**:
   - Assert `status === "candidate"`.
   - Assert `capability === "vnstock-data"`.
   - Assert `topic_tag` matches the suggested tag.
6. **Create a product experiment** referencing the candidate entry.
7. **Run `validateRecords`** and assert it rejects the experiment.
8. **Run `listVerifiedClaims`** and assert the candidate is NOT included.
9. **Run `searchIndex`** with `include_candidates: true` and assert the candidate IS included.
10. **Clean up** tmp directory.

### Synthetic Vendor Doc

```markdown
# VNStock Unified UI Migration Guide

## Tổng Quan

Unified UI provides a single entry point for all data types.
The API supports both historical and real-time data.

## API Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `stock_intraday` | Real-time intraday data | DataFrame |
| `stock_historical` | Historical daily data | DataFrame |

## Setup

Install with `pip install vnstock_data`.
```

## Related Code Files

- Create: `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` — end-to-end test
- Modify: `package.json` — ensure test file is included in `pnpm test` glob

## Implementation Steps

1. Create `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js`:
   - Use `node:test` and `node:assert/strict`.
   - Use `mkdtempSync` for isolation.
   - Write the synthetic vendor doc to `records/vnstock/vendor-docs/test-doc.md`.
   - Import `parseDoc` from `core/vendor-doc-assist/doc-parser.js` and `generateSuggestions` from `core/vendor-doc-assist/suggestion-engine.js`.
   - Import `runExtraction` from `core/extract-index/extract-index.js`.
   - Import `validateRecords` from `core/record-validation-rules.js`.
   - Import `loadSchemas` from `core/schema-loader.js`.
   - Import `listVerifiedClaims` from `core/list-verified.js`.
   - Import `searchIndex` from `core/search-index.js`.
   - Write the pipeline as described in the Architecture section.
2. Verify the test file runs with `node --test tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js`.
3. Run `pnpm test` to ensure all tests pass.
4. Run `pnpm check` to ensure the full check suite passes.

## Success Criteria

- [x] Synthetic vendor doc produces suggestions with confidence > 0.5
- [x] Evidence written from suggestions produces a `candidate` index entry
- [x] `validateRecords` rejects a product experiment referencing the `candidate` entry
- [x] `listVerifiedClaims` does not include the `candidate` entry by default
- [x] `searchIndex` with `include_candidates: true` includes the `candidate` entry
- [x] Test is idempotent and runs in <30 seconds
- [x] `pnpm test` passes
- [x] `pnpm check` passes

## Risk Assessment

- **Test flakiness due to filesystem timing:** Low — uses synchronous fs operations and tmp dir isolation.
- **Test fails on real data because existing records violate candidate block:** Low — e2e test uses tmp dir with synthetic data only.
- **Suggestion engine quality varies with synthetic doc:** Medium — the synthetic doc is designed to trigger known heuristics. If heuristics change, test may need updating. This is acceptable — the test validates the pipeline, not the specific suggestions.
- **Test is too slow:** Low — all operations are local filesystem; no network calls or LLM inference.

---
phase: 1
title: "Supersession Write-Back Tests"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Supersession Write-Back Tests

## Overview

Write failing tests that pin the contract for automated supersession write-back. Tests must fail today (proving the gap is real) and pass after Phase 2.

## Requirements

- Functional: cover the three behaviors the brainstorm promised — old entry gets `superseded_by`, new entry gets `supersedes`, both happen in one extraction pass without manual edits.
- Functional: hard-stop case (assertion text changed without `## Confirmation / Disproof Notes`) still produces an error and writes nothing.
- Non-functional: test harness uses the same `node:test` pattern as existing `extract-index.test.js`. No new dependencies.

## Architecture

Tests sit in `tools/extract-index/extract-index.test.js` alongside the existing supersession test (which currently only checks the disproof-note flag). New cases call `runExtraction` against a tmp directory containing:

1. An existing index entry on disk (the "old" assertion).
2. A new evidence file with `## Findings` + `## Confirmation / Disproof Notes` naming the old assertion-id.
3. Assertions on both YAML files after extraction.

## Related Code Files

- Modify: `tools/extract-index/extract-index.test.js` — add three test cases.
- Read for context: `tools/extract-index/extract-index.js:159-176` (`checkSupersession`), `tools/extract-index/index-entry-builder.js:43-55` (entry shape).

## Implementation Steps

1. Add test case `writes supersedes link on new entry when disproof note names old assertion-id`. Setup: write old index YAML with `id: assertion-cap-runtime-tag-old`, `status: active`. Write new evidence file producing `assertion-cap-runtime-tag-new` with disproof note. Expect: new file on disk shows `supersedes: [assertion-cap-runtime-tag-old]`.
2. Add test case `writes superseded_by link on old entry when new disproof references it`. Same setup. Expect: old file on disk now shows `superseded_by: assertion-cap-runtime-tag-new` and `status: superseded`.
3. Add test case `hard-stops when assertion text changes without disproof note`. Setup: old entry exists, new evidence rewrites assertion text but provides no `## Confirmation / Disproof Notes`. Expect: `runExtraction` returns error containing "Supersession hard-stop"; neither file changes.
4. Confirm all three tests FAIL on current `main` (proves the gap exists). Run `pnpm test --filter extract-index` or equivalent and capture failures in commit message.

## Success Criteria

- [ ] Three new tests added to `extract-index.test.js`.
- [ ] All three FAIL on current code.
- [ ] Failure messages clearly describe missing behavior (not a setup bug).
- [ ] `pnpm check` runs (the three new tests are the only failures).

## Risk Assessment

- Risk: tests over-specify YAML formatting and break on benign serialization changes. Mitigation: assert on parsed YAML (via `parseYaml`), not raw strings.
- Risk: tmp-directory setup leaks state between tests. Mitigation: follow the `before` / `after` pattern already in `extract-index.test.js`.

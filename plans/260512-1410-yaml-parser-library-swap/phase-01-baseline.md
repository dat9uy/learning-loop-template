---
phase: 1
title: "Baseline"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Baseline

## Overview

Capture exact current `pnpm validate:records` output across all 34 records before any swap. This becomes the regression diff target — any post-swap deviation is a problem to investigate, not a quirk to accept.

## Requirements

- Functional: capture `pnpm validate:records` stdout + stderr + exit code on a clean main branch.
- Functional: enumerate the 34 records by id so the post-swap parse can be diffed at the record-level too.
- Non-functional: baseline artifact stays under the plan dir (not committed to repo root; not in `records/`).

## Architecture

Two artifacts:
1. `baseline-validate-records.txt` — full stdout/stderr of `pnpm validate:records` for byte-diff comparison.
2. `baseline-record-shapes.json` — structured snapshot of each record's parsed shape (id, type, top-level keys), produced via a throwaway Node one-liner that imports `record-loader.js` (still on hand-rolled parser) and dumps the result. This lets Phase 4 confirm that not only the validator exit is identical, but the parsed object graph is too.

Both artifacts live in `plans/260512-1410-yaml-parser-library-swap/baseline/`. They are temporary; deleted in Phase 5 cleanup.

## Related Code Files

- Read: `tools/validate-records/record-loader.js`, `tools/validate-records/simple-yaml-parser.js`
- Create: `plans/260512-1410-yaml-parser-library-swap/baseline/baseline-validate-records.txt`
- Create: `plans/260512-1410-yaml-parser-library-swap/baseline/baseline-record-shapes.json`

## Implementation Steps

1. Confirm working tree clean (`git status`), on `main`, HEAD at `e2a82d6` or later (UTC-Z normalization landed).
2. Run `pnpm validate:records 2>&1 | tee plans/260512-1410-yaml-parser-library-swap/baseline/baseline-validate-records.txt`. Confirm exit 0.
3. Run an inline Node script that imports `loadRecords` from `tools/validate-records/record-loader.js`, then writes a sorted JSON dump of `[{id, type, file: __file, topKeys: Object.keys(record).filter(k => k !== '__file').sort()}]` to `baseline/baseline-record-shapes.json`. Pretty-print 2-space.
4. Count records: confirm exactly 34 entries. If the count differs from the brainstorm/decision references, record the live count in the baseline filename or a `README.txt` next to the artifact and proceed with the live count as truth.

## Success Criteria

- [ ] `baseline-validate-records.txt` exists, ends with exit-0-equivalent content (no "errors" lines, validator's normal success summary).
- [ ] `baseline-record-shapes.json` exists with N records (N = live count, expected 34).
- [ ] Working tree otherwise clean — baseline artifacts are untracked or staged but not committed yet.

## Risk Assessment

- **Risk**: validator's stdout includes timestamps or unstable ordering. **Mitigation**: inspect `baseline-validate-records.txt`; if any unstable field surfaces, redact or normalize in both pre- and post-snapshots consistently.
- **Risk**: record count differs from documents. **Low**; live count is truth, just document it.

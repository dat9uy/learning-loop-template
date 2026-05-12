---
phase: 4
title: "Regression"
status: completed
priority: P1
effort: "45m"
dependencies: [3]
---

# Phase 4: Regression

## Overview

Confirm post-swap parse + validate output is byte-identical to the Phase 1 baseline across all 34 records. Then prove the new capability — a record using a pipe-block-scalar parses cleanly under the library where it would have failed under the hand-rolled parser. Both gates pass before we proceed to deletion.

## Requirements

- Functional: post-swap `pnpm validate:records` stdout/stderr/exit byte-identical to `baseline-validate-records.txt`.
- Functional: post-swap parsed record shapes identical to `baseline-record-shapes.json` (same ids, same `topKeys` sets, same types).
- Functional: a hand-crafted YAML fragment with `|` block scalar parses cleanly under the new import surface (smoke test, not a committed record).
- Non-functional: any diff — even cosmetic — is investigated and either reverted, fixed, or explicitly accepted with rationale.

## Architecture

Two diff gates and one smoke test:

1. **Stdout diff**: capture post-swap output to `regression-validate-records.txt` and `diff` against baseline. Empty diff required.
2. **Shape diff**: re-run the same Node one-liner from Phase 1 to dump record shapes; `diff` against `baseline-record-shapes.json`. Empty diff required.
3. **Pipe-scalar smoke**: feed a small in-memory YAML string with `notes: |` followed by a multi-line block, via `node -e`, and assert the parsed result has `notes` as a multi-line string. Not a committed record — this is purely a capability proof.

Regression artifacts go in `plans/260512-1410-yaml-parser-library-swap/regression/`.

## Related Code Files

- Read (verification): all 6 migrated files from Phase 3
- Create: `plans/260512-1410-yaml-parser-library-swap/regression/regression-validate-records.txt`
- Create: `plans/260512-1410-yaml-parser-library-swap/regression/regression-record-shapes.json`
- Create: `plans/260512-1410-yaml-parser-library-swap/regression/pipe-scalar-smoke.txt` (smoke-test transcript)

## Implementation Steps

1. Run `pnpm validate:records 2>&1 | tee plans/260512-1410-yaml-parser-library-swap/regression/regression-validate-records.txt`. Confirm exit 0.
2. `diff plans/260512-1410-yaml-parser-library-swap/baseline/baseline-validate-records.txt plans/260512-1410-yaml-parser-library-swap/regression/regression-validate-records.txt`. Expect zero output. If diff is non-empty, analyze every line.
3. Re-run the Phase-1 shape-dump one-liner against the migrated loader, writing to `regression-record-shapes.json`. `diff` against baseline. Expect zero output.
4. **Smoke**: run `node -e 'import("yaml").then(m => { const s = `notes: |\n  line one\n  line two\nid: smoke`; const r = m.parse(s); console.log(JSON.stringify(r)); })' > plans/260512-1410-yaml-parser-library-swap/regression/pipe-scalar-smoke.txt`. Expect output `{"notes":"line one\nline two\n","id":"smoke"}` (or near-equivalent). This is the capability proof; record verbatim in the transcript file.
5. If any diff surfaces, classify:
   - **Cosmetic** (whitespace, ordering): tighten the dump format to be deterministic, or normalize both sides identically. Do not accept silently.
   - **Semantic** (a record that parses differently): if the hand-rolled parser was wrong (e.g., it silently dropped a value), the library is right — fix the record in a follow-up commit before the swap lands. If the library is wrong, halt and revisit the decision.
6. If all three gates pass, mark phase complete. Do NOT delete the parser yet — Phase 5 owns that.

## Success Criteria

- [ ] `regression-validate-records.txt` exists; `diff` vs baseline is empty.
- [ ] `regression-record-shapes.json` exists; `diff` vs baseline is empty.
- [ ] `pipe-scalar-smoke.txt` shows the `|` block scalar correctly parsed to a multi-line string.
- [ ] `pnpm check` exit 0.

## Risk Assessment

- **Risk**: dump format is non-deterministic (e.g., object key order changes). **Mitigation**: sort keys explicitly in the dump script; `JSON.stringify(obj, Object.keys(obj).sort(), 2)` for top-level; recurse if needed.
- **Risk**: library normalizes whitespace or empty strings differently. **Mitigation**: shape-diff catches it; investigate per case. Most likely cosmetic and acceptable; document in `regression/` README if so.
- **Risk**: an existing record fails to parse under the library (real grammar error the hand-rolled parser tolerated). **Mitigation**: classify as a record bug, file a one-line fix in the same commit (decision draft does not forbid fixing genuinely broken YAML — only forbids *retrofitting* to use new features).
- **Risk**: smoke test passes but doesn't actually exercise project tooling. **Acknowledged**: the smoke is a library-capability check, not a tooling-integration check. Integration is already covered by gates 1+2.

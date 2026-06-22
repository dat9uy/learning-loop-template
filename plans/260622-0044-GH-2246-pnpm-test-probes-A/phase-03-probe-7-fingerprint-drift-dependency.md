---
phase: 3
title: "Probe 7: Fingerprint-drift dependency"
status: completed
priority: P2
dependencies: []
---

# Phase 3: Probe 7 — Fingerprint-drift dependency

## Overview

Determine whether the fingerprint-drift finding (`meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift`) requires the FULL E2E test suite, or just one specific namespace (e.g., `mcp` or `mastra`). The operator's "slow test is the signal" claim is at stake: if drift detection only needs one namespace, the forcing function can be per-namespace, not full-suite. If it needs the full suite, the operator's claim is grounded.

## Why This Probe Is Blocking

The brainstorm's central trade-off is: "10-min run is the catch mechanism for drift findings; do not shorten it." If the catch mechanism only needs one namespace, the trade-off shifts: we can shorten the run by running only the drift-detecting namespace, and the rest of the suite can move to CI / per-namespace gates. If the catch mechanism needs the full suite, the trade-off holds.

## Requirements

- Functional: read the fingerprint-drift finding's `evidence_code_ref` and `verification.steps`; identify which test file asserts drift; determine if that test file requires the full E2E or just one namespace.
- Non-functional: read-only. Do not modify any source files. Do not invoke the test runner.

## Related Code Files (read-only)

- `meta-state.jsonl` (at repo root) — the finding itself; the line containing `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift`
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` — the test file asserted as `evidence_test`; this is where the drift detection runs
- `tools/learning-loop-mcp/core/meta-state.js` — the SHA-256 fingerprint computation; the `check_grounding` function
- `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js` — possibly related
- `package.json` — the test script (defines what runs in `pnpm test`)

## Implementation Steps

1. **Read the finding from `meta-state.jsonl`.** Extract: `evidence_code_ref`, `evidence_test`, `verification.steps`, `subtype`. Note the journal reference (`evidence_journal`).

2. **Read `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`.** Identify:
   - What does this test assert? (Likely: "all `mechanism_check: true` findings must be grounded against current SHA-256 fingerprints")
   - Which findings does it iterate over? (Probably: all `mechanism_check: true` findings in `meta-state.jsonl`)
   - What does it require to run? (Probably: a populated `meta-state.jsonl` + a workspace; no test runner is required to *detect* drift — only to assert no-drift)

3. **Read the journal file referenced by the finding** (`plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` per the finding's `evidence_journal`). Note any specific test commands that were run.

4. **Read `tools/learning-loop-mcp/core/meta-state.js`.** Find the `check_grounding` function. Note:
   - Does it require the test runner to have run? (Probably no — fingerprint is computed against source file SHA-256, independent of test execution)
   - Or does it require actual test execution? (If yes, this is the binding constraint)

5. **Read `package.json`'s test script.** Identify which namespace(s) it covers. The brainstorm notes 11 directories + 7 directories that contain tests = 136 test files. Confirm.

6. **Determine: does the drift detection require the FULL E2E suite?**
   - If `cold-tier-regression.test.js` runs as part of `pnpm test`, and `pnpm test` is the full E2E, then yes — drift detection transitively requires the full suite.
   - If `cold-tier-regression.test.js` can run in isolation (e.g., `node --test tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`), then no — drift detection only needs that one file.
   - If `check_grounding` requires a fully-populated `meta-state.jsonl` (which is updated by other test runs), then yes — but the dependency is on `meta-state.jsonl`, not on the test runner.

7. **Compute the answer:**
   - "Drift detection requires full E2E" if and only if the chain of dependencies shows that running `pnpm test` is necessary for the drift assertion to be meaningful.
   - Note: "the test passes when run as part of the full E2E" is NOT the same as "the test requires the full E2E." A test that runs in 1s in isolation does not require 10 minutes of other tests.

8. **Quantify the cost.** If the answer is "drift detection requires full E2E," note how much of the 10 minutes is drift-detection-essential vs. collateral. If the answer is "drift detection is one test file," note its isolated runtime.

## Success Criteria

- [x] A concrete answer: "Drift detection requires [full E2E | one specific namespace | one specific test file | just `meta-state.jsonl` updates]"
- [x] File:line evidence for the answer
- [x] If the answer is "one specific test file," the isolated runtime of that file is noted (or the cost to measure it is documented for Plan B)
- [x] If the answer is "full E2E," the chain of dependencies that forces the full suite is traced

## Risk Assessment

- **Risk:** The drift detection has hidden dependencies on other tests (e.g., shared fixtures, side effects from earlier tests). **Mitigation:** read the test setup block; if there are inter-test dependencies, note them.
- **Risk:** The drift detection depends on `meta-state.jsonl` being populated, and the population is done by other test runs. **Mitigation:** trace the population path; if the path runs as part of `pnpm test`, note that the full suite is needed for population, but the drift assertion itself does not need the test runner.
- **Risk:** The answer is "it depends" (e.g., the test asserts drift, but a CI step pre-populates `meta-state.jsonl`). **Mitigation:** document the dependency chain; flag for Plan B.

## Output Format

Append to `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` under `## Probe 7`:

```markdown
### Probe 7: Fingerprint-drift dependency

**Question:** Does the fingerprint-drift finding require the FULL E2E test suite to be detected, or just one specific namespace / test file?

**Answer:** [Full E2E | one namespace | one test file | just meta-state updates] — [1-2 sentences]

**Evidence:**
- `meta-state.jsonl` — finding line: `evidence_code_ref = tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:113`
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:LINE` — [what the test does]
- `tools/learning-loop-mcp/core/meta-state.js:LINE` — `check_grounding` does [what]
- `package.json:LINE` — test script runs [what]

**Dependency chain:** [paragraph from Step 6]

**Isolated runtime (if measurable without running):** [X seconds/minutes] or [requires measurement in Plan B]

**Operator's "slow test is the signal" claim verdict:** [Holds at full-suite level | Holds at per-namespace level | Reframed: see new constraints]

**New constraints (if any):** [List, or "None"]
```

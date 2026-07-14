---
phase: 1
title: "Script"
status: completed
priority: P2
dependencies: []
---

# Phase 1: Script

## Overview

Create `tools/scripts/vitest-failures.sh`: a pure `#!/usr/bin/env bash` + `jq` read-only parser over `.test-logs/vitest-results.json`. Compact failure output, exit-coded so the agent can gate its next step without reading JSON into context.

## Requirements

- Functional: green → one-line summary, exit 0; failures → header + per-failure `fullName` + `failureMessages` (truncated ~500 chars), exit 1; missing/invalid file → guidance message, exit 2.
- Non-functional: `set -euo pipefail`; single `jq` invocation; read-only (no side effects → no gate preflight); path overridable via `$1` (default `.test-logs/vitest-results.json`).

## Architecture

`jq` is the only parser (per locked decision). Script fails closed on schema drift (invalid JSON → exit 2), so the prose fallback jq one-liner in Phase 2 remains the agent's backup. No node, no runner modes — runner flags (`--bail`/`--changed`/`run <path>`) are prose-only in Phase 2.

## Related Code Files

- Create: `tools/scripts/vitest-failures.sh`
- Create: `tools/scripts/__fixtures__/vitest-results-failed.json` (regression fixture, 1–2 failing assertions)
- Create: `tools/learning-loop-mastra/__tests__/scripts/vitest-failures.test.cjs` (or `.js`) — invokes the script via `child_process.spawnSync` against the fixture + the live green file; asserts exit codes and compact output. Kept out of the main suite's test tally concerns (it's a normal vitest test file, runs fast).

## Implementation Steps

1. Write `vitest-failures.sh` with the contract above. Reference jq filters (verified on live green file):
   - green guard: `if .numFailedTests==0 then "all green: \(.numTotalTests) tests / \(.numTotalTestSuites) suites passed" else . end`
   - failures: `[.testResults[].assertionResults[] | select(.status=="failed") | {fullName, failureMessages}]`
2. Truncate each `failureMessages` entry to ~500 chars with a trailing `…` when cut (use `jq`'s string slicing `[0:500]`).
3. `chmod +x` the script.
4. Build the failed fixture JSON (hand-authored minimal `testResults` with one `status:"failed"` assertion + a `failureMessages` entry, plus `numFailedTests:1`, `numTotalTests:1`, `numTotalTestSuites:1`, `numFailedTestSuites:1`).
5. Write the spawnSync test: green-live (exit 0), failed-fixture (exit 1, asserts `fullName` appears, message truncated marker), missing-path (exit 2).
6. Run `bash tools/scripts/vitest-failures.sh` against the live green file to confirm the summary line.

## Success Criteria

- [x] `bash tools/scripts/vitest-failures.sh` → green summary line, exit 0 (live tree: `all green: 1894 tests / 381 suites passed` — exact counts shifted as the suite grew post-plan authoring; format matches)
- [x] fixture path → failing assertion printed, exit 1
- [x] nonexistent path → exit 2 with guidance message
- [x] script test passes under `pnpm test` (7 hermetic tests in `tools/scripts/__tests__/vitest-failures.test.js`)
- [x] script is `+x` and has `set -euo pipefail`

## Risk Assessment

- **jq schema drift**: vitest JSON shape changes → script exits 2 (fail-closed); prose jq one-liner is the fallback. Low blast radius.
- **Fixture rot**: hand-authored fixture may drift from real vitest shape. Mitigation: keep it minimal and shape-checked against the live file during authoring.
- **Truncation hides info**: ~500 char cut may drop a needed trace. Mitigation: prose hint gives the raw jq one-liner for full output; truncation is the bounded-context default.
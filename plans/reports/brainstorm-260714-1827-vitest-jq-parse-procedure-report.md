# Brainstorm: deterministic jq parse of vitest results

**Finding:** `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age` (open, `loop-anti-pattern`/`missing-test-parse-instruction`, `affected_system: mcp-tools`)
**Date:** 2026-07-14 18:27 BKK
**Mode:** brainstorm only — no implementation. Flags: none.

## Problem

Vitest migration (change-log `meta-260713T2032Z-test-runner-coverage`, `vitest.config.mjs:54-57`) shipped structured endpoint `.test-logs/vitest-results.json` (`numTotalTests`/`numFailedTests`/`numFailedTestSuites` + `testResults[].assertionResults[]` with `status`/`name`/`fullName`/`failureMessages`). No PROCESS_HINTS row or discoverability hint tells the agent to consume it. So every session the agent re-pollutes context by grepping raw vitest stdout and hand-parsing the JSON with adhoc `python -c`/`node -e` — re-introducing resolved `meta-260712T0730Z-test-runner-pollutes-agent-context`. Fast-feedback gap: agent re-runs full `pnpm vitest run` (~25s) 3× to surface pre-existing drift because no hint covers `--bail`/`--changed`. Stale row #1 (`loop-introspect.js:129`) references deleted per-namespace `.test-logs/<ns>.log` files (namespaced runner removed in commit `7952f16`).

**Underlying problem (problem-first):** not "python vs jq" — it is "agent re-parses test output from scratch every session, polluting context." Fix must eliminate re-pollution and make the parse deterministic, not merely cheaper.

## Decisions (locked)

1. **Force lever:** shipped jq script + prose PROCESS_HINTS row pointing to it (no gate rule, no MCP tool).
2. **Script form:** pure `#!/usr/bin/env bash` + `jq`. jq is literally the parser. Not a runtime-hook surface → no `.factory` mirror needed for the script.
3. **Script scope:** pure parser over existing `.test-logs/vitest-results.json` (read-only, no side effects → no gate preflight). Fast-feedback run flags stay in prose (runner concern, not parser).
4. **Row shape:** rewrite stale row #1 into one canonical test-discipline row (run flags + parse via script/jq fallback), mirrored byte-for-byte to `.factory/hooks/loop-surface-inject.cjs` `LOCAL_PROCESS_HINTS` row #1. DRY.

## Design

### New file: `tools/scripts/vitest-failures.sh`

Pure bash + jq, read-only. Contract:

- Input: `.test-logs/vitest-results.json` (path overridable via `$1`).
- `numFailedTests == 0` → print one line `all green: <numTotalTests> tests / <numTotalTestSuites> suites passed`, exit 0.
- `numFailedTests > 0` → print header `<numFailedTests> failures in <numFailedTestSuites> suites`, then per failure: `fullName` + indented `failureMessages[]` (truncate each message to ~500 chars to bound context), exit 1.
- Missing file or invalid JSON → print `no vitest results at <path>; run \`pnpm test\` first`, exit 2.
- `set -euo pipefail`. `jq` invoked once with a single filter.

Reference jq (verified on live file, green tree):
```jq
# green guard
if .numFailedTests==0 then "all green: \(.numTotalTests) tests / \(.numTotalTestSuites) suites passed"
else . end
# failures
[.testResults[].assertionResults[] | select(.status=="failed") | {fullName, failureMessages}]
```
Failure-exit code lets the agent gate its next step on the script exit status without reading JSON into context.

### Edit: `tools/learning-loop-mastra/core/loop-introspect.js` PROCESS_HINTS row #1 (line 129)

Replace stale text with one canonical test-discipline row covering:
- **Run targeted, not full suite:** (a) `vitest run --bail=1` — stop at first failure, use while iterating a fix; (b) `vitest run <path>` — one file, use while debugging one handler; (c) `vitest --changed` — only files affected by `git diff`, use post-edit to verify without re-running the full suite.
- **Parse once, compactly:** after a run, parse `.test-logs/vitest-results.json` with `bash tools/scripts/vitest-failures.sh` (deterministic jq; exit 0 = green, non-zero = failures printed compactly). Do NOT grep raw vitest stdout, re-read passing tests, or hand-write `python -c`/`node -e` to parse the JSON. Fallback jq one-liner if script absent: `jq '[.testResults[].assertionResults[]|select(.status=="failed")|{fullName,failureMessages}]' .test-logs/vitest-results.json`.
- Keep Rule 2 (same-file-read journal stop) from the old row — still valid. Drop Rule 1 (silent-command `.test-logs/<ns>.log` tail) — references deleted writer.

### Edit: `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS row #1

Mirror the rewritten row byte-for-byte (parity test `cold-session-discoverability.test.cjs:307` enforces exact string equality). Confirmed current row #1 is already byte-identical between the two files, so the rewrite mirrors cleanly.

### Resolve finding

`meta_state_resolve({ id: "meta-260714T1334Z-…", resolution: "<summary of shipped fix>" })` after verification.

## Scope

**In:** script + row #1 rewrite + `.factory` mirror + resolve finding.
**Out (explicitly):** new MCP tool; bash-gate rule blocking adhoc parse (false-positive risk per `meta-260714T1656Z` recurrence pattern); the `meta-260714T1656Z` meta-state-refresh-workflow gap (separate finding, mentioned as adjacent evidence only); CI workflow changes; script runner modes (conflates run+parse).

## Acceptance criteria

1. `bash tools/scripts/vitest-failures.sh` on current green tree prints `all green: 1197 tests / 225 suites passed`, exit 0.
2. Script on a forced-failure fixture prints only failing assertions, exit non-zero (test fixture or temporary vitest run).
3. Missing-file path → exit 2 with the guidance message.
4. `cold-session-discoverability.test.cjs` parity test passes (byte-for-byte mirror).
5. `pnpm test` green.
6. Finding resolved via `meta_state_resolve`; PR body enumerates the delta per `rule-pr-body-registry-deltas`.
7. No adhoc `python -c`/`node -e` parse of `vitest-results.json` introduced anywhere.

## Constraints

- Runtime-agnostic: script is project tooling, not a hook surface → no `check_runtime_agnostic` audit required, no `.factory` mirror for the script itself. The hint mirror is the only parity obligation.
- KISS/YAGNI: pure jq, no node, no runner modes.
- Conventional commits, no AI references, no plan IDs in code/comments/commit messages (per `review-audit-self-decision.md`).
- kebab-case filename `vitest-failures.sh`.

## Risks / rollback

- **Risk:** jq filter brittle to future vitest schema change. Mitigation: script fails closed (exit 2 on invalid JSON) — agent falls back to the prose jq one-liner or re-runs. Low blast radius (read-only tool).
- **Risk:** agent ignores prose hint and still writes adhoc python. Accepted — chosen lever is steer-not-force; the cheap one-command canonical path is the main pressure, not a hard block. If recurrence observed, escalate to gate rule in a follow-up finding.
- **Rollback:** revert script + row #1 edits in both files; un-resolve finding. No data migration, no schema change.

## Next step

Hand off to `/ck:plan` (default mode) to produce phase-by-phase implementation plan from this report.

## Unresolved questions

- Should the script truncate `failureMessages` (proposed ~500 chars) or print full? Default: truncate to bound context, revisit if a fix needs full trace.
- Test the script with a forced failure via a temporary failing test or a fixture JSON? Default: small fixture JSON committed under `tools/scripts/__fixtures__/` (or inlined in a vitest test) so the script has a regression test without polluting the main suite.
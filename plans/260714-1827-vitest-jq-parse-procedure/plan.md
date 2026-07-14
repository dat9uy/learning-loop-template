---
title: "Deterministic jq parse of vitest results"
description: "Ship a pure bash+jq parser for .test-logs/vitest-results.json and surface it via a rewritten PROCESS_HINTS row so the agent stops hand-parsing test output with adhoc python/node. Resolves meta-260714T1334Z."
status: completed
priority: P2
branch: "main"
tags: [loop, test-infra, process-hints, runtime-agnostic]
blockedBy: []
blocks: []
created: "2026-07-14T11:33:24.925Z"
createdBy: "ck:plan"
source: skill
completedAt: "2026-07-14T12:02:56.000Z"
shippedCommit: pending
---

# Deterministic jq parse of vitest results

## Overview

Vitest migration shipped structured `.test-logs/vitest-results.json` but no agent-facing instruction surfaces it, so every session the agent re-pollutes context by grepping raw vitest stdout and hand-writing `python -c`/`node -e` to parse the JSON — re-introducing resolved anti-pattern `meta-260712T0730Z-test-runner-pollutes-agent-context`. Fix: a deterministic pure-bash+jq parser script + one canonical PROCESS_HINTS row (run flags + parse procedure) mirrored byte-for-byte to `.factory`. Resolves `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age`.

Brainstorm report: `plans/reports/brainstorm-260714-1827-vitest-jq-parse-procedure-report.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Script](./phase-01-script.md) | Complete |
| 2 | [Hint Rewrite](./phase-02-hint-rewrite.md) | Complete |
| 3 | [Verify Resolve](./phase-03-verify-resolve.md) | Complete |

## Dependencies

No cross-plan blocking. Tangential (not blocking): `260622-1810-phase-d-plan-1a-parity-tightening` (parity mechanism, different concern) and `260628-1337-fallow-tool-integration-rule-encoding` (different PROCESS_HINTS row). Both touch `loop-introspect.js`/`loop-surface-inject.cjs` arrays but different rows — coordinate if run concurrently.

## Acceptance Criteria

1. `bash tools/scripts/vitest-failures.sh` on green tree prints `all green: 1197 tests / 225 suites passed`, exit 0.
2. Script on a forced-failure fixture prints only failing assertions (`fullName` + truncated `failureMessages`), exit non-zero.
3. Missing/invalid file → exit 2 with guidance message.
4. `cold-session-discoverability.test.cjs` parity test passes (byte-for-byte mirror of row #1).
5. `pnpm test` green.
6. Finding `meta-260714T1334Z…` resolved via `meta_state_resolve`; PR body enumerates the delta per `rule-pr-body-registry-deltas`.
7. No adhoc `python -c`/`node -e` parse of `vitest-results.json` introduced.

## Constraints

- Runtime-agnostic: script is project tooling (not a hook surface) → no `.factory` mirror for the script, no `check_runtime_agnostic` audit. The hint mirror is the only parity obligation.
- KISS/YAGNI: pure jq, no node, no runner modes in the script.
- Conventional commits, no AI references, no plan IDs in code/comments/commit messages.
- kebab-case filename `vitest-failures.sh`.

## Open Questions

1. Truncate `failureMessages`? Default yes (~500 chars) to bound context; revisit if a fix needs the full trace.
2. How to regression-test the failure path? Default: small fixture JSON committed under `tools/scripts/__fixtures__/` covered by a vitest test, without polluting the main suite.
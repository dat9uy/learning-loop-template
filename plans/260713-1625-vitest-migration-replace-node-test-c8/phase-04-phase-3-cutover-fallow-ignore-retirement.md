---
phase: 4
title: "Phase 3: Post-cutover verification"
status: pending
priority: P1
dependencies: [3]
---

# Phase 4: Phase 3: Post-cutover verification

## Overview

Formal verification gate between the atomic cutover (Phase 2) and registry closeout (Phase 4). The cutover commit is already green (the pre-commit hook enforced it), but this phase performs the **security re-audit sign-off** (r2), the cold-session timing confirmation, the agent-context-fix smoke test, and a full `fallow:gate` confirmation. No code changes — verification + sign-off only.

## Requirements

- Functional: all 7 `r2/` security tests re-audited and signed off; cold-session timing confirmed at `testTimeout`/`hookTimeout:120000`; agent-context smoke test confirms the structured-failure output.
- Non-functional: full suite + `fallow:gate` green on the cutover tree; sign-off recorded.

## Architecture

**r2 re-audit (R5):** the 7 `r2/` tests (`allowlist-cache`, `allowlist-shape`, `glob-match`, `ownership`, `path-field-detector`, `precommit-hook`, `workflow-coverage`) are the security gate. Run each under vitest individually + inspect that the assertions actually execute (not silently passing due to a skip/timeout). Sign-off recorded in this phase's report. r2 must not pass-while-broken.

**Cold-session timing (R4):** `cold-session-discoverability.test.cjs` uses `Date.now()` for 48h staleness + per-test `{timeout}`. Confirm it passes under vitest at the configured timeouts (not flaking on the 10s default that C2 would have caused pre-fix).

**Agent-context smoke test (pillar 1):** the whole point of the migration. Read `.test-logs/vitest-results.json`, grep `numFailedTests>0`, confirm only failing assertions are surfaced — no passing-test flood. Optionally inject a failing test in a scratch copy and confirm the agent-facing flow surfaces exactly that failure.

**Full confirmation:** `pnpm test` (vitest) green; `pnpm fallow:gate` green; `r2/fallow-test-tree-clean` green; `fallow list --entry-points` shows `*.test.*` entries `source:"vitest"`.

## Related Code Files

- Read-only: `.test-logs/vitest-results.json`, `coverage/coverage-final.json`, all 7 `r2/` tests.
- Create: `plans/260713-1625-vitest-migration-replace-node-test-c8/reports/phase-03-verification-signoff.md` (r2 sign-off + timing + smoke-test results).

## Implementation Steps

1. `pnpm test` (vitest) → full 234-file suite green.
2. **r2 re-audit:** run each of the 7 `r2/` tests under `vitest run`; inspect each asserts (not skipped/silently-passing); record sign-off per test in the verification report.
3. `pnpm fallow:gate` → exit 0 (final end-to-end confirmation that vitest's coverage is accepted — H1's real consumer, not the proxy).
4. `r2/fallow-test-tree-clean.test.js` → green; `fallow list --entry-points` → shows `*.test.*` `source:"vitest"`.
5. Cold-session timing: run `cold-session-discoverability` under vitest; confirm no flake at `testTimeout`/`hookTimeout:120000`.
6. **Agent-context smoke test:** read `.test-logs/vitest-results.json`; assert `numFailedTests` + `assertionResults[]` present; confirm grepping `numFailedTests>0` surfaces only failures (no passing-test lines). Optionally inject a deliberate failure in a scratch copy and confirm the structured flow.
7. Write `reports/phase-03-verification-signoff.md` with r2 sign-off table + timing + smoke-test evidence. This is the gate for Phase 4.

## Success Criteria

- [ ] `pnpm test` (vitest) green across 234 files.
- [ ] `fallow:gate` exit 0 (real consumer confirmed).
- [ ] `r2/fallow-test-tree-clean` green; `fallow list --entry-points` shows `*.test.*` `source:"vitest"`.
- [ ] 7 `r2/` tests re-audited + signed off (each asserts, none silently passing).
- [ ] Cold-session test passes without flake at configured timeouts.
- [ ] Agent-context smoke test: `vitest-results.json` has `numFailedTests`/`assertionResults[]`; grep surfaces only failures.
- [ ] `phase-03-verification-signoff.md` written; gates Phase 4.

## Risk Assessment

- **R5 (r2 silent pass):** the per-test inspection (Step 2) is the mitigation — confirm each r2 test actually executes its assertions, not skipping on a timeout/condition.
- **R4 (timing flake):** if cold-session flakes, revisit `hookTimeout` (the 6 C2 hooks bootstrap a real MCP server — confirm their `(fn,N)` rewrite holds).
- **No code risk:** verification-only; any failure here blocks Phase 4 and returns to Phase 2 for a fix commit.
---
phase: 5
title: "Verify and ship PR"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verify and ship PR

## Overview

Run the full test suite, resolve the source finding in the meta-state registry, and ship
the change as a PR. Watch CI to green. The red-team expanded the touched surface (production
hook + ~12 tests + configs + extra docs), so the full suite is the gate, not a narrow subset.

## Requirements

- Functional: `pnpm test` green end-to-end; wire-budget + residue-contract + parity +
  cold-session tests pass with the re-anchored surface; no test references the retired flags
  as an opt-out; `check_runtime_agnostic` still passes for the changed surface.
- Non-functional: conventional commit messages with no plan IDs, phase numbers, or finding
  codes in code/test/commit text (describe the invariant directly — per repo rule).

## Architecture

Branch off `main`, apply Phases 1-4, run the full suite, then open a PR via `gh`. After the
PR opens, resolve the finding `meta-260811T1106Z-...` via `meta_state_resolve` once CI is
green (the finding's acceptance is the shipped single-surface contract + green tests).

## Related Code Files

- Verify-only: the full `tools/learning-loop-mastra/__tests__` suite + `pnpm test`.
- Record-only (via loop CLI): `meta-state.jsonl` finding resolution.

## Implementation Steps

1. `pnpm install` (only if lockfile touched — not expected) then `pnpm test` full suite.
   Expect: wire-budget green at `<= 6_000`; residue-contract green; parity tests green on
   direct-handler oracle; cold-session test green on CLI anchor; no
   `cli-mcp-subset-registration.test.js`; `cli-optout-wiring.test.js` green;
   `cli-sessionstart-banner.test.js` green on unconditional banner.
2. If any test fails, fix the regression rather than weakening the test (repo rule). Common
   expected failures: a test still importing the deleted subset-registration module; a
   missed `callTool` on a non-residue tool (Phase 3 gap); a tier-membership mismatch
   (Phase 2 `vitest.config.mjs`). Remove stray imports / route the call / fix the tier.
3. `pnpm lint` / typecheck if the project configures them (check `package.json` scripts).
4. Run `check_runtime_agnostic` against the changed surface (the hook + server are
   runtime-agnostic surfaces); confirm the 6-item checklist still holds.
5. Branch + commit with conventional commits (`refactor(mcp): drop CLI_TOOLS registration`,
   `feat(hook): unconditional transport banner`, `test(mcp): re-target wire budget to residue`,
   `test: re-base parity oracle to direct-handler`, `docs: retire records-via-CLI flags`).
   No finding IDs / phase numbers in commit messages.
6. `gh pr create` with a body summarizing: the debt paid, the measured residue (8 tools /
   4,563 B), the re-anchored ceiling (55,000 → 6,000 all-tools), the session-start banner
   redesign, the parity + cold-session re-anchor, and the accepted contract-reversal risk.
   Per repo PR-body registry-deltas rule, enumerate any meta-state registry deltas.
7. Resolve the finding: `loop.mjs meta_state_resolve '{"id":"meta-260811T1106Z-mcp-and-cli-surfaces-run-duplicated-tool-registrations-every",
   "resolution":"MCP registration of CLI_TOOLS dropped; CLI is single record surface; session-start banner unconditional; wire budget re-anchored to residue (6,000 all-tools); parity + cold-session re-anchored to CLI; flags retired from server/hook/configs/docs.",
   "resolved_by":"operator"}'`.
8. Watch CI: `gh pr checks <n> --watch`; fix until every required check is green. Verify
   `gh pr view <n> --json mergeStateStatus` == `CLEAN` (bind context to job id, not
   workflow name — repo rule).

## Success Criteria

- [ ] `pnpm test` green (full suite).
- [ ] `check_runtime_agnostic` passes for the changed surface.
- [ ] PR opened with the debt-paid summary + re-anchored ceiling + banner/parity/cold-session notes + accepted-risk.
- [ ] All required CI checks green; `mergeStateStatus` == `CLEAN`.
- [ ] Finding `meta-260811T1106Z-...` resolved in the registry with a pointer to the PR.
- [ ] No plan IDs / phase numbers / finding codes in commits or code comments.

## Risk Assessment

- **Phase 3 missed migration:** the ~12-test migration is the largest surface; a missed
  `callTool` on a non-residue tool surfaces as a "tool not found" failure here. Signal: a
  test errors with "tool not found" for a `mastra_<CLI_TOOL>`. Pre-decided response: route
  that call to the CLI or direct-handler per the Phase 3 decision list; do not re-register
  the tool on MCP.
- **CI flake on a non-related job:** the suite is large. Signal: a pre-existing flaky job
  fails. Response: reproduce at parent + HEAD, diff the failing-test set vs baseline (repo
  flake rule), never bypass hooks; only re-run if confirmed flake.
- **Required-check binding mismatch:** `mergeStateStatus` read off the workflow name instead
  of job id gives a false CLEAN. Signal: `gh pr view` shows CLEAN but `gh pr checks` still
  lists a pending/failed job. Response: bind to the job id and re-verify.
- **Finding resolution premature:** resolving before CI green leaves a "resolved" finding
  over a red PR. Pre-decided response: resolve only after step-8 confirms CLEAN; if CI goes
  red after resolution, re-open via a new finding rather than editing the resolution.
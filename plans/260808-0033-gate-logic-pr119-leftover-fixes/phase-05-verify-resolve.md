---
phase: 5
title: "Verify and resolve findings"
status: completed
priority: P1
effort: "0.5d"
dependencies: ["1", "2", "3", "4"]
---

# Phase 5: Verify and resolve findings

## Overview
Whole-plan verification on the security boundary, then close (or re-scope with
evidence) the four meta-state findings via loop tools.

## Requirements
- Functional: full test suite green (3089+), `pnpm fallow:gate` green,
  `check_runtime_agnostic` clean, the import-guard (`shell-quote#quote` forbidden on
  the gate path) green.
- Functional: each of the four findings resolved or re-scoped with evidence in
  meta-state via loop tools (CLI).
- Non-functional: no docs churn unless user-facing behavior changed (Phase 1 added an
  operator note; Phase 3 may touch a JSDoc limitation note). Follow
  `documentation-management.md`.

## Architecture
- Verification surface: `pnpm test` (full), `pnpm fallow:gate` (after re-saving any
  shifted baselines via fallow's own writers, as in PR #119's quality gate), and the
  runtime-agnostic regression test at `__tests__/runtime-agnostic.test.js`.
- Resolution surface: loop CLI write tools (`meta_state_resolve`,
  `meta_state_re_verify`, `meta_state_log_change` for any design-only decisions).
  Source refs use `local:meta-state:<id>`; `evidence_code_ref` points at the changed
  code paths.

## Related Code Files
- Run: `pnpm test`, `pnpm fallow:gate`, `pnpm exec vitest run
  __tests__/runtime-agnostic.test.js`
- Records: `meta-state.jsonl` (via loop tools only; direct writes blocked)
- Possibly modify: baselines under `baselines/fallow/` (via fallow's writers, not hand-edits)

## Implementation Steps
1. Run the full suite to a per-namespace log; confirm 0 failures. If failures, fix
   regressions (do not weaken tests).
2. Run `pnpm fallow:gate`; triage per `fallow-gate-triage` (compact-CSV, grep severity=,
   ignore baseline-inherited lines). If non-zero from THIS branch's changes, re-save
   the affected baselines. NOTE (red-team #10): `fallow audit` (which `pnpm fallow:gate`
   runs) REJECTS `--save-baseline`. Re-save with the three subcommands writing the
   committed baseline artifacts under `<root>/baselines/fallow/`:
   - `pnpm exec fallow dead-code --save-baseline baselines/fallow/dead-code-baseline.json`
   - `pnpm exec fallow health --save-baseline baselines/fallow/health-baseline.json`
   - `pnpm exec fallow dupes --save-baseline baselines/fallow/dupes-baseline.json`
   Re-run `pnpm fallow:gate` to confirm green; commit the re-saved baselines (mirrors
   PR #119's `chore(gate): re-key fallow baselines` commit).
3. Run the runtime-agnostic regression test + `check_runtime_agnostic` against the
   6-item checklist (Phase 1 added an enum source-of-truth change — verify no
   shim-not-fork regression).
4. Resolve the four findings via the loop CLI. **Enum boundary (red-team #15):**
   `meta_state_resolve`/`meta_state_report` validate `affected_system` against
   `AFFECTED_SYSTEM_ENUM` (no `gate-verb:*`); use `affected_system:"gate-logic"` for
   any meta-state write describing the gate-verb observation surface — NOT
   `"gate-verb:bash"` (which is valid only for `runtime_state_record`).
   - B: `meta_state_resolve({ id, resolution: "...gate-verb observation path wired;
     affected_system enum derives from patterns.json; 30-min age expiry added to the
     bash gate", resolved_by: "operator" })`
   - D: `meta_state_resolve({ id, resolution: "...full-command pass flag-aware via
     shell-parse substrate" })`
   - A: `meta_state_resolve` (full retirement) OR `meta_state_resolve` with a re-scope
     note (fallback: load-bearing helpers retained; test migration + partial deletion
     done; full unification deferred). If design-only choices were made, log a
     `meta_state_log_change` and cite its id.
   - C: `meta_state_resolve` (root-cause fixed) OR `meta_state_re_verify({ id, refresh:
     true })` then `meta_state_resolve` with non-reproduction evidence.
5. Whole-plan consistency sweep: re-read `plan.md` + every phase file; confirm no
   stale terms, no contradicted assumptions, no superseded decisions remain.
6. Optional handoff: if shipping, run the ak-ship/PR flow; record any
   `meta_state_log_change` for the public-surface change (the enum now accepts
   `gate-verb:*`).

## Success Criteria
- [ ] `pnpm test` 0 failures (3089+).
- [ ] `pnpm fallow:gate` green (or waived findings explicitly intentional + baselines
  re-saved via fallow's writers).
- [ ] `check_runtime_agnostic` clean; runtime-agnostic test green.
- [ ] Import-guard (`shell-quote#quote` forbidden on the gate path) green.
- [ ] All four findings resolved or re-scoped-with-evidence in meta-state.
- [ ] Whole-plan consistency sweep: zero unresolved contradictions.

## Risk Assessment
- **Fallow baseline drift (low):** code changes may shift dead-code/health/duplication
  baselines. Mitigation: re-save via fallow's writers (not hand-edits), as PR #119 did.
- **Premature resolution (low):** only resolve a finding after its phase's success
  criteria are met. Re-scope with evidence rather than over-claiming.
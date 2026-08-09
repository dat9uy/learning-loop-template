# Combined Per-Clone Git Setup — Orchestrator + Merge-Driver Preflight

Status: complete
Date: 2026-08-09
Branch: main
Closed: 2026-08-09 — all acceptance criteria met; 87 tests green (6 files); runtime-agnostic audit 6/6; code-reviewer DONE (no blocking defects, 2 cosmetic notes applied). One gate misfire observed + filed (meta-260809T0528Z-...).

## Problem

Two per-clone git setup scripts (`setup-git-merge-drivers.sh`, `setup-git-push.sh`)
configure git state that is not committable. A clean clone must run both. The push
setup has a SessionStart preflight hook (loud on failure); the merge-driver setup
has none, and its failure mode is **silent** (`merge=union` no-ops → parallel PRs
conflict, one-sided data-loss risk with the wrong arg order). The "remember to do
both" surface is split across two scripts and one banner.

## Outcome

One command a clean clone runs to do both, plus a session-start banner that surfaces
*both* states so the silent merge-driver forget becomes loud. Both preflight lines
point at the single orchestrator.

## Constraints / Non-goals

- Keep the two hardened sub-scripts and their `__tests__` matrices intact (do not
  merge files — different risk profiles and test boundaries).
- Preserve fail-closed (scripts) / fail-open (hooks) postures and the 0/1/2 exit
  contract.
- `.claude`-only wiring (matches push-hook scope; `.factory`/`.mastracode` deferred
  — same adapter constraint noted in AGENTS.md §4b).
- Non-goal: blocking gates; non-goal: merging the script files.

## Acceptance criteria

1. `tools/scripts/setup-git.sh` runs merge-drivers then push, idempotent; `--force`
   passes through to both; non-zero from either sub propagates; unknown arg → 2;
   outside a work tree → 1.
2. `tools/learning-loop-mastra/hooks/universal/session-start-git-merge-driver-preflight.cjs`
   emits one fail-open line; pure `classifyMergeDriverMode` exported; modes
   canonical/unset/wrong-order/non-canonical; pointer → `setup-git.sh`.
3. Push preflight `SCRIPT_POINTER` repointed to `setup-git.sh`.
4. Merge-driver hook wired into `.claude/settings.json` SessionStart.
5. All touched tests green; `check_runtime_agnostic` passes on the new hook.
6. AGENTS.md updated: orchestrator is the one-command entry; merge-driver preflight
   documented; §4b pointer repointed.

## Phases

- phase-01: orchestrator `setup-git.sh` + its test
- phase-02: merge-driver preflight hook + its test; repoint push hook; wire settings
- phase-03: docs (AGENTS.md); verify (tests, runtime-agnostic audit, code-reviewer)

## Files

- add: `tools/scripts/setup-git.sh`
- add: `tools/scripts/__tests__/setup-git.test.js`
- add: `tools/learning-loop-mastra/hooks/universal/session-start-git-merge-driver-preflight.cjs`
- add: `tools/learning-loop-mastra/__tests__/session-start-git-merge-driver-preflight.test.js`
- edit: `tools/learning-loop-mastra/hooks/universal/session-start-git-push-preflight.cjs` (SCRIPT_POINTER + comment)
- edit: `tools/learning-loop-mastra/__tests__/session-start-git-push-preflight.test.js` (pointer assertions)
- edit: `.claude/settings.json` (SessionStart array)
- edit: `AGENTS.md` (§4/§4b)

## Risk / Rollback

Low. All new code is additive except two single-string edits (push hook pointer +
its test assertions) and a settings.json array append. Revert = delete new files +
revert the three edits. No records/** or product/** writes.
---
phase: 2
title: "Verify on test PR"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Verify on test PR

## Overview

Confirm the YAML change satisfies the branch-protection requirement end-to-end. Push a branch with the workflow edit, open (or update) a PR, observe the `meta-state refs check` context appearing in the PR's Checks tab as green. This is the load-bearing acceptance criterion — without a green check on a PR, the bug is not fixed.

## Requirements

- Functional: `meta-state refs check` appears in the PR's Checks tab; check is `SUCCESS` (validator exit 0); the branch-protection requirement is satisfied (merge button is enabled or admin-bypass is no longer required for non-admins).
- Non-functional: PR-HEAD validator run completes in ≤30s (timeout is 5min, validator runs ~5s); no flakes.

## Architecture

`actions/checkout@v7` with `fetch-depth: 0` on `pull_request` checks out the PR head SHA. The validator script (`validate-registry-refs.js`) reads the registry files from the workspace root (default `--root=$GITHUB_WORKSPACE`) — same as the post-merge push run. Result: identical classification between PR and push runs.

The branch-protection API uses `contexts: ["meta-state refs check"]` (legacy mode, matched against the workflow's `name:` field). With `pull_request` added, the workflow produces a check run whose `name` is `meta-state refs check / refs-check` (workflow name + job name) — GitHub matches the workflow name against the `contexts` entry and accepts it.

## Related Code Files

- Modify: none (this phase is verification-only)
- Reference: `.github/workflows/meta-state-refs-check.yml` (the change from Phase 1)
- Reference: `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (unchanged; verified by Phase 1 step 4)

## Implementation Steps

1. Push the Phase-1 branch to origin: `git push origin <branch-name>`.
2. Open a PR (or update an existing PR with the new commit) targeting `main`.
3. Wait for CI to settle: `gh pr checks <pr-number> --watch` (or poll `gh pr view <pr-number> --json statusCheckRollup`).
4. Confirm in the PR's Checks tab:
   - `meta-state refs check` appears (it was MISSING pre-change)
   - The check is `SUCCESS` (green)
   - The check's `detailsUrl` points to a recent workflow run
5. Confirm via API: `gh api repos/dat9uy/learning-loop-template/pulls/<pr-number>` → `mergeable: true` AND the required check appears in the rollup.
6. Cross-check the branch-protection rule is satisfied: `gh api repos/dat9uy/learning-loop-template/branches/main/protection/required_status_checks` → still shows `contexts: ["meta-state refs check"]` (this plan did NOT modify branch protection; only the workflow).
7. If the check is missing or red:
   - **Missing:** GitHub may be matching against job name (`refs-check`) instead of workflow name. Either rename the job to match the context, or add `refs-check` as a second entry in `contexts`. Document the resolution and update the plan.
   - **Red (exit 1):** a real orphan in the union. Run `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` locally — if exit 0, suspect a transient (re-run); if exit 1, the union drifted and needs Phase-2-style cleanup before this PR can land. STOP and surface the orphan to the operator; do not bypass the validator.
8. Once verified, mark the Phase-1 + Phase-2 success criteria complete; the plan is shippable.

## Success Criteria

- [ ] `meta-state refs check` appears in the test PR's Checks tab (previously MISSING).
- [ ] Check status is `SUCCESS` (green).
- [ ] `gh pr view --json mergeable` reports `MERGEABLE` (or `UNKNOWN` post-merge).
- [ ] Validator exit 0 matches between local run and PR-HEAD CI run (proof the PR-head union is the same as local).
- [ ] Branch-protection `required_status_checks.contexts` is unchanged (this plan does not modify it; only the workflow).

## Risk Assessment

- **Check is MISSING despite `pull_request:` being added.** GitHub context-name matching is generally robust but not formally documented for every config. Mitigation: step 7's fallback (rename job or add `refs-check` to `contexts`).
- **Check is RED on PR but green locally.** Indicates the union drifted between local clone and the PR-HEAD commit. Mitigation: run the validator against `git checkout origin/<branch>` then `git checkout main` separately to identify which side has the orphan; report the divergence.
- **Validator runs twice per PR** (once on `pull_request`, once on `push` after merge). ~5s × N PRs; trivial cost.
- **Flake on the test PR's CI run.** First re-run is sufficient — the validator is deterministic. If flake recurs, the workflow has a hidden state issue (look at runner setup, not the validator).
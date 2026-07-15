---
phase: 3
title: "Flip refs-check to BLOCK-mode"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 3: Flip refs-check to BLOCK-mode

## Overview

Remove `continue-on-error: true` from the `Validate registry refs` step in `.github/workflows/meta-state-refs-check.yml` so the post-merge ref validator BLOCKs push-to-main on real orphans. Gated entirely on Phase 2's clean validator exit 0 + a manual `workflow_dispatch` run that passes.

## Why this exists

PR #60 shipped `meta-state-refs-check.yml` in **WARN-mode** (`continue-on-error: true`) because 124 pre-existing orphans would otherwise BLOCK every push to main. Phase 1 (semantics) + Phase 2 (mutable cleanup) drive the blocking set to 0. With a clean union, the WARN-mode scaffold can flip to its intended BLOCK-mode — closing the Tier-1 acceptance criterion that was shipped pending this cleanup. The validator's `historical`/`informational` buckets ensure retired-entry refs (the permanent 54 change-log `consolidates`) never trip the BLOCK.

## Requirements

- Functional: `meta-state-refs-check.yml` exits non-zero (fails the job) when `validate-registry-refs.js` exits 1; passes when it exits 0.
- Non-functional: no behavioral change to the validator itself (Phase 1 already landed). The flip is a one-line YAML edit + verification.
- Invariant: the workflow still runs on `push: [main]` + `workflow_dispatch`; the `continue-on-error` removal is the only structural change.

## Architecture

The workflow (shipped PR #60) runs `node tools/learning-loop-mastra/scripts/validate-registry-refs.js --root=$GITHUB_WORKSPACE` in a step with `continue-on-error: true`. Removing that attribute restores the default fail-on-non-zero behavior — exit 1 from the validator fails the job and BLOCKs the push (GitHub Actions blocks the merge branch protection if the workflow is a required check; otherwise it surfaces a red check). The validator's exit-2 (load/parse error) also fails the job, which is correct.

**Pre-flip gates (both must pass):**
1. Local: `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` exits 0 on the live union (Phase 2 success criterion).
2. Remote: trigger a `workflow_dispatch` run of `meta-state-refs-check.yml` on main — confirm the validator step reports 0 blocking (i.e., the runner sees a clean union too, not just the local clone). This catches any drift between local and CI registry state.

**Sequencing (red-team F6 — the dispatch checks out main HEAD).** Phase 2's cleanup MUST be merged to main BEFORE the pre-flip dispatch. `workflow_dispatch` checks out the dispatch ref's HEAD (`actions/checkout@v7`); if Phase 2's patches live on an unmerged branch, the dispatch sees the pre-cleanup main and reports ~27 blocking — falsely blocking the flip (and tempting a confused re-entry into Phase 2). Steps: merge the Phase 2 cleanup PR to main → note the merge SHA → trigger the dispatch on main → confirm the dispatch run's checkout SHA matches the merge SHA. Only then remove `continue-on-error: true` and merge the flip.

**Enforcement (validation Q4 — required branch-protection check).** A BLOCK that doesn't enforce merges is just a red badge; the Tier-1 "load-bearing defense" (Red Team F4) only bites if the check is required. After the post-flip green `workflow_dispatch`, make `meta-state-refs-check` a **required branch-protection check** on `main` (repo Settings → Branches → required status checks, or `gh api` against the branch-protection rules) so a real orphan actually blocks a merge, not merely reddens the check. Order matters: require it only AFTER the post-flip green run confirms exit 0, or an unexpected orphan halts all merges until resolved.

## Related Code Files

- Modify: `.github/workflows/meta-state-refs-check.yml` (remove `continue-on-error: true` from the `Validate registry refs` step; update the header comment that documents the WARN-mode toggle).
- Reference: `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (unchanged).

## Implementation Steps

1. Confirm Phase 2's exit-0 locally: `node tools/learning-loop-mastra/scripts/validate-registry-refs.js; echo "exit=$?"` → 0.
2. **Merge the Phase 2 cleanup PR to main** (red-team F6); note the merge SHA.
3. Trigger a `workflow_dispatch` run: `gh workflow run meta-state-refs-check.yml --ref main` (or via the Actions UI); wait for the run; **confirm the run's checkout SHA matches the merge SHA**; confirm the validator step logs "0 real orphans" (no BLOCK). If it logs blocking refs, DO NOT flip — diff the dispatch's blocking list against Phase 2's triage report to distinguish a real new orphan from a sequencing artifact (unmerged cleanup) before re-entering Phase 2.
4. Remove `continue-on-error: true` from the `Validate registry refs` step; update the header comment to reflect BLOCK-mode (remove the "WARN-mode until orphan cleanup" note; state that retired-entry refs are exempt as `historical` by Phase 1).
5. Merge the flip (the `continue-on-error` removal commit).
6. Trigger one more `workflow_dispatch` run post-merge; confirm the job is green (exit 0, no BLOCK).
7. **Make `meta-state-refs-check` a required branch-protection check on main** (validation Q4): via repo Settings → Branches → required status checks, or `gh api -X PUT repos/{owner}/{repo}/branches/main/protection` with the check in `required_status_checks.contexts`. Order matters — only after step 6's green run.
8. Update the Tier-1 plan's Phase 3 acceptance note + the closeout journal: WARN-mode → BLOCK-mode activated (required branch-protection check noted).

## Success Criteria

- [ ] Local `validate-registry-refs.js` exit 0 (Phase 2 gate).
- [ ] Phase 2 cleanup PR merged to main; pre-flip `workflow_dispatch` run confirms 0 blocking on the runner AND the run's checkout SHA matches the merge SHA.
- [ ] `continue-on-error: true` removed; header comment updated to BLOCK-mode.
- [ ] Post-flip `workflow_dispatch` run on main is green (exit 0).
- [ ] `meta-state-refs-check` is a required branch-protection check on main (validation Q4).
- [ ] Tier-1 plan/journal updated: WARN-mode → BLOCK-mode (required check noted).

## Risk Assessment

- **Flipping on stale CI state (red-team F6)** — `workflow_dispatch` checks out main HEAD; if Phase 2's cleanup isn't merged first, the runner reports ~27 blocking and the flip is falsely blocked. Mitigation: the explicit "merge cleanup PR → confirm dispatch SHA == merge SHA" sequencing (steps 2-3); never flip on local-only evidence.
- **A new orphan lands between flip and a future push** — the BLOCK now fires on any future real orphan. This is the intended behavior (the post-merge BLOCK is the load-bearing defense for cross-PR orphans per Tier-1 Red Team F4). Mitigation: the pre-merge `meta-state-pr-body-advisory.yml` WARN-on-own-diff catches orphans before merge; the BLOCK is the backstop.
- **Required-check misconfiguration** — if `meta-state-refs-check` is a required branch-protection check and it fails, main is blocked. Mitigation: the pre-flip gate ensures it passes first; if it later fails on a real orphan, that is correct behavior (fix the orphan, then push).
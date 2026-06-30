---
phase: 3
title: "Phase 3: Verify in CI"
status: pending
priority: P2
dependencies: ["phase-02-phase-2-patch-sarif-1-explicit-upload"]
---

# Phase 3: Verify in CI

## Overview
Open a fresh PR from the recovery branch (PR #22 closed) and verify the workflow amendment ships end-to-end: `verdict=pass` on a no-change branch, SARIF visible in Code Scanning under `category: fallow`, and the failure-upload path resolves to a real file on a failing run.

## Requirements

### Functional
- A new PR is opened against `main` from the `260629-2011-fallow-tools-v2-action-swap` branch with the recovery commit sequence (Phase 1 docs + Phase 2 workflow + tests).
- PR #22 is closed with a comment linking to the new plan and the new PR.
- The `test` workflow on the new PR reports success on the first run.
- The Code Scanning UI on the new PR shows findings (or empty state) under `category: fallow` — not split into per-analyzer categories.
- The `Meta-state registry delta advisory` workflow reports SUCCESS (no surprise registry mutations introduced by the recovery commit).

### Non-functional
- Recovery commit is a single atomic commit (or a tight 2-commit sequence: docs first, workflow second) so rollback is trivial if Phase 3 surfaces an issue.
- The recovery branch's force-push is documented in the plan's ship journal.
- All acceptance criteria from Phases 1 and 2 remain satisfied (no regression).
- Local test suite still green (re-run `pnpm test` after the recovery commit is applied locally).

## Architecture

This phase has no architecture — it's a verification gate. The "design" is the verification matrix:

```
                ┌──────────────────────────────────────────────────┐
                │ Recovery PR opened against main                  │
                │ (branch: 260629-2011-fallow-tools-v2-action-swap) │
                └──────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
   ┌─────────┐             ┌──────────────┐         ┌────────────────┐
   │ test    │             │ Meta-state   │         │ Code Scanning  │
   │ workflow│             │ advisory     │         │ UI (manual     │
   │         │             │ workflow     │         │ verification)  │
   └─────────┘             └──────────────┘         └────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
   verdict=pass             SUCCESS                  category: fallow
   no SARIF upload error    no surprise              visible (or empty)
   (Phase 2's T13 assertion  registry mutations
   validated end-to-end)
```

## Related Code Files
- **Modify**: `plans/260630-0536-fallow-action-swap-with-sarif-split/reports/journal-260630-...-recovery-pr.md` — journal entry documenting the PR open + verification results (create this file inside the plan directory under `reports/`)
- **Modify**: `plans/reports/journal-260629-2011-fallow-tools-v2-action-swap-plan-shipped.md` — append a note to the prior plan's ship journal explaining the amendment. **Path note:** the prior plan's ship journal lives at `plans/reports/` (not `plans/260629-2011-.../reports/` — that subdirectory doesn't exist).
- **No code changes** (Phases 1 + 2 already shipped the workflow change)

## Implementation Steps

### TDD structure for this phase
The "tests" are CI run assertions. The matrix below defines what passes (GREEN) for the phase.

#### Step 3.1 — Pre-flight: close PR #22 and reset the branch (with force-push safeguards)

**Before opening the new PR**, the broken PR #22 must be closed and the branch reset.

```bash
# Close PR #22 with a comment file (avoids shell-injection risk if comment text contains metacharacters)
cat > /tmp/pr-close-comment.md <<'EOF'
Closed in favor of the recovery PR. The failure was a multi-run SARIF rejection by codeql-action v4's areAllRunsUnique validator; the fix is documented in plans/260630-0536-fallow-action-swap-with-sarif-split/ and the source-level evidence is in plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md.
EOF
gh pr close 22 --comment-file /tmp/pr-close-comment.md

# Find the actual commit that introduced `sarif: true` on test.yml (NOT 44b8d03, which is meta-state only)
git log --all --oneline -p -- .github/workflows/test.yml \
  | grep -B 5 "^+.*sarif:.*true" \
  | grep -E "^commit [0-9a-f]{40}" \
  | head -1
# Capture the commit hash; the parent is the safe reset point.

# Pre-flight: enumerate in-flight WIP branches based on the broken-PR state
git ls-remote origin 'refs/heads/260629-2011-*' || echo "no remote branches matching"
# If any branch appears, coordinate with the owner BEFORE force-pushing.

# Reset and re-apply Phase 1 + Phase 2
git checkout <actual-broken-pr-commit-parent>
git checkout -b 260629-2011-fallow-tools-v2-action-swap
git cherry-pick <phase-1-commit> || git cherry-pick --abort
git cherry-pick <phase-2-commit> || git cherry-pick --abort

# Force-push with the safer flag (Git 2.30+) — checks remote matches expected state
git push --force-with-lease --force-if-includes origin 260629-2011-fallow-tools-v2-action-swap
```

**Red-team hardening applied:**
- `--comment-file` instead of inline `--comment "..."` (avoids shell metacharacter risk)
- Identifies the ACTUAL commit that introduced `sarif: true` via `git log -p -- .github/workflows/test.yml` (44b8d03 is meta-state, NOT the broken change — that was a scout error)
- Pre-flight `git ls-remote` enumerates any WIP branches based on the broken-PR state (prevents silent force-push over collaborator work)
- `--force-with-lease --force-if-includes` (Git 2.30+) checks remote matches expected state before pushing
- Reflog recovery path documented in the risk notes (find the lost SHA via `git reflog`)

**Test (assertion) before step 3.2:**
- [ ] Branch `260629-2011-fallow-tools-v2-action-swap` HEAD is at a clean commit with all Phase 1 + Phase 2 changes applied
- [ ] `git status` is clean
- [ ] `pnpm test` is still green locally (count matches `/tmp/baseline-counts.txt` from step 2.0)

#### Step 3.2 — Push the branch and open the recovery PR

```bash
git push --force-with-lease origin 260629-2011-fallow-tools-v2-action-swap

gh pr create \
  --base main \
  --head 260629-2011-fallow-tools-v2-action-swap \
  --title "ci(fallow): amend PR #22 with SARIF automationDetails patch" \
  --body-file plans/260630-0536-fallow-action-swap-with-sarif-split/reports/pr-body-recovery.md
```

The PR body should reference:
- The deep-dive §6.3 / §6.5 error (now corrected in commit from Phase 1)
- The source-audit report (`plans/reports/research-260630-1425-...`)
- The 14-test green run (Phase 2's workflow-shape.test.js)
- The plan file (this directory's `plan.md`)
- Acceptance criteria checklist

**Test (assertion) immediately after step 3.2:**
- [ ] PR is open against main
- [ ] PR title contains "amend PR #22" or similar marker
- [ ] `gh pr view <new-pr> --json state` returns `"OPEN"`

#### Step 3.3 — Wait for the `test` workflow to complete on the new PR

```bash
# Watch the test workflow on the new PR
gh run watch --repo <repo> --exit-status
```

Expected: workflow completes with `success` exit code.

If the workflow fails:
1. Capture the failure log: `gh run view --log-failed`
2. Most likely failure mode: the patch step's classifier misses a rule prefix. Diagnose by downloading the SARIF artifact and running the local jq smoke test from Phase 2 step 2.11.
3. If the failure is unrelated (e.g., a flaky network test), re-run with `gh run rerun`.

**Test (assertion) for GREEN:**
- [ ] `test` workflow on the new PR completes with exit code 0
- [ ] Workflow logs show `verdict=pass` and `gate=new-only` (matching the failed-PR-22 expectation)
- [ ] No `##[error]` lines in the workflow log
- [ ] The `Upload fallow SARIF to Code Scanning` step's log shows no `areAllRunsUnique` rejection

#### Step 3.4 — Verify SARIF in Code Scanning (automated, not manual)

The plan originally called for manual UI verification. Red-team flagged this as unfalsifiable. **Use the GitHub Code Scanning API instead:**

```bash
# Wait for the SARIF upload to be ingested (Code Scanning processes async)
sleep 60

# List code scanning alerts for the recovery PR's HEAD SHA
gh api repos/{owner}/{repo}/code-scanning/alerts \
  --jq '.[] | select(.most_recent_instance.commit_sha == env.RECOVERY_HEAD_SHA)' \
  REF=refs/heads/main > /tmp/code-scanning-alerts.json

# Assert at least one alert (or empty state) has category: "fallow"
jq '[.[] | select(.rule.category == "fallow")] | length' /tmp/code-scanning-alerts.json
# Expected: ≥0 (findings present) or error if any other category appears

# Sanity: confirm no per-analyzer categories leaked through
jq '[.[] | .rule.category] | unique' /tmp/code-scanning-alerts.json
# Expected: ["fallow"] — single category
```

**Red-team hardening applied:** the manual UI check is replaced with a `gh api` query against `code-scanning/alerts`. This is falsifiable: if the upload step's `category: fallow` is silently lost (e.g., YAML indentation bug), the API query returns empty + the assertion fails.

**Test (assertion) for GREEN:**
- [ ] `gh api .../code-scanning/alerts` returns alerts with `rule.category == "fallow"` (single category)
- [ ] No `fallow-deadcode` / `fallow-health` / `fallow-dupes` categories appear
- [ ] If findings exist, `ruleId` prefixes match the analyzer they should come from (`fallow/unused-*` / `fallow/high-*` / `fallow/code-duplication`)

#### Step 3.5 — Verify the failure-upload step resolves to a real file (worktree-isolated, destructive)

This is a destructive test — only run if the operator wants to verify the failure path end-to-end. Use a `git worktree` so the failure-test branch lives in a separate directory and cannot leak back to the main checkout.

```bash
# Create an isolated worktree so the failure-test branch doesn't touch the main checkout
git worktree add /tmp/fallow-failure-test 260629-2011-fallow-tools-v2-action-swap
cd /tmp/fallow-failure-test

# Introduce a fallow finding that exceeds the gate (e.g., add an unused export to a NEW file,
# not to state-bearing server.js which is the running MCP server entrypoint)
cat > tools/learning-loop-mastra/__orphan_test_failure__.js <<'EOF'
export const __test_orphan = 1;
EOF
git add -A && git commit -m "test(failure): introduce deliberate fallow finding to verify failure-upload path"
git push origin 260629-2011-fallow-tools-v2-action-swap-failure-test
gh pr create --base main --head 260629-2011-fallow-tools-v2-action-swap-failure-test --title "test(failure): verify failure-upload path"
# Wait for the workflow to fail, then check the SARIF artifact
gh run download --name fallow-sarif
ls -la fallow-sarif.sarif
# Verify it's the PATCHED file (has automationDetails.id on all runs)
jq '.runs | map(.automationDetails.id)' fallow-sarif.sarif

# Cleanup — explicit, worktree-aware
gh pr close 22 --delete-branch  # or whichever PR was created
cd /home/datguy/codingProjects/learning-loop-template
git worktree remove --force /tmp/fallow-failure-test
git branch -D 260629-2011-fallow-tools-v2-action-swap-failure-test
rm -f tools/learning-loop-mastra/__orphan_test_failure__.js  # if not already deleted by the branch cleanup
```

**Red-team hardening applied:**
- `git worktree add` isolates the failure-test branch — `server.js` and other tracked files in the main checkout are not modified
- New file `__orphan_test_failure__.js` instead of appending to `server.js` (avoids polluting the running MCP server entrypoint)
- Explicit cleanup of worktree, branch, and temp file (the original plan only had `gh pr close --delete-branch`, which leaves the local file behind)

**Test (assertion) for GREEN (only if step 3.5 is run):**
- [ ] `fallow-sarif.sarif` artifact downloads successfully
- [ ] All runs in the artifact have non-null `automationDetails.id`
- [ ] Workflow fails with the expected gate-failure verdict
- [ ] After cleanup, `git status` is clean and `git worktree list` shows only the main checkout

If step 3.5 is skipped, document the skip in the journal and rely on Phase 2's static tests (T8-update, T10-T16) plus the failure-upload step's `if-no-files-found: ignore` behavior to cover the failure path.

#### Step 3.6 — Update the prior plan's ship journal

Append a paragraph to `plans/reports/journal-260629-2011-fallow-tools-v2-action-swap-plan-shipped.md` (verified to exist at this path; the `plans/260629-2011-.../reports/` subdirectory does NOT exist):

```markdown
## Amendment (2026-06-30)
This plan was amended by `plans/260630-0536-fallow-action-swap-with-sarif-split/` to fix the
multi-run SARIF rejection at codeql-action v4's `areAllRunsUnique` validator. The deep-dive
§6.3 / §6.5 claim that multi-run SARIF was accepted was wrong. The fix is an inline jq patch
that rewrites `runs[i].automationDetails.id` on runs where it's null, plus a single explicit
`codeql-action/upload-sarif@v4` call. See `plans/reports/research-260630-1425-...md` for
the source-level evidence. PR #22 was closed; a recovery PR was opened against this branch.
```

#### Step 3.7 — Write this plan's ship journal

Create `plans/260630-0536-fallow-action-swap-with-sarif-split/reports/journal-260630-0536-fallow-action-swap-with-sarif-split-plan-shipped.md` with:

```markdown
# Ship Journal: Patch SARIF tool.driver per run in fallow Action swap

**Ship date:** <actual>
**Branch:** 260629-2011-fallow-tools-v2-action-swap
**Recovery PR:** <new PR URL>

## What shipped
- Inline jq patch step in `.github/workflows/test.yml` that rewrites
  `runs[i].automationDetails.id` per run
- Single explicit `codeql-action/upload-sarif@v4` call with `category: fallow`
- Updated 2 + added 5 workflow-shape tests in
  `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js`
- Corrected §6.3 / §6.5 in `plans/reports/researcher-260629-2011-...md`
- Flipped D2 in `plans/reports/decision-260629-2011-...md`
- Updated meta-state entry `meta-260630T1238Z-...`

## Verification
- Local test suite: 1380+/1380+ green
- Workflow-shape tests: 14/14 green (9 original + 5 new)
- CI test workflow on recovery PR: <exit code + duration>
- Code Scanning UI: category `fallow` visible (or empty state)
- jq smoke test: `tools/learning-loop-mastra/reports/fallow/audit.sarif` patches to
  `runs[].automationDetails.id = ["fallow/audit/dead-code", "fallow/audit/dupes", "fallow/audit/health"]`

## Follow-ups (deferred)
- F-1: when bumping fallow to 2.103.x, regenerate baselines + re-test the classifier
- F-4: if operators want PR-body summary, add `comment: true` to the Action
- F-6: file upstream issue + PR at github.com/fallow-rs/fallow for `automationDetails.id`
  on dead-code and health SARIF builders (deferred per operator instruction)
- F-7: per-analyzer Code Scanning categories (revisit after F-6 lands)

## What was NOT done
- F-6 was explicitly NOT filed (per operator instruction)
- No new top-level workflow files were created
- No Python dependency was added; jq is pre-installed on runners
```

## Success Criteria

- [ ] PR #22 is closed with a comment linking to the new plan
- [ ] Branch `260629-2011-fallow-tools-v2-action-swap` is reset and has Phase 1 + Phase 2 commits applied
- [ ] New recovery PR is open against main, marked `ready to review` (or equivalent)
- [ ] `test` workflow on the new PR completes with exit code 0
- [ ] `Meta-state registry delta advisory` workflow on the new PR completes with SUCCESS
- [ ] Code Scanning UI on the new PR shows `category: fallow` (single category, not split)
- [ ] If step 3.5 ran: failure-upload artifact `fallow-sarif.sarif` contains the patched SARIF (all runs have non-null `automationDetails.id`)
- [ ] `plans/reports/journal-260629-2011-fallow-tools-v2-action-swap-plan-shipped.md` updated with amendment note
- [ ] `plans/260630-0536-fallow-action-swap-with-sarif-split/reports/journal-...md` created with ship record
- [ ] Local `pnpm test` is still green after the recovery commit is applied
- [ ] `gh pr view <new-pr> --json state` returns `"MERGED"` or `"OPEN"` (depending on operator preference)

## Risk Assessment

- **Risk:** The recovery PR fails CI due to a regression unrelated to the SARIF fix (e.g., a flaky network test). **Mitigation:** re-run with `gh run rerun`; if the failure persists, isolate by reverting one Phase 2 change at a time and re-running.
- **Risk:** Code Scanning UI's category display caches the old `fallow-deadcode` / `fallow-health` / `fallow-dupes` from PR #22's earlier runs. **Mitigation:** the categories are per-SARIF-run, not global; the new PR's runs only have `category: fallow`. If old categories show, that's a Code Scanning display quirk (separate from our upload), not a SARIF issue.
- **Risk:** Operator reviews the recovery PR and requests per-analyzer categories back (rejecting Option B). **Mitigation:** the F-7 follow-up in this plan is the path for that; the operator can request F-7 as a separate plan instead of blocking this one. The PR review comment should explicitly call out the F-7 path.
- **Risk:** Branch reset via force-push loses prior work. **Mitigation:** the prior plan's commits (Phase 3 rule extension + F-2 baseline relocation) are intact on the branch; only the broken workflow change is reverted. Verify with `git log --oneline -5` before force-pushing.
- **Risk:** The new PR's CI runs against a different fallow version than expected (e.g., dependabot bumped `github/codeql-action` between runs). **Mitigation:** the workflow pins `github/codeql-action/upload-sarif@v4` (not `@latest`), so dependabot bumps would create a separate PR; the recovery PR runs against the pinned `@v4`.
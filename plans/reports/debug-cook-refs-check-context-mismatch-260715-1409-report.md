# Debug report: refs-check branch-protection context mismatch

> **Status (updated 2026-07-15): RESOLVED via a different approach.** The
> recommendation below (§1 "Option A — rename the job to `meta-state refs
> check`") was **not** adopted — it is a hand-wavy workaround that preserves the
> wrong assumption (that the required context should be the workflow `name:`).
> The adopted fix binds the required-check context to the Actions **job id**
> `refs-check` (the check-run name GitHub actually matches), via
> `tools/scripts/setup-branch-protection.mjs` (single source of truth — parses
> the job id from the workflow YAML and writes it into branch protection). This
> also migrates the input off the legacy `contexts` array to the modern `checks`
> array (`app_id: -1`). Branch protection on `main` now requires `refs-check`;
> PR 62 `mergeStateStatus: CLEAN`. See plan `260715-2010-…` Phase 3. §1 is
> retained below as historical reasoning; §2/§3/§4 remain relevant.

**Type:** from-debugger (cook follow-up investigation)
**Date:** 2026-07-15T14:09Z
**Triggered by:** operator observation that PR 62's CI shows `meta-state refs check` PENDING indefinitely while `meta-state refs check / refs-check (pull_request)` is SUCCESS
**Plan under scrutiny:** `plans/260715-2010-meta-state-refs-check-pr-trigger/` (status: completed per the report at `plans/reports/cook-refs-check-pr-trigger-260715-1356-report.md`)
**PR under scrutiny:** https://github.com/dat9uy/learning-loop-template/pull/62

## Executive summary

The Phase-1/Phase-2 fix landed correctly and the workflow now fires on `pull_request`, but branch protection is **still not satisfied**. The plan's acceptance criterion #4 ("branch protection requirement satisfied") was signed off in the cook report **on incorrect evidence** — `mergeable: MERGEABLE` was read as a green signal but is in fact independent of the required-status-check state.

**Root cause:** GitHub's legacy `contexts` branch-protection array matches against check-run **names**. GitHub Actions check runs are named after the **JOB**, not the workflow `name:` field. Our check run is named `refs-check` (job id), but branch protection requires the context `meta-state refs check` (workflow name). The two never match.

**Severity:** medium-to-high. The original bug (required check MISSING on PRs) is unchanged from the operator's perspective — every future PR will still fall back to admin bypass (`enforce_admins: false`). The recent PRs #57-#61 (already merged via bypass) and now PR #62 (would also need bypass) are evidence the fix is incomplete.

**Recommended fix:** rename the job in `.github/workflows/meta-state-refs-check.yml` from `refs-check:` to `meta-state refs check:` (Option A from the diagnostic conversation). The check run then takes the name `meta-state refs check`, matching the branch-protection context. Single-file change; no branch-protection edit; no behavior change to the validator.

## Technical analysis

### Symptom

PR 62's Checks tab renders two entries:

| Entry | Status |
|---|---|
| `meta-state refs check` | PENDING indefinitely |
| `meta-state refs check / refs-check (pull_request)` | SUCCESS |

The first entry is GitHub's "required-context stub" rendered against the branch-protection `contexts` array. It stays pending because no check run / legacy commit status matches the literal string `meta-state refs check`. The second entry is the actual job-level check run; it succeeds but does not satisfy the branch-protection context.

### Evidence trail (commit `ef7e823`, PR 62 HEAD)

**Branch-protection required context:**
```
gh api repos/dat9uy/learning-loop-template/branches/main/protection/required_status_checks
→ { "contexts": ["meta-state refs check"], "strict": true }
```

**Check runs on the commit:**
```
gh api repos/dat9uy/learning-loop-template/commits/ef7e823/check-runs
→ 3 check runs:
  - "fallow"        (github-advanced-security app)
  - "refs-check"    (github-actions app, conclusion=success)  ← our workflow's job
  - "test"          (github-actions app, conclusion=success)
```

**Combined status (GitHub's authoritative "what branch protection sees"):**
```
gh api repos/dat9uy/learning-loop-template/commits/ef7e823/status
→ { "state": "pending", "statuses": [], "sha": "ef7e823..." }
```

The empty `statuses` array + `state: pending` is the load-bearing fact. It is what `git push`-time branch-protection enforcement reads. Until that flips to `success`, branch protection is unsatisfied.

### Why the cook report's verification was insufficient

The cook report at `plans/reports/cook-refs-check-pr-trigger-260715-1356-report.md` accepted `gh pr view 62 --json mergeable` returning `MERGEABLE` as proof that branch protection was satisfied. It is not. `mergeable` reports GitHub's merge-button state, which incorporates `enforce_admins: false` — so admins (including the operator) see MERGEABLE regardless of the required-status-check state. The proof artifact should have been:

```
gh api repos/dat9uy/learning-loop-template/commits/<sha>/status
→ { state: success, ... }
```

or equivalently:

```
gh api repos/dat9uy/learning-loop-template/pulls/62
→ check the statusCheckRollup + the branch-protection rule's `contexts` array
```

The statusCheckRollup IS a CheckRun (typename: "CheckRun"), so the JSON `name`/`conclusion` pair was available; but the rollup lists the JOB name (`refs-check`), not the workflow name. Reading the rollup without cross-checking against `branches/main/protection/required_status_checks.contexts` allowed the mismatch to slip past verification.

### Why this happens (GitHub's data model)

GitHub Actions creates one **check run per job** with `name = <job-id>`. The workflow file's `name:` field becomes the **check suite's** display name (and the UI prefix `workflow_name / check_run_name`), but is **not** the check run's `name` field. The legacy `contexts` branch-protection array matches against:

- Legacy commit status `context` strings (from `actions/github-script`, third-party CI, etc.), and
- Check run `name` strings

It does **not** match against check suite names or workflow file `name:` fields.

When the workflow name and job name match — as in `test.yml` (`name: test` + job `test:`) — the check run name is unambiguous and matches. When they differ — as in our workflow — there are two candidate strings, and the **job name** wins. Branch protection configured with the **workflow name** then never matches.

### Why the original plan missed this

Plan `260715-2010-meta-state-refs-check-pr-trigger/plan.md` listed this scenario explicitly in Risk Assessment as a Phase-2 fallback ("GitHub context-name matching is generally robust but not formally documented for every config"), and listed "Renaming the workflow or job to align with branch-protection context expectations" in Out of Scope. The plan was scoped optimistically: it assumed adding `pull_request:` alone would close the bug. The plan even stated the verification would confirm:

> "A test PR (or re-pushed branch) shows `meta-state refs check` as a green check in the Checks tab."

The first half of that — "appears in the Checks tab" — is true (because of how GitHub renders branch-protection required contexts). The second half — "as a green check" — is false. The check is rendered but stays pending because the underlying check run is named `refs-check`, not `meta-state refs check`. The plan's verification step (`gh pr checks 62 --json name,state,workflow`) reported `refs-check` SUCCESS, but the operator's eye (and the plan author's verification reading) treated "the workflow named `meta-state refs check`" as equivalent to "the context `meta-state refs check`." It is not.

## Recommendations

### 1. Apply Option A — rename the job (recommended)

Single-line change to `.github/workflows/meta-state-refs-check.yml`:

```yaml
jobs:
  meta-state refs check:        # was: refs-check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: ...
```

After the rename, the check run's `name` becomes `meta-state refs check`, the branch-protection context matches, the combined status flips to `success`, and the UI's "required-context stub" entry flips from PENDING to a green check.

**Job IDs with spaces are valid YAML** (the key is a quoted/unquoted scalar). There is one cosmetic issue: GitHub URLs for the job page will have `%20` for the space. No functional impact.

**Verification artifacts after the fix:**

```
gh api repos/dat9uy/learning-loop-template/commits/<sha>/status
→ { state: "success", ... }   # was "pending"

gh api repos/dat9uy/learning-loop-template/commits/<sha>/check-runs
→ { name: "meta-state refs check", conclusion: "success", ... }   # was "refs-check"

gh pr checks <pr> --json name,state
→ includes "meta-state refs check" → SUCCESS
```

### 2. Amend plan `260715-2010-meta-state-refs-check-pr-trigger/`

Add a Phase 3 ("Fix context-name match") that supersedes the "Out of Scope" line for renaming. Reopen the plan's status (currently `completed`) to `in_progress`, document Phase 3, and re-flip to `completed` after the job rename is merged and verified.

### 3. Strengthen the cook verification protocol

The cook report's verification mistake — accepting `gh pr view --json mergeable` as branch-protection-satisfied proof — should be added as a rule to the meta-surface. Suggested finding:

> **Rule candidate:** `rule-required-status-checks-verify-combined-status` — branch-protection satisfaction requires `gh api repos/<owner>/<repo>/commits/<sha>/status.state == "success"`, NOT `gh pr view --json mergeable`. The latter reports GitHub's merge-button state (which honors `enforce_admins` bypass).

This is a meta-surface improvement (loop-anti-pattern: `gate-logic-bug` or `record-repair-gap`): a verification pattern that produced false-positive completion claims. Add via `mcp__learning-loop__mastra_meta_state_report` after the immediate fix lands.

### 4. Strengthen the cook report template

The cook report's "Acceptance criteria" section should be augmented to require per-criterion evidence (`gh api` output, not operator assertion). This is a documentation change, not a code change.

## Out-of-scope / not recommended

- **Renaming the workflow `name:` field to `refs-check`.** Forces a branch-protection edit (`contexts: ["refs-check"]`), which the original plan listed as out of scope and which is a separate concern.
- **Migrating branch protection to the modern `checks` array.** More explicit (avoids the workflow-vs-job ambiguity by binding to `app_id`), but an API-shape change beyond this bug's scope.
- **Adding `pull_request.paths:` filter.** Already correctly excluded by the original plan (a path filter would re-introduce the bug for non-registry PRs).

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Job ID with space breaks `actions/labeler` or other Actions that reference `${{ github.job }}` | low | low | grep for `github.job` references; the workflow does not use this expression |
| Re-render of the workflow causes job URL to change | certain | cosmetic | URLs in old logs/comments will 404; no functional impact |
| Phase 3 amendment confuses the original Phase-1/2 timeline | low | low | keep Phase 3 retrospective — document why it was needed post-completion |
| Another future workflow hits the same workflow/job-name trap | high | medium | promote the rule candidate in §3 to make this discoverable |

## Files referenced

- `.github/workflows/meta-state-refs-check.yml` (target of the fix)
- `.github/workflows/test.yml` (canonical working pattern — workflow name == job name)
- `plans/260715-2010-meta-state-refs-check-pr-trigger/plan.md` (plan to amend)
- `plans/reports/cook-refs-check-pr-trigger-260715-1356-report.md` (cook report that mis-verified)

## Unresolved questions

1. **Should the operator proceed with the fix themselves, or spawn a sub-agent / invoke `/ck:cook --auto` again?** The fix is one YAML line + plan amendment. A cook invocation would re-run the full cook protocol for a 1-line change; a direct Edit + commit + push is faster and equally auditable.

2. **Should the rule candidate (§3) be filed via `meta_state_report` BEFORE or AFTER the immediate fix?** Reporting it before the fix would broaden the diff on this branch; reporting it after is cleaner but loses the trail. The current recommendation is to apply the immediate fix first (so the branch's verification artifact is clean), then file the rule in a follow-up plan.

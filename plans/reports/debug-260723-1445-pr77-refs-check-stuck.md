# Debug Report — PR#77 "stuck at refs-check"

## TL;DR

**CI was never stuck.** Both checks succeeded; the user's snapshot caught the
PR mid-flight. `refs-check` completed in 7 s; `test` finished ~2.5 min later.
Current state is `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`.

The "stuck at refs-check" framing is a misnomer: `refs-check` is the **only**
required status check on `main` (branch protection contexts: `["refs-check"]`),
so when the PR's merge state is `BLOCKED`, the visual association is "the
required check is blocking me." But the actual blocker was the non-required
`test` check, which GitHub waits on before flipping the rollup to
`COMPLETED`/`CLEAN`.

## Final state (verified at 2026-07-23T07:49:55Z)

| Check | Status | Conclusion | Started | Completed | Duration |
|---|---|---|---|---|---|
| `refs-check` (run 29989211342) | COMPLETED | SUCCESS | 07:46:27Z | 07:46:34Z | 7 s |
| `test` (run 29989211334) | COMPLETED | SUCCESS | 07:46:27Z | 07:48:58Z | ~2.5 min |
| `fallow` (Code Scanning, 89148282791) | COMPLETED | SUCCESS | 07:48:50Z | 07:48:53Z | 3 s |

- PR: `mergeStateStatus:** CLEAN**`, `mergeable: MERGEABLE`, `reviewDecision: ""`
- Branch: `plan-260722-2249-inbound-gate-paused-surface-skip`
- Head SHA: `e4e59887fbbf2d56e76f8e581ac4750f3b285561`
- 2 commits ahead of main, 0 behind
- `runtime-state.jsonl` intact on PR branch (33 rows, unchanged vs main)

## What the user likely saw

Snapshot at the user's question (2026-07-23T07:45:36Z, ~49 s before the new
runs were created at 07:46:25Z):

- No workflow runs existed yet for the freshly pushed headSHA `e4e5988`.
- The previous run history (run 29935469045 from 2026-07-22T15:53:14Z) was
  stale — it belonged to the pre-rebase headSHA `cf20366` (the PR that
  contained the bad prune).
- The PR's `mergeStateStatus: BLOCKED` was inherited from the prior failing
  `test` run (run 29935469595, conclusion: failure) on the previous headSHA.
- Branch protection's only required context is `refs-check`, so the user
  attributed the blocked state to that check.

By the time the user asked, the new commits had been pushed but GitHub had
not yet created the matching workflow runs. The "stuck" perception was
either a stale view of the PR page or a UI race.

## Why `refs-check` cannot be stuck

`.github/workflows/meta-state-refs-check.yml:62-97` defines a single job
`refs-check` with:

- `runs-on: ubuntu-latest`
- `timeout-minutes: 5`
- 4 steps: Checkout → setup-node → git union-merge driver config → `node
  tools/learning-loop-mastra/scripts/validate-registry-refs.js`
- No external services, no network, no matrix

`validate-registry-refs.js` is a pure-Node script that scans the union of
`meta-state.jsonl` + `change-log.jsonl` for dangling refs and exits 1 on
real orphans. Runtime on the live union is ~hundreds of ms — the 7 s
duration includes runner acquistion + checkout + setup-node. There is no
plausible path to a long "stuck" state for this job under `timeout-minutes: 5`.

The required-status-check context invariant (`.github/workflows/meta-state-refs-check.yml:14-22`)
is the relevant trap: Actions names a check run after the **job id**
(`refs-check`), NOT the workflow's display name (`meta-state refs check`).
Branch protection binds the required context to the parsed job id via
`tools/scripts/setup-branch-protection.mjs`. Hand-editing the protection
context to the workflow name would silently make the check
`EXPECTED`/`PENDING` forever — that is the realistic "stuck at refs-check"
scenario, but no evidence of it here (the actual run concluded SUCCESS in
7 s, and the rollup saw the required context).

## What was actually slowed

The `test` workflow (`.github/workflows/test.yml`) was the only run still
in progress at the user's snapshot time. Steps in order:

1. Set up job (4 s)
2. Checkout (2 s)
3. pnpm/action-setup (1 s)
4. setup-node (6 s)
5. Install dependencies (`pnpm install --frozen-lockfile`, 5 s)
6. Seed file-index (0 s)
7. Cold-session probe tests (7 s)
8. **`pnpm test` (113 s)** — the long pole
9. Resolve fallow version (0 s)
10. Fallow audit (4 s)
11. Patch SARIF (4 s)
12. Upload SARIF (6 s)
13-14. Failure-path uploads (skipped)

The `pnpm test` step is where the wall-clock sits. The namespaced runner
(`tools/scripts/run-pnpm-test-namespaced.mjs`) writes `.test-logs/<ns>.log`;
`pnpm-test-discipline` rule (warm hint) keeps progress visible.

## Why `mergeStateStatus: BLOCKED` though `refs-check` was green

GitHub's `mergeStateStatus` is an aggregate of:

- merge conflicts (not here)
- review requirements (none configured; `reviewDecision: ""`)
- required status checks (green: `refs-check` SUCCESS)
- **non-required check rollup state** (here: `IN_PROGRESS` because `test`
  was still running)

GraphQL rollup state during the user's snapshot: `PENDING` (one context
`IN_PROGRESS`). GitHub's documented merge states:

- `PENDING` — non-required checks still running
- `BLOCKED` — required check failed or other merge blocker
- `CLEAN` — all required checks passed, no blockers

The CLI's `mergeStateStatus: BLOCKED` was the **stale** view from the prior
`test` failure (run 29935469595) on the pre-rebase headSHA `cf20366`. As
soon as the new `test` run reached the SARIF upload step (success), GitHub
recomputed to `CLEAN`. The race is between the user's perceived "stuck"
state and GitHub's recompute.

## Verification

```bash
$ gh pr view 77 --json statusCheckRollup,mergeStateStatus,mergeable,reviewDecision
{
  "mergeStateStatus": "CLEAN",
  "mergeable": "MERGEABLE",
  "reviewDecision": "",
  "statusCheckRollup": [
    {"name":"refs-check","status":"COMPLETED","conclusion":"SUCCESS", ...},
    {"name":"test","status":"COMPLETED","conclusion":"SUCCESS", ...},
    {"name":"fallow","status":"COMPLETED","conclusion":"SUCCESS", ...}
  ]
}
```

Branch protection (verified via `gh api
repos/dat9uy/learning-loop-template/branches/main/protection`):

```json
"required_status_checks": {
  "strict": true,
  "contexts": ["refs-check"],
  "checks": [{"context": "refs-check", "app_id": null}]
}
```

Required context is the job id (`refs-check`), bound by
`tools/scripts/setup-branch-protection.mjs` per the comment at
`.github/workflows/meta-state-refs-check.yml:14-22`. No drift here.

## Remediation (none required)

The PR is now `MERGEABLE`. The user can merge via `gh pr merge 77 --squash`
or the GitHub UI. No code change is needed.

If the user keeps seeing "stuck at refs-check" in the GitHub UI, the most
likely cause is a stale cached page (the PR's `mergeStateStatus` lags the
underlying checks by a few seconds on initial push). Hard refresh usually
clears it; otherwise wait for the next event on the branch.

## Evidence trail

- Run 29989211342 (refs-check): `https://github.com/dat9uy/learning-loop-template/actions/runs/29989211342`
- Run 29989211334 (test): `https://github.com/dat9uy/learning-loop-template/actions/runs/29989211334`
- Workflow: `.github/workflows/meta-state-refs-check.yml` (job id
  `refs-check`, line 62)
- Workflow: `.github/workflows/test.yml` (job id `test`, line 25)
- Branch protection: `dat9uy/learning-loop-template` `main` — required
  context `refs-check`
- Branch protection setup: `tools/scripts/setup-branch-protection.mjs`
- Prior PR#77 debug reports (relevant context):
  - `plans/reports/debug-260723-1410-pr77-runtime-state-prune-flaw.md`
  - `plans/reports/debug-260723-1426-ledger-vs-budget-tracking-l1l2.md`

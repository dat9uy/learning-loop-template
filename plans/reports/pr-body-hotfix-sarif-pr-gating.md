# Hotfix: gate SARIF patch + upload to `pull_request` events

## What broke

After merging #23, the post-merge CI on main (run 28444039075) **failed** with:

```
realpath: invalid option -- 'p'
Try 'realpath -- help' for more information.
```

The `Patch fallow SARIF per analyzer (jq)` step ran on a `push` event to `main`, where the `Fallow audit (PR gate)` step is gated `if: github.event_name == 'pull_request'` and therefore skipped. With no fallow run, `steps.analyze.outputs.sarif` was empty, and `${SARIF_INPUT%.sarif}-patched.sarif` resolved to `-patched.sarif` — which `realpath` parsed as the `-p` option.

PR #23 had no `if:` guard on the patch / upload steps because PRs always run them; the regression only surfaced on the first push-to-main after merge.

## Fix

1. **Primary:** add `if: github.event_name == 'pull_request'` to the patch step + the upload step so they only run when the upstream fallow audit ran (which is itself PR-gated).
2. **Belt-and-suspenders:** guard empty/empty-file `SARIF_INPUT` at the start of the patch step's `run:` block, before the `realpath` call. Even if the PR-only `if:` is removed in a future refactor, `realpath` will not crash.

## Tests

- **T17** (workflow-shape): assert patch + upload steps have the PR-gating `if:`
- **T18** (workflow-shape): assert empty-input guard runs **before** the realpath call

Both tests fail RED against #23's state and pass GREEN against this fix.

**Suite:** 16/16 workflow-shape tests green; 1395/1395 local suite green (+2 over PR #23's 1393).

## Verification plan

After this PR merges, the next push to `main` should run CI with the patch + upload steps correctly skipped (because the fallow audit step is also skipped on push), and `test` + `fallow` + `registry-deltas` should all pass on `main`.

## References

- Failing run: https://github.com/dat9uy/learning-loop-template/actions/runs/28444039075
- Original recovery plan: `plans/260630-0536-fallow-action-swap-with-sarif-split/`
- SARIF internals audit: `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`
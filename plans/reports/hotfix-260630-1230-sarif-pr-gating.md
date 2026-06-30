# Hotfix Journal: gate SARIF patch + upload to `pull_request` events

**Hotfix date:** 2026-06-30
**Recovery PR #23:** merged at 7a650bf (failed post-merge CI)
**Hotfix PR #24:** merged at e048d4e (fixes PR #23's post-merge regression)

## What broke

After merging PR #23 to main, the post-merge CI on main (run 28444039075) **failed** with:

```
realpath: invalid option -- 'p'
Try 'realpath --help' for more information.
```

The `Patch fallow SARIF per analyzer (jq)` step ran on a `push` event to `main`, where the `Fallow audit (PR gate)` step is gated `if: github.event_name == 'pull_request'` and therefore skipped. With no fallow run, `steps.analyze.outputs.sarif` was empty, and `${SARIF_INPUT%.sarif}-patched.sarif` resolved to `-patched.sarif` — which `realpath` parsed as the `-p` option.

PR #23 had no `if:` guard on the patch / upload steps because PRs always run them; the regression only surfaced on the first push-to-main after merge.

## Fix shipped (PR #24, commit e048d4e)

1. **Primary:** add `if: github.event_name == 'pull_request'` to the patch step + the upload step so they only run when the upstream fallow audit ran (which is itself PR-gated).
2. **Belt-and-suspenders:** guard empty/empty-file `SARIF_INPUT` at the start of the patch step's `run:` block, before the `realpath` call. Even if the PR-only `if:` is removed in a future refactor, `realpath` will not crash.

## Tests added

- **T17** (workflow-shape): assert patch + upload steps have the PR-gating `if:`
- **T18** (workflow-shape): assert empty-input guard runs **before** the `realpath` call

Both tests fail RED against PR #23's state and pass GREEN against this fix.

**Suite:** 16/16 workflow-shape tests green; 1395/1395 local suite green (+2 over PR #23's 1393).

## Verification

- **PR #24 CI:** `test: pass` (1m22s), `fallow: pass` (2s) — both checks green
- **Post-merge main CI:** `completed/success` on the merge commit e048d4e (run 28444604634) — push-event workflow now skips patch + upload correctly

## Root cause classification

This was a **regression in the recovery plan** (plan 260630-0536, Phase 2 step 2.6 + 2.7) — the patch + upload steps were extracted from inside the fallow Action's composite (which had its own `if:` guard via `steps.ghas-check.outputs.available == 'true'`) and re-added to the workflow without re-applying the PR-only `if:` guard.

## Lesson (for future similar migrations)

When extracting a step from inside a composite Action's `runs.steps:` block, **inherited `if:` clauses do not transfer**. Each extracted step must independently declare its guards (event type, prior step's success/failure, output availability).

## Status: DONE

Summary: PR #23 (SARIF automationDetails patch) had a post-merge regression on push events. PR #24 (this hotfix) adds PR-only `if:` guards to the patch + upload steps plus a belt-and-suspenders empty-input guard at the top of the patch step's `run:` block. 16/16 workflow-shape tests green; 1395/1395 local suite green; both PR events (PR #24) and push events (main post-merge) report CI success.
---
phase: 3
title: "Verify gate exits 0 on fresh PR run"
status: pending
effort: "0.5h"
---

# Phase 3: Verify gate exits 0 on fresh PR run

## Overview

Confirms that Phases 1 and 2's changes actually unblock PR #21 by watching the next CI run end-to-end. If the gate still fails, captures the new SARIF and triages the remaining findings — closing the loop on the meta-state finding with concrete evidence either way.

## Requirements

**Functional:**
- Next PR #21 CI run completes
- `test` check passes (green)
- meta-state finding `meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356` is resolved with the green-run URL as evidence

**Non-functional:**
- No new findings introduced by Phases 1 and 2 (sanity check the SARIF)

## Architecture

N/A — verification only.

## Related Code Files

- **Modify:** none (read-only verification + meta-state mutation via MCP tool)

## Implementation Steps

### Step 3.1 — Watch the next CI run

```bash
gh pr checks 21 --watch
```

Expect:
- `test` check transitions from `fail` (or `pending`) to `pass`
- `registry-deltas` continues to pass (it was passing in run 28358847609)

If the run is slow (>5 min), capture the current status periodically with `gh pr checks 21` instead of `--watch`.

### Step 3.2 — Capture the green-run URL

```bash
gh pr checks 21 --json name,state,link
```

Copy the URL of the green `test` check. It looks like `https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>`.

### Step 3.3 — Sanity check the SARIF (optional but recommended)

The SARIF upload step from the diagnostic is now permanent in the workflow. If the gate flips green, no SARIF is uploaded (the step is `if: failure()`). To verify no NEW findings slipped in, run fallow locally:

```bash
cd /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra
pnpm exec fallow audit \
  --root . \
  --gate new-only \
  --dead-code-baseline ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json \
  --health-baseline    ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json \
  --dupes-baseline     ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json \
  --changed-since "origin/main" \
  --format sarif \
  --output-file /tmp/audit-phase3.sarif

echo "Exit code: $?"
jq '.runs[].results | length' /tmp/audit-phase3.sarif
```

Expect: exit code 0, 0 results per run. (The local run uses `origin/main` as the changed-since base, mirroring what the CI workflow does.)

If the local run reports new findings but CI is green, the discrepancy is itself a finding — investigate before resolving the meta-state entry.

### Step 3.4 — Resolve the meta-state finding

If Step 3.1 confirms green AND Step 3.3 (if run) shows 0 local findings:

```js
mcp__learning-loop__mastra_meta_state_resolve({
  id: "meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356",
  resolution: "Root cause was NOT env drift (env-drift hypothesis refuted by diagnostic). Real cause: 4 fallow/high-crap-score findings (3 in PR-touched core/evaluate-*.js files from the evaluator extraction in commit 09415f4; 1 pre-existing in hooks/legacy/bash-gate.js) + 1 fallow/code-duplication + stale dupes-baseline.json (18 entries, 0 matched). Fixed by: regenerating the dupes baseline, refactoring the 3 core/ evaluators (rule registry pattern for evaluateWriteGate; extracted helpers for evaluatePreflight and evaluateInboundGate), and [decision on legacy file: refactored/deleted/excluded]. PR #21 CI run <run-id> now passes the test check. SARIF upload-artifact step preserved at .github/workflows/test.yml:225-237 for future drift diagnosis."
})
```

### Step 3.5 — If the gate still fails

If Step 3.1 reports `test` check still failing:

1. Download the new SARIF artifact:
   ```bash
   gh run download <new-run-id> -n fallow-sarif -D /tmp/fallow-sarif-phase3
   ```
2. Inspect which rule IDs fired:
   ```bash
   jq -r '.runs[].results[].ruleId' /tmp/fallow-sarif-phase3/audit.sarif | sort -u
   ```
3. Update the meta-state finding's `description` with the new evidence via `meta_state_patch`.
4. Do NOT resolve the finding.
5. Decide: address the new findings in this plan (extend Phase 2), or open a follow-up plan.
6. The SARIF upload-artifact step remains in the workflow regardless — it proved its value by providing the diagnostic data.

### Step 3.6 — Mark Phase 3 complete

If green: `ck plan check 3` from the plan dir.

If still failing: leave Phase 3 in-progress and document the residual findings in a follow-up plan.

## Success Criteria

- [ ] PR #21 `test` check is green on the most recent CI run
- [ ] (If Step 3.3 run locally) `pnpm exec fallow audit --gate new-only` reports 0 results locally
- [ ] Meta-state finding `meta-260629T1450Z-...` is resolved (status: `resolved`) with evidence-based note
- [ ] Phase 1 and Phase 2 commits both landed in PR #21's branch

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A new finding emerges that Phase 2's refactor missed (e.g., a function helper extracted with high CC) | Low | Gate still fails | The SARIF surfaces it; Step 3.5's triage flow handles it. Extend Phase 2 or open a follow-up. |
| The CI run's `changed-since` base differs from local (`origin/main`) — fallow compares different diffs | Low | Local says green, CI says red (or vice versa) | Investigate the base SHA difference. The CI uses `github.event.pull_request.base.sha`. If they truly differ, the local check isn't a 1:1 proxy — rely on the CI result. |
| The registry-deltas check (a separate required check) fails because of unrelated drift | Low | PR blocked on a different gate | Out of scope for this plan; address in a separate plan if it occurs. |
| Meta-state resolve is gated by `resolution-evidence-required` consult rule | Very low | Can't resolve without extra evidence | The green-run URL is the evidence. If a different consult rule blocks resolution, report the gate message and adjust. |
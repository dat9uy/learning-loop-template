---
title: "Re-introduce SARIF split into fallow-rs/fallow@v2 Action swap (amendment to plan 260629-2011-fallow-tools-v2-action-swap)"
description: "Plan 260629-2011-fallow-tools-v2-action-swap shipped end-to-end locally but failed CI on PR #22 with a multi-run SARIF rejection. The deep-dive §6.3 / §6.5 claim that codeql-action accepts multi-run SARIF sharing a category is FALSE — codeql-action v4's areAllRunsUnique validator uses tool.driver.{name,fullName,version,semanticVersion,guid} + automationDetails.id (not category). Fallow's runs collide because every run has identical name=\"fallow\" / version=\"2.102.0\" and null fullName/guid/automationId. Fix: re-introduce the SARIF split (3 single-run files with distinct tool.driver.name per analyzer) + 3 explicit codeql-action/upload-sarif@v4 calls with per-analyzer categories. This plan amends the prior plan's Phase 4 contract and is the recovery path for the blocked PR."
status: pending
priority: P2
branch: "260629-2011-fallow-tools-v2-action-swap"
tags: [ci, fallow, action-swap, sarif-split, codeql-v4, plan-amendment]
blockedBy: ["260629-2011-fallow-tools-v2-action-swap"]
blocks: []
created: "2026-06-30T05:36:12.000Z"
createdBy: "operator"
addresses: ["meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo"]
source: skill
---

# Re-introduce SARIF split into fallow-rs/fallow@v2 Action swap

## Overview

PR #22 (commit `44b8d03`) shipped the migration of `.github/workflows/test.yml:62-237` from the hand-rolled `pnpm exec fallow audit` step to the official `fallow-rs/fallow@v2` Action. The plan was approved based on the researcher #2 deep-dive's claim that codeql-action/upload-sarif@v4 accepts multi-run SARIF sharing a single category (deep-dive §6.3 / §6.5).

**The claim is wrong.** The first CI run on PR #22 (run 28395140914) failed with:

```
##[error]The CodeQL Action does not support uploading multiple SARIF runs with the same category.
For more information, see https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/
```

The `areAllRunsUnique` validator in `github/codeql-action/src/sarif/index.ts` builds its uniqueness key from `run.tool?.driver?.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails?.id` — **`category` is NOT in the key**. Fallow's multi-run SARIF has identical values on every key field across all runs (verified locally: `[{name: "fallow", version: "2.102.0", fullName: null, guid: null, automationId: null}, {name: "fallow", version: "2.102.0", fullName: null, guid: null, automationId: null}]`), so the runs collide and the upload is rejected.

The gate semantics themselves are correct — `verdict=pass`, `gate=new-only`, `ISSUES=0` in the failed run. The failure is purely a SARIF upload packaging issue.

## Why the deep-dive was wrong

Two distinct errors in `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5:

1. **Wrong claim about codeql-action validation.** "codeql-action accepts multi-run SARIF when they share a category" — FALSE. The validator's `createRunKey` does not use `category` at all; it uses 6 fields on the SARIF run's tool driver. The changelog's "distinct tool or category" wording was misread as "category alone is sufficient".
2. **Wrong number of SARIF runs.** Claimed "one per analyzer (dead-code, health, dupes)" — but the fallow CLI emits 2 runs on a clean tree (dead-code + dupes; health doesn't emit when no findings above threshold). On a PR with health findings, 3 runs would emit. The Action's `sarif: true` does not deduplicate.

## Corrected design

Re-introduce the SARIF split that plan 260629-2011-fallow-tools-v2-action-swap's Phase 4 deliberately removed. The fix is the same Python script that the OLD workflow ran (test.yml:79-188) — it reads the multi-run `fallow-results.sarif` the Action produces, splits it into N single-run files, patches each file's `tool.driver.name` to a per-analyzer unique value (e.g., `fallow-deadcode`, `fallow-health`, `fallow-dupes`), and emits them to `${{ inputs.artifacts-dir }}` (default `.`). Then 3 explicit `codeql-action/upload-sarif@v4` calls upload each file under its category.

Key changes from the old Python heredoc:
- **Source SARIF path**: the Action writes to `<root>/.fallow/fallow-results.sarif` (or wherever `inputs.artifacts-dir` resolves), NOT the old `tools/learning-loop-mastra/reports/fallow/audit.sarif`. Adapt the read path.
- **Tool driver name patching**: when splitting, the script must rewrite `tool.driver.name` to a unique per-analyzer value. The old script's classifier used category names but did NOT patch the SARIF; codeql-action's `createRunKey` collision is on `tool.driver.name` (not category), so this patching is the new requirement.
- **Upload step count**: 3 explicit `codeql-action/upload-sarif@v4` calls (one per analyzer), with `category: fallow-deadcode` / `fallow-health` / `fallow-dupes`. Each upload has 1 run + 1 category → uniqueness key is unique → accepted.
- **Failure-upload step**: preserved from the failed PR #22's commit; path may need updating depending on where the split script writes.
- **Action's `sarif: true` input**: set to `false` so the Action does NOT try to upload the unmodified multi-run SARIF (which fails).

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Correct the design evidence](./phase-01-update-design-evidence.md) | Pending | Deep-dive §6.3 / §6.5 corrected with the actual codeql-action source citation + the live SARIF diff. Decision record updated. |
| 2 | [Re-introduce SARIF split + 3 explicit uploads](./phase-02-reintroduce-sarif-split.md) | Pending | Workflow-shape test asserts: (a) `sarif: false` on Action; (b) 3 explicit `codeql-action/upload-sarif@v4` calls present; (c) 3 unique categories; (d) split step is in the workflow. Local test suite 1380+/1380+ green. |
| 3 | [Verify in CI on PR](./phase-03-verify-in-ci.md) | Pending | Fresh PR run on a no-change branch reports `verdict=pass`; SARIF uploaded to Code Scanning under 3 distinct categories (`fallow-deadcode`, `fallow-health`, `fallow-dupes`); failure-upload step's path resolves to a real file. |

## Dependencies

- **Upstream**: `260629-2011-fallow-tools-v2-action-swap` (the broken plan; this amendment)
- **Resolves**: `meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo` (the meta-state finding)
- **Branch**: stays on `260629-2011-fallow-tools-v2-action-swap` (per user's "in the same branch" instruction). PR #22 is currently in a failed-CI state on this branch and should be closed (the broken commit is not the recovery path).
- **Reuses**: Phase 3 of the prior plan (rule extension) and F-2 (baseline relocation) commit intact. Only the workflow change needs amendment.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Current (PR #22, broken)              Migration target (this plan)      │
├──────────────────────────────────────────────────────────────────────────┤
│  uses: fallow-rs/fallow@<sha>        uses: fallow-rs/fallow@<sha>        │
│    with:                                with:                            │
│      sarif: true        ← fails          sarif: false       ← disabled  │
│      version: ${{ ... }}                 version: ${{ ... }}              │
│      baselines...                        baselines...                     │
│  (Action tries to upload multi-run   - name: Split fallow SARIF per       │
│   SARIF, codeql-action rejects)         analyzer (Python script)          │
│                                      - uses: codeql-action/upload-sarif  │
│                                        with:                             │
│                                          sarif_file: <split1.sarif>      │
│                                          category: fallow-deadcode       │
│                                          (×3 analyzers, unique category  │
│                                           + unique tool.driver.name from  │
│                                           the split step)                │
│  - name: Upload fallow SARIF on       (preserved; path updated to         │
│    failure                              artifacts-dir + per-analyzer)     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] `meta-state.jsonl` has an active finding (`meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo`) documenting the deep-dive §6.3/§6.5 error and pointing at the corrected source (codeql-action `createRunKey`)
- [ ] Deep-dive report updated: §6.3 / §6.5 claim corrected with the actual `createRunKey` function and the live SARIF diff
- [ ] Decision record updated: D2 (per-analyzer categories) flipped from "drop" to "preserve" (Migration B is the corrected path; Migration A was based on incorrect evidence)
- [ ] `.github/workflows/test.yml` has `sarif: false` on the Action invocation
- [ ] Split step present: reads `fallow-results.sarif` from the Action's artifacts-dir, emits 3 single-run files, patches each `tool.driver.name` to a per-analyzer unique value
- [ ] 3 explicit `codeql-action/upload-sarif@v4` calls present with `category: fallow-deadcode` / `fallow-health` / `fallow-dupes`
- [ ] All workflow-shape tests still pass (the existing 9 must be updated to reflect the corrected design — `sarif: false`, 3 categories, no `codeql-action/upload-sarif` direct call inside the Action's composite)
- [ ] New workflow-shape tests added: split step exists; split step writes per-analyzer files; upload steps have correct categories
- [ ] Local test suite green (1380+/1380+)
- [ ] Fresh PR run on a no-change branch reports `verdict=pass`; SARIF visible in Code Scanning under 3 distinct categories
- [ ] Failure-upload step's path resolves to a real file on a failing run
- [ ] PR #22 closed with a comment linking to the new plan
- [ ] Original plan's ship journal updated to note the amendment

## Risks

- **Risk:** Split script's classifier heuristic (which run maps to which analyzer) drifts from fallow's taxonomy. **Mitigation:** pin `version: 2.102.0` (already done); update the classifier against fallow's CHANGELOG; if fallow 2.103.x lands, regenerate baselines + update the classifier with a tested fixture.
- **Risk:** 3 explicit `codeql-action/upload-sarif@v4` calls may break a future codeql-action v5+ relaxation (if the changelog is reversed). **Mitigation:** low — the changelog 2025-07-21 is a tightening, not a relaxation; no follow-up reversal is documented.
- **Risk:** Split script in the workflow (vs extracted to a file) is the same YAGNI question the OLD workflow faced. The OLD script stayed inline for 6 months; keep it inline until a 2nd tool needs the same treatment.
- **Risk:** PR #22's commit `44b8d03` is on the branch tip. Cherry-picking the fix is messier than a fresh PR. **Mitigation:** close PR #22, force-push the branch to a known-good state, open a new PR with the corrected commit sequence.

## Open Questions

- None at plan creation. The fix is well-scoped: re-introduce what worked, disable what doesn't, document the truth.

## Follow-ups (post-amendment)

- F-1 (deferred from prior plan): when bumping fallow to 2.103.x, regenerate baselines + re-test the split script's classifier against the new taxonomy
- F-4 (deferred from prior plan): if operators want PR-body summary, add `comment: true` to the Action (requires `pull-requests: write`)
- F-6 (new): file an upstream issue at github.com/fallow-rs/fallow asking them to set per-run `tool.driver.fullName` (or `automationDetails.id`) so their SARIF output is naturally unique. This would let the Action's `sarif: true` work without our split step.

---

Status: pending
Created: 2026-06-30T05:36:12.000Z
Branch: 260629-2011-fallow-tools-v2-action-swap

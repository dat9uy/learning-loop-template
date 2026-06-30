---
title: "Patch SARIF `tool.driver` per run in fallow-rs/fallow@v2 Action swap (amendment to plan 260629-2011-fallow-tools-v2-action-swap)"
description: "Plan 260629-2011-fallow-tools-v2-action-swap shipped end-to-end locally but failed CI on PR #22 with a multi-run SARIF rejection. The deep-dive §6.3 / §6.5 claim that codeql-action accepts multi-run SARIF sharing a category is FALSE — codeql-action v4's areAllRunsUnique validator keys on run.tool.driver.{name,fullName,version,semanticVersion,guid} + run.automationDetails.id (NOT category). Verified at the fallow source level: build_audit_sarif synthesizes the dupes run locally with automationDetails.id=\"fallow/audit/dupes\" but passes dead-code and health runs verbatim from upstream builders that don't set automationDetails.id, so dead-code and health collide on createRunKey. Fix: inline jq patch that rewrites only the runs with null automationDetails, classifier based on rules[0].id prefix, then 1 explicit codeql-action/upload-sarif@<sha> call with category: fallow. F-6 (upstream fix in fallow) is deferred per operator instruction; the local patch retires when F-6 ships."
status: pending
priority: P2
branch: "260629-2011-fallow-tools-v2-action-swap"
tags: [ci, fallow, action-swap, sarif-patch, codeql-v4, plan-amendment]
blockedBy: ["260629-2011-fallow-tools-v2-action-swap"]
blocks: []
created: "2026-06-30T05:36:12.000Z"
createdBy: "operator"
addresses: ["meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo"]
source: skill
---

# Patch SARIF `tool.driver` per run in fallow-rs/fallow@v2 Action swap

## Overview

PR #22 (commit `44b8d03`) shipped the migration of `.github/workflows/test.yml:62-237` from the hand-rolled `pnpm exec fallow audit` step to the official `fallow-rs/fallow@v2` Action. The plan was approved based on the researcher #2 deep-dive's claim that codeql-action/upload-sarif@<sha> accepts multi-run SARIF sharing a single category (deep-dive §6.3 / §6.5).

**The claim is wrong.** The first CI run on PR #22 (run 28395140914) failed with:

```
##[error]The CodeQL Action does not support uploading multiple SARIF runs with the same category.
For more information, see https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/
```

The `areAllRunsUnique` validator in `github/codeql-action/src/sarif/index.ts` builds its uniqueness key from `run.tool?.driver?.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails?.id` — **`category` is NOT in the key**.

## What fallow actually emits (verified at the source level)

Source-audit in `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`:

- `crates/output/src/sarif.rs::build_sarif_document` is **single-run** by construction (hard-coded `runs: [{...}]`, no branching). Every SARIF run in fallow's output carries driver metadata limited to `name`, `version`, `informationUri`.
- `crates/api/src/audit_output.rs::build_audit_sarif` is the **only** place that emits a multi-run SARIF file. It spreads pre-built dead-code and health SARIF documents verbatim and synthesizes a dupes run locally with `automationDetails.id = "fallow/audit/dupes"`. **The dead-code and health runs do not set `automationDetails.id`** — that's the partial fix that causes the collision.

Verified locally against `tools/learning-loop-mastra/reports/fallow/audit.sarif` (fallow 2.102.0) and a fresh `fallow audit --format sarif` run (fallow 2.103.0):

| Run | analyzer | driver.name | driver.version | automationDetails.id | createRunKey |
|-----|----------|-------------|----------------|----------------------|--------------|
| 0 | dead-code | `fallow` | `2.102.0` | **null** | K_X |
| 1 | dupes | `fallow` | `2.102.0` | `"fallow/audit/dupes"` | K_Y (unique) |
| 2 | health | `fallow` | `2.102.0` | **null** | K_X (**collides with run 0**) |

The dupes run is uniquely identified because `build_audit_duplication_sarif_run` sets its `automationDetails.id`. Dead-code and health runs collide because their upstream builders don't.

The gate semantics themselves are correct — `verdict=pass`, `gate=new-only`, `ISSUES=0` in the failed run. The failure is purely a SARIF upload packaging issue.

## Why the deep-dive was wrong

Two distinct errors in `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5:

1. **Wrong claim about codeql-action validation.** "codeql-action accepts multi-run SARIF when they share a category" — FALSE. The validator's `createRunKey` does not use `category` at all; it uses 6 fields on the SARIF run's tool driver and `automationDetails.id`. The changelog's "distinct tool or category" wording was misread as "category alone is sufficient".
2. **Wrong number of SARIF runs.** Claimed "one per analyzer (dead-code, health, dupes)" — fallow's audit emits 2 or 3 runs depending on whether findings cross the health/dupes thresholds. The dead-code run is always present.

## Corrected design (Option B: patch in-place + 1 upload)

Inline jq patch on the multi-run SARIF file that the Action produces, followed by a single `codeql-action/upload-sarif@<sha>` call. The patch:

1. Reads the SARIF file from the Action's artifacts-dir (default `.`).
2. For each `runs[i]` where `automationDetails == null`, sets `runs[i].automationDetails.id` based on `runs[i].tool.driver.rules[0].id` prefix:
   - `fallow/high-*`, `fallow/low-*`, `fallow/long-*`, `fallow/duplicated-*` → `"fallow/audit/health"`
   - `fallow/unused-*`, `fallow/private-*`, `fallow/duplicate-*`, `fallow/unlisted-*` → `"fallow/audit/dead-code"`
   - otherwise → `"fallow/audit/dupes"` (defensive fallback; in practice dupes runs already have `automationDetails.id` set)
3. Writes the patched SARIF to `<artifacts-dir>/fallow-results-patched.sarif`.
4. Uploads the patched file with a single `codeql-action/upload-sarif@<sha>` call, `category: fallow`.

Key design properties:

- **Idempotent**: runs with `automationDetails` already set are passed through unchanged. Re-running the patch on fallow's output (which already has the dupes run uniquely identified) is a no-op for those runs.
- **Drift-aware**: classifier is rules-prefix-based, not run-index-based. When fallow adds new rule IDs, the classifier catches them via the prefix and falls through to `fallow/audit/dupes` (or we extend the prefix map; one-line change).
- **Single upload**: 1 `codeql-action/upload-sarif@<sha>` call, 1 category. Per-analyzer Code Scanning categories are deferred — when the local patch retires (F-6 ships), per-analyzer categorization can be reintroduced in a follow-up plan if operators want it.
- **jq over Python**: the patch is mechanical (rewrite `automationDetails` based on rules prefix). jq is pre-installed on GitHub-hosted runners and the script is ~15 lines. No Python dependency, no classify-and-split complexity from the old workflow.

Key changes from the old Python heredoc:

- **Source SARIF path**: the Action writes to `<root>/.fallow/fallow-results.sarif` (or wherever `inputs.artifacts-dir` resolves), NOT the old `tools/learning-loop-mastra/reports/fallow/audit.sarif`. Adapt the read path.
- **Patch is per-run, not split-and-rewrite**: the old script split the multi-run SARIF into N files and uploaded each separately. The new patch keeps the multi-run file but rewrites `automationDetails.id` per run so `createRunKey` produces unique values across runs.
- **Upload step count**: 1 explicit `codeql-action/upload-sarif@<sha>` call (the Action's `sarif: true` is disabled so it doesn't try to upload the unmodified file).
- **Failure-upload step**: preserved from the failed PR #22's commit; path updated to `<artifacts-dir>/fallow-results-patched.sarif`.
- **Action's `sarif: true` input**: set to `false` so the Action does NOT try to upload the unmodified multi-run SARIF (which fails).

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Correct the design evidence](./phase-01-phase-1-correct-design-evidence.md) | Pending | Deep-dive §6.3 / §6.5 corrected with the actual codeql-action source citation + the live SARIF diff + the fallow source-level evidence. Decision record D2 annotated to confirm it remains correct (already "Drop (Migration A)"; PR #22 failure was an orthogonal bug). |
| 2 | [Patch SARIF per run + 1 explicit upload](./phase-02-phase-2-patch-sarif-1-explicit-upload.md) | Pending | Workflow-shape test asserts: (a) `sarif: false` on Action; (b) inline jq patch step present; (c) 1 explicit `codeql-action/upload-sarif@<sha>` call with `category: fallow`; (d) no per-analyzer upload calls. Local test suite baseline (from step 2.0) green. |
| 3 | [Verify in CI on PR](./phase-03-phase-3-verify-in-ci.md) | Pending | Fresh PR run on a no-change branch reports `verdict=pass`; SARIF uploaded to Code Scanning under `category: fallow`; failure-upload step's path resolves to a real file. |

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
│  (Action tries to upload multi-run   - name: Patch fallow SARIF per run   │
│   SARIF, codeql-action rejects)         (inline jq, idempotent)          │
│                                      - uses: codeql-action/upload-sarif@<sha>  │
│                                        with:                             │
│                                          sarif_file:                     │
│                                            <artifacts-dir>/               │
│                                            fallow-results-patched.sarif   │
│                                          category: fallow                │
│                                          (1 call; per-run                 │
│                                           automationDetails.id patched   │
│                                           so createRunKey is unique)     │
│  - name: Upload fallow SARIF on       (preserved; path updated to         │
│    failure                              artifacts-dir + patched file)     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] `meta-state.jsonl` has an active finding (`meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo`) documenting the deep-dive §6.3/§6.5 error and pointing at the corrected source (codeql-action `createRunKey` + fallow `build_audit_sarif`)
- [ ] Deep-dive report updated: §6.3 / §6.5 claim corrected with the actual `createRunKey` function and the live SARIF diff (3 runs; automationDetails.id null on dead-code and health, set on dupes)
- [ ] Decision record updated: D2 (per-analyzer categories) **annotated** to confirm it remains correct (was already "Drop (Migration A)" before this plan; the PR #22 failure was an orthogonal bug, not a category-routing issue). Per-analyzer categories deferred to a follow-up after F-6 lands.
- [ ] `.github/workflows/test.yml` has `sarif: false` on the Action invocation
- [ ] Inline jq patch step present: reads `fallow-results.sarif` from the Action's artifacts-dir, patches each `runs[i]` where `automationDetails == null` to set `automationDetails.id` based on `runs[i].tool.driver.rules[0].id` prefix, writes to `<artifacts-dir>/fallow-results-patched.sarif`
- [ ] 1 explicit `codeql-action/upload-sarif@<sha>` call present with `category: fallow`, `sarif_file: <artifacts-dir>/fallow-results-patched.sarif`
- [ ] All workflow-shape tests still pass (the existing 9 must be updated to reflect the corrected design — `sarif: false`, single category, no `codeql-action/upload-sarif@<sha>` direct call inside the Action's composite, no per-analyzer upload calls)
- [ ] New workflow-shape tests added: patch step exists; patch step is jq-based (no Python dependency); patch step reads from artifacts-dir; upload step has correct category
- [ ] Local test suite green (1380+/1380+)
- [ ] Fresh PR run on a no-change branch reports `verdict=pass`; SARIF visible in Code Scanning under `category: fallow`
- [ ] Failure-upload step's path resolves to a real file on a failing run
- [ ] PR #22 closed with a comment linking to the new plan
- [ ] Original plan's ship journal updated to note the amendment
- [ ] F-6 (upstream fix to fallow) explicitly deferred — NOT filed in this plan's scope. Owner assigned to "operator", target follow-up plan when convenient.

## Risks

- **Risk:** Inline jq classifier heuristic (rules[0].id prefix → analyzer name) drifts from fallow's taxonomy. **Mitigation:** pin `version: 2.102.0` (already done); update the prefix map against fallow's CHANGELOG; if fallow 2.103.x lands and adds new rule prefixes, regenerate baselines + update the prefix map with a tested fixture. The patch is idempotent so re-running is safe.
- **Risk:** A future fallow version may emit runs with `automationDetails` already set on dead-code/health too (F-6 lands). The patch would then no-op on those runs (still correct), but the upload step would still pass because `createRunKey` is already unique. **Mitigation:** none needed — the patch is forward-compatible with F-6. When F-6 lands, the entire patch step can be removed in a follow-up plan.
- **Risk:** Inline jq in the workflow (vs extracted to a file) is the same YAGNI question the OLD workflow faced. The OLD script stayed inline for 6 months; keep jq inline until a 2nd tool needs the same treatment.
- **Risk:** PR #22's commit `44b8d03` is on the branch tip. Cherry-picking the fix is messier than a fresh PR. **Mitigation:** close PR #22, force-push the branch to a known-good state, open a new PR with the corrected commit sequence.
- **Risk:** Without per-analyzer Code Scanning categories, finding triage in the Code Scanning UI requires reading the rule ID to identify the analyzer. **Mitigation:** acceptable for now; SARIF `results[].ruleId` already starts with `fallow/high-*` / `fallow/unused-*` / `fallow/code-duplication`, so triage is still possible via rule filter. Per-analyzer categories can be reintroduced in a follow-up if operators request it.

## Open Questions

- None at plan creation. The fix is well-scoped: keep the multi-run file, patch `automationDetails.id` per run, upload once, document the truth.

## Abort Semantics (per red-team finding)

| Phase | Step | Abort on failure |
|-------|------|------------------|
| 1 | 1.2 — replace §6.3 | `git checkout plans/reports/researcher-260629-2011-...md` to revert |
| 1 | 1.3 — replace §6.5 | `git checkout plans/reports/researcher-260629-2011-...md` to revert |
| 1 | 1.4 — annotate D2 | `git checkout plans/reports/decision-260629-2011-...md` to revert |
| 1 | 1.5 — meta-state patch | `meta_state_patch` with the inverse `description`/`evidence_*` fields, or `meta_state_report` with a new id + `reopens` link |
| 2 | 2.5 — flip sarif + add id | `git checkout .github/workflows/test.yml` to revert |
| 2 | 2.6 — add patch step | `git checkout .github/workflows/test.yml` to revert |
| 2 | 2.7 — add upload step | `git checkout .github/workflows/test.yml` to revert |
| 2 | 2.8 — fix failure-upload path | `git checkout .github/workflows/test.yml` to revert |
| 2 | 2.3 — update tests | `git checkout tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` to revert |
| 2 | 2.12 — add behavioral test | `git rm tools/learning-loop-mastra/__tests__/legacy-mcp/sarif-patch.test.js` to revert |
| 3 | 3.1 — close PR #22 + reset branch | `gh pr reopen 22` + `git push --force-with-lease` to restore; reflog recovery via `git reflog \| grep -i "260629-2011"` |
| 3 | 3.2 — push recovery PR | `gh pr close <new-pr>` to abandon |
| 3 | 3.5 — destructive failure test | `git worktree remove --force /tmp/fallow-failure-test` + `git branch -D` to clean up |

**Cross-phase abort:** if Phase 1 partial-fails (e.g., meta-state patch succeeds but deep-dive replacement fails), Phase 2 MUST NOT begin. Either complete Phase 1 fully or revert all Phase 1 changes. The `addBlockedBy: [1]` chain on Task #2 enforces this at the task level; the implementer must also enforce it manually when working outside the task system.

## Red Team Review

### Session 1 — 2026-06-30
**Findings:** 19 total (across 3 reviewers)
**Severity breakdown:** 4 Critical, 8 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `codeql-action/upload-sarif@<sha>` violates rule-tool-integration-same-commit-dep item 4 (SHA-pin rule) | Critical | **Accept** | Phase 2 step 2.7 |
| 2 | `steps.analyze.outputs.sarif` references non-existent step id | Critical | **Accept** | Phase 2 step 2.5 (add `id: analyze`) |
| 3 | Phase 3 force-push targets wrong commit hash (`44b8d03` is meta-state, not workflow change) | Critical | **Accept** | Phase 3 step 3.1 (use `git log -p` to find actual commit) |
| 4 | Idempotency claim is wrong: `automationDetails == null` does NOT match `automationDetails: {}` | Critical | **Accept** | Phase 2 step 2.6 (structural check) |
| 5 | Phase 2 step 2.7 has unresolved broken YAML block (literal `inputs.artifacts-dir || '.'` expression) | High | **Accept** | Phase 2 step 2.7 (deleted first block) |
| 6 | `createRunKey` source citation not directly verified against `codeql-action` source | High | **Accept** | Phase 2 step 2.13 (new verify step) |
| 7 | Tests are text-pattern only; a malformed SARIF could pass all 14 assertions | High | **Accept** | Phase 2 step 2.12 (new behavioral test) |
| 8 | Size guard missing — DoS via 10GB SARIF | High | **Accept** | Phase 2 step 2.6 (size cap + schema check + atomic write) |
| 9 | Path traversal in `${SARIF_INPUT%.sarif}-patched.sarif` — escapes workspace | High | **Accept** | Phase 2 step 2.6 (realpath canonicalization) |
| 10 | `pnpm test` baseline (1380+) unverified | High | **Accept** | Phase 2 step 2.0 (new baseline step) |
| 11 | Phase 1→2→3 abort semantics missing | High | **Accept** | plan.md (new Abort Semantics section) |
| 12 | Classifier only validates `rules[0]`, not full rules array | High | **Accept** | Phase 2 step 2.11 (full-rules grep verification) |
| 13 | Empty SARIF_INPUT produces silent empty patched file | Medium | **Accept** | Phase 2 step 2.6 (pre-check + atomic write) |
| 14 | Phase 3 step 3.5 dirty checkout — modifies `server.js`, leaves orphan export | Medium | **Accept** | Phase 3 step 3.5 (worktree isolation + explicit cleanup) |
| 15 | Phase 3 step 3.4 manual Code Scanning verification is unfalsifiable | Medium | **Accept** | Phase 3 step 3.4 (`gh api code-scanning/alerts`) |
| 16 | F-6 deferral assumes 2.103.x still emits null `automationDetails.id` — unverified | Medium | **Accept** | Phase 2 step 2.14 (new 2.103.x verify step) |
| 17 | `findStepByName(/Upload fallow SARIF to Code Scanning/)` is brittle under future name additions | Medium | **Accept** | Phase 2 step 2.3 (anchor regex in T13) |
| 18 | D2 annotation example text references planning dir, not decision record path | Medium | **Accept** | Phase 1 step 1.4 (annotation text corrected) |
| 19 | RED gate sequencing — T7-update + T10-T14 must be RED before workflow changes, not all at once | Medium | **Accept** | Phase 2 step 2.1 (explicit test ordering) |

**Rejected:** 0 (all evidence-backed findings accepted; cosmetic ones deferred to follow-up)

### Whole-Plan Consistency Sweep (post-red-team)
- **Files reread:** plan.md, phase-01-..., phase-02-..., phase-03-...
- **Decision deltas checked:** 4 (SHA pin instead of @v4; add `id: analyze`; structural idempotency check; behavioral test addition)
- **Reconciled stale references:** 0 (all updates applied to plan.md + phase files in lockstep)
- **Unresolved contradictions:** 0

## Follow-ups (post-amendment)

- F-1 (deferred from prior plan): when bumping fallow to 2.103.x, regenerate baselines + re-test the inline jq classifier against the new rule taxonomy
- F-4 (deferred from prior plan): if operators want PR-body summary, add `comment: true` to the Action (requires `pull-requests: write`)
- F-6 (deferred per operator instruction, **NOT filed**): when convenient, file an upstream issue + PR at github.com/fallow-rs/fallow asking them to set `automationDetails.id` on the dead-code and health SARIF builders (the same fix already applied to the dupes builder in `build_audit_duplication_sarif_run`). PR #1102 (merged same-day for `fallow security`) is precedent for the engagement model. Once F-6 ships, the inline jq patch step in this plan can be removed entirely in a follow-up.
- F-7 (new): if operators want per-analyzer Code Scanning categories, reintroduce them in a follow-up plan once F-6 lands. The category parameter is per-upload-call, so this would mean either (a) splitting the SARIF into 3 files and uploading 3 times, or (b) using the SARIF `properties.category` per-result field with a single upload.

---

Status: pending
Created: 2026-06-30T05:36:12.000Z
Branch: 260629-2011-fallow-tools-v2-action-swap
Refactored: 2026-06-30T14:25 — Option A (split + 3 uploads) replaced with Option B (patch in-place + 1 upload) per operator pushback. See `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md` for the source-level evidence.

## Validation Log

### Session 1 — 2026-06-30
**Trigger:** `/ck:plan validate` invoked on the refactored plan
**Questions asked:** 4

#### Questions & Answers

1. **[Assumptions — D2 status]** Plan's Phase 1 step 1.4 says to flip D2 from "preserve" to "drop", but the record already says "Drop (Migration A)" at line 17. What should Phase 1 actually do?
   - Options: Skip the flip; document the existing state (Recommended) | Keep the flip step but reword to "verify + annotate" | Re-open D2 and reconsider per-analyzer categories under Option B
   - **Answer:** Skip the flip; document the existing state
   - **Rationale:** D2 is already in the target state. The PR #22 failure was caused by `areAllRunsUnique` rejecting runs with identical `tool.driver` metadata — orthogonal to the category choice. The flip step would have been a no-op that might have introduced confusion about whether D2 was actually changed.

2. **[Tradeoffs — Classifier fallback]** The classifier routes runs with empty `rules[]` (the dupes run) to the `fallow/audit/dupes` fallback via the `// ""` empty-string check. Acceptable?
   - Options: Yes, fall through to dupes (Recommended) | Use position-based classifier (run index) instead of rules prefix | Add a separate explicit pre-pass that infers from `results[0].ruleId`
   - **Answer:** Yes, fall through to dupes
   - **Rationale:** The dupes fallback is conservative — the run that originally synthesizes that analyzer gets routed to its matching category. Worst case is cosmetic mis-routing; correctness is preserved because `createRunKey` is still unique. The patch is idempotent so re-running is safe.

3. **[Architecture — codeql-action version]** Plan uses `github/codeql-action/upload-sarif@<sha>@<sha>@<sha>` (the version that introduced strict `areAllRunsUnique`). No current workflow pins this. Confirm version?
   - Options: Pin `@v4` (Recommended) | Pin to a specific commit SHA | Use `@v3`
   - **Answer:** Pin `@v4`
   - **Rationale:** `@v4` matches the version that introduced the validator we're solving for. Major-version pinning is consistent with the workflow's other action pins (`@v7` for upload-artifact, `@v4` for checkout). `@v3` would be pinning to an older version to avoid the bug instead of fixing the root cause. SHA pinning is consistent with rule-tool-integration-same-commit-dep 4th item but is more friction; `@v4` is acceptable here because the action is read-only and idempotent.

4. **[Scope — F-7 timing]** When F-6 lands upstream (fallow emits `automationDetails.id` for all runs), the inline jq patch retires. Do we re-introduce per-analyzer Code Scanning categories in F-7, or stay with 1?
   - Options: Stay with 1 category; F-7 is YAGNI (Recommended) | Re-introduce 3 categories after F-6 lands | Defer the decision until after F-6 ships
   - **Answer:** Defer the decision until after F-6 ships
   - **Rationale:** Don't pre-commit. Let operators decide once they see how F-6 changes the SARIF output. The current plan already marks F-7 as a deferred follow-up — no change needed.

#### Confirmed Decisions
- **D2 status:** already "Drop (Migration A)"; document only — no flip
- **Classifier fallback:** routes empty-rules runs to `fallow/audit/dupes` via `// ""`
- **codeql-action version:** pinned at `@v4` (major version, not SHA)
- **F-7 timing:** defer until F-6 ships; current plan's F-7 follow-up is correct

#### Action Items
- [x] Phase 1 step 1.4: replaced "flip D2" with "annotate D2" (D2 was already Drop)
- [x] Phase 2 step 2.5: corrected line number from 86 to 99 for `sarif:` value
- [x] Phase 2 step 2.8: corrected line number from 109 to 118 for failure-upload path
- [x] Phase 1 + Phase 2: corrected meta-state.jsonl path from `tools/learning-loop-mcp/.claude/coordination/` to repo-root `./meta-state.jsonl`
- [x] Phase 3 step 3.6 + 3.7: corrected prior-plan journal path from `plans/260629-2011-.../reports/journal-...md` to `plans/reports/journal-260629-2011-...md`
- [x] Plan.md acceptance criteria: D2 line changed from "flipped from preserve to drop" to "annotated to confirm it remains correct"

#### Impact on Phases
- **Phase 1:** Step 1.4 rewritten (no flip; document state). All other steps unchanged.
- **Phase 2:** Line number corrections in steps 2.5, 2.8. Meta-state path note added. No design changes.
- **Phase 3:** Ship journal path corrected. No design changes.

### Verification Results
- **Tier:** Standard (3 phases)
- **Claims checked:** 30
- **Verified:** 24 | **Failed:** 5 | **Unverified:** 1
- **Failures (resolved in this validation session):**
  1. `sarif: true` line number: plan said 86, actual 99 — corrected in Phase 2 step 2.5
  2. Meta-state path: plan said `tools/learning-loop-mcp/...`, actual `./meta-state.jsonl` — corrected in Phase 1 step 1.5 + Phase 2 Related Code Files
  3. `fallow Action step` line number: plan said 86, actual 84 — corrected context in Phase 2; failure-upload `path:` field is on line 128 (not 109 or 118) — corrected in Phase 2 step 2.8
  4. D2 status: plan said "flip from preserve to drop", D2 was already "Drop" — Phase 1 step 1.4 rewritten to "annotate" instead of "flip"
  5. Prior plan ship journal path: plan said `plans/260629-2011-.../reports/`, actual `plans/reports/journal-...md` — corrected in Phase 3
- **Unresolved:** codeql-action version was `@v4` assumption — confirmed via interview (Option 1: Pin `@v4`)

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-..., phase-02-..., phase-03-...
- **Decision deltas checked:** 4 (D2 status, classifier fallback, codeql-action version, F-7 timing)
- **Reconciled stale references:** 5 (line numbers, paths, D2 wording, meta-state path, journal path)
- **Unresolved contradictions:** 0

Validation complete. Plan is eligible for implementation.
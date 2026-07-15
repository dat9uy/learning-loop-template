---
phase: 1
title: "Edit workflow YAML"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Edit workflow YAML

## Overview

Add `pull_request:` to `.github/workflows/meta-state-refs-check.yml#on:` so the required branch-protection check actually runs on PRs. Single-file YAML edit; no behavior change to the validator or the validator's classification policy.

## Requirements

- Functional: the workflow must run on every `pull_request` event (opened, synchronize, reopened) targeting `main`. The check must report as `meta-state refs check / refs-check` so the branch-protection `contexts: ["meta-state refs check"]` requirement is satisfied.
- Non-functional: no change to the validator script (`tools/learning-loop-mastra/scripts/validate-registry-refs.js`); no change to per-step behavior on `push`; the git union-merge driver setup step (Phase 4 of plan 260715-1608) remains.
- Invariant: the post-merge BLOCK behavior (no `continue-on-error: true`) is preserved.

## Architecture

`on:` currently:
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

`on:` after this phase:
```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
```

**Why bare `pull_request:` (no `paths:` filter):**
- Branch protection requires the check on every PR. A path filter would re-introduce the bug for non-registry PRs — which is exactly when the check is most useful (a PR can introduce a finding/rule/loop-design entry id that an existing ref no longer points to).
- Matches `test.yml` (also bare `pull_request:`), which is the canonical required-check pattern in this repo.
- The validator scans the entire union (registry on disk); a PR's HEAD checkout carries the same union as the post-merge state, so the result is consistent regardless of which files the PR diff touched.

**Why no `concurrency:` block:**
- The validator is fast (~5s) and deterministic; no benefit from canceling superseded runs.
- YAGNI: `test.yml` has `concurrency: cancel-in-progress: true` because its suite is heavier; this validator does not need it.
- Easy to add later if CI cost ever matters.

**Header comment update:** Replace the "Why post-merge: at push-to-main the full union is visible" framing with a dual-trigger framing that documents the branch-protection consistency. Keep the F13 (union-merge driver) and Phase-3 (BLOCK-mode) citations intact.

## Related Code Files

- Modify: `.github/workflows/meta-state-refs-check.yml`
  - Add `pull_request:` (bare) to the `on:` block
  - Update the header comment to document the dual-trigger behavior + branch-protection rationale

## Implementation Steps

1. Edit `.github/workflows/meta-state-refs-check.yml` `on:` block to add bare `pull_request:` (between `push:` and `workflow_dispatch:` — GitHub accepts any order, but this order matches the event chronology: `push` for post-merge, `pull_request` for pre-merge, `workflow_dispatch` for manual).
2. Update the workflow header comment: replace the "Why post-merge: at push-to-main the full union is visible" sentence with one that explains dual-trigger + branch-protection consistency. Preserve citations to plans `260715-0801`, `260715-1608` (Phase 1, Phase 3, Phase 4).
3. Confirm the YAML still parses: `node -e 'require("yaml").parse(require("fs").readFileSync(".github/workflows/meta-state-refs-check.yml", "utf8"))'` (or `actionlint` if available locally).
4. Confirm validator still exits 0 on the live union (regression gate): `node tools/learning-loop-mastra/scripts/validate-registry-refs.js; echo "exit=$?"` → 0.

## Success Criteria

- [ ] `.github/workflows/meta-state-refs-check.yml` `on:` block contains `pull_request:` (bare).
- [ ] Header comment explains dual-trigger + branch-protection consistency.
- [ ] YAML parses cleanly.
- [ ] `validate-registry-refs.js` exits 0 on the live union (regression gate).
- [ ] Diff is minimal (≤10 lines changed) and contains no validator or script edits.

## Risk Assessment

- **YAML parse failure on a malformed edit.** Mitigation: step 3's parse check catches it before commit.
- **Branch-protection context mismatch.** GitHub matches the workflow `name:` field against the branch-protection `contexts` entry — both are "meta-state refs check", so the match should be exact. If GitHub ever changes this behavior, fall back to using the job name `refs-check` in `contexts` (or move to the `checks` array with `app_id`). Not a Phase-1 risk; Phase-2 verification catches it.
- **Path-filter exclusion (deliberate choice).** Skipped path filter means the validator runs on every PR (~5s × N PRs). Cost is trivial; benefit (correctness on non-registry PRs) outweighs the cost.
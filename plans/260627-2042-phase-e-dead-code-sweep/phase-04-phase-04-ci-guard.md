---
phase: 4
title: "phase-04-ci-guard"
status: pending
priority: P2
dependencies: ["phase-03-phase-03-apply-triage"]
effort: "0.5 day"
---

# Phase 4: CI Guard

## Overview
Wire `fallow audit --gate new-only` into the CI workflow as a PR-time gate. Commit the regression baseline so CI can compare. Validate the guard with a synthetic dead-file injection (negative test) before closing the phase.

## Requirements
- **Functional:** every PR triggers `fallow audit --gate new-only`; exit code gates the merge; SARIF uploads to GitHub code-scanning.
- **Non-functional:** the guard is fast (cache hit on warm), severity-aware (warn-tier is advisory only), and survives a regression-baseline regeneration without manual edits.

## Architecture

```
PR opened/updated
       │
       ▼
┌─────────────────────────────────────────┐
│ CI workflow (Phase 4 step 1)            │
│                                         │
│  1. checkout + pnpm install             │
│  2. fallow audit                        │
│     --gate new-only                     │
│     --dead-code-baseline .fallow/baselines/dead-code-baseline.json
│     --health-baseline .fallow/baselines/health-baseline.json
│     --dupes-baseline .fallow/baselines/dupes-baseline.json
│     --changed-since origin/main         │
│     --format sarif                      │
│     --sarif-file reports/fallow/audit.sarif
│  3. github/codeql-action/upload-sarif   │
└─────────────────────────────────────────┘
       │
       ▼
PR merge gated on exit code 0
```

The regression baseline (counts) is separate from the fingerprint baseline; both live in `tools/learning-loop-mastra/.fallow/baselines/`. The fingerprint baseline is used by `fallow audit`; the count baseline is used by the optional `--fail-on-regression` check on `fallow dead-code` (not on `audit` per `reports/researcher-260627-fallow-config.md` §5.4).

## Related Code Files
- Modify: `.github/workflows/*.yml` (or equivalent — find the actual CI workflow file in Phase 4 step 0)
- Modify: `.gitignore` (allow `.fallow/baselines/*` through)
- Commit: `tools/learning-loop-mastra/.fallow/baselines/regression-baseline.json` (from Phase 2 output)
- Commit: `tools/learning-loop-mastra/.fallow/baselines/dead-code-baseline.json` (regenerate in this phase post-deletion)
- Commit: `tools/learning-loop-mastra/.fallow/baselines/health-baseline.json` (new, this phase)
- Commit: `tools/learning-loop-mastra/.fallow/baselines/dupes-baseline.json` (new, this phase)

## Implementation Steps

### Step 0 — Locate the CI workflow file
```bash
ls .github/workflows/
cat .github/workflows/*.yml 2>/dev/null | head -100
```

Read the existing workflow to understand:
- The job that runs on PRs (likely named `test` or `ci`)
- The Node/pnpm version pinning
- Whether `pnpm install` runs as a step
- The existing SARIF upload pattern (if any)

### Step 1 — Regenerate baselines after Phase 3 deletions
```bash
cd tools/learning-loop-mastra

# Post-deletion fingerprint baseline (replaces Phase 2 version)
fallow dead-code \
  --root . \
  --format json \
  -o ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json \
  --save-baseline .fallow/baselines/dead-code-baseline.json \
  --quiet

# Companion health baseline
fallow health \
  --root . \
  --save-baseline .fallow/baselines/health-baseline.json \
  --quiet

# Companion dupes baseline
fallow dupes \
  --root . \
  --save-baseline .fallow/baselines/dupes-baseline.json \
  --quiet

# Refresh regression-count baseline
fallow dead-code \
  --root . \
  --save-regression-baseline .fallow/baselines/regression-baseline.json \
  --quiet
```

### Step 2 — Update `.gitignore` (if needed)

The fallow cache dir (`.fallow/cache/`) should be gitignored. The baselines dir should be tracked:

```bash
# Inspect current .gitignore
grep -E "^\.fallow" .gitignore || echo "no .fallow entry"

# If missing, add:
echo ".fallow/cache/" >> .gitignore
echo ".fallow/churn.bin" >> .gitignore
echo "!.fallow/baselines/" >> .gitignore
```

Verify with `git check-ignore -v .fallow/baselines/regression-baseline.json` (should print `::` — i.e., NOT ignored).

### Step 3 — Add `fallow audit` step to CI

In the PR job, add:

```yaml
- name: Fallow audit (PR gate)
  if: github.event_name == 'pull_request'
  run: |
    cd tools/learning-loop-mastra
    pnpm install --frozen-lockfile

    # fallow version pinned via devDependencies (Phase 1 step 2.5).
    pnpm exec fallow audit \
      --root . \
      --gate new-only \
      --dead-code-baseline .fallow/baselines/dead-code-baseline.json \
      --health-baseline .fallow/baselines/health-baseline.json \
      --dupes-baseline .fallow/baselines/dupes-baseline.json \
      --changed-since "${{ github.event.pull_request.base.sha || 'origin/main' }}" \
      --format sarif \
      --sarif-file reports/fallow/audit.sarif

- name: Upload SARIF
  if: always() && github.event_name == 'pull_request'
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: tools/learning-loop-mastra/reports/fallow/audit.sarif
    category: fallow-audit
```

Notes:
- `--gate new-only` is the audit default but stated explicitly for readability
- `--changed-since` uses `${{ github.event.pull_request.base.sha }}` as the primary ref, with `origin/main` as the fallback for non-PR pipelines (scheduled nightly). This handles fork PRs correctly (their `origin/main` may not exist or be stale).
- `fallow` invoked via `pnpm exec` (validation session 1 decided devDependencies-only pinning); the version lives in the root `package.json#devDependencies`. CI inherits via `pnpm install --frozen-lockfile`.
- `--quiet` is omitted to keep progress visible in CI logs (cache warm = ~2s; cache cold = ~30s)

### Step 4 — Commit the baselines
```bash
cd tools/learning-loop-mastra
git add .fallow/baselines/ .gitignore
git commit -m "chore(fallow): commit baselines + add .fallow/cache to .gitignore"
```

### Step 5 — Negative test: synthetic dead file

Create a throwaway branch and PR with a deliberately unused file:

```bash
cd tools/learning-loop-mastra
git checkout -b fallow-guard-negative-test
echo "export const unused = 'noop';" > core/_fallow-test-tmp.js
git add core/_fallow-test-tmp.js
git commit -m "test(fallow): verify CI guard catches unused file"
git push origin fallow-guard-negative-test
gh pr create --title "test: fallow guard negative" --body "Synthetic dead file; PR should fail CI"
```

Expected: CI exits non-zero with `unused-files: error` finding pointing at `core/_fallow-test-tmp.js`. SARIF uploaded to code-scanning.

### Step 6 — Positive test: file with real consumer

Add a file that's actually imported from a known live site:

```bash
cd tools/learning-loop-mastra
echo "export const ping = () => 'pong';" > core/_fallow-test-tmp.js
# Wire it into a live site (e.g., export from core/meta-state.js)
# (choose any live file; the key is that the new export is consumed)
```

Expected: CI exits zero.

### Step 7 — Cleanup test artifacts

```bash
cd tools/learning-loop-mastra
rm core/_fallow-test-tmp.js
git checkout main
git branch -D fallow-guard-negative-test
gh pr close fallow-guard-negative-test
```

`tasks.md` row for the CI guard marked ☑ with the test evidence (CI run URLs from negative + positive tests).

## Success Criteria
- [ ] `.gitignore` allows `.fallow/baselines/*` through; ignores `.fallow/cache/`
- [ ] 4 baseline files committed to git: `regression-baseline.json`, `dead-code-baseline.json`, `health-baseline.json`, `dupes-baseline.json`
- [ ] CI workflow runs `fallow audit --gate new-only` on every PR
- [ ] SARIF uploaded to GitHub code-scanning via `github/codeql-action/upload-sarif`
- [ ] Negative test: synthetic dead file PR fails CI with non-zero exit
- [ ] Positive test: file with a real consumer PR passes CI
- [ ] Test artifacts cleaned up; synthetic branches deleted
- [ ] `tasks.md` row marked ☑ with evidence links to CI runs

## Risk Assessment
- **R1 — `fallow audit` is slow on first CI run.** Mitigation: `.fallow/cache/` is gitignored but persists across CI runs via cache action; first run ~30s, warm ~2s.
- **R2 — Baseline files drift between local and CI.** Mitigation: Phase 4 Step 1 regenerates them after Phase 3 deletions; CI checks out the same commit, so no drift.
- **R3 — `--changed-since origin/main` resolves differently in fork PRs.** Mitigation: fallow docs note this; the action auto-detects in PR context. If fork PRs break, switch to `--changed-since ${{ github.event.pull_request.base.sha }}`.
- **R4 — The synthetic dead file PR leaks into main.** Mitigation: Step 7 explicitly deletes the branch and closes the PR. Re-verify with `git branch -a` and `gh pr list`.
- **R5 — `codeql-action/upload-sarif` v3 is deprecated by the time this ships.** Mitigation: pin the major version; bump on fallow upgrade.
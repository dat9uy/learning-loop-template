---
phase: 1
title: Revert dead-weight step and regenerate dupes baseline
status: completed
effort: 0.5h
---

# Phase 1: Revert dead-weight step and regenerate dupes baseline

## Overview

Removes the `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` step that the diagnostic confirmed runs "Already up to date" (no behavioral effect, 380ms per PR run) and regenerates the stale `dupes-baseline.json` so the gate stops flagging current clone groups as new.

The SARIF upload-artifact step from the diagnostic is intentionally **preserved** — it proved its value by surfacing the real cause.

## Requirements

**Functional:**
- Revert the subdir install step (`.github/workflows/test.yml:51-58`)
- Preserve the SARIF upload-artifact step (`.github/workflows/test.yml:235-247`)
- Regenerate `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json` with current paths
- (Optional) Regenerate `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json` — decision deferred to Phase 2 since the high-crap-score findings may still need handling regardless

**Non-functional:**
- Local sanity check: `pnpm test` still passes (YAML syntax intact)
- Sanity check on regenerated baseline: paths match current repo (no stale paths)

## Architecture

N/A — config-only changes.

## Related Code Files

- **Modify:** `.github/workflows/test.yml` (revert subdir install step; preserve SARIF upload step)
- **Modify:** `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json` (regenerate)

## Implementation Steps

### Step 1.1 — Revert the subdir install step

Remove lines 51-58 from `.github/workflows/test.yml` (the `Install subdir dependencies (fallow audit gate)` step + its trailing blank line). The `Install dependencies` step at L48-49 and the `Seed cold-session sentinel` step at L60-66 (after removal, renumbering) should remain adjacent.

Before:
```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install subdir dependencies (fallow audit gate)
        # ... (10 lines incl. comments)
        run: pnpm --dir tools/learning-loop-mastra install --frozen-lockfile

      - name: Seed cold-session sentinel
```

After:
```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Seed cold-session sentinel
```

### Step 1.2 — Preserve the SARIF upload step

Do **not** remove `.github/workflows/test.yml:235-247` (the `Upload fallow SARIF on failure` step). It was instrumental in capturing the CI SARIF that revealed the real cause. It remains in the workflow permanently as a future-drift diagnostic capability.

### Step 1.3 — Regenerate the dupes baseline

```bash
cd /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra
pnpm exec fallow dupes --save-baseline ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json
```

This rewrites `dupes-baseline.json` with the current clone groups. Per `rule-tool-integration-same-commit-dep` item 2, the `--save-baseline` flag (NOT `--save-regression-baseline`) is the correct invocation for `audit`-consumable baselines — same flag used to generate the existing file in commit `9ed520d`.

### Step 1.4 — Sanity check the regenerated baseline

```bash
cd /home/datguy/codingProjects/learning-loop-template

# Confirm the file is parseable JSON and has non-zero entries
jq 'length' plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json

# Confirm a sample entry references a real path
jq -r '.[0]' plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json | head -1

# Verify the referenced file (or directory) exists
test -e "$(jq -r '.[0]' plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json | head -1 | cut -d: -f1)" && echo OK
```

Expect: a positive count, paths matching the current repo (e.g., `tools/learning-loop-mastra/...`), and the test `-e` returns `OK`.

### Step 1.5 — Local test suite

```bash
pnpm test
```

Expect: 1369 tests pass (no regressions from the workflow revert).

### Step 1.6 — Commit

```bash
git add .github/workflows/test.yml plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json
git commit -m "ci(fallow): drop dead-weight subdir install + refresh dupes baseline

The pnpm --dir install step from the diagnostic ran 'Already up to date'
with no behavioral effect; pnpm hoisting already materializes the subdir
deps. Drop it to save 380ms per PR run.

Also regenerate the dupes-baseline.json: the previous file had 18
entries that matched 0 current clone groups (paths stale), causing the
audit gate to flag every current clone as new.

Refs diagnostic at plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md"

git push
```

The commit message MUST NOT include literal finding IDs (`meta-260629T1450Z-...`) per `~/.claude/rules/review-audit-self-decision.md` § "Stable Code Artifacts." Use a `Refs` line pointing at the diagnostic report file path instead.

## Success Criteria

- [ ] `.github/workflows/test.yml` no longer contains `pnpm --dir ... install`
- [ ] `.github/workflows/test.yml` still contains the SARIF upload-artifact step
- [ ] `dupes-baseline.json` parses; sanity checks pass
- [ ] `pnpm test` passes locally
- [ ] Commit pushed to PR #21 branch
- [ ] Phase 2's pre-conditions met (dupes baseline valid)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regenerated baseline still doesn't match (different root paths) | Low | Phase 1 AC fails; Phase 2 still proceeds | Investigate the path-normalization issue separately. The `audit's --dupes-baseline` may need a path-resolution flag. |
| The 1 code-duplication finding is still flagged after baseline refresh | High | Gate still fails on dupes; Phase 2 needs to address it | This is expected. The clone group has no locations (stripped by the Python splitter) so it's already non-blocking for CodeQL, but fallow still emits it in the SARIF. The `--gate new-only` mode means only NEW findings fail; if the duplication is pre-existing and now baselined, the gate will pass on dupes. If still flagged as new, address in Phase 2. |
| Local sanity check (`-e` on first entry) fails because entries are stored with line numbers or relative paths | Low | Step 1.4 reports failure | Adjust the sanity check to handle the entry format (read first 2-3 entries manually if needed). |

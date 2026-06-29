---
phase: 1
title: Add subdir install + SARIF upload-artifact
status: completed
effort: 0.5h
---

# Phase 1: Add subdir install + SARIF upload-artifact

## Overview

Two surgical edits to `.github/workflows/test.yml`. Net change: +6 lines, 0 deletions, 0 modifications to existing steps. The change does not touch the inline Python SARIF splitter (lines 79-188) or the 3 `upload-sarif` steps (lines 190-215) — those are preserved for the separate action-swap plan.

## Requirements

**Functional:**
- Insert a subdir install step between the existing root install (line 48-49) and the existing cold-session sentinel (line 51-57)
- Insert a SARIF upload-artifact step after the existing `Upload per-namespace logs on failure` step (lines 217-224)
- Both new steps must not affect the success path (subdir install is unconditional; SARIF upload is `if: failure()` only)

**Non-functional:**
- Subdir install must be idempotent against the lockfile (`--frozen-lockfile`)
- SARIF upload retention matches the existing test-logs retention (7 days)
- No new permissions requested (uses default `GITHUB_TOKEN`)

## Architecture

N/A — pure CI glue. The change is bounded to one workflow file; no other code, no schema changes, no docs.

## Related Code Files

- **Modify:** `.github/workflows/test.yml`

## Implementation Steps

### Step 1.1 — Insert subdir install step

Insert after line 49 (`run: pnpm install --frozen-lockfile`), before line 51 (`- name: Seed cold-session sentinel`):

```yaml
      - name: Install subdir dependencies (fallow audit gate)
        # PR #21 env-drift diagnostic: fallow emits
        # "WARN node_modules directory not found" in CI twice (once per analyzer)
        # but not locally. Locally, `tools/learning-loop-mastra/node_modules` is
        # a symlink to root `node_modules` (created 2026-06-27). CI's
        # `pnpm install --frozen-lockfile` at root may not create that subdir
        # symlink before fallow runs. This step forces it.
        # See meta-state finding meta-260629T1450Z-pr-21-fallow-audit-gate-...
        run: pnpm --dir tools/learning-loop-mastra install --frozen-lockfile
```

**Why `pnpm --dir` (not `cd && pnpm install`):**
- Stays as a single pnpm invocation; matches existing style in the repo
- Does not change `cwd` for subsequent steps (the fallow step at line 65 already does its own `cd`)
- If `--dir` does not create the symlink for any reason, the failure branch (Step 1.5 below) will capture it and we can switch to the `cd` form

### Step 1.2 — Insert SARIF upload-artifact step

Insert after line 224 (end of the `Upload per-namespace logs on failure` step), before the end of the `test` job:

```yaml
      - name: Upload fallow SARIF on failure
        # Preserves reports/fallow/audit.sarif on failure so the next session
        # can read the actual CI output (rule IDs + locations) instead of
        # the truncated public log. Without this, diagnosing a future
        # CI-vs-local divergence requires re-running with debug logs.
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: fallow-sarif
          path: tools/learning-loop-mastra/reports/fallow/audit.sarif
          if-no-files-found: ignore
          retention-days: 7
```

**Why `if: failure()` and `if-no-files-found: ignore`:**
- The step is a diagnostic — it must not affect the success path
- `audit.sarif` is only written by the fallow step on PR events; for push events it does not exist, so `ignore` prevents a spurious upload failure
- Mirrors the existing test-logs upload pattern at lines 217-224

### Step 1.3 — Local sanity check

```bash
pnpm test
```

This loads `tools/learning-loop-mastra/`, which is what the new subdir install step is meant to make available in CI. Confirms the install step wouldn't accidentally break a local setup that already has the symlink.

### Step 1.4 — Commit + push to PR #21 branch

```bash
git add .github/workflows/test.yml
git commit -m "ci(fallow): diagnose PR #21 audit gate exit 1

Adds pnpm --dir install for tools/learning-loop-mastra/ before the
fallow step (verifies env-drift hypothesis from meta-state finding
meta-260629T1450Z-pr-21-fallow-audit-gate-...) and an upload-artifact
step that preserves the CI SARIF on failure for future diagnosis.

Refs: meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356"

git push
```

The commit message must NOT include the literal finding id per
`~/.claude/rules/review-audit-self-decision.md` § "Stable Code Artifacts" — but commit message body is allowed; only code comments / migration names / test names are blocked. Use `Refs:` (not the in-code convention) to keep git log clean.

### Step 1.5 — Observe CI outcome and act on it

Watch the PR #21 CI run. Two branches:

**Branch A — gate exits 0 (hypothesis confirmed):**
1. Capture the green check URL from the PR checks tab
2. Call:
   ```js
   meta_state_resolve({
     id: "meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356",
     resolution: "Env-drift hypothesis confirmed: pnpm --dir install at .github/workflows/test.yml:50-58 creates the missing tools/learning-loop-mastra/node_modules symlink that fallow's import resolution needs. PR #21 gate now exits 0 on identical input. Code fix in commit c94f1ea was locally clean (0 SARIF results, 1369 tests pass); only CI install ordering was wrong. SARIF upload-artifact step retained at lines 226-233 for future drift diagnosis."
   })
   ```
3. Mark phase complete

**Branch B — gate still exits 1 (hypothesis wrong or incomplete):**
1. From the failed run, download the `fallow-sarif` artifact
2. Inspect `audit.sarif` for which rule IDs fired and at which locations
3. Patch the meta-state finding with `meta_state_patch` to update `description` and add `evidence_code_ref` (the SARIF file path or a snippet showing the offending rule)
4. Do NOT resolve the finding; mark phase in-progress pending root-cause re-investigation
5. The SARIF upload-artifact step stays in the workflow regardless — it proved its value by providing the diagnostic data

### Step 1.6 — Optional: journal entry

After Phase 1 lands (either branch), write a 1-paragraph journal entry at `plans/reports/journal-260629-pr-21-fallow-env-drift-diagnostic.md` capturing the outcome (hypothesis confirmed / refuted / partial) and the link to the meta-state resolution. Skip if the user prefers.

## Success Criteria

- [ ] Step 1.1 YAML inserted exactly as shown; line numbers shifted by +9 from the insertion
- [ ] Step 1.2 YAML inserted exactly as shown; line numbers shifted by +9 from Step 1.1
- [ ] `pnpm test` passes locally
- [ ] Commit pushed; PR #21 CI run completes
- [ ] If branch A: meta-state finding status flips to `resolved` with the evidence-based note
- [ ] If branch B: SARIF artifact retrieved, finding description updated, phase remains in-progress
- [ ] The 110-line inline Python SARIF splitter at lines 79-188 is untouched
- [ ] The 3 `upload-sarif` steps at lines 190-215 are untouched

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `pnpm --dir install` does not create the subdir symlink that `cd && pnpm install` would | Low | Step 1.5 Branch B fires; diagnostic SARIF uploaded | Fallback: change step to `cd tools/learning-loop-mastra && pnpm install --frozen-lockfile`. `--frozen-lockfile` works in subshell because pnpm resolves the lockfile from the workspace root. |
| `--frozen-lockfile` fails because subdir lockfile doesn't match | Very low | CI fails at install step | pnpm workspaces share root lockfile; subdir has no separate lockfile. If it does, drop `--frozen-lockfile` from subdir step only. |
| Upload-artifact step fails on push events (no SARIF generated) | Low | Step fails but `if: failure()` doesn't trigger because other steps succeed | `if-no-files-found: ignore` handles this. Documented in Step 1.2. |
| Both env-drift fix AND SARIF artifact upload are needed long-term, not just diagnostic | Certain | The upload-artifact step is intentionally permanent | Documented in plan § Acceptance Criteria. Out-of-scope for this plan to extract the SARIF splitter (that's the action-swap plan). |
| Inline Python SARIF splitter (lines 79-188) drifts away from fallow 2.102.0 rule taxonomy | Already exists; not changed by this plan | None for this PR | Out of scope; covered by the existing `Drift signal` comment in the splitter (line 130) and the deferred action-swap plan. |

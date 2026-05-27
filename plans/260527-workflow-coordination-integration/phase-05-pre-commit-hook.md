---
phase: 5
title: "Pre-commit Hook"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 5: Pre-commit Hook

## Overview

Install `simple-git-hooks` as a dev dependency and configure a `pre-commit` hook that runs `pnpm validate:records && pnpm extract:index`. This is the commit-time safety net for when the agent forgets to call `workflow_notify_artifact`.

## Requirements

- **Functional:** Before every `git commit`, run validators. If they fail, block the commit.
- **Non-functional:** Zero runtime dependencies for the hook itself; lightweight; one-time setup.

## Related Code Files

- **Modify:** `package.json` (add devDep + `simple-git-hooks` config block)
- **Modify:** `README.md` (document `npx simple-git-hooks` setup step)
- **Read:** `plans/reports/260527-pre-commit-solution-research.md` (full comparison)

## Implementation Steps

1. **Install dev dependency:**
   ```bash
   pnpm add -D simple-git-hooks
   ```

2. **Add config to `package.json`:**
   ```json
   {
     "devDependencies": {
       "simple-git-hooks": "^2.13.1"
     },
     "simple-git-hooks": {
       "pre-commit": "pnpm validate:records && pnpm extract:index"
     }
   }
   ```

3. **Run setup:**
   ```bash
   npx simple-git-hooks
   ```

4. **Document in README:**
   Add a "Development Setup" or "Git Hooks" section:
   ```markdown
   ## Git Hooks

   After cloning, run:
   ```bash
   pnpm install
   npx simple-git-hooks
   ```

   This installs a `pre-commit` hook that validates records and extracts the index before every commit.
   ```

5. **Verify hook works:**
   - Make a trivial change to a `records/**` file.
   - Stage and attempt commit.
   - Verify `pnpm validate:records` runs.
   - If validation fails, commit is blocked.

## Tests

No unit tests for the hook itself — it's a configuration change. Verification via manual test:
1. `git commit --allow-empty -m "test: verify pre-commit hook"` (or with a real staged change).
2. Observe output showing `pnpm validate:records` and `pnpm extract:index`.

## Success Criteria

- [ ] `simple-git-hooks` in `devDependencies`.
- [ ] `package.json` contains `simple-git-hooks` config with `pre-commit` command.
- [ ] `npx simple-git-hooks` successfully creates `.git/hooks/pre-commit`.
- [ ] README documents the setup step.
- [ ] Manual verification: commit triggers validation.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hook not installed by contributor | Low | Document prominently; pre-commit is safety net, not enforcement. CI still validates. |
| Slow commits | Low | `validate:records` + `extract:index` are fast (<5s combined on this repo). |
| Bypassed with `--no-verify` | Low | All git hooks are bypassable; this is expected. CI is the enforcement boundary. |
| Windows compatibility | Low | `simple-git-hooks` generates POSIX shell scripts; Git for Windows bundles `sh.exe`. |

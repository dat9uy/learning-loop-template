---
phase: 5
title: "Cleanup"
status: completed
priority: P2
effort: "15m"
dependencies: [4]
---

# Phase 5: Cleanup

## Overview

Delete `tools/validate-records/simple-yaml-parser.js`. Verify zero remaining imports across the entire repo. Remove temporary baseline/regression artifacts from the plan dir (they served their purpose; they're not commit-worthy).

## Requirements

- Functional: hand-rolled parser file removed.
- Functional: no source file (excluding the deletion itself) references `simple-yaml-parser` after this phase.
- Functional: `pnpm validate:records` and `pnpm check` both still exit 0.
- Non-functional: plan dir contains only the plan/phase docs and the upcoming evidence MD — no leftover regression artifacts.

## Architecture

Three actions in sequence: full-repo grep → delete file → re-run gates → wipe scratch.

## Related Code Files

- Delete: `tools/validate-records/simple-yaml-parser.js`
- Delete: `plans/260512-1410-yaml-parser-library-swap/baseline/` (entire subdir)
- Delete: `plans/260512-1410-yaml-parser-library-swap/regression/` (entire subdir)

## Implementation Steps

1. Full-repo grep: `grep -rn "simple-yaml-parser" --include="*.js" --include="*.ts" --include="*.mjs" --include="*.cjs" .`. Expect zero matches (or only matches inside the file itself, which is about to be deleted).
2. Delete `tools/validate-records/simple-yaml-parser.js`.
3. Re-grep to confirm zero matches anywhere.
4. Run `pnpm validate:records`. Expect exit 0.
5. Run `pnpm check`. Expect exit 0.
6. Remove the baseline + regression subdirs from the plan folder (`rm -rf plans/260512-1410-yaml-parser-library-swap/baseline plans/260512-1410-yaml-parser-library-swap/regression`). They were process artifacts, not deliverables; the diff outcome is what matters and that's captured in the journal.
7. `git status` — review final diff. Expected: `package.json` (deps), `pnpm-lock.yaml` (lockfile), 6 modified caller files (one-line import swaps), 1 deleted parser file, 6 new plan files (plan + 5 phases), 1 modified phase-6 file (still to come).

## Success Criteria

- [ ] `tools/validate-records/simple-yaml-parser.js` no longer exists.
- [ ] `grep -rn simple-yaml-parser .` returns no matches in tracked source files.
- [ ] `pnpm validate:records` exit 0.
- [ ] `pnpm check` exit 0.
- [ ] `plans/260512-1410-yaml-parser-library-swap/baseline/` and `regression/` are gone.

## Risk Assessment

- **Risk**: stray import in a doc snippet (`docs/`, `README.md`, plan files themselves) triggers grep noise. **Acknowledged**: grep `--include=*.js` etc. limits to source files. Plan/doc references to the old parser are fine — they're historical.
- **Risk**: deleting the regression artifacts loses audit trail. **Accepted**: the journal entry (Phase 6) captures the diff outcome. Re-running the regression is a one-command repro from the deleted parser at the pre-swap commit.

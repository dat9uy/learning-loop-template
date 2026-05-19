---
phase: 4
title: "Plans Cleanup and Acceptance"
status: pending
priority: P2
effort: "20m"
dependencies: [3]
---

# Phase 4: Plans Cleanup and Acceptance

## Overview

Mark the machine-extracted-index brainstorm as complete, verify no stale claim-primary references survive in `docs/`, run full validation, and close this plan.

## Context Links

- Brainstorm report: `plans/reports/brainstorm-20260518-machine-extracted-index.md`
- This plan: `plans/260519-2326-docs-canonicalization-machine-extracted-index/plan.md`
- Completed Plan 3: `plans/260519-1558-migration-execution-machine-extracted-index/`
- Validation command: `pnpm check`

## Key Insights

1. The brainstorm report is the persistent record of the design decisions. Marking it “complete” is editorial — it signals to future readers that all four plans were executed.
2. Automated grep is the acceptance gate. Any surviving “claim-first”, “claims first”, or “read claims first” in `docs/` (excluding `docs/journals/`) is a failure.
3. `pnpm check` must pass before the plan can be marked complete.

## Requirements

- Functional: Mark brainstorm complete; run automated stale-reference check; run `pnpm check`.
- Non-functional: No code or schema changes in this phase.

## Related Code Files

- Modify: `plans/reports/brainstorm-20260518-machine-extracted-index.md`
- Modify: `plans/260519-2326-docs-canonicalization-machine-extracted-index/plan.md` (status update)

## Implementation Steps

1. **Baseline validation (before any edits):**
   - Run `pnpm check` on `main` to establish baseline.
   - If baseline fails due to pre-existing issues, fix them before starting Phase 1.

2. **Mark brainstorm complete:**
   - Open `plans/reports/brainstorm-20260518-machine-extracted-index.md`.
   - At the bottom of the file (after the existing “## Unresolved Questions” section), add:
     ```markdown
     ## Completion Status

     - **Plan 1 (Schema + Scaffolding):** Completed 2026-05-19.
     - **Plan 2 (Extraction Tool):** Completed 2026-05-19.
     - **Plan 3 (Migration Execution):** Completed 2026-05-19.
     - **Plan 4 (Deprecation + Docs Canonicalization):** Completed 2026-05-19. See `plans/260519-2326-docs-canonicalization-machine-extracted-index/`.
     ```

3. **Automated stale-reference check:**
   - Run:
     ```bash
     grep -riE "claim[s]?-first|read claims first" docs/ | grep -v journals | grep -v ".git"
     ```
   - If any file is returned (other than journals and historical context sections explicitly preserved in Phase 2), the check fails. Return to the relevant phase and fix.
   - Also run:
     ```bash
     grep -rln "Truth status lives in claims" docs/ | grep -v journals
     ```
   - Any hit = failure.
   - Explicitly verify `docs/record-system-architecture.md:102` was changed from "Claims-first scanning" to "Index-first scanning".

4. **Full validation:**
   - Run `pnpm check`.
   - Run `pnpm extract:index` separately to verify index freshness.
   - Any failure = stop, fix, re-run.

5. **Update this plan's status:**
   - In `plans/260519-2326-docs-canonicalization-machine-extracted-index/plan.md`, change `status: pending` to `status: completed`.
   - Mark all phases as completed in the phases table.

6. **Commit (when operator approves):**
   - Commit message: `docs(plans,philosophy,operator-guide,artifact-reference): canonicalize index-first conventions and mark machine-extracted-index complete`
   - No `chore` or `docs` prefix on `.claude` changes (not applicable here — all changes are in `docs/` and `plans/`).

## Success Criteria

- [ ] Brainstorm report has a “Completion Status” section listing all four plans as completed.
- [ ] Automated grep for `claim-first`, `claims first`, `read claims first`, and `Truth status lives in claims` returns zero hits in `docs/` (excluding `docs/journals/`).
- [ ] `pnpm check` passes with zero failures.
- [ ] This plan's `plan.md` status is `completed`.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Stale-reference check returns false positives in journal files | Exclude `docs/journals/` from the grep; journals are historical and intentionally frozen |
| `pnpm check` fails due to unrelated pre-existing issue | Baseline check runs before Phase 1; if baseline fails, fix before starting |
| Acceptance gate misses stale references because `pnpm check` does not include extraction | Run `pnpm extract:index` as a separate step in the full validation gate |

## Next Steps

- None. This is the terminal phase of the machine-extracted-index work stream.

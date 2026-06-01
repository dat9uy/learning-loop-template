---
phase: 6
title: "Integration"
status: pending
effort: "1h"
dependencies: [5]
---

# Phase 6: Integration

## Overview

Run the full Bridge-2 pipeline against the real codebase. Verify no regressions, update documentation, and confirm the plan is complete.

## Requirements

- Functional: `pnpm test` passes with no regressions
- Functional: `pnpm validate:records` passes on all existing records
- Functional: `pnpm validate:plan-loop` passes on all plans
- Functional: `pnpm extract:index --dry-run` passes (no unexpected changes)
- Functional: `docs/artifact-concepts.md` updated with mapping convention and promotion workflow
- Non-functional: Integration completes in <1 hour

## Integration Steps

1. Run `pnpm test` — verify all tests pass (including new bridge-2 tests)
2. Run `pnpm validate:records` — verify no existing records violate candidate/pending_approval rules
3. Run `pnpm validate:plan-loop` — verify plan frontmatter is valid
4. Run `pnpm extract:index --dry-run` — verify no unexpected index changes
5. Update `docs/artifact-concepts.md`:
   - Add "Candidate-to-Experiment Mapping" section
   - Add "Promotion Workflow" section
   - Update dimension overview table if needed
6. Review `tools/learning-loop-mcp/tools/manifest.json` — confirm `workflow_candidate_to_experiment` is registered
7. Run a quick smoke test: create a synthetic candidate in a tmp dir, call the tool, verify draft output
8. Update `docs/journals/` with a bridge-2 closeout entry

## Success Criteria

- [ ] `pnpm test` passes (including all bridge-2 tests)
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes
- [ ] `pnpm extract:index --dry-run` passes
- [ ] `docs/artifact-concepts.md` updated with mapping convention and promotion workflow
- [ ] `workflow_candidate_to_experiment` visible in `manifest.json`
- [ ] Smoke test produces valid draft experiment
- [ ] Journal entry written

## Risk Assessment

- **Regression in existing tests:** Low — all changes are additive. No existing files are modified except docs and manifest.
- **Manifest merge conflict:** Low — only one new tool entry added.
- **Doc update is incomplete:** Medium — review `artifact-concepts.md` for any stale references to `pending_approval` being produced by extract-index.
- **Smoke test reveals runtime bug:** Medium — fix any issues found during smoke test.

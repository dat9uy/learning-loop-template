---
phase: 4
title: "Acceptance Validation"
status: completed
priority: P1
effort: "30m"
dependencies: [3]
---

# Phase 4: Acceptance Validation

## Overview

Run the full validation pipeline to confirm all existing records still pass, the new schema compiles in AJV, and the empty `records/index/` directory does not break the loader.

## Context Links

- Validation script: `tools/validate-records/validate-records.js`
- Package scripts: `package.json`
- Existing negative fixtures: `fixtures/negative/`

## Key Insights

- `pnpm check` runs `pnpm validate:records && pnpm test`.
- `validate:records` loads all schemas, loads all records from `recordDirs`, runs AJV schema validation, then runs claim verification rules, derived assurance, and negative fixtures.
- Because `records/index/` is empty (only `.gitkeep`), the loader will return no YAML files from that directory. The only risk is a crash if the loader does not handle an empty directory gracefully — but `sortedYamlFiles` already returns `[]` for empty directories.

## Requirements

- Functional:
  - `pnpm validate:records` passes with zero errors on existing records.
  - `pnpm test` passes (existing unit tests for other tools; `validate-records` itself is covered by `pnpm validate:records` and negative fixtures, not unit tests).
  - `pnpm check` passes (the combined command).
- Non-functional:
  - No new negative fixtures needed in this plan (they come in Plan 2 when real index entries exist).

## Related Code Files

- Read for context: `package.json`
- Read for context: `tools/validate-records/validate-records.js`

## Implementation Steps

1. Run `pnpm validate:records`.
2. If any errors, diagnose whether they are caused by Phase 1–3 changes or pre-existing. Fix if caused by changes.
3. Run `pnpm test`.
4. If any test failures, diagnose and fix.
5. Run `pnpm check`.
6. **Update the original brainstorm** `plans/reports/brainstorm-20260518-machine-extracted-index.md`:
   - Under `### Plan 1: Schema + Scaffolding`, append a status block: `**Status:** Completed {date} — decision record authored, claim schema deprecated, index-entry schema created, validator plumbing extended, docs updated.`
   - Under `## Unresolved Questions`, confirm the 3 deferred design points (cross-dimension bullets, supersession detection, frontmatter backfill) remain open and are still deferred to Plan 2.
   - If any decisions made during Plan 1 red-team/validation contradict the brainstorm (e.g., schema filename mapping, bare ID convention), add a brief correction note so Plan 2–4 operators read the updated context.

## Success Criteria

- [ ] `pnpm validate:records` passes with zero errors.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.
- [ ] `plans/reports/brainstorm-20260518-machine-extracted-index.md` updated with Plan 1 completion status and any decision deltas from red-team/validation.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Schema mapping object introduces a subtle AJV compile error | AJV compile happens at load time; any error will surface immediately on `validate:records`. |
| Empty `records/index/` with `.gitkeep` causes loader issues | `sortedYamlFiles` filters by `.yaml`; `.gitkeep` is ignored. Verified by code inspection. |

## Security Considerations

- None.

## Next Steps

- Plan complete. Next plan in sequence: Plan 2 (Extraction Tool), blocked by this plan.
- Post-plan handoff: `/ck:plan red-team` (already runs in `--hard` mode) → `/ck:cook` or end session.

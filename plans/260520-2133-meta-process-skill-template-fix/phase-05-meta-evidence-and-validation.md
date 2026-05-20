---
phase: 5
title: "Meta-Evidence and Validation"
status: completed
priority: P2
effort: "20m"
dependencies: [2, 3, 4]
---

# Phase 5: Meta-Evidence and Validation

## Overview

Capture the four gaps as a light meta-evidence note and run repo validation to ensure no inconsistencies were introduced.

## Requirements

- Functional:
  - Create `records/evidence/meta/skill-template-gap-260520T2133Z.md` documenting the gaps and the fixes applied
  - Run `pnpm validate:records` and `pnpm check`
- Non-functional:
  - Meta-evidence must include `## Trigger` section for future recall
  - No `## Findings` bullets required (this is documentary, not index-extracted)

## Architecture

Record authoring + validation. No code changes.

## Related Code Files

- Create: `records/evidence/meta/skill-template-gap-260520T2133Z.md`
- Read for context: `records/evidence/meta/` (existing meta evidence for style reference)
- Read for context: `docs/operator-guide.md` (Self-Improvement Flow section)

## Implementation Steps

1. Draft meta-evidence content:
   ```markdown
   ---
   capability: meta
   dimension: self-improvement
   scope: skill-template
   validation_status: passed
   ---

   # Skill Template Gap Discovery

   ## Context

   During planning of `260520-2101-fundamental-capability-productization`, four gaps were discovered in the learning-loop skill templates and operator-guide.

   ## Gaps

   1. **Memory dependence**: The planner used injected CLAUDE memory to replicate the gate pattern instead of querying `records/index/`.
   2. **Domain overfit**: `docs/operator-guide.md` contained vnstock-specific examples without a generic gate-addition template.
   3. **Unencoded decisions**: Plan-level decisions (DataFrameEnvelope, gate naming, fetch strategy) were not encoded as `records/decisions/` artifacts.
   4. **Evidence authority violation**: Phase 5 of the plan instructed agent-authored evidence creation without operator confirmation, violating `docs/record-system-architecture.md` and `docs/philosophy.md`.

   ## Fixes Applied

   - Memory prohibition added to `references/learning-loop-rules.md`; project memory deleted.
   - Operator-guide split into generic core + vnstock appendix.
   - `prompt-blueprints-product-build.md` updated with decision-record requirement and operator-only evidence protocol.

   ## Trigger

   - When a new product-build plan is drafted, verify it against this checklist.
   - When adding a new domain to the operator-guide, use the generic template first.
   ```
2. **STOP — operator approval required.** The write gate blocks `records/evidence/**`. Present the drafted content to the operator and request explicit approval to create `records/evidence/meta/skill-template-gap-260520T2133Z.md`. Do not proceed without operator confirmation.
3. Run validation:
   ```bash
   pnpm validate:records
   pnpm check
   ```
4. Verify no new validation errors from the skill file changes.

## Success Criteria

- [ ] Meta-evidence content drafted and presented to operator
- [ ] Operator approval obtained for creating `records/evidence/meta/skill-template-gap-260520T2133Z.md`
- [ ] `pnpm validate:records` passes
- [ ] `pnpm check` passes
- [ ] No new lint or type errors introduced

## Risk Assessment

- **Validation failure from deleted memories**: None — memories are outside the repo and not validated.
- **Meta-evidence without Findings**: Files without `## Findings` are silently skipped by `pnpm extract:index`, which is the intended behavior here.

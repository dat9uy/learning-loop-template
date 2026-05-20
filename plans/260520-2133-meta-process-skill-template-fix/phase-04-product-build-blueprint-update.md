---
phase: 4
title: "Product-Build Blueprint Update"
status: pending
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 4: Product-Build Blueprint Update

## Overview

Update `references/prompt-blueprints-product-build.md` so product-build prompts require decision records for architectural choices and delegate evidence creation to the operator.

## Requirements

- Functional:
  - Pre-build prompt requires decision records for all plan-level architectural decisions
  - Post-build prompt delegates evidence creation to operator (agent may draft, operator authors)
  - Add pre-implementation checklist: "Have all Key Decisions been encoded as `records/decisions/` artifacts?"
- Non-functional:
  - Must align with `docs/record-system-architecture.md` entity roles
  - Must align with `docs/philosophy.md` "Agents Do Not Mutate State"

## Architecture

Skill reference file update. No code changes.

## Related Code Files

- Modify: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`
- Read for context: `docs/record-system-architecture.md`
- Read for context: `docs/philosophy.md`
- Read for context: `plans/260520-2101-fundamental-capability-productization/plan.md` (Key Decisions section)

## Implementation Steps

1. Update `Pre-Build Record Authoring` prompt:
   - Add constraint: "Before any implementation phase, encode all architectural decisions (envelope pattern, gate naming, fetch strategy) as `records/decisions/` artifacts with scoped `decision_effect`."
   - Add constraint: "Do not proceed to implementation until decision records exist for every Key Decision."
2. Update `Skill-Phase Constraint Prompt`:
   - Add: "Allowed scope is bounded by the approved decision record's `decision_effect`. Do not expand beyond allowed actions."
3. Update `Post-Build Verification Prompt`:
   - Replace any agent-authored evidence creation with: "Agent may draft evidence findings; operator must author the evidence file under `records/evidence/`. The write gate blocks agent writes to this path."
   - Add: "Do not update `validation_status` to `passed` without operator confirmation."
4. Add a new section: `## Pre-Implementation Checklist`:
   ```text
   - [ ] All plan Key Decisions have corresponding `records/decisions/` artifacts
   - [ ] Decision records cite source evidence and required gates
   - [ ] No implementation phase proceeds without decision coverage
   - [ ] Evidence creation is delegated to operator; agent drafts only
   ```

## Success Criteria

- [ ] `prompt-blueprints-product-build.md` contains decision-record requirement
- [ ] `prompt-blueprints-product-build.md` contains pre-implementation checklist
- [ ] `prompt-blueprints-product-build.md` delegates evidence creation to operator
- [ ] No agent-authored evidence steps remain in product-build prompts

## Risk Assessment

- **Backward compatibility**: Existing plans that reference the old blueprints are not affected — blueprints are prompt templates, not runtime constraints.
- **Over-constraint**: The checklist may slow down trivial plans. The rule applies to architectural decisions only; naming and formatting choices do not need decision records.

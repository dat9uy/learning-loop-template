---
phase: 3
title: "Skill Workflow Enhancement"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Skill Workflow Enhancement

## Overview

Modify the learning-loop skill to become a gatekeeper. Before producing a prompt, the skill checks resource budget state. If budget exhausted, it refuses to produce a prompt and returns a block signal.

## Requirements

- Functional: skill calls `pnpm check:budget` to get state, gates prompt generation based on tool output; prompts include budget context when relevant
- Non-functional: gating logic is ~20 lines of checks; skill stays focused on prompt shaping with a pre-flight step

## Related Code Files

- Modify: `.claude/skills/learning-loop/SKILL.md`
- Create: `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md`
- Read (for context): `.claude/skills/learning-loop/references/prompt-blueprints.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`

## Implementation Steps

1. Update `SKILL.md` workflow:
   - Add step 2 "Check state" before prompt generation:
     - Call `pnpm check:budget -- --system {system} --resource {resource}` for external systems involved in the task
     - Parse JSON output from tool
     - If exit code 1 (exhausted) → return BLOCKED signal (not a prompt)
     - If `validation_window_active` → return DEFERRED signal with window protocol
     - If `stale` → return WARNING, ask operator to confirm
   - Add step 3 "Gate decision" that routes to block/defer/proceed
   - Update step 4 "Produce constrained prompt":
     - Embed budget context in prompt: current, remaining, hard-stop rules (from tool JSON output)
     - Include "Operator must update budget YAML after this action"

2. Write `prompt-blueprints-state-gated.md`:
   - BLOCKED template: "Budget exhausted. Operator must clear {resource} before proceeding. Current: {current}/{budget}. Last verified: {timestamp}."
   - DEFERRED template: "Validation window active. No state-changing actions until operator confirms. Window opened: {timestamp}."
   - WARNING template: "Budget data is stale ({days} days old). Ask operator to confirm {external_system} state before acting."
   - Constrained prompt template: includes budget section with current state, remaining capacity, hard-stop rules, operator update reminder

3. Update `SKILL.md` "When to Use" section:
   - Add trigger: "before any task involving external systems with irreversible state"

4. Update `references/learning-loop-rules.md`:
   - Add reference to `resource-budget-rules.md` in Source Docs section (if not done in Phase 1)

## Success Criteria

- [ ] Skill workflow includes state-checking step before prompt generation
- [ ] Skill returns BLOCKED signal when budget exhausted (verified by test in Phase 4)
- [ ] Skill returns constrained prompt with budget context when budget available (verified by test in Phase 4)
- [ ] Prompt templates exist for BLOCKED, DEFERRED, WARNING, and constrained states
- [ ] SKILL.md references the new workflow step

## Risk Assessment

- Medium risk: skill workflow change affects all learning-loop invocations
- Mitigation: gating only activates for tasks involving external systems with budget YAML; existing tasks unaffected
- Prompt templates must be clear enough that agents cannot misinterpret block signals as suggestions

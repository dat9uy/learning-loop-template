# Brainstorm: Learning-Loop Skill Coordination with Plan/Cook

**Date:** 2026-05-16
**Status:** Open — design not finalized, continuing next session
**Trigger:** User wants learning-loop to work in harmony with external skills (ck:plan, ck:cook)

---

## Context

### Session Part 1: vnstock Experiment Readiness

Before the coordination discussion, we assessed readiness to restart the vnstock data experiment.

**Findings:**
- State-machine plan (`plans/260516-1200-state-machine-for-irreversible-operations/`) — all 4 phases completed
- Budget: `vnstock_vendor/device_slots` = 1 budget, 0 used, not stale, validation window closed
- `pnpm check:budget` returns exit 0 with `remaining: 1`
- Skill SKILL.md wired with state-gated workflow, prompt blueprints and resource-budget rules in place
- HOME fix already committed (`e5f263a`), venv requests fix committed (`af506ef`)

**Blocker found:** `pnpm check` failed on 2 broken experiment records from the old `260515-vnstock-installer-rewrite` plan:
- `experiment-vnstock-installer-rewrite-validation-20260515T103000Z.yaml`
- `experiment-vnstock-installer-rewrite-validation-20260515T201054Z.yaml`

Both had: missing `observations` field, invalid `status` enum, `source_refs` pointing to archived plan path.

**Resolution:** User chose to delete both records. `pnpm check` passes after deletion (47 records validated, 9 tests pass, 0 failures).

**Conclusion:** vnstock data experiment is ready to restart. Budget available, enforcement in place, validation clean.

---

### Session Part 2: Skill Coordination Problem

**User's intent:** When running `/ck:plan Create a new plan for vnstock data experiment continuation`, the resulting plan should include learning-loop checkpoints. When running `/ck:cook plan.md`, cook should invoke learning-loop at those checkpoints.

**Core issue:** Skills are isolated modules. `/ck:plan` doesn't read `learning-loop/SKILL.md`. `/ck:cook` follows plan steps but doesn't know to invoke specific skills unless the plan tells it to. Context clears between invocations.

**Coordination flow desired:**
```
User → /ck:plan → plan.md (includes learning-loop steps)
User → /ck:cook plan.md → executes steps → invokes learning-loop at checkpoints
```

---

## Approaches Evaluated

### Approach A: Trigger Rule in Learning-Loop (Initially Recommended)

Add 'When to Use' trigger to learning-loop SKILL.md: "Also use when creating plans for tasks involving external systems with irreversible state."

**How it works:**
- Learning-loop intercepts at plan creation time
- Calls `pnpm check:budget`
- Generates plan with budget context in header + `## Required Skill Invocations` table
- Cook reads table and invokes learning-loop at specified phases

**User feedback:** "The plan should be created by ck:plan, we should not inject planning inside the learning-loop skill."

**Verdict:** Rejected — learning-loop should be a checkpoint, not a planner.

### Approach B: Convention in Plan Template

Create `plans/templates/plan.md` with `## Required Skill Invocations` table. Development rules mandate this section for plans with irreversible operations.

**Pros:** Explicit, visible in plan output, works even if plan skill doesn't know about learning-loop.
**Cons:** Requires changes to plan template, cook skill, AND rules. More moving parts.

**Verdict:** Not selected but pattern (declarative skill invocations in plans) is useful.

### Approach C: Cook Intercepts via Rules

Add rules to cook SKILL.md — cook detects external system references in plans and invokes learning-loop before state-changing steps.

**Pros:** Cook is the executor, so it's the right gatekeeper. Budget check at execution time (most relevant).
**Cons:** Fuzzy detection, might miss cases.

**Verdict:** Not selected.

---

## Revised Design (After User Feedback)

User clarified: `/ck:plan` creates the plan. Learning-loop is a **checkpoint** called during planning/cooking, not the planner itself.

**Revised flow:**
```
User: "/ck:plan Create a plan for vnstock data experiment continuation"
  → ck:plan reads project rules (CLAUDE.md / development-rules.md)
  → Rule says: plans with irreversible ops MUST include learning-loop checkpoints
  → ck:plan includes "invoke learning-loop" steps in plan phases

User: "/ck:cook plan.md"
  → cook executes plan
  → Hits "invoke learning-loop" step → calls learning-loop skill
  → learning-loop checks budget, returns state-gated prompt
  → cook continues with that context
```

**Proposed changes:**
1. Project `CLAUDE.md` or `development-rules.md` — rule: plans with irreversible ops must include learning-loop skill invocation steps
2. `learning-loop/SKILL.md` — update workflow: "when invoked as a checkpoint by a plan, check budget and return state-gated prompt or BLOCKED signal"

**User feedback:** Still needs adjustment. User said "Let me explain" but session ended before they could elaborate.

---

## Open Questions

1. **Where should the coordination rule live?**
   - Options: CLAUDE.md, development-rules.md, learning-loop SKILL.md, ck:plan SKILL.md, or somewhere else
   - User rejected CLAUDE.md/development-rules.md in the revised design — needs clarification

2. **What mechanism should learning-loop use as a checkpoint?**
   - Options: skill invocation in plan steps, hook, template section, or something else
   - User said "wrong mechanism for checkpoint" — needs clarification

3. **Should the budget check happen at plan creation time or cook execution time?**
   - Budget state may change between plan creation and execution
   - Execution-time check is more relevant but requires cook to know about learning-loop

4. **How does ck:plan discover the rule?**
   - ck:plan is a global skill in `~/.claude/skills/`
   - Project rules are in project-local CLAUDE.md
   - ck:plan may not read project-specific rules unless told to

5. **Should this be a general pattern or learning-loop specific?**
   - User chose "single skill coordination" but the pattern could generalize
   - `## Required Skill Invocations` table is reusable for any skill coordination

---

## Key Artifacts Referenced

| Artifact | Path | Relevance |
|----------|------|-----------|
| State-machine plan | `plans/260516-1200-state-machine-for-irreversible-operations/plan.md` | Completed — budget enforcement ready |
| Trigger journal | `docs/journals/260515-loop-harness-context-gate-discussion.md` | Documents the incident that motivated state-machine |
| Learning-loop skill | `.claude/skills/learning-loop/SKILL.md` | Core skill that needs coordination |
| Budget checker | `tools/check-budget/check-budget.js` | Tool that learning-loop calls |
| Budget observation | `records/observations/observation-vnstock-resource-budget.yaml` | Current state: 1 slot, 0 used |
| State-gated prompts | `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md` | Templates for budget-constrained tasks |
| Resource budget rules | `.claude/skills/learning-loop/references/resource-budget-rules.md` | Hard constraints for irreversible ops |
| Cook skill | `~/.claude/skills/cook/SKILL.md` | Plan executor that needs to invoke learning-loop |
| Plan skill | `~/.claude/skills/ck-plan/SKILL.md` | Plan creator that needs to include learning-loop steps |

---

## Next Session Action Items

1. User explains their vision for how learning-loop should coordinate with plan/cook
2. Finalize: where the rule lives, what mechanism learning-loop uses, budget check timing
3. Design the concrete changes (files to modify, sections to add)
4. Implement if agreed

---

## Unresolved Questions

- User's preferred mechanism for learning-loop as a checkpoint (not skill invocation in plan steps?)
- Where the coordination rule should live (rejected CLAUDE.md and development-rules.md)
- Whether budget check should happen at plan time or cook time
- How ck:plan discovers project-specific coordination rules

# Re-Write Prompt — Fundamental Capability Productization Plan

Use this prompt in a future session to make the existing plan comply with the updated skill templates.

## Paste This

```
Re-write the plan at `plans/260520-2101-fundamental-capability-productization/` to comply with the updated learning-loop skill templates and operator-guide. Read the existing plan and all phase files first, then read `docs/operator-guide.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`, and `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` to understand the new constraints. Apply the following mandatory fixes:

1. Encode all Key Decisions from the plan's `## Key Decisions` section as `records/decisions/` YAML artifacts before any implementation phase. Each decision must have `decision_effect` with `allowed_actions`, `blocked_actions`, `required_gates`, and `affected_refs`.

2. Replace Phase 5's agent-authored evidence step with operator-only evidence protocol. The agent may draft evidence findings; the operator must author the evidence file under `records/evidence/`. The write gate blocks agent writes to this path.

3. Add a Pre-Implementation Checklist to the plan's front matter or Phase 2 header: verify decision records exist for every Key Decision before backend/frontend implementation begins.

4. Remove any reliance on injected memory for pattern replication. Reference `records/index/` or `records/observations/` instead.

5. Update the `## Next Steps` section to reference the new Pre-Implementation Checklist, not just `/ck:cook`.

After editing, run `pnpm validate:records && pnpm check` to confirm no schema or test failures. Update the plan's `createdBy` and add a note in `## Dependencies` linking to `record:decision-20260517T1200Z-observation-state-check-rule` for observation-first state queries.
```

## Why This Exists

The original plan was drafted before the meta-process template fix (`plans/260520-2133-meta-process-skill-template-fix/`). It violates four gaps that were closed:

- **Memory dependence** — planner used injected CLAUDE memory instead of `records/index/`
- **Unencoded decisions** — Key Decisions stayed in prose, not `records/decisions/`
- **Agent-authored evidence** — Phase 5 instructed agent to write `records/evidence/` without operator confirmation
- **Missing pre-implementation checklist** — no gate requiring decision coverage before code phases

---
phase: 5
title: "Update Documentation & Learning-Loop Skill"
status: completed
priority: P2
effort: "2h"
dependencies: [4]
---

# Phase 5: Update Documentation & Learning-Loop Skill

## Overview

Update all documentation to reflect the collapsed architecture. Rewrite or delete the `learning-loop` skill. Update `CLAUDE.md`, `system-architecture.md`, `charter.md`, `operator-guide.md`, `hooks/README.md`, and `coordination-rules.md`.

## Requirements

- Functional: No documentation references deleted components as live architecture.
- Functional: `CLAUDE.md` accurately describes the new coordination model.
- Functional: The `learning-loop` skill either has a new defined purpose or is deleted.

## Architecture

### Files to Update (Explicit List)

| File | What to Change |
|------|---------------|
| `CLAUDE.md` (root) | Rewrite the "Skill Coordination" section. Remove the coordinator workflow description. Describe the new model: bash gate (commands), write gate (files), inbound gate (operator messages), MCP server (explicit checks). |
| `docs/system-architecture.md` | Rewrite the coordination architecture diagram. Remove skill gate. Show only bash, write, inbound gates + MCP server. |
| `docs/charter.md` | Update the "Coordination profiles" section. Remove references to profiles, registry, and coordinator. Describe domain-aware write gate. |
| `docs/operator-guide.md` | Rewrite the coordinator workflow section (lines 126-165). Remove skill registry table and `.bypass-next` explanation. Document the new domain rules. |
| `.claude/coordination/hooks/README.md` | Remove skill gate section. Update architecture description to 3 hooks + MCP server. Remove profile and `.active-profile` references. |
| `.claude/skills/learning-loop/references/coordination-rules.md` | Delete or rewrite. The coordinator workflow no longer exists. |
| `.claude/skills/learning-loop/SKILL.md` | **Make explicit decision:** either (a) delete the skill directory entirely if it has no role without the coordinator, or (b) rewrite `SKILL.md` to define a new concrete purpose (e.g., "prompt authoring for observation-based checks"). |

### Grep Sweep for Remnant References

```bash
grep -r "skill-registry\|active-profile\|bypass-next\|skill-coordination-gate\|plan-execution\|code-generation" \
  docs/ .claude/skills/ .claude/coordination/ \
  --include="*.md" --include="*.cjs" --include="*.js"
```

- Hits in `docs/journals/` and `plans/` are acceptable historical references.
- Hits in active docs, skills, or code must be updated or removed.

## Related Code Files

- Modify: `CLAUDE.md`
- Modify: `docs/system-architecture.md`
- Modify: `docs/charter.md`
- Modify: `docs/operator-guide.md`
- Modify: `.claude/coordination/hooks/README.md`
- Modify: `.claude/skills/learning-loop/references/coordination-rules.md`
- Modify or Delete: `.claude/skills/learning-loop/SKILL.md`

## Implementation Steps

1. **Update `CLAUDE.md`.**
   - Read the current "Skill Coordination" section.
   - Rewrite to describe the new model:
     - Bash gate: blocks commands matching constraint patterns without active observations or with exhausted budgets.
     - Write gate: blocks file writes based on domain rules (`schemas/**` and `records/observations/**` blocked; `docs/**`, `plans/**`, `product/**`, `tools/**` allowed).
     - Inbound gate: warns when operator state-change messages may have stale observations.
     - MCP server: provides `check_gate` and `record_observation` tools.
   - Remove the `/ck:learning-loop` coordination workflow description.

2. **Update `docs/system-architecture.md`.**
   - Find the coordination architecture diagram.
   - Remove `skill-coordination-gate` from the diagram.
   - Update the outbound gates section to describe only bash, write, and inbound gates.

3. **Update `docs/charter.md`.**
   - Find the "Coordination profiles" section.
   - Rewrite to describe the domain-aware write gate.
   - Remove references to profiles, registry, and coordinator.

4. **Update `docs/operator-guide.md`.**
   - Find the coordinator workflow section (lines 126-165).
   - Remove the skill registry table.
   - Remove `.bypass-next` explanation.
   - Add a section on domain rules: what paths are allowed, what paths are blocked, and why.

5. **Update `hooks/README.md`.**
   - Remove `skill-coordination-gate.cjs` section.
   - Update the architecture description to: bash gate (command safety), write gate (file-domain safety), inbound gate (observation staleness warnings), MCP server (explicit checks).
   - Remove references to `.active-profile` and profiles.

6. **Update or delete `learning-loop` skill.**
   - Read `SKILL.md`.
   - **Decision point:** Does the skill have any purpose without the coordinator?
   - If no: delete the entire `.claude/skills/learning-loop/` directory. Remove the skill from the skills catalog.
   - If yes: rewrite `SKILL.md` with a new, concrete purpose. Update `references/coordination-rules.md` to match.

7. **Run grep sweep.**
   - Execute the grep command above.
   - For each hit outside journals/plans:
     - Determine if it is a legitimate reference (e.g., describing what was deleted) or a stale reference.
     - Update stale references.

8. **Update journal entry with resolution note.**
   - Append to `docs/journals/260520-coordination-gate-misfire-docs-refactor.md`:
     - "Resolution: Plan `260520-0157-coordination-model-collapse` executed. Profile-based model deleted. Write gate now domain-aware. Skill gate, registry, active-profile, and bypass mechanism removed."

## Success Criteria

- [x] `CLAUDE.md` describes the new coordination model with no coordinator workflow references.
- [x] `system-architecture.md` diagram shows only 3 hooks + MCP server.
- [x] `charter.md` has no profile/registry/coordinator references.
- [x] `operator-guide.md` has no `.bypass-next` or skill registry table.
- [x] `hooks/README.md` has no skill gate section or profile references.
- [x] `learning-loop` skill is either deleted or has a new defined purpose in `SKILL.md`.
- [x] Grep sweep shows zero stale references outside journals/plans.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missed stale reference in active docs | Medium | Low | Grep sweep + explicit file list covers all high-impact docs. |
| Deleting `learning-loop` skill breaks something unexpected | Low | Medium | Search for `/ck:learning-loop` invocations in plans/journals before deleting. |

## Next Steps

- Phase 6 runs the full validation suite.

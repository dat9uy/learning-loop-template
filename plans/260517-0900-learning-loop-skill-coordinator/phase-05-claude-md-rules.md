---
phase: 5
title: "CLAUDE.md Rules"
status: pending
priority: P1
effort: "30m"
dependencies: [3, 4]
---

# Phase 5: CLAUDE.md Rules

## Overview

Create a project-local CLAUDE.md with coordination routing rules. The project currently has no CLAUDE.md (only global `~/.claude/CLAUDE.md`). This phase creates the project file.

## Requirements

- Functional: CLAUDE.md instructs Claude to invoke learning-loop when blocked
- Functional: CLAUDE.md explains what the coordination system is
- Functional: routing instructions are clear enough that Claude follows them
- Non-functional: doesn't conflict with global `~/.claude/CLAUDE.md` rules

## Red Team Fixes Applied

| Finding | Fix |
|---------|-----|
| #5 No project CLAUDE.md | Create new file, not modify. Ensure no conflicts with global CLAUDE.md. |

## Related Code Files

- Create: `CLAUDE.md` (project root — new file)
- Read: `~/.claude/CLAUDE.md` (global, to avoid conflicts)

## Implementation Steps

### Step 1: Read global CLAUDE.md for conflict avoidance

Read `~/.claude/CLAUDE.md` to understand existing rules. The project CLAUDE.md must not contradict global rules.

### Step 2: Create project CLAUDE.md

```markdown
# CLAUDE.md — Learning Loop Template

## Skill Coordination

This repo uses a coordination system for external skills. When you invoke a write-capable
skill (e.g., /ck:backend-development, /ck:cook, /ck:deploy) and it gets blocked by the
coordination hook:

1. **Do NOT retry the blocked skill directly.**
2. **Invoke /ck:learning-loop** with:
   - `target=<blocked-skill-name>` (e.g., target=backend-development)
   - Your original intent (what you wanted the skill to do)
3. Learning-loop will check state, build constraints, and return instructions.
4. Follow the returned instructions to invoke the target skill.

Skills NOT in the coordination registry (test, scout, research, code-review, etc.)
bypass coordination and can be invoked directly.

The coordination config lives at `.claude/coordination/`:
- `skill-registry.json` — which skills are gated
- `coordination-config.json` — profiles with write allowlists
```

### Step 3: Verify no conflicts

Compare project CLAUDE.md against global CLAUDE.md. Ensure:
- No contradictory instructions
- Project rules are additive (don't override global rules)
- Coordination section is clearly scoped to this repo

## Success Criteria

- [ ] Project `CLAUDE.md` exists (new file created)
- [ ] Has coordination routing section
- [ ] Routing instructions are clear and actionable
- [ ] No conflicts with global `~/.claude/CLAUDE.md`
- [ ] Read-only skills explicitly excluded from coordination

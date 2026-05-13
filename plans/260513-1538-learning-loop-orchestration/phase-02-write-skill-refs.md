---
phase: 2
title: "Write Skill Reference Files"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Write Skill Reference Files

## Overview

Implement the orchestration blueprints designed in Phase 1 as durable reference files in the learning-loop skill.

## Requirements

- Functional: Write `orchestration-patterns.md` and update `prompt-blueprints.md`.
- Non-functional: All references must be <300 lines. Must pass `pnpm check` if applicable.

## Related Code Files

- Create: `.claude/skills/learning-loop/references/orchestration-patterns.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`

## Implementation Steps

1. **Create `orchestration-patterns.md`** with:
   - Full-Lifecycle Experiment Orchestration Prompt skeleton
   - Post-Experiment Claim Update Prompt skeleton
   - Claim-Evidence Alignment Review Prompt skeleton
   - Promotion rules reference table
   - Multi-experiment synthesis notes
2. **Update `prompt-blueprints.md`**:
   - Add a new section referencing `orchestration-patterns.md`
   - Keep existing blueprints unchanged
   - Add a one-line pointer in the answer format section
3. Validate YAML frontmatter of any code examples inside the blueprints.
4. Run `pnpm check` to ensure no repo-wide breakage.

## Success Criteria

- [ ] `orchestration-patterns.md` exists and is readable.
- [ ] `prompt-blueprints.md` updated with pointer.
- [ ] All reference files <300 lines.
- [ ] No broken `local:` or `record:` refs in examples.

## Risk Assessment

- **Risk:** Writing references that are too long (>300 lines).
  - Mitigation: Split into multiple reference files if needed.

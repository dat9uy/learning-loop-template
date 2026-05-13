---
phase: 3
title: "Update SKILL.md and Add Evals"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Update SKILL.md and Add Evals

## Overview

Update the skill's entry point (`SKILL.md`) to recognize full-lifecycle orchestration as a first-class task type. Add eval cases to quantitatively validate the new capability.

## Requirements

- Functional: Update SKILL.md workflow classification and references. Add eval cases.
- Non-functional: Description stays ≤1024 chars. SKILL.md stays <300 lines.

## Related Code Files

- Modify: `.claude/skills/learning-loop/SKILL.md`
- Modify: `.claude/skills/learning-loop/evals/evals.json`

## Implementation Steps

1. **Update SKILL.md**:
   - Add "full-lifecycle orchestration" as the 9th task class in Workflow step 1.
   - Update the `When to Use` section with an orchestration trigger example.
   - Add `references/orchestration-patterns.md` to the References list.
2. **Update `evals.json`**:
   - Add eval case: "I have a draft experiment and a claim. How do I run the experiment and update the claim if it succeeds?"
   - Assertions should check:
     - Recommends reading claim + evidence first
     - Produces an experiment plan
     - Gates execution behind approval
     - Captures results into experiment record
     - Uses claim-evidence alignment review before update
     - Constructs `pnpm verify:claim` command
     - Runs `pnpm validate:records && pnpm check`
3. Run evals locally if eval infrastructure is ready.

## Success Criteria

- [ ] SKILL.md updated with orchestration task class.
- [ ] Eval case added to `evals.json`.
- [ ] SKILL.md <300 lines.
- [ ] Description ≤1024 chars.

## Risk Assessment

- **Risk:** SKILL.md grows past 300 lines.
  - Mitigation: Move detailed orchestration content to `orchestration-patterns.md`; keep SKILL.md as a pointer.

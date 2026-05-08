---
phase: 3
title: "Refresh Learning-Loop Skill"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 3: Refresh Learning-Loop Skill

## Overview

Update the learning-loop skill to encode the dimension-based model. This is the primary self-improvement interface — agents use these prompts to interact with the loop. Accuracy here determines whether the loop improves itself correctly.

## Requirements

- Remove all references to linear lifecycle states
- Add dimension-based rules (`static`, `install`, `runtime`, `product`)
- Update prompt blueprints to reference `claimed`/`verified`/`rejected`
- Update SKILL.md workflow description
- Add self-improvement gap detection: old-state references trigger meta-evidence

## Architecture

### Skill File Changes

| File | Change |
|------|--------|
| `references/learning-loop-rules.md` | Replace lifecycle state list with dimension rules |
| `references/prompt-blueprints.md` | Update all prompts: no states, use dimensions |
| `SKILL.md` | Update workflow steps and prompt requirements |

### Key Rule Updates

Old:
> Allowed claim lifecycle states include: `imported-prior`, `evidence-reviewed`, `static-verified`, `install-verified`, `runtime-verified`, `product-approved`, `rejected`

New:
> Claims assert verification dimensions: `static`, `install`, `runtime`, `product`. Each dimension has status `claimed`, `verified`, or `rejected`. Experiments prove dimensions via `verification.proves`. Decisions approve `product` dimension.

### Prompt Blueprint Updates

- Generic prompt: replace lifecycle promotion limits with dimension proof limits
- Runtime/install prompt: reference `dimension: install` or `dimension: runtime` with scope
- Experiment planning prompt: reference `proves` block, not `assurance_level`

## Related Code Files

- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Modify: `.claude/skills/learning-loop/SKILL.md`

## Implementation Steps

1. Read current skill files
2. Rewrite `learning-loop-rules.md` — dimension rules, no state list
3. Rewrite `prompt-blueprints.md` — update all 4 prompt templates
4. Rewrite `SKILL.md` — update workflow description
5. Verify no old-state references remain (grep for `imported-prior`, `evidence-reviewed`, etc.)

## Success Criteria

- [ ] No references to old lifecycle states in skill files
- [ ] Prompt blueprints generate dimension-aware prompts
- [ ] SKILL.md workflow references `verification.proves` not `assurance_level`
- [ ] Self-improvement gap detection documented in meta-evidence rules

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Skill generates invalid prompts before other phases complete | Phase 3 runs in parallel with Phases 2+4; coordinate via plan |
| Agents confused by dimension model vs old state model | Clear examples in prompt blueprints |

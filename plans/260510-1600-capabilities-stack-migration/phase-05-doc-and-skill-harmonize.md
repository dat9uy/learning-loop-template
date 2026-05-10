---
phase: 5
title: "Doc and Skill Harmonize"
status: pending
priority: P1
effort: "4h"
dependencies: [4]
---

# Phase 5: Doc and Skill Harmonize

## Overview

Update living docs, skill files, `.gitignore`, and `product/README.md` to reflect the per-stack capability layout. Author the new `references/prompt-blueprints-product-build.md` file.

## Requirements

- Functional: All living docs reference `product/<stack>/capabilities/`. No living doc references `product/capabilities/`.
- Non-functional: Frozen records and journals untouched. Qualified terminology throughout.

## Related Code Files

- Modify: `docs/operator-guide.md`
- Modify: `docs/claim-verification.md`
- Modify: `docs/lab-model.md`
- Modify: `docs/knowledge-pack-contract.md`
- Modify: `docs/handoff.md`
- Modify: `product/README.md`
- Modify: `.gitignore`
- Modify: `.claude/skills/learning-loop/SKILL.md`
- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Create: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`

## Implementation Steps

1. Update `docs/operator-guide.md`:
   - Line 27-29: Add capability-record-only `local:product/<stack>/capabilities/...` exception to source_refs section.
   - Line 152, 157: Replace `product/capabilities/<scope>/` and environment-model paragraph with `product/<stack>/capabilities/<scope>/` + per-stack environment model.
   - Add new section "Stacks and Capability Locations" with locked terminology table and allowlist rule.
2. Update `docs/claim-verification.md` line 83: Update capability-script path.
3. Update `docs/lab-model.md` line 34: Update path in pipeline diagram.
4. Update `docs/knowledge-pack-contract.md` line 54: Update path.
5. Update `docs/handoff.md` line 26, 38: Update path; add migration date pointer for readers consulting frozen records.
6. Rewrite `product/README.md`: workspace framing (not shared environment). One-paragraph pointer to `docs/operator-guide.md`.
7. Update `.gitignore` (if not done in phase 04).
8. Update `.claude/skills/learning-loop/SKILL.md`:
   - Qualify all "capability" mentions.
   - Update path references to `product/<stack>/capabilities/`.
   - Add `product-build` task class entry.
9. Update `.claude/skills/learning-loop/references/learning-loop-rules.md`:
   - Same qualified-term harmonization.
   - Update path references.
10. Update `.claude/skills/learning-loop/references/prompt-blueprints.md`:
    - Update path references.
    - Qualify terminology.
11. Create `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`:
    - Three blueprint skeletons per sibling brainstorm "learning-loop skill extension" section:
      1. Pre-build record-authoring prompt.
      2. Skill-phase constraint prompt.
      3. Post-build verification prompt.
    - Must use qualified terms and lock the capability-record source-ref pattern.
12. Run grep audit: `grep -rn "product/capabilities" docs/ .claude/ product/README.md` must return zero matches.
13. Run `pnpm validate:records` and `pnpm check`.

## Prompt Block (Loop + Code)

```text
Task: Harmonize living docs and skill files for the per-stack capability layout.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- docs/operator-guide.md
- docs/claim-verification.md
- docs/lab-model.md
- docs/knowledge-pack-contract.md
- docs/handoff.md
- product/README.md
- .claude/skills/learning-loop/SKILL.md
- .claude/skills/learning-loop/references/learning-loop-rules.md
- .claude/skills/learning-loop/references/prompt-blueprints.md
- plans/reports/brainstorm-20260510-capabilities-stack-migration.md (Doc updates table)
- plans/reports/brainstorm-20260510-external-skills-integration.md (learning-loop skill extension section)

Goal:
- Update all living docs to reference product/<stack>/capabilities/.
- Rewrite product/README.md to workspace framing.
- Update skill files with qualified terminology and new paths.
- Create references/prompt-blueprints-product-build.md.

Constraints:
- Do not edit frozen historical records or journals.
- Use qualified terminology: capability script, capability record, Capability Runtime Experiment.
- No bare "capability" or "user" language.

Validation:
- Run grep -rn "product/capabilities" docs/ .claude/ product/README.md (must be empty).
- Run pnpm validate:records.
- Run pnpm check.

Report:
- Files modified.
- grep audit result.
- Any remaining stale references.
```

## Success Criteria

- Process: 13/13 steps complete.
- Experiment outcome: `supports` (docs and skill are consistent with new layout).
- `grep -rn "product/capabilities" docs/ .claude/ product/README.md` returns zero matches.
- `pnpm validate:records` passes.
- `pnpm check` passes.

## Risk Assessment

- Risk: grep audit misses a reference in an unexpected file. Mitigation: also run `grep -rn "product/capabilities" . --include="*.md"` as broader sweep.
- Risk: skill file edits introduce terminology drift. Mitigation: review diff before commit; qualified terms only.

## Approval Gate

None. This phase edits docs and skill only; no filesystem mutation outside text files.

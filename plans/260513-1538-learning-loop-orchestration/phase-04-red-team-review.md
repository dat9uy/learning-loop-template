---
phase: 4
title: "Red Team Review of Skill Changes"
status: pending
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 6: Red Team Review of Skill Changes

## Overview

Adversarial review of the new orchestration blueprints. Hostile reviewers attempt to find gaps, ambiguities, or ways the new prompts could cause agents to bypass approval gates, leak data, or update claims incorrectly.

## Requirements

- Functional: Identify at least 3 potential failure modes in the new blueprints.
- Non-functional: Review stays focused on skill safety; does not re-review the vnstock experiment.

## Related Code Files

- Read: `.claude/skills/learning-loop/references/orchestration-patterns.md`
- Read: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Read: `.claude/skills/learning-loop/SKILL.md`

## Implementation Steps

1. **Spawn red team reviewers** (hostile personas):
   - Reviewer A: "Approval bypass attacker" — looks for ways the orchestration prompt lets an agent skip human approval.
   - Reviewer B: "Data exfil attacker" — looks for ways the prompt could lead to credential capture or raw data retention.
   - Reviewer C: "Claim corruption attacker" — looks for ways an agent could incorrectly promote a claim dimension without sufficient proof.
2. **Run structured review**:
   - Each reviewer reads the new blueprints and writes findings.
   - Findings classified: `critical` (blocks release), `warning` (should fix), `observation` (nice to have).
3. **Synthesize and fix**:
   - Address all `critical` findings.
   - Address `warning` findings or document as accepted risk.
   - Update blueprints with fixes.
   - Re-run `pnpm check` after any edits.
4. **Document residual risk**:
   - If any finding is accepted rather than fixed, document in skill notes or meta evidence.

## Success Criteria

- [ ] At least 3 failure modes identified.
- [ ] All critical findings addressed.
- [ ] Blueprints updated with fixes.
- [ ] No `pnpm check` regressions.
- [ ] Residual risks documented.

## Risk Assessment

- **Risk:** Red team finds a critical gap that requires redesigning a blueprint.
  - Mitigation: This is the point of red team. If found, loop back to Phase 2.
- **Risk:** Red team scope creeps into re-reviewing the vnstock experiment.
  - Mitigation: Explicitly scope red team to skill blueprints only. The experiment will use existing approved gates.

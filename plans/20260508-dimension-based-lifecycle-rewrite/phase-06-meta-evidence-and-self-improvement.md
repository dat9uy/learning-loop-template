---
phase: 6
title: "Meta-Evidence and Self-Improvement"
status: completed
priority: P2
effort: "2h"
dependencies: [5]
---

# Phase 6: Meta-Evidence and Self-Improvement

## Overview

Document this architecture change as a loop self-improvement case. Create meta evidence, risk, and decision records that demonstrate the loop eating its own dog food.

## Requirements

- Meta evidence file explaining why the linear model failed and dimension model was chosen
- Meta risk record capturing residual exposure from the transition
- Meta decision record approving the dimension model
- Update `meta-evidence-self-improvement.md` with dimension-model gap detection patterns

## Architecture

### Meta Evidence

```
records/evidence/meta/dimension-based-lifecycle-rationale.md
```

Content:
- Problem: linear lifecycle too rigid, runtime-verified overloaded
- Analysis: 4 approaches evaluated
- Decision: Option C (dimension-based)
- Trade-offs: schema migration cost vs long-term extensibility
- Revisit trigger: if dimensions grow beyond 6, reconsider abstraction

### Meta Risk

```
records/risks/risk-20260508-loop-dimension-model-transition.yaml
```

Content:
- Risk: agents using old skill generate invalid prompts
- Severity: medium
- Mitigation: skill refreshed in Phase 3
- Residual: old docs/external references may persist

### Meta Decision

```
records/decisions/decision-20260508-loop-dimension-model.yaml
```

Content:
- Approves dimension-based verification model
- Scope: all claims, experiments, decisions
- Boundaries: 4 dimensions max until revisit
- Blocked: adding new dimensions without meta-evidence

### Skill Update

Update `references/meta-evidence-self-improvement.md`:
- Add pattern: "prompt references old lifecycle state" → meta-evidence trigger
- Add pattern: "agent conflates sandbox and production scope" → meta-evidence trigger

## Related Code Files

- Create: `records/evidence/meta/dimension-based-lifecycle-rationale.md`
- Create: `records/risks/risk-20260508-loop-dimension-model-transition.yaml`
- Create: `records/decisions/decision-20260508-loop-dimension-model.yaml`
- Modify: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`

## Implementation Steps

1. Read current meta-evidence rules
2. Write meta evidence rationale
3. Write meta risk record
4. Write meta decision record
5. Update meta-evidence-self-improvement.md with dimension-model gap patterns
6. Run `pnpm validate:records` and `pnpm check`

## Success Criteria

- [ ] Meta evidence explains the architecture change
- [ ] Meta risk captures residual exposure
- [ ] Meta decision approves the model with boundaries
- [ ] Skill self-improvement reference includes dimension-model gap detection
- [ ] All meta records pass validation

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Meta records drift from actual implementation | Write after Phase 5, reference actual files |
| Over-documenting minor change | Keep concise; reference brainstorm report for detail |

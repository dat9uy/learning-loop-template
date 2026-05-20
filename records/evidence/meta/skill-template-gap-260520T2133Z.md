---
capability: meta
dimension: static
scope: skill-template
validation_status: passed
---

# Skill Template Gap Discovery

## Context

During planning of `260520-2101-fundamental-capability-productization`, four gaps were discovered in the learning-loop skill templates and operator-guide.

## Gaps

1. **Memory dependence**: The planner used injected CLAUDE memory to replicate the gate pattern instead of querying `records/index/`.
2. **Domain overfit**: `docs/operator-guide.md` contained vnstock-specific examples without a generic gate-addition template.
3. **Unencoded decisions**: Plan-level decisions (DataFrameEnvelope, gate naming, fetch strategy) were not encoded as `records/decisions/` artifacts.
4. **Evidence authority violation**: Phase 5 of the plan instructed agent-authored evidence creation without operator confirmation, violating `docs/record-system-architecture.md` and `docs/philosophy.md`.

## Fixes Applied

- Memory prohibition added to `references/learning-loop-rules.md`; project memory deleted.
- Operator-guide split into generic core + vnstock appendix.
- `prompt-blueprints-product-build.md` updated with decision-record requirement and operator-only evidence protocol.

## Trigger

- When a new product-build plan is drafted, verify it against this checklist.
- When adding a new domain to the operator-guide, use the generic template first.

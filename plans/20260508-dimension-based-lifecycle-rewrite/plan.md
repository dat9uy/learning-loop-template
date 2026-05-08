---
title: "Dimension-Based Claim Verification Lifecycle Rewrite"
description: "Replace linear claim lifecycle states with independent per-dimension verification. Refresh learning-loop skill as first-class self-improving artifact."
status: completed
priority: P1
branch: "main"
tags: [lifecycle, schema, skill, self-improvement]
blockedBy: []
blocks: []
created: "2026-05-08T07:16:52.291Z"
createdBy: "ck:plan"
source: skill
---

# Dimension-Based Claim Verification Lifecycle Rewrite

## Overview

Replace the linear claim lifecycle (`imported-prior` → `evidence-reviewed` → `static-verified` → `install-verified` → `runtime-verified` → `product-approved`) with a dimension-based model where each claim asserts independent dimensions (`static`, `install`, `runtime`, `product`), each moving from `claimed` → `verified` or `rejected` via experiment proof.

The learning-loop skill is refreshed first as the primary self-improvement interface.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Design Schemas](./phase-01-design-schemas.md) | Completed | 2h | P1 |
| 2 | [Rewrite Validation Tools](./phase-02-rewrite-validation-tools.md) | Completed | 4h | P1 |
| 3 | [Refresh Learning-Loop Skill](./phase-03-refresh-learning-loop-skill.md) | Completed | 3h | P1 |
| 4 | [Rewrite Documentation](./phase-04-rewrite-documentation.md) | Completed | 3h | P2 |
| 5 | [Rewrite Fixtures and Validate](./phase-05-rewrite-fixtures-and-validate.md) | Completed | 3h | P1 |
| 6 | [Meta-Evidence and Self-Improvement](./phase-06-meta-evidence-and-self-improvement.md) | Completed | 2h | P2 |

## Dependencies

```
Phase 1 (Schemas)
  ├──→ Phase 2 (Validation Tools)
  ├──→ Phase 3 (Skill Refresh)
  └──→ Phase 4 (Docs)

Phase 2 (Tools)
  └──→ Phase 5 (Fixtures)

Phase 5 (Fixtures)
  └──→ Phase 6 (Meta-Evidence)
```

## Key Decisions

- **No backward compatibility**: No production records exist. Breaking change is acceptable.
- **Skill-first**: Learning-loop skill refreshed before docs to ensure agents generate correct prompts immediately.
- **Dimension model**: `static`, `install`, `runtime`, `product` as independent per-claim verification axes.
- **Experiment `proves` block**: Replaces `assurance_level` and `from_state`/`to_state`.
- **Product dimension uses decisions**: Not experiment proofs.

## Success Criteria

- [x] `pnpm check` passes with new fixtures
- [x] No references to old lifecycle states remain in active code/docs/fixtures/skill sources
- [x] Skill prompts reference dimensions, not linear states
- [x] Meta-evidence documents the architecture change as self-improvement

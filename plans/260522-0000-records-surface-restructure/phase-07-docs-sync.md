---
phase: 7
title: "Documentation & Blueprint Sync"
status: pending
priority: P2
effort: "20m"
dependencies: [6]
---

# Phase 7: Documentation & Blueprint Sync

## Overview

Update all documentation and skill blueprints that reference flat `records/` paths. This phase is purely documentation — no code or record changes.

## Requirements

- Functional: All docs with hardcoded flat paths updated to surface-first.
- Functional: Skill blueprints updated so agents produce correct paths.

## Related Code Files

- Modify: `README.md` — update `records/` path references
- Modify: `docs/artifact-concepts.md` — update path references
- Modify: `docs/record-system-architecture.md` — update path references
- Modify: `docs/operator-guide.md` — update path references
- Modify: `docs/operator-guide-vnstock-appendix.md` — update path references
- Modify: `docs/philosophy.md` — update path references
- Modify: `docs/red-team-review.md` — update path references
- Modify: `docs/trajectory.md` — update path references
- Modify: `docs/charter.md` — update path references
- Modify: `docs/system-architecture.md` — update path references
- Modify: `.claude/skills/learning-loop/references/orchestration-patterns.md` — update path examples
- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md` — update path examples
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` — update path examples
- Modify: `.claude/skills/learning-loop/references/context-retrieval-patterns.md` — update path examples
- Modify: `.claude/skills/learning-loop/references/resource-budget-rules.md` — update path examples

## Implementation Steps

1. Grep all docs, blueprints, tools, and coordination configs for flat path patterns:
   ```bash
   grep -rn "records/evidence/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/experiments/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/decisions/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/index/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/capabilities/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/claims/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/risks/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   grep -rn "records/observations/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/
   ```

2. Update each reference to use surface-first examples. Use `<surface>` placeholder where generic.

3. Update `README.md` lanes table:
   - `records/` → keep, but note surface-first structure
   - `records/observations/` → keep (flat exception)

4. Update `docs/operator-guide.md` record type table:
   - `records/decisions/` → `records/<surface>/decisions/`
   - `records/experiments/` → `records/<surface>/experiments/`
   - `records/evidence/<domain>/` → `records/<surface>/evidence/`
   - `records/index/` → `records/<surface>/index/`
   - `records/capabilities/` → `records/<surface>/capabilities/`
   - `records/claims/` → `records/<surface>/claims/`
   - `records/risks/` → `records/<surface>/risks/`

5. Update skill blueprints to use surface-first paths in examples.

## Tests Before

- None. Documentation phase.

## Refactor

- Path reference updates only.

## Tests After

- Grep again across all scopes to confirm no stale flat path references remain (except in historical context or where `records/observations/` is correct).

## Success Criteria

- [ ] `README.md` updated
- [ ] `docs/artifact-concepts.md` updated
- [ ] `docs/record-system-architecture.md` updated
- [ ] `docs/operator-guide.md` updated
- [ ] `docs/operator-guide-vnstock-appendix.md` updated
- [ ] `docs/philosophy.md` updated
- [ ] `docs/red-team-review.md` updated
- [ ] `docs/trajectory.md` updated
- [ ] `docs/charter.md` updated
- [ ] `docs/system-architecture.md` updated
- [ ] All skill blueprint `.md` files updated
- [ ] Grep for flat paths across `docs/`, `tools/`, `.claude/skills/`, `.claude/coordination/` returns only expected matches (observations, historical references)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Missed doc reference | Systematic grep sweep in step 1 and 5 across all scopes |
| Over-updating historical references | Only update paths that instruct current behavior, not historical examples |

## Regression Gate

```bash
grep -rn "records/evidence/\|records/experiments/\|records/decisions/\|records/index/\|records/capabilities/\|records/claims/\|records/risks/" docs/ .claude/skills/learning-loop/references/ tools/ .claude/coordination/ | grep -v "records/observations/" | grep -v "records/<surface>/" | grep -v "historical\|legacy\|before migration"
```

This should return zero matches.

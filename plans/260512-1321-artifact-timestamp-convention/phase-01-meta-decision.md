---
phase: 1
title: "Meta Decision"
status: completed
priority: P2
effort: "15m"
dependencies: []
---

# Phase 1: Meta Decision

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-1310-artifact-timestamp-unification.md`
- Meta-evidence self-improvement doc: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Prospective convention policy: `record:decision-20260509T192449Z-prospective-convention-application`

## Overview

Create a meta-decision YAML that pins the unified timestamp convention for artifact filenames.

## Requirements

- `id` matches filename stem
- `status: draft` (operator review required for approval)
- `question` asks: what is the unified filename timestamp convention?
- `decision` specifies `YYMMDDTmmZ` for event-like artifacts, no timestamp for state-like artifacts
- `rationale` cites the format audit from the brainstorm report
- `alternatives` lists: full ISO datetime (rejected, too long), date-only (rejected, collision-prone), timestamp everything (rejected, breaks claim/cap semantic identity)
- `tradeoffs` notes: 70-year horizon for short-year format; pre-convention files remain untouched
- `decision_effect` scopes to meta-evidence and docs updates only

## Related Code Files

- Create: `records/decisions/decision-260512T1321Z-artifact-timestamp-convention.yaml`

## Implementation Steps

1. Read `schemas/decision.schema.json` to confirm required fields.
2. Author the decision YAML with all required fields.
3. Ensure `source_refs` cites the brainstorm report and the prospective-convention-application decision.
4. Ensure `affected_refs` lists the docs files to be updated in Phase 2.

## Success Criteria

- [ ] Decision YAML exists and passes schema validation
- [ ] `id` matches filename stem
- [ ] `source_refs` cites brainstorm report
- [ ] `decision_effect.boundaries.allowed_actions` includes doc updates and validator changes
- [ ] `decision_effect.boundaries.blocked_actions` includes retroactive renames

## Risk Assessment

- **Risk:** Decision schema `scope` enum lacks a `meta` value.
  **Mitigation:** Use `schema-improvement` and document deviation in `notes`.

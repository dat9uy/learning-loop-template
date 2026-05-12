---
status: pending
title: "Artifact Timestamp Convention"
priority: P2
effort: "45m"
dependencies: []
---

# Artifact Timestamp Convention

## Context

- Brainstorm report: `plans/reports/brainstorm-260512-1310-artifact-timestamp-unification.md`
- Driving need: unify timestamp formats across learning-loop artifact filenames

## Phases

| Phase | Status | File | Description |
|---|---|---|---|
| 1 | completed | [phase-01-meta-decision.md](phase-01-meta-decision.md) | Create meta-decision YAML pinning the convention |
| 2 | completed | [phase-02-doc-updates.md](phase-02-doc-updates.md) | Update meta-evidence-self-improvement.md and operator-guide.md |
| 3 | completed | [phase-03-validator-warning.md](phase-03-validator-warning.md) | Add filename-pattern warning to validate-records |
| 4 | completed | [phase-04-validation-gates.md](phase-04-validation-gates.md) | Run pnpm validate:records and pnpm check |

## Key Decisions

- Format: `YYMMDDTmmZ` (short-year compact, 13 chars, UTC)
- Timestamped: decisions, experiments, risks, domain evidence MDs
- Not timestamped: claims, capabilities, meta-evidence MDs
- Enforcement: validator warning (medium), not blocking error
- Migration: prospective only; existing files unchanged

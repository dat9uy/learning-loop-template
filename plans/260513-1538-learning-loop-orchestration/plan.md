---
title: "Learning-Loop Skill Orchestration Enhancement + Vnstock One-Liner Experiment"
description: "Add full-lifecycle experiment orchestration capabilities to the learning-loop skill, then use the enhanced skill to execute the vnstock vendor one-liner experiment and update claims."
status: completed
priority: P1
branch: "main"
tags: [learning-loop, skill, orchestration, vnstock, experiment]
blockedBy: []
blocks: []
created: "2026-05-13T15:38:05Z"
createdBy: "ck:plan"
source: skill
---

# Learning-Loop Skill Orchestration Enhancement + Vnstock One-Liner Experiment

## Overview

The `learning-loop` skill is a prompt factory with 4 blueprints (generic, runtime proof, experiment planning, migration). It cannot yet orchestrate the full lifecycle: read evidence → plan experiment → execute → capture results → validate claim-evidence alignment → update claim → run validation. This plan adds that orchestration capability, then immediately uses it to run the draft vnstock vendor one-liner experiment.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Design Orchestration Blueprints](./phase-01-design-blueprints.md) | pending |
| 2 | [Write Skill Reference Files](./phase-02-write-skill-refs.md) | pending |
| 3 | [Update SKILL.md and Add Evals](./phase-03-update-skill-and-evals.md) | pending |
| 4 | [Red Team Review of Skill Changes](./phase-04-red-team-review.md) | pending |
| 5 | [Execute Vnstock One-Liner Experiment](./phase-05-execute-vnstock-experiment.md) | pending |
| 6 | [Post-Experiment Claim Update and Validation](./phase-06-post-experiment-update.md) | pending |

## Dependencies

```
Phase 1 (Design)
  └──→ Phase 2 (Write References)

Phase 2 (Write References)
  └──→ Phase 3 (Update SKILL.md + Evals)

Phase 3 (Skill Update)
  └──→ Phase 4 (Red Team Review)

Phase 4 (Red Team Review)
  └──→ Phase 5 (Execute Experiment)

Phase 5 (Experiment)
  └──→ Phase 6 (Claim Update + Validation)
```

## Key Decisions

- **Scope:** One plan covers both skill enhancement and experiment execution. The skill changes are the minimum viable set to orchestrate the vnstock experiment.
- **Skill location:** `.claude/skills/learning-loop/` (project scope, not global).
- **Experiment scope:** Sandbox install only. `metadata-only` output. Fresh Docker containers.
- **Claim target:** `claim-vnstock-install-sandbox` is the only claim updated by this plan.
- **Red team:** Applied to skill blueprints BEFORE using them to orchestrate the experiment. Experiment uses existing approved gates.

## Success Criteria

- [ ] New orchestration reference file exists and passes skill validation
- [ ] SKILL.md updated with full-lifecycle task classification
- [ ] Evals cover the orchestration prompt
- [ ] Draft experiment executed with result captured
- [ ] Claim updated via `pnpm verify:claim` with correct proof refs
- [ ] `pnpm validate:records` and `pnpm check` pass
- [ ] Temp directories deleted, cleanup confirmed
- [ ] Red team review produces actionable findings (or clean pass)

## Blocked Actions

- Do not promote product dimension of any claim.
- Do not modify `product/api/scripts/install-vnstock.sh` unless experiment proves venv-path hypothesis.
- Do not create new decision records.
- Do not capture raw external data, credentials, or config contents.

## Source

- Brainstorm: `plans/reports/brainstorm-260510-1706-vnstock-installer-bootstrap.md` (superseded by later records)
- Research reports: Background tasks `agent-c6kxofks` (skill gaps) and `agent-wst1q5la` (vnstock state)
- Driving evidence: `records/evidence/vnstock-data/vendor-installation-troubleshooting-guide.md`
- Driving evidence: `records/evidence/vnstock-data/vendor-dockerfile-sample.md`
- Draft experiment: `records/experiments/experiment-vnstock-install-vendor-one-liner-20260513T213042Z.yaml`

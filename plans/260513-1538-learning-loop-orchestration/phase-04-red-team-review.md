---
phase: 4
title: "Red Team Review of Skill Changes"
status: completed
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 4: Red Team Review of Skill Changes

## Overview

Adversarial review of the new orchestration blueprints.

## Reviewers

- Reviewer A: Approval bypass attacker
- Reviewer B: Data exfil attacker
- Reviewer C: Claim corruption attacker

## Findings

### Critical

| ID | Finding | Location | Fix |
|---|---|---|---|
| C1 | Approval language was policy-oriented ("Approval required before") rather than imperative; an agent could interpret it as informative and proceed without explicit approval. | Full-Lifecycle prompt | Changed to "STOP and request explicit human approval before..." with explicit "If the user has not given explicit bounded approval for the exact gate, do not proceed." |
| C2 | Alignment review did not verify experiment status was reviewed/approved before promotion, allowing a draft experiment to update a claim. | Claim-Evidence Alignment Review | Added check: "Experiment status: status is reviewed or approved before promotion." |

### Warning

| ID | Finding | Location | Fix |
|---|---|---|---|
| W1 | Orchestration prompt delegated execution to Runtime Proof Prompt but did not explicitly remind agents not to echo credential env vars inside containers. | Full-Lifecycle prompt Phase 2 | Added: "Do not echo, log, or capture environment variables that carry credentials or API keys inside the runtime substrate." |

### Observation

| ID | Finding | Risk Level | Note |
|---|---|---|---|
| O1 | Multi-experiment synthesis rule relies on agent compliance; no mechanical guard prevents an agent from ignoring conflicting experiments. | Low | Acceptable. The verify:claim tool validates proof refs exist but does not enforce synthesis logic. Operator review is the backstop. |
| O2 | The orchestration prompt chains multiple sub-prompts. A confused agent might skip the alignment review and jump directly to claim update. | Low | Mitigated by explicit numbered phases and "delegated to Claim-Evidence Alignment Review Prompt" language. The verify:claim dry-run step provides a second gate. |

## Residual Risk

- **O1 (accepted):** Multi-experiment synthesis remains agent-dependent. If conflicting experiments become common, a future plan should add a validator or decision record gate.
- **O2 (accepted):** Phase skipping is a general prompt-composition risk, not unique to orchestration. Existing dry-run gates limit blast radius.

## Validation

- `pnpm check` passes.
- All reference files remain <300 lines.

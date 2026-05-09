---
phase: 2
title: "Investigation setup"
status: completed
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Investigation setup

## Overview

Author the operator claim record (device-limit mechanism hypothesis) and the device-clearance decision YAML. The decision documents scope, blocked actions, and expected effect on the experiment that follows. Also patch the claim's `notes` with a forward pointer to the decision (R-Q2 resolution).

## Requirements

- Functional: two new records exist (claim + decision), claim `notes` has forward pointer
- Non-functional: decision records operator-side action only; agent does not perform or observe clearance

## Architecture

```
records/claims/claim-vnstock-device-limit-mechanism.yaml
  └──→ status: claimed
  └──→ scope: sandbox
  └──→ evidence_refs: [run-2 evidence MD]

records/decisions/decision-<UTC>-vnstock-vendor-device-limit-clearance.yaml
  └──→ decision_effect.action: mitigate-risk
  └──→ decision_effect.scope: install
  └──→ decision_effect.boundaries.blocked_actions: [agent-performs-clearance]
  └──→ decision_effect.boundaries.allowed_actions: [operator-performs-clearance]

records/claims/claim-vnstock-install-sandbox.yaml
  └──→ notes: "Active operator decision: record:decision-<UTC>-..."
```

## Related Code Files

- **Create:** `records/claims/claim-vnstock-device-limit-mechanism.yaml`
- **Create:** `records/decisions/decision-<UTC>-vnstock-vendor-device-limit-clearance.yaml`
- **Modify:** `records/claims/claim-vnstock-install-sandbox.yaml` (`notes` field)

## Implementation Steps

1. Create `claim-vnstock-device-limit-mechanism.yaml` with `status: claimed`, `scope: sandbox`, `evidence_refs` pointing to run-2 evidence
2. Create `decision-<UTC>-vnstock-vendor-device-limit-clearance.yaml` with `decision_effect` documenting blocked_actions, allowed_actions, and expected outcome on the experiment
3. Patch `claim-vnstock-install-sandbox.yaml` `notes` with forward pointer to the decision
4. Operator performs external device clearance on `vnstocks.com/account?section=devices` (manual action, not performed by agent)
5. Operator confirms in-band that the prior on-host device has been removed

## Success Criteria

- [x] Operator claim record exists under `records/claims/`
- [x] Decision record exists under `records/decisions/`
- [x] Claim `notes` field has forward pointer to decision
- [x] Operator confirms external clearance completed (in-band confirmation)

## Status Notes

- Record setup completed 2026-05-09.
- Operator confirmed external device clearance in-band on 2026-05-09.
- Validation: `pnpm check` passed.

## Risk Assessment

Medium risk: operator may delay or skip external clearance, blocking Phase 3. Mitigation: decision YAML makes the requirement explicit and auditable; plan can pause at this boundary indefinitely.

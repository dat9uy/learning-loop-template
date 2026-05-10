---
phase: 1
title: "Record Preflight"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Record Preflight

## Context Links

- `plans/reports/brainstorm-260510-1706-vnstock-installer-bootstrap.md`
- `records/evidence/loop/vnstock-installer-bootstrap.md`
- `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml`
- `records/evidence/loop/capabilities-stack-migration.md`
- `records/claims/claim-vnstock-install-sandbox.yaml`
- `records/claims/claim-vnstock-device-limit-mechanism.yaml`
- `records/risks/risk-vnstock-external-installer.yaml`

## Overview

Confirm the existing discovery evidence and draft decision are valid inputs before touching code. This phase prevents the implementation from recreating records that already exist or approving a decision before runtime proof exists.

## Requirements

- Functional: verify the draft bootstrap decision matches the brainstorm and current repo state.
- Functional: identify whether any record metadata needs a small update before implementation.
- Non-functional: preserve frozen records and keep all source refs validator-compliant.

## Architecture

Records are the authority layer. The implementation phases depend on the draft decision boundary, but approval is delayed until Phase 4 validates the clean bootstrap run.

## Related Code Files

- Modify: `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml` only if metadata or boundaries are stale.
- Modify: `records/evidence/loop/vnstock-installer-bootstrap.md` only if the implementation plan finds inaccurate text.
- Read: `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md`
- Read: `records/evidence/vnstock-data/installer-prior-notes.md`

## Implementation Steps

1. Re-read the brainstorm report and existing bootstrap evidence.
2. Validate that the draft decision's allowed/blocked actions match this plan.
3. Confirm no new claim is needed; current claims already cover installer behavior and device-limit mechanism.
4. If the decision still says approval depends on a fresh `pnpm bootstrap:api` run, leave `status: draft`.
5. Run `pnpm validate:records` after any record edits.

## Success Criteria

- [x] Existing evidence and decision are either confirmed unchanged or minimally corrected.
- [x] Draft decision remains draft until Phase 4 proof exists.
- [x] No frozen records changed.
- [x] `pnpm validate:records` passes if records changed.

## Risk Assessment

Risk: approving the decision before the bootstrap script proves clean-venv behavior.
Mitigation: Phase 1 may only preserve or correct draft status; approval belongs to Phase 4.

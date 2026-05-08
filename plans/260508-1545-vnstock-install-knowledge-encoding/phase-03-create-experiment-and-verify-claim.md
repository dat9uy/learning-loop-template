---
phase: 3
title: "Create Experiment and Verify Claim"
status: blocked
priority: P1
effort: "30m"
dependencies: [2]
---

# Phase 3: Create Experiment and Verify Claim

## Overview

Create the experiment record linking the install proof to the claim, then update the claim's install dimension to verified.

## Requirements

- Functional: Experiment record has `verification.proves` linking to claim. Claim has install dimension verified.
- Non-functional: Human approval recorded on experiment. All refs resolve.

## Architecture

```
records/
├── experiments/
│   └── experiment-vnstock-install-sandbox.yaml
└── claims/
    └── claim-vnstock-install-sandbox.yaml (updated)
```

## Related Code Files

- **Create:** `records/experiments/experiment-vnstock-install-sandbox.yaml`
- **Modify:** `records/claims/claim-vnstock-install-sandbox.yaml`
- **Read for context:** `schemas/experiment.schema.json`
- **Read for context:** `tools/validate-records/claim-verification-rules.js`

## Implementation Steps

1. Create experiment record `experiment-vnstock-install-sandbox.yaml`
   - `id`: experiment-vnstock-install-sandbox
   - `type`: experiment
   - `scope`: install
   - `status`: approved
   - `goal`: Verify vnstock can be installed and imported in sandbox
   - `hypothesis`: vnstock installs successfully by downloading and executing the official Makeself .run installer in a temp directory
   - `method`: [download-installer, inspect-installer-options, execute-installer, verify-import]
   - `success_metrics`: [install-exit-code-zero, import-succeeds, metadata-captured]
   - `result`: supports
   - `agent_outcome`: install verified
   - `product_outcome`: none
   - `observations`: [list any anomalies]
   - `knowledge_pack_ids`: []
   - `verification.claim_refs`: [record:claim-vnstock-install-sandbox]
   - `verification.proves`:
     - dimension: install
     - scope: sandbox
     - output_level: metadata-only
   - `verification.requires_human_approval`: true
   - `verification.approval_status`: approved
   - `source_refs`:
     - local:records/evidence/vnstock-data/installer-prior-notes.md
     - local:records/evidence/vnstock-data/experiment-install-<run_id>.md

2. Update claim `claim-vnstock-install-sandbox.yaml`
   - Change `verification.install.status` from `claimed` to `verified`
   - Set `verification.install.proof_refs`: [record:experiment-vnstock-install-sandbox]
   - Set `verification.install.reason`: "Install succeeded in temp venv with metadata-only output."

3. Run `pnpm validate:records`

## Success Criteria

- [x] Experiment record created and validates
- [ ] Experiment has `verification.proves` with dimension install, scope sandbox
- [ ] Experiment has `requires_human_approval: true` and `approval_status: approved`
- [ ] Claim updated: install.status = verified
- [ ] Claim install.proof_refs includes experiment record
- [x] `pnpm validate:records` passes
- [ ] Validation confirms matching experiment proves dimension (per `claim-verification-rules.js`)

## Blocker

The experiment result was `does-not-support`, so the claim was intentionally left at `install.status: claimed` and no proof refs were attached.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Ref mismatch between experiment and claim | low | Use exact record IDs, validate with pnpm check |
| Experiment status not approved | low | Set status to approved since human gate was obtained in phase 2 |
| Claim verification missing required fields | low | Follow schema exactly; validate before finishing |

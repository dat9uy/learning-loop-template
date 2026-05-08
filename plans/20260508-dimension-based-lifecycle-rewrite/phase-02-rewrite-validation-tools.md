---
phase: 2
title: "Rewrite Validation Tools"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Rewrite Validation Tools

## Overview

Rewrite the validation toolchain to enforce dimension-based verification rules instead of linear lifecycle transitions.

## Requirements

- Validate claims have at least one dimension
- Validate `claimed` has no proofs, `verified`/`rejected` has matching proofs
- Validate experiment `proves` matches claim dimension config
- Validate human approval for install/runtime experiments
- Validate product dimension uses decisions, not experiments
- Preserve cleanup fail-closed logic
- Rename CLI tool from `lifecycle:claim` to `verify:claim`

## Architecture

### Validation Flow

```
load records → validate schemas → validate dimension proofs → report errors
```

### Key Functions (claim-proof-lifecycle-rules.js)

- `validateClaimDimensions(claim, byId, errors)` — check claim.verification
- `validateDimensionProofs(claim, dimension, proofRecords, errors)` — check proof refs
- `validateExperimentProves(experiment, byId, errors)` — check experiment.proves
- `validateProofMatch(claim, experiment, dimension, errors)` — check config match
- `validateHumanApproval(experiment, dimension, errors)` — check approval gates
- `validateProductDecision(claim, proofRecords, errors)` — check decision refs
- `validateCleanup(experiment, errors)` — preserve cleanup fail-closed

### CLI Tool (verify-claim.js)

Renamed from `lifecycle-claim.js`. Operations:
- `--claim <id>` — validate specific claim
- `--dimension <dim>` — add/update dimension on claim
- `--status <status>` — set dimension status
- `--proof-ref <ref>` — add proof ref
- `--reason <text>` — dimension reason
- Dry run by default, `--apply` to write

## Related Code Files

- Modify: `tools/validate-records/claim-proof-lifecycle-rules.js`
- Rename+Modify: `tools/claim-lifecycle/lifecycle-claim.js` → `tools/claim-verification/verify-claim.js`
- Modify: `package.json` scripts
- Modify: `tools/validate-records/record-validation-rules.js` (if references lifecycle)

## Implementation Steps

1. Read current `claim-proof-lifecycle-rules.js`
2. Write new dimension-based validation (top-down rewrite)
3. Test against schema drafts from Phase 1
4. Rename CLI directory and tool
5. Update `package.json` scripts (`verify:claim` replaces `lifecycle:claim`)
6. Run `pnpm check` to verify no regressions in non-lifecycle validation

## Success Criteria

- [ ] New validator catches: missing dimensions, mismatched proofs, missing human approval
- [ ] Old transition errors no longer apply
- [ ] `pnpm check` passes on baseline (non-lifecycle records)
- [ ] CLI tool renamed and functional

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Validator misses edge cases from old model | Write exhaustive fixture tests in Phase 5 |
| Performance regression with per-dimension checks | Early return on first error; no N+1 lookups |

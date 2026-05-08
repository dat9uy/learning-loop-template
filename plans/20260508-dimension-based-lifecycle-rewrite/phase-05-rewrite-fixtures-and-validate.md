---
phase: 5
title: "Rewrite Fixtures and Validate"
status: completed
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 5: Rewrite Fixtures and Validate

## Overview

Rewrite all negative test fixtures to exercise the dimension-based validation rules. Run `pnpm check` to verify the validator catches each error case.

## Requirements

- All existing negative fixtures updated to new schema
- New fixture categories for dimension-specific errors:
  - missing-dimensions
  - claimed-with-proof-refs
  - verified-without-proof-refs
  - verified-mismatched-proof
  - install-without-human-approval
  - runtime-without-human-approval
  - runtime-wrong-output-level
  - product-without-decision
  - product-with-experiment-proof
  - rejected-without-proof
- `pnpm check` passes (catches all negative cases, passes positive baseline)

## Architecture

### Fixture Categories

| Category | Old Fixture Equivalent | New Dimension Error |
|----------|----------------------|---------------------|
| missing-dimensions | missing-claim-lifecycle | claim has no verification block |
| claimed-with-proof-refs | — | dimension status claimed but proof_refs non-empty |
| verified-without-proof-refs | high-state-without-proof | dimension status verified but no proofs |
| mismatched-proof | invalid-lifecycle-transition | experiment proves different scope/output |
| install-no-human-approval | runtime-without-human-approval | install dimension lacks human approval |
| runtime-no-human-approval | runtime-without-human-approval | runtime dimension lacks human approval |
| runtime-wrong-output | — | runtime proof has wrong output_level |
| product-no-decision | product-approved-without-decision | product dimension uses experiment not decision |

### Positive Baseline

Create minimal positive fixtures showing valid dimension configurations:
- static-verified claim
- install-verified claim (sandbox)
- runtime-verified claim (sandbox, metadata-only)
- product-approved claim
- multi-dimension claim (static + runtime)

## Related Code Files

- Create/Modify: `fixtures/negative/*/claims/*.yaml`
- Create/Modify: `fixtures/negative/*/experiments/*.yaml`
- Create/Modify: `fixtures/negative/*/decisions/*.yaml`
- Create: `fixtures/positive/*/claims/*.yaml` (if positive dir created)

## Implementation Steps

1. List all existing negative fixtures
2. Map each to new dimension-based error category
3. Rewrite fixtures in batches
4. Run `pnpm check` after each batch
5. Fix validator if fixtures reveal gaps
6. Create positive baseline fixtures
7. Final `pnpm check` run

## Success Criteria

- [ ] All negative fixtures updated and catching errors
- [ ] `pnpm check` passes with zero errors on positive baseline
- [ ] No references to old lifecycle states in fixtures
- [ ] Validator coverage: ≥10 distinct error types

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Fixture rewrite introduces schema drift | Validate each fixture against schema immediately |
| Validator misses edge case | Add fixture for it, fix validator |
| Old fixture paths break other tools | Grep for fixture paths across all JS tools |

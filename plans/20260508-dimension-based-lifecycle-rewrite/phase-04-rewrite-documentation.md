---
phase: 4
title: "Rewrite Documentation"
status: completed
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 4: Rewrite Documentation

## Overview

Rewrite all project docs to reflect the dimension-based model. Docs are the source of truth for human operators.

## Requirements

- `claim-proof-lifecycle.md` becomes `claim-verification.md` or fully rewritten
- `lab-model.md` updates lifecycle axes to verification axes
- `operator-guide.md` removes state transition references
- All docs use dimension terminology exclusively

## Architecture

### Doc Changes

| File | Change |
|------|--------|
| `docs/claim-proof-lifecycle.md` | Full rewrite: no states, dimensions, claimed→verified/rejected |
| `docs/lab-model.md` | Update "Lifecycle Axes" to "Verification Axes" |
| `docs/operator-guide.md` | Remove transition references, update CLI commands |

### Claim Verification Doc Structure

1. **Dimension Overview** — what each dimension means
2. **Experiment-Owned Proof** — experiment `proves` block
3. **Derived Claim Verification** — claim `verification` block
4. **Per-Dimension Rules** — static, install, runtime, product
5. **Promotion Rules** — claimed→verified, claimed→rejected
6. **Experiment Verification Fields** — `proves`, `requires_human_approval`
7. **Runtime Output Policy** — output levels per scope
8. **Forbidden Shortcuts** — unchanged

## Related Code Files

- Modify: `docs/claim-proof-lifecycle.md`
- Modify: `docs/lab-model.md`
- Modify: `docs/operator-guide.md`

## Implementation Steps

1. Read current docs
2. Rewrite `claim-proof-lifecycle.md` from scratch
3. Update `lab-model.md` verification axes section
4. Update `operator-guide.md` CLI and workflow references
5. Grep for old state names across all docs
6. Fix any remaining references

## Success Criteria

- [ ] No old lifecycle state names in any doc
- [ ] `claim-proof-lifecycle.md` explains dimension model completely
- [ ] `lab-model.md` axes table uses verification terminology
- [ ] `operator-guide.md` references `verify:claim` not `lifecycle:claim`

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Docs drift from implementation | Phase 4 runs after Phase 1; docs match schemas |
| Incomplete removal of old terms | Grep sweep for all old state names |

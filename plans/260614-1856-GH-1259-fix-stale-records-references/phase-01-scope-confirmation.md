---
phase: 1
title: "Scope confirmation"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Scope confirmation

## Overview

Confirm exactly which `records/*` references are stale vs. still valid, and lock the constraint-to-affected_system mapping before editing code.

## Requirements

- Inventory every code path that reads or writes `records/observations/`.
- Distinguish valid references (write-block patterns, archive paths, cache paths) from stale references.
- Confirm runtime-state.jsonl shape and status values.

## Related Code Files

- Read: `tools/learning-loop-mcp/core/file-readers.js`
- Read: `tools/learning-loop-mcp/hooks/bash-gate.js`
- Read: `tools/learning-loop-mcp/hooks/inbound-gate.js`
- Read: `tools/learning-loop-mcp/core/inbound-state.js`
- Read: `tools/learning-loop-mcp/core/gate-logic.js`
- Read: `runtime-state.jsonl`
- Read: archived observations in `records/_unbound/observation/`

## Implementation Steps

1. Run `grep -R "records/observations" tools/learning-loop-mcp/ --include="*.js"` and capture every caller.
2. Run `grep -R "readObservations\|readBudgets" tools/learning-loop-mcp/ --include="*.js"` and map each call site.
3. Confirm `runtime-state.jsonl` contains only `kind: ledger-event` rows today and that `status: active` is the only satisfying state.
4. Decide the constraint mapping (reverse map from `affected_system` to `constraint_type`):
   - `vnstock` → `["vendor-api", "package-manager"]`
   - `docker` and `sudo` → no runtime-state affected_system currently; remain hard-blocked
5. Decide metadata authorization criteria: which runtime-state entry metadata fields indicate that a ledger-event authorizes `vendor-api` vs `package-manager` usage.
6. File the mapping decision in this plan's phase-2 file before implementation.

## Success Criteria

- [ ] Every `records/observations/` code reference is classified as stale or valid.
- [ ] Constraint mapping is documented in phase-2.
- [ ] No edits to source files in this phase.

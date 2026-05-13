---
phase: 4
title: "Validation Gates"
status: completed
priority: P2
effort: "5m"
dependencies: ["1", "2", "3"]
---

# Phase 4: Validation Gates

## Context Links

- Validation commands: `package.json` → `validate:records`, `check`
- All artifacts from Phases 1-3

## Overview

Run validation gates. Fix any errors before finishing.

## Requirements

- `pnpm validate:records` exits 0
- Warnings from Phase 3 validator are visible but non-blocking
- `pnpm check` exits 0

## Related Code Files

- Read: all artifacts from Phases 1-3

## Implementation Steps

1. Run `pnpm validate:records`.
2. If errors, fix offending file and re-run.
3. Run `pnpm check`.
4. If errors, fix and re-run.

## Success Criteria

- [ ] `pnpm validate:records` exits 0
- [ ] Warnings are visible in output
- [ ] `pnpm check` exits 0

## Risk Assessment

- **Risk:** Phase 3 warnings may be more numerous than expected.
  **Mitigation:** Warnings are non-blocking; count them and note in the plan completion.

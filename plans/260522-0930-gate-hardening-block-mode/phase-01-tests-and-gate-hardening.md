---
phase: 1
title: "Tests and Gate Hardening"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Tests and Gate Hardening

## Overview

Update artifact-aware gate tests to expect `block` instead of `warn` for missing decision records. Then modify `write-coordination-gate.cjs` to hardcode `block` for artifact-aware violations.

## Requirements

- **Functional:**
  - `plans/**/plan.md` + `tags: [product-build]` + missing decisions → **exit 2 (block)** regardless of `GATE_RESPONSE_MODE`
  - `product/**` + missing decisions for inferred surface → **exit 2 (block)** regardless of `GATE_RESPONSE_MODE`
  - Existing allow behaviors remain unchanged (decision records present, journals, etc.)
- **Non-functional:**
  - Gate latency < 50ms for content scan
  - No regressions in other gate behaviors

## Related Code Files

- **Modify:** `.claude/coordination/__tests__/artifact-aware-gate.test.cjs`
- **Modify:** `.claude/coordination/hooks/write-coordination-gate.cjs`

## Implementation Steps

1. **Update tests (TDD — red phase)**
   - Change test `plan.md with product-build tag and MISSING decision records -> warn mode emits warning (exit 0)` to expect `exit 2` and `decision: 'block'`
   - Change test `product/web/src/routes.ts without decision record -> warn mode (exit 0)` to expect `exit 2` and `decision: 'block'`
   - Change test `unknown product/unknown/stack.py -> warn` to expect `exit 2` and `decision: 'block'`
   - Change test `multi-segment product path ... -> warn` to expect `exit 2` and `decision: 'block'`
   - Run tests to confirm they fail (red)

2. **Harden gate (green phase)**
   - In `write-coordination-gate.cjs`, remove `responseMode` check for artifact-aware branches
   - For `plans/**/plan.md` + `product-build` + missing decisions: always `block` (exit 2)
   - For `product/**` + missing decisions: always `block` (exit 2)
   - Keep `responseMode` for all other gate behaviors (unknown paths, observation staleness, etc.)

3. **Run tests (confirm green)**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template/.claude/coordination/__tests__
   node --test artifact-aware-gate.test.cjs
   ```

## Success Criteria

- [x] All artifact-aware gate tests pass (7 content-scanning + 9 surface-inference cases)
- [x] Tests confirm `block` behavior regardless of `GATE_RESPONSE_MODE`
- [x] Existing allow cases still exit 0
- [x] No changes to non-artifact gate behaviors

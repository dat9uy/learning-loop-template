---
phase: 5
title: "Verification"
status: pending
priority: P1
dependencies: [4]
---

# Phase 5: Verification

## Overview

Run focused and broad tests to prove the deadlock is gone and no regressions were introduced.

## Requirements

- Functional: all rewritten tests pass.
- Functional: Droid hook tests pass.
- Functional: full `pnpm test` completes without deadlock.

## Related Code Files

- All files modified in Phases 1-4.

## Implementation Steps

1. Run each rewritten test in isolation:
   - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`
   - `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`
   - `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`
   - `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js`
   - `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`
2. Run `.factory/hooks/__tests__/` suite.
3. Run `pnpm test` end-to-end (expect ~10 min; confirm it no longer hangs).
4. Check for new lint/type issues.

## Success Criteria

- [ ] All 5 rewritten MCP tests pass.
- [ ] `.factory/hooks/__tests__/` passes.
- [ ] `pnpm test` completes with no deadlock.
- [ ] No failing tests were hidden by the new timeout.

## Risk Assessment

- **Risk:** Full `pnpm test` still slow (~10 min). Mitigation: run it once at the end; use focused tests during development.
- **Risk:** Other tests have latent issues masked by the deadlock. Mitigation: inspect all failures; do not weaken assertions to green the suite.

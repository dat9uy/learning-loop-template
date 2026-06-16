---
phase: 3
title: "Test"
status: complete
effort: "15m"
dependencies: [2]
---

# Phase 3: Test

## Overview

Run the full test suite to verify the new E2E test passes and doesn't break existing tests.

## Implementation Steps

1. Run the new test in isolation: `node --test tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs`
2. Run the full test suite: `pnpm test`
3. Run the cold-session test specifically: `pnpm test:cold-session`
4. Verify no orphaned processes after test run

## Success Criteria

- [x] New E2E test passes (all 4 cases)
- [x] Full test suite passes (no regressions)
- [x] Cold-session test still passes
- [x] No process leaks

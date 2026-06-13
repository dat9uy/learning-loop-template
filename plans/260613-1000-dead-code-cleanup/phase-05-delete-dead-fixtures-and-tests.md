---
phase: 5
title: "Delete Dead Fixtures and Tests"
status: pending
priority: P2
effort: "15min"
dependencies: []
---

# Phase 5: Delete Dead Fixtures and Tests

## Overview

Remove 5 dead test fixtures and 1 dead test file. The tanstack fixture files are unused by any test (the generate-capabilities tests were removed). The `tool-description-audit.test.cjs` is not matched by any test glob (`.cjs` extension not in globs). The `sp3-drift.test.js` acceptance test is not in any test glob.

## Related Code Files

- Delete: `tools/generate-capabilities/fixtures/tanstack/router.tsx`
- Delete: `tools/generate-capabilities/fixtures/tanstack/routes/index.tsx`
- Delete: `tools/generate-capabilities/fixtures/tanstack/routes/reference/company.$symbol.tsx`
- Delete: `tools/generate-capabilities/fixtures/tanstack/routes/reference/equity.tsx`
- Delete: `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs`
- Delete: `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js`

## Implementation Steps

1. Delete all 6 files listed above
2. Remove empty `tools/generate-capabilities/fixtures/tanstack/` directory tree if empty
3. Remove empty `tools/learning-loop-mcp/__tests__/acceptance/` directory if empty
4. Run `pnpm test` to verify no regressions

## Success Criteria

- [ ] All 6 files deleted
- [ ] Empty directories cleaned up
- [ ] `pnpm test` passes

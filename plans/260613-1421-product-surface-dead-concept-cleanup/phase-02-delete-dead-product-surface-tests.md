---
phase: 2
title: "Delete Dead Product-Surface Tests"
status: complete
priority: P2
effort: "10min"
dependencies: [1]
---

# Phase 2: Delete Dead Product-Surface Tests

## Overview
Delete 5 test files that test only product-surface validation logic. These tests import from the files deleted in Phase 1 and have no live test coverage value.

## Related Code Files
- Delete: `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` (153 lines) — tests vendor-doc → evidence → candidate → validate pipeline
- Delete: `tools/learning-loop-mcp/__tests__/generate-capabilities.test.js` (105 lines) — tests dead generate-capabilities module
- Delete: `tools/learning-loop-mcp/__tests__/fastapi-adapter.test.js` (65 lines) — tests dead fastapi-adapter
- Delete: `tools/learning-loop-mcp/__tests__/candidate-block.test.js` (255 lines) — tests candidate consumption validation (dead product-surface concept)
- Delete: `tools/learning-loop-mcp/__tests__/verify-claim-scalar-rules.test.js` (37 lines) — tests `assertWritablePlainString` from dead claim-update.js

## Implementation Steps
1. `rm tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js`
2. `rm tools/learning-loop-mcp/__tests__/generate-capabilities.test.js`
3. `rm tools/learning-loop-mcp/__tests__/fastapi-adapter.test.js`
4. `rm tools/learning-loop-mcp/__tests__/candidate-block.test.js`
5. `rm tools/learning-loop-mcp/__tests__/verify-claim-scalar-rules.test.js`
6. Run `pnpm test` — all tests should pass now

## Success Criteria
- [ ] All 5 test files deleted
- [ ] `pnpm test` passes with 0 failures

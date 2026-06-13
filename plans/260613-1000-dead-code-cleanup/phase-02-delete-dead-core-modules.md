---
phase: 2
title: "Delete Dead Core Modules"
status: pending
priority: P2
effort: "15min"
dependencies: []
---

# Phase 2: Delete Dead Core Modules

## Overview

Remove 6 dead core modules from `tools/learning-loop-mcp/core/`. These form two dead chains:

1. **Dead validation chain:** `plan-validator.js` → zero imports. `negative-fixture-runner.js` → zero imports, but imports `derived-claim-assurance.js` and `filename-convention-validation.js`. Since the runner is dead, the entire chain is dead.
2. **Dead barrel files:** `core/index.js` and `scout/index.js` — barrel re-exports with zero consumers. Tests import directly from individual modules.
3. **Dead vendor module:** `vendor-doc-assist/index-querier.js` — zero imports.

## Related Code Files

- Delete: `tools/learning-loop-mcp/core/plan-validator.js`
- Delete: `tools/learning-loop-mcp/core/negative-fixture-runner.js`
- Delete: `tools/learning-loop-mcp/core/derived-claim-assurance.js`
- Delete: `tools/learning-loop-mcp/core/filename-convention-validation.js`
- Delete: `tools/learning-loop-mcp/core/index.js`
- Delete: `tools/learning-loop-mcp/core/vendor-doc-assist/index-querier.js`

## Implementation Steps

1. Delete all 6 files listed above
2. Run `pnpm test` to verify no regressions
3. Verify `vendor-doc-assist/` directory still has `doc-parser.js` and `suggestion-engine.js` (both live)

## Success Criteria

- [ ] All 6 files deleted
- [ ] `pnpm test` passes
- [ ] `vendor-doc-assist/` directory retains its live files

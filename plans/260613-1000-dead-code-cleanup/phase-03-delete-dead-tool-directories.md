---
phase: 3
title: "Delete Dead Tool Directories"
status: pending
priority: P2
effort: "15min"
dependencies: []
---

# Phase 3: Delete Dead Tool Directories

## Overview

Remove 9 files across 2 dead tool directories and 2 dead lib files. These are standalone modules with zero imports from source code and not matched by test globs.

**check-budget/** — 3 files. Budget checking was migrated to MCP tools; these standalone modules are orphaned.
**validate-plan-loop/** — 3 files. Plan validation was migrated to MCP tools; these standalone modules are orphaned.
**tools/lib/** — 3 dead files. `path-validator.js` and `index.js` are unused; `frontmatter-splitter.test.js` is not in any test glob.

## Related Code Files

- Delete: `tools/check-budget/check-budget.js`
- Delete: `tools/check-budget/check-budget.test.js`
- Delete: `tools/check-budget/check-budget-function.test.js`
- Delete: `tools/validate-plan-loop/validate-plan-loop.js`
- Delete: `tools/validate-plan-loop/validate-plan-loop.test.js`
- Delete: `tools/validate-plan-loop/integration.test.js`
- Delete: `tools/lib/path-validator.js`
- Delete: `tools/lib/index.js`
- Delete: `tools/lib/frontmatter-splitter.test.js`

## Implementation Steps

1. Delete all 9 files listed above
2. Remove empty `tools/check-budget/` and `tools/validate-plan-loop/` directories
3. Run `pnpm test` to verify no regressions

## Success Criteria

- [ ] All 9 files deleted
- [ ] Empty directories removed
- [ ] `pnpm test` passes

---
phase: 4
title: "Delete Dead CLI Shims"
status: pending
priority: P2
effort: "15min"
dependencies: []
---

# Phase 4: Delete Dead CLI Shims

## Overview

Remove 9 orphaned CLI shim files. These were created during `plans/260527-cli-shim-migration` but never wired into `package.json` scripts. They are standalone entry points that duplicate functionality now served by MCP tools.

## Related Code Files

- Delete: `tools/check-budget-cli.js`
- Delete: `tools/extract-index-cli.js`
- Delete: `tools/generate-capabilities-cli.js`
- Delete: `tools/list-probes-cli.js`
- Delete: `tools/list-verified-cli.js`
- Delete: `tools/search-index-cli.js`
- Delete: `tools/validate-plan-loop-cli.js`
- Delete: `tools/validate-records-cli.js`
- Delete: `tools/verify-claim-cli.js`

## Implementation Steps

1. Delete all 9 files listed above
2. Run `pnpm test` to verify no regressions

## Success Criteria

- [ ] All 9 files deleted
- [ ] `pnpm test` passes

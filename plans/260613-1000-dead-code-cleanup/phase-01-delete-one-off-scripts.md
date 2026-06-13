---
phase: 1
title: "Delete One-off Scripts"
status: pending
priority: P2
effort: "15min"
dependencies: []
---

# Phase 1: Delete One-off Scripts

## Overview

Remove 15 one-off migration/fixup scripts that were used during past plan implementations and are no longer needed. All verified dead — zero imports from any source or test file.

## Related Code Files

- Delete: `scripts/file-master-tracker-flip.mjs`
- Delete: `scripts/file-phase-a-audit-trail.mjs`
- Delete: `scripts/fix-ledger-fingerprint.mjs`
- Delete: `tools/learning-loop-mcp/scripts/cleanup-duplicate-changelog.cjs`
- Delete: `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs`
- Delete: `tools/learning-loop-mcp/scripts/closeout-meta-evidence-migration.cjs`
- Delete: `tools/learning-loop-mcp/scripts/file-260608-test-failures.mjs`
- Delete: `tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs`
- Delete: `tools/learning-loop-mcp/scripts/migrate-first-rule.mjs`
- Delete: `tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs`
- Delete: `tools/learning-loop-mcp/scripts/refresh-drifted-fingerprints.mjs`
- Delete: `tools/learning-loop-mcp/scripts/resolve-260608-1746Z-false-positives.mjs`
- Delete: `tools/learning-loop-mcp/scripts/resolve-260608-1746Z-test-file-tools-false-positives.mjs`
- Delete: `tools/learning-loop-mcp/scripts/resolve-260608-1747Z-false-positives.mjs`
- Delete: `tools/scripts/closeout-260608-2255-batch-archive-resolve.mjs`

## Implementation Steps

1. Delete all 15 files listed above
2. Run `pnpm test` to verify no regressions
3. If `scripts/` and `tools/scripts/` directories are empty after deletion, remove them

## Success Criteria

- [ ] All 15 files deleted
- [ ] `pnpm test` passes
- [ ] Empty directories cleaned up

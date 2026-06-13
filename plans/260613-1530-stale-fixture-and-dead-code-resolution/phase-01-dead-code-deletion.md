---
phase: 1
title: "Dead Code Deletion"
status: pending
priority: P2
effort: "10min"
dependencies: []
---

# Phase 1: Dead Code Deletion

## Overview

Delete 8 dead product-surface files and 4 associated test files. These modules serve the unbound product surface (AGENTS.md §9) and have zero live importers. Deleting first ensures scout fixture regeneration (Phase 3) won't re-discover dead files.

## Dead Files to Delete (8 source files)

| File | Lines | Why Dead |
|------|-------|----------|
| `tools/learning-loop-mcp/core/extract-index/extract-index.js` | ~460 | No live importer |
| `tools/learning-loop-mcp/core/extract-index/file-writer.js` | ~50 | No live importer |
| `tools/learning-loop-mcp/core/extract-index/findings-parser.js` | ~120 | No live importer |
| `tools/learning-loop-mcp/core/extract-index/frozen-claim-drift.js` | ~100 | No live importer |
| `tools/learning-loop-mcp/core/extract-index/hash-computer.js` | ~10 | No live importer |
| `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js` | ~40 | No live importer |
| `tools/learning-loop-mcp/core/list-verified.js` | 142 | No live importer |
| `tools/learning-loop-mcp/core/search-index.js` | 87 | No live importer |

## Dead Test Files to Delete (4 test files)

| File | Imports From |
|------|-------------|
| `tools/learning-loop-mcp/__tests__/list-verified.test.js` | `#mcp/core/list-verified.js` |
| `tools/learning-loop-mcp/__tests__/search-index.test.js` | `#mcp/core/search-index.js` |
| `tools/learning-loop-mcp/__tests__/findings-parser.test.js` | `#mcp/core/extract-index/findings-parser.js` |
| `tools/learning-loop-mcp/__tests__/index-query-filter.test.js` | `#mcp/core/search-index.js` AND `#mcp/core/list-verified.js` |

## Implementation Steps

1. Delete all 8 dead source files listed above
2. Delete the `tools/learning-loop-mcp/core/extract-index/` directory (now empty)
3. Delete the 4 dead test files
4. Run `pnpm test` to verify no regressions
5. If tests fail, `git checkout -- <files>` and investigate

## Success Criteria

- [ ] All 8 source files + 4 test files deleted
- [ ] `extract-index/` directory removed
- [ ] `pnpm test` passes (0 new failures)

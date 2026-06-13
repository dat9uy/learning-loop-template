---
phase: 3
title: "Scout Fixture + Cache Regeneration"
status: pending
priority: P2
effort: "5min"
dependencies: [1, 2]
---

# Phase 3: Scout Fixture + Cache Regeneration

## Overview

After dead files are deleted (Phase 1) and stale references cleaned (Phase 2), regenerate the scout fixture and invalidate the cold cache. Running AFTER deletion ensures the fixture won't re-discover dead files.

## 3A: Scout Fixture Regeneration

`run-scout.js` writes to `scout/fixtures/scout-output.json` (line 328-330). Run it to regenerate.

**Verify:** The regenerated fixture contains zero references to:
- `claim-verification-rules.js`
- `claim-update.js`
- `generate-capabilities/`
- `vendor-doc-assist/`
- `workflow-product-build-tool.js`
- `extract-index/`
- `list-verified.js`
- `search-index.js`

## 3B: Cold Cache Invalidation

`records/meta/.cache/loop-describe-cold.json` contains 92 stale references to deleted modules. This cache is read by `loop-describe-tool.js` at runtime.

**Options:**
1. Delete the cache file (it will be regenerated on next cold-tier read)
2. Regenerate it if there's a build script

Check if there's a regeneration command; if not, delete the file and let it rebuild lazily.

## Implementation Steps

1. Run `node tools/learning-loop-mcp/scout/run-scout.js` to regenerate fixture
2. Verify fixture has zero stale references (grep for all 8 deleted module names)
3. Delete or regenerate `records/meta/.cache/loop-describe-cold.json`
4. Run `pnpm test` to verify no regressions

## Success Criteria

- [ ] Scout fixture regenerated with zero stale references
- [ ] Cold cache invalidated (deleted or regenerated)
- [ ] `pnpm test` passes

---
phase: 6
title: "Remove Unused Exports"
status: pending
priority: P3
effort: "30min"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Remove Unused Exports

## Overview

Remove 92 unused exports identified by fallow across the codebase. These are exported symbols that no other module imports. After phases 1-5 delete dead files, some of these exports will already be gone (the ones in deleted files). This phase handles the remaining live-file exports.

**Deferred:** `product/web/src/lib/macro-client.ts` has 18 unused exports but requires the product preflight gate. Handle separately or skip.

## Key Files with Unused Exports

### tools/learning-loop-mcp/core/gate-logic.js (6 exports)
- `CONSTRAINT_PATTERNS`, `pathMatchesObservation`, `extractFrontmatter`, `hasProductBuildTag`, `extractSurfaces`, `checkDecisionRecords`, `hasDecisionRecords`

### tools/learning-loop-mcp/core/record-writer.js (8 exports)
- `sanitizeSlug`, `generateTimestamp`, `generateISOTimestamp`, `generateRecordId`, `generateFilename`, `resolveRecordDir`, `atomicWriteYaml`, `findRecordById`, `updateRecordFile`, `validateRecordShape`

### tools/learning-loop-mcp/core/meta-state.js (3 exports)
- `AFFECTED_SYSTEM_ENUM`, `metaStateEntryPatchSchema`, `deleteEntry`

### tools/learning-loop-mcp/core/schema-to-zod.js (3 exports)
- `buildZodSchemaFor`, `zodObjectForProperties`, `composeUpdateSchema`

### tools/learning-loop-mcp/core/claim-verification-rules.js (6 exports)
- `verificationDimensions`, `experimentDimensions`, `proofStatuses`, `productStatuses`, `scopedDimensions`, `humanApprovedDimensions`

### tools/learning-loop-mcp/core/other files
- `file-readers.js`: `readBudgets`
- `record-loader.js`: `recordDirs`
- `record-validation-rules.js`: `validateLocalPath`, `validateLocalRef`
- `schema-description-loader.js`: `clearDescriptionsCache`
- `check-grounding.js`: `FileNotFoundError`
- `claim-update.js`: `updateClaimVerification`
- `list-verified.js`: `SURFACES`
- `search-index.js`: `SURFACES`
- `loop-introspect-cache.js`: `registrySha256`
- `loop-introspect.js`: `listAllMetaCategories`, `buildColdTierCache`
- `vendor-doc-assist/suggestion-engine.js`: `detectCapability`, `detectDimension`, `computeConfidence`, `generateTopicTag`

### tools/learning-loop-mcp/hooks/lib/protocol-adapter.js (8 exports)
- `parseInput`, `normalizeToolName`, `extractCommand`, `extractFilePath`, `extractPrompt`, `formatOutput`, `exitCode`, `formatSoftWarning`

### tools/learning-loop-mcp/tools/ (2 exports)
- `loop-get-instruction-tool.js`: `HINT_KEY_MAP`
- `meta-state-patch-tool.js`: `IMMUTABLE_PATCH_FIELDS`

### tools/learning-loop-mcp/scout/budget-estimator.js (1 export)
- `stripComments`

### tools/lib/gate-logging.js (1 export)
- `rotateGateLog`

### tools/learning-loop-mcp/__tests__/probe-helpers.cjs (1 export)
- `defaultWriteFn`

## Implementation Steps

1. For each file above, remove the unused `export` keyword (keep the function/const, just make it module-private)
2. After each file edit, run `pnpm test` to verify no regressions
3. Skip `product/web/src/lib/macro-client.ts` — requires product preflight gate
4. Run final `fallow dead-code --format json` to confirm reduction

## Success Criteria

- [ ] All unused exports in `tools/` files removed or suppressed
- [ ] `pnpm test` passes
- [ ] `fallow dead-code` total_issues reduced from 179 to ~85
- [ ] `product/web/src/lib/macro-client.ts` exports deferred (noted in plan.md)

## Risk Assessment

- **Low risk:** Removing `export` keyword doesn't change runtime behavior
- **Watch:** `protocol-adapter.js` exports — the hooks import specific functions; verify each is actually used by the hooks before removing
- **Watch:** `gate-logic.js` exports — some may be used by tests via direct import

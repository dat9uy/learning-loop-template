---
phase: 2
title: "Move Write Logic to Core and Shim"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Move Write Logic to Core and Shim

## Overview

Migrate 3 write-capable / complex CLIs (`generate-capabilities`, `extract-index`, `verify-claim`) to thin MCP stdio shims. Move pure logic into `core/`, update existing MCP tools, create shims. `verify-claim` is the exception: its shim calls 3 tools sequentially (`index_validate` → `index_update_claim` → `index_validate`) because it's a safety-critical write operation.

## Requirements

- Functional: `pnpm generate:capabilities`, `pnpm extract:index`, `pnpm verify:claim` work identically.
- Non-functional: Zero logic changes. `pnpm test` passes.

## Architecture

```
CLI shim (tools/<name>-cli.js)  →  MCP server  →  MCP tool  →  core/<module>.js
```

## Related Code Files

- Create: `tools/learning-loop-mcp/core/generate-capabilities.js`
- Create: `tools/learning-loop-mcp/core/extract-index.js`
- Create: `tools/learning-loop-mcp/core/claim-update.js`
- Create: `tools/generate-capabilities-cli.js`
- Create: `tools/extract-index-cli.js`
- Create: `tools/verify-claim-cli.js`
- Modify: `tools/learning-loop-mcp/tools/generate-capabilities-tool.js` (import from core)
- Modify: `tools/learning-loop-mcp/tools/extract-index-tool.js` (import from core)
- Modify: `tools/learning-loop-mcp/tools/update-claim-tool.js` (import from core)
- Modify: `package.json` (script paths)
- Delete: `tools/generate-capabilities/` (entire directory)
- Delete: `tools/extract-index/` (entire directory)
- Delete: `tools/claim-verification/` (entire directory)
- Move tests: relevant `.test.js` files → `tools/learning-loop-mcp/__tests__/`

## Implementation Steps

1. **Run existing tests to lock baseline.**
   ```bash
   node --test tools/generate-capabilities/generate-capabilities.test.js
   node --test tools/extract-index/extract-index.test.js
   node --test tools/claim-verification/verify-claim-scalar-rules.test.js
   ```
   All must pass.

2. **Move `generateCapabilities` logic to core.**
   - Create `tools/learning-loop-mcp/core/generate-capabilities.js` with `generateCapabilities`, `deriveSurfaceFromCapabilityId`, `getCapabilityDir`, `mapsEqual`, and `DEFAULT_STACKS`.
   - Update `tools/learning-loop-mcp/tools/generate-capabilities-tool.js` to `import { generateCapabilities } from "../core/generate-capabilities.js"`.
   - Strip pure logic from `tools/generate-capabilities/generate-capabilities.js`, leave only the `main()` CLI entry point and `isMain` guard.
   - Move tests: update imports to core.

3. **Move `runExtraction` logic to core.**
   - Create `tools/learning-loop-mcp/core/extract-index.js` with `runExtraction` and all its helpers (`walkEvidenceFiles`, `buildExperimentMap`, `validateFrontmatter`, `parseDisproofNotes`, `loadExistingIndexEntries`, `checkSupersession`, `applySupersessionWriteBack`, `checkFrozenClaimDrift`, `buildIndexEntry`, `writeIndexEntry`, etc.).
   - Update `tools/learning-loop-mcp/tools/extract-index-tool.js` to import from core.
   - Strip logic from `tools/extract-index/extract-index.js`, leave CLI entry point.
   - Move tests and update imports.

4. **Move `updateClaimVerification` logic to core.**
   - Create `tools/learning-loop-mcp/core/claim-update.js` with `updateClaimVerification`, `assertWritablePlainString`, `formatList`, `serializeDimension`, `serializeVerification`, `replaceVerificationBlock`, `findTargetClaim`, `buildDimension`, `formatProposal`, `validateRecordSet`, `parseArgs`, `hasUpdateArgs`, `requireUpdateArgs`, `usage`.
   - Update `tools/learning-loop-mcp/tools/update-claim-tool.js` to `import { updateClaimVerification } from "../core/claim-update.js"`.
   - Strip logic from `tools/claim-verification/verify-claim.js`, leave CLI entry point.
   - Move tests and update imports.

5. **Run tests after core move.**
   ```bash
   pnpm test
   ```
   Must pass.

6. **Create shim CLIs.**
   - `tools/generate-capabilities-cli.js` — spawns MCP, calls `capability_generate` with `--dry-run` mapped to `dry_run`. Prints results, exits 0 or 1 based on drift.
   - `tools/extract-index-cli.js` — calls `index_extract` with `--capability`, `--dry-run`, `--verbose` mapped. Prints stats, exits 0 or 1 based on errors.
   - `tools/verify-claim-cli.js` — **multi-call exception**. Opens single transport, calls:
     1. `index_validate` (pre-validation)
     2. `index_update_claim` (with all args mapped from CLI flags)
     3. `index_validate` (post-validation)
     Prints proposal/dry-run summary. Exits 0 or 1.

7. **Update `package.json` scripts.**
   ```json
   "generate:capabilities": "node tools/generate-capabilities-cli.js",
   "extract:index": "node tools/extract-index-cli.js",
   "verify:claim": "node tools/verify-claim-cli.js"
   ```

8. **Delete old directories.**
   ```bash
   rm -rf tools/generate-capabilities/ tools/extract-index/ tools/claim-verification/
   ```

9. **Run integration tests.**
   ```bash
   pnpm generate:capabilities --dry-run
   pnpm extract:index --dry-run
   pnpm verify:claim -- --claim claim-test --dimension static --status verified --reason test
   ```
   All must behave identically to old CLIs.

10. **Run full test suite.**
    ```bash
    pnpm test
    ```
    Must pass.

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/generate-capabilities.js` exists.
- [ ] `tools/learning-loop-mcp/core/extract-index.js` exists.
- [ ] `tools/learning-loop-mcp/core/claim-update.js` exists.
- [ ] `tools/generate-capabilities-cli.js` exists and works.
- [ ] `tools/extract-index-cli.js` exists and works.
- [ ] `tools/verify-claim-cli.js` exists and works (3-call sequence).
- [ ] `tools/generate-capabilities/`, `tools/extract-index/`, `tools/claim-verification/` do not exist.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `extract-index` has many helpers to move | Medium | Move all at once; no partial refactor |
| `verify-claim` shim complexity (3 calls) | Medium | Single transport; documented exception |
| `generate-capabilities` adapters still in old dir | Low | Keep adapters in `core/` subdir or move separately |
| Tests break with deep import changes | Medium | Update test imports to `#mcp/core/...` |

---
phase: 1
title: "Self Prefix Support"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Self Prefix Support

## Overview

Add `self:` prefix support to source-ref validation so index entries can stand alone without referencing external evidence files. The `self:` prefix means: "this assertion stands on its own, no external evidence needed." This is required before Phase 2 can bulk-update all 96 index entries, because updating the refs before the validator recognizes them would break `pnpm validate:records`.

## Requirements

- **Functional:** `self:` is recognized as a valid source-ref prefix in index entries
- **Functional:** `self:` refs skip existence checks (no file to validate)
- **Functional:** `self:` refs skip the local-root allowlist check
- **Non-functional:** `pnpm validate:records` passes after all changes
- **Non-functional:** `pnpm test` passes (no regression in negative fixtures)

## Architecture

Five validation layers must be updated:

1. **Schema layer — index entries** (`schemas/index-entry.schema.json`): `source_refs.file` pattern regex must accept `self:`
2. **Schema layer — other record types** (`schemas/decision.schema.json`, `schemas/experiment.schema.json`, `schemas/risk.schema.json`): `source_refs` pattern regex must accept `self:` (currently `^(local|record|legacy):.+`)
3. **Record validation layer** (`tools/learning-loop-mcp/core/record-validation-rules.js`): `validateSourceRefs` must handle `self:` prefix — skip `validateLocalRef`, no existence check
4. **MCP source-ref validator** (`tools/learning-loop-mcp/lib/source-ref-validator.js`): `validateSourceRef` must accept `self:` prefix (currently rejects with "must start with local:, record:, or legacy:")
5. **Extract-index generator** (`tools/learning-loop-mcp/core/extract-index/index-entry-builder.js`): Must emit `self:` instead of `local:` for meta evidence files (or skip meta evidence entirely)
6. **Negative fixtures** (`tools/learning-loop-mcp/fixtures/negative/`): Add a positive fixture for `self:` refs

### Data Flow

```
index entry source_refs.file = "self:capability-allowlist"
  ↓
schema validation (regex: "^(local|record|legacy|self):.+")
  ↓
record-validation-rules.js validateSourceRefs()
  → if startsWith("self:") → skip local validation, return early
  ↓
passes without existence check
```

## Related Code Files

- **Modify:** `schemas/index-entry.schema.json` — add `self` to the `source_refs.file` pattern
- **Modify:** `schemas/decision.schema.json` — add `self` to the `source_refs` pattern
- **Modify:** `schemas/experiment.schema.json` — add `self` to the `source_refs` pattern
- **Modify:** `schemas/risk.schema.json` — add `self` to the `source_refs` pattern
- **Modify:** `tools/learning-loop-mcp/core/record-validation-rules.js` — add `self:` branch in `validateSourceRefs`
- **Modify:** `tools/learning-loop-mcp/lib/source-ref-validator.js` — add `self:` branch in `validateSourceRef`
- **Modify:** `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js` — emit `self:` for meta evidence (or skip meta evidence)
- **Modify:** `tools/learning-loop-mcp/core/negative-fixture-runner.js` — add `self-prefix-valid` case
- **Create:** `tools/learning-loop-mcp/fixtures/negative/self-prefix-valid/` — positive fixture with `self:` ref

## Implementation Steps

1. **Schema updates (all 4 schemas):** Change `source_refs` (or `source_refs.file`) pattern from `^(local|record|legacy):.+` to `^(local|record|legacy|self):.+` in:
   - `schemas/index-entry.schema.json`
   - `schemas/decision.schema.json`
   - `schemas/experiment.schema.json`
   - `schemas/risk.schema.json`
2. **Record validation update:** In `record-validation-rules.js` `validateSourceRefs()`, add `self:` branch before `local:` branch for both extracted-assertion and non-extracted-assertion paths:
   ```js
   if (fileRef.startsWith("self:")) {
     // Self-standing assertion — no external evidence required
     continue;
   }
   ```
3. **MCP source-ref validator update:** In `source-ref-validator.js` `validateSourceRef()`, add `self:` branch before `local:` branch:
   ```js
   if (ref.startsWith("self:")) {
     return { valid: true };
   }
   ```
4. **Extract-index update:** In `extract-index.js` (around line ~158), the `sourceRefs` are pushed with `local:${evidencePath}`. Add logic to emit `self:` for meta evidence files:
   ```js
   const sourceRef = {
     file: item.evidencePath.startsWith("records/meta/evidence/")
       ? `self:${id}`
       : `local:${item.evidencePath}`,
     section: "## Findings",
     bullet_index: item.finding.bulletIndex,
     line_anchor: item.finding.lineAnchor,
   };
   ```
   OR: Skip `records/meta/evidence/` entirely in `extract-index.js` `walkEvidenceFiles()` by adding a filter:
   ```js
   if (entry.name.startsWith("records/meta/evidence/")) continue;
   ```
   **Recommended:** Skip meta evidence files in `walkEvidenceFiles()` — simpler, no risk of reverting `self:` refs.
5. **Test baseline:** Run `pnpm validate:records` — must pass (no index entries use `self:` yet, so this is a no-op regression check)
6. **Test with `self:` ref:** Create temporary fixture with `self:` prefix and run `pnpm test` — must pass
7. **Cleanup:** Remove temporary fixture

## Success Criteria

- [ ] `schemas/index-entry.schema.json` `source_refs.file` pattern accepts `self:` prefix
- [ ] `schemas/decision.schema.json` `source_refs` pattern accepts `self:` prefix
- [ ] `schemas/experiment.schema.json` `source_refs` pattern accepts `self:` prefix
- [ ] `schemas/risk.schema.json` `source_refs` pattern accepts `self:` prefix
- [ ] `record-validation-rules.js` `validateSourceRefs()` skips validation for `self:` refs
- [ ] `source-ref-validator.js` `validateSourceRef()` accepts `self:` refs
- [ ] `extract-index.js` does not revert `self:` refs back to `local:` for meta evidence
- [ ] `pnpm validate:records` passes with no errors
- [ ] `pnpm test` passes with no failures
- [ ] Negative fixtures do not reject `self:` prefix

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `self:` prefix conflicts with future prefix naming | Low | Low | Prefix is intuitive and unlikely to collide |
| Schema regex change breaks other source-ref types | Low | High | Only adds `self` to OR group; existing prefixes unchanged |
| Extract-index reverts `self:` refs on next run | Medium | Critical | Fix `index-entry-builder.js` to emit `self:` for meta evidence (Step 4) |
| MCP tools reject `self:` refs | Medium | High | Fix `source-ref-validator.js` (Step 3) |
| Non-extracted-assertion records use `self:` unexpectedly | Low | Medium | `self:` is semantically only for index entries; no enforcement needed |

---
phase: 4
title: "Index Query Filter"
status: completed
priority: P2
effort: "1h"
dependencies: [1, 2]
---

# Phase 4: Index Query Filter

## Overview

Update `list-verified` and `search-index` MCP tools to default to `status: active` only. Add an `--include-candidates` flag (default false) to both tools so that callers must explicitly request `candidate` entries. This prevents accidental consumption of unverified vendor assertions by product queries.

## Requirements

- Functional: `capability_list_verified` (MCP tool) defaults to filtering out `candidate` entries.
- Functional: `index_search` (MCP tool) defaults to filtering out `candidate` entries when no status filter is provided.
- Functional: Both tools accept an `include_candidates` boolean parameter (default false) to override the filter.
- Functional: When `include_candidates: true`, `candidate` entries are included in results.
- Non-functional: Zero breaking changes for callers that already pass `status: active` explicitly.

## Architecture

Both tools delegate to core functions:
- `searchIndex` in `tools/learning-loop-mcp/core/search-index.js`
- `listVerifiedClaims` in `tools/learning-loop-mcp/core/list-verified.js`

These core functions currently filter by capability, dimension, and status. The status filter is string-based. We add a `excludeCandidates` boolean parameter to both core functions.

### Changes

1. **`searchIndex`**:
   - Add `excludeCandidates: true` as default when `filters.status` is not provided.
   - When `excludeCandidates` is true, skip any entry where `frontmatter.status === "candidate"`.
   - When `filters.status` is provided, honor it (if `status: candidate` is explicitly requested, include it).

2. **`listVerifiedClaims`**:
   - The current function returns `claims` and `evidence`. `claims` are frozen-legacy and not affected.
   - The function does not currently query `extracted-assertion` entries. We add a new section that queries `records/<surface>/index/*.yaml` for `active` entries only.
   - Add an `includeCandidates` parameter (default false) that controls whether `candidate` entries are included.

3. **MCP tool wrappers**:
   - `index_search` tool: add `include_candidates` schema parameter, pass to `searchIndex`.
   - `capability_list_verified` tool: add `include_candidates` schema parameter, pass to `listVerifiedClaims`.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/search-index.js` — add `excludeCandidates` parameter
- Modify: `tools/learning-loop-mcp/core/list-verified.js` — add `includeCandidates` parameter
- Modify: `tools/learning-loop-mcp/tools/search-index-tool.js` — add `include_candidates` schema parameter
- Modify: `tools/learning-loop-mcp/tools/list-verified-tool.js` — add `include_candidates` schema parameter
- Create: `tools/learning-loop-mcp/__tests__/index-query-filter.test.js` — tests
- Modify: `docs/artifact-concepts.md` — document query filter behavior

## Implementation Steps

1. Edit `tools/learning-loop-mcp/core/search-index.js`:
   - Change function signature: `searchIndex(root, filters = {})` → `searchIndex(root, filters = {}, excludeCandidates = true)`.
   - After all existing filters, add: if `excludeCandidates && frontmatter.status === "candidate"`, skip.
   - When `filters.status` is explicitly provided, ignore `excludeCandidates` (operator explicitly asked for a status).
2. Edit `tools/learning-loop-mcp/core/list-verified.js`:
   - Change function signature: `listVerifiedClaims(root)` → `listVerifiedClaims(root, includeCandidates = false)`.
   - Add a new section after `loadEvidence` that loads `extracted-assertion` entries from `records/<surface>/index/*.yaml`.
   - Filter to `status: active` only unless `includeCandidates` is true.
   - Add `assertions` field to the return object: `{ claims, evidence, assertions }`.
3. Edit `tools/learning-loop-mcp/tools/search-index-tool.js`:
   - Add `include_candidates: z.boolean().optional().default(false)` to schema.
   - Pass to `searchIndex` as `excludeCandidates: !args.include_candidates`.
4. Edit `tools/learning-loop-mcp/tools/list-verified-tool.js`:
   - Add `include_candidates: z.boolean().optional().default(false)` to schema.
   - Pass to `listVerifiedClaims` as `includeCandidates: args.include_candidates`.
5. Create `tools/learning-loop-mcp/__tests__/index-query-filter.test.js`:
   - Test `searchIndex` with default filter excludes `candidate`.
   - Test `searchIndex` with `include_candidates: true` includes `candidate`.
   - Test `searchIndex` with `status: candidate` explicitly includes `candidate`.
   - Test `listVerifiedClaims` with default filter excludes `candidate`.
   - Test `listVerifiedClaims` with `include_candidates: true` includes `candidate`.
6. Update `docs/artifact-concepts.md` to document the default filtering behavior.
7. Run `pnpm test` to verify.

## Success Criteria

- [x] `searchIndex` defaults to excluding `candidate` entries
- [x] `searchIndex` with `include_candidates: true` includes `candidate` entries
- [x] `listVerifiedClaims` defaults to excluding `candidate` entries
- [x] `listVerifiedClaims` with `include_candidates: true` includes `candidate` entries
- [x] `index_search` MCP tool exposes `include_candidates` parameter
- [x] `capability_list_verified` MCP tool exposes `include_candidates` parameter
- [x] Tests cover all filter combinations
- [x] `pnpm test` passes

## Risk Assessment

- **Existing MCP callers break:** Low — default behavior changes from "all statuses" to "active only". This is the intended behavior change (safer default). Callers that relied on `candidate` being returned will need to pass `include_candidates: true`.
- **`searchIndex` performance regression:** Low — adds a single string comparison per result.
- **Confusion between `status: candidate` and `include_candidates`:** Low — documented in `docs/artifact-concepts.md` and tool descriptions.

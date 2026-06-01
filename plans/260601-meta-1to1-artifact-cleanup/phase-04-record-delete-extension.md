---
phase: 4
title: "Record Delete Extension"
status: pending
priority: P2
effort: "2h"
dependencies: [3]
---

# Phase 4: Record Delete Extension

## Overview

Extend the `record_delete` MCP tool to support `evidence` and `claim` record types with hard-delete semantics. Evidence files are temporary scaffolding, not audit records. The deprecated claim is frozen-legacy. Both are safe to hard-delete without moving to `.deleted/`. The existing tool only supports `decision`, `experiment`, and `risk` with soft-delete.

## Requirements

- **Functional:** `record_delete` tool accepts `record_type: "evidence"` and `record_type: "claim"`
- **Functional:** Evidence and claim records are hard-deleted (no `.deleted/` move)
- **Functional:** Gate log still records the deletion for audit
- **Functional:** `record_type: "evidence"` requires `surface` parameter (evidence lives under `records/<surface>/evidence/`)
- **Non-functional:** `pnpm test` passes after all changes
- **Non-functional:** No regression for existing soft-delete behavior (decision, experiment, risk)

## Architecture

### Current behavior

```
record_delete(decision|experiment|risk, surface, id)
  → finds file in records/<surface>/<type>s/
  → checks status ∈ {draft, rejected}
  → moves to records/<surface>/<type>s/.deleted/
  → logs to gate log
```

### New behavior

```
record_delete(evidence, surface, id)
  → finds file in records/<surface>/evidence/
  → hard-deletes (no status check)
  → logs to gate log

record_delete(claim, surface, id)
  → finds file in records/<surface>/claims/
  → hard-deletes (no status check)
  → logs to gate log
```

### Evidence path resolution

Evidence files are `.md` (not `.yaml`). The `record_id` for evidence is typically the filename without extension (e.g., `capability-allowlist-deferred-axes`). The tool must look in `records/<surface>/evidence/` for `{id}.md`.

**Critical finding:** `resolveRecordDir` in `record-writer.js` uses `join(root, "records", surface, "${type}s")`, which for `type: "evidence"` gives `records/<surface>/evidences/` (WRONG). Evidence files are in `records/<surface>/evidence/` (no trailing `s`). Also, `findRecordById` filters for `.yaml` or `.yml` files — evidence files are `.md`, so it won't find them.

Claim files are `.yaml` in `records/<surface>/claims/`. The tool must look for `{id}.yaml`.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/delete-record-tool.js` — add `evidence` and `claim` to enum, add hard-delete path with custom resolution
- **Modify:** `tools/learning-loop-mcp/tools/delete-record-tool.test.js` — add tests for evidence and claim deletion
- **Modify:** `tools/learning-loop-mcp/agent-manifest.json` — update `record_delete` schema description if needed
- **Modify:** `tools/learning-loop-mcp/core/record-writer.js` — add `resolveEvidenceDir` or handle `evidence`/`claim` as special cases

## Implementation Steps

1. **Update tool schema:** Add `"evidence"` and `"claim"` to `record_type` enum in `delete-record-tool.js`
2. **Add custom path resolution for evidence:** Evidence needs its own path resolution because:
   - Directory is `records/<surface>/evidence/` (not `evidences/`)
   - File extension is `.md` (not `.yaml`)
   - `findRecordById` in `record-writer.js` filters for `.yaml`/`.yml` only
   
   Options:
   - **Option A:** Add `resolveEvidenceDir(root, surface)` and `findEvidenceById(dir, id)` in `record-writer.js`
   - **Option B:** Inline the evidence/claim path resolution in `delete-record-tool.js` (simpler, no core changes)
   
   **Selected: Option B** — inline in `delete-record-tool.js` to avoid touching core record-writer.js. The tool already has `getRecordDir` and `getDeletedDir` functions.
3. **Add hard-delete handler:**
   - If `record_type === "evidence"`, look in `records/<surface>/evidence/` for `{id}.md` using inline `readdirSync` + manual filename matching
   - If `record_type === "claim"`, look in `records/<surface>/claims/` for `{id}.yaml` using `findRecordById` (claims are `.yaml`)
   - Skip status check and `.deleted/` move for both
   - Use `unlinkSync` to delete
   - Log to gate log
4. **Update tests:** Add test cases:
   - `record_delete` with `evidence` type deletes the `.md` file
   - `record_delete` with `claim` type deletes the `.yaml` file
   - `record_delete` with `evidence` type for non-existent file returns `not_found`
   - Existing soft-delete tests still pass (regression)
5. **Validate:** `pnpm test` passes
6. **Document:** Update `agent-manifest.json` record_crud group description if it mentions only soft-delete

## Success Criteria

- [ ] `record_delete` tool accepts `evidence` and `claim` record types
- [ ] Evidence hard-delete removes the `.md` file from `records/<surface>/evidence/` without `.deleted/` move
- [ ] Claim hard-delete removes the `.yaml` file from `records/<surface>/claims/` without `.deleted/` move
- [ ] Gate log records the deletion for both types
- [ ] `pnpm test` passes including new test cases
- [ ] Existing soft-delete behavior (decision, experiment, risk) unchanged

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hard-delete bypasses audit trail | Low | Medium | Gate log still records; git history preserves |
| Evidence path resolution is wrong (evidences/ vs evidence/) | Medium | High | Inline path resolution in delete tool; test with temp dir |
| `findRecordById` doesn't find `.md` evidence files | Medium | High | Use inline `readdirSync` + manual match for evidence; don't rely on `findRecordById` |
| Record ID convention mismatch for evidence | Medium | Medium | Evidence IDs are filename stems; verify with existing files |
| Soft-delete regression | Low | High | Keep existing soft-delete code path unchanged |

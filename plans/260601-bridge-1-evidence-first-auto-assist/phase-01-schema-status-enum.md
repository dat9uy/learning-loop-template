---
phase: 1
title: "Schema+Status Enum"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Schema+Status Enum

## Overview

Add `candidate` to the `index-entry.schema.json` status enum and update the extraction pipeline to map `evidence.validation_status: pending` to `candidate` instead of `pending_approval`. This is the foundational schema change that all downstream phases depend on.

## Requirements

- Functional: `schemas/index-entry.schema.json` accepts `candidate` as a valid status value.
- Functional: `extract-index` produces `candidate` entries when evidence has `validation_status: pending`.
- Functional: `extract-index` still produces `active` for `passed` and `pending_approval` when no `pending` evidence exists.
- Non-functional: Zero breaking changes to existing `active`/`superseded`/`pending_approval` entries.

## Architecture

The status enum lives in `schemas/index-entry.schema.json` under `properties.status`. The extraction pipeline maps `evidence.validation_status` to index status in `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js` via the `STATUS_MAP` constant.

Current mapping:
```js
const STATUS_MAP = {
  passed: "active",
  pending: "pending_approval",
  failed: null,
  draft: null,
};
```

New mapping:
```js
const STATUS_MAP = {
  passed: "active",
  pending: "candidate",
  failed: null,
  draft: null,
};
```

`pending_approval` is still produced by explicit human promotion of a `candidate` entry (future workflow, not this plan). The `index-entry-builder.js` does not need to produce `pending_approval` from evidence frontmatter anymore; it produces `candidate` for `pending`.

## Related Code Files

- Modify: `schemas/index-entry.schema.json` — add `candidate` to status enum
- Modify: `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js` — update `STATUS_MAP`
- Modify: `docs/artifact-concepts.md` — update Dimension Overview table to include `candidate`

## Implementation Steps

1. Edit `schemas/index-entry.schema.json`:
   - Change `status.enum` from `["active", "superseded", "pending_approval"]` to `["active", "superseded", "pending_approval", "candidate"]`.
2. Edit `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js`:
   - Change `STATUS_MAP.pending` from `"pending_approval"` to `"candidate"`.
   - Update error message for unknown validation_status to list the expected values.
3. Edit `docs/artifact-concepts.md`:
   - Update the "Dimension Overview — Index Entries" table to include `candidate` in the status values column.
   - Add a note: `candidate` is for vendor-sourced or unverified assertions; `pending_approval` is for human-promoted candidates awaiting experiment.
4. Run `pnpm test` to verify no regressions.
5. Run `pnpm extract:index --dry-run` to verify existing evidence still produces expected statuses.

## Success Criteria

- [ ] `schemas/index-entry.schema.json` status enum includes `candidate`
- [ ] `index-entry-builder.js` `STATUS_MAP` maps `pending` → `candidate`
- [ ] `docs/artifact-concepts.md` documents the new status
- [ ] `pnpm test` passes with no regressions
- [ ] `pnpm extract:index --dry-run` runs clean on existing evidence

## Risk Assessment

- **Schema change breaks AJV validation for existing index entries:** Low — existing entries are `active`/`superseded`/`pending_approval`; we only add to the enum, not remove or rename.
- **Extraction mapping change surprises operators:** Low — `pending` evidence was already producing `pending_approval` entries, which is now `candidate`. Both are non-consumable by product, so the behavior change is subtle. Documented in phase.
- **`pending_approval` status orphaned:** Low — no evidence frontmatter produces `pending_approval` anymore. This is intentional; `pending_approval` is reserved for a future human-promotion workflow (not this plan). The status stays in the enum for backward compatibility with any existing entries. There are zero `pending_approval` entries in the current repo (verified by search), so the enum addition is purely forward-compatible.

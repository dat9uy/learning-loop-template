---
title: "Meta 1:1 Artifact Cleanup"
description: "Enforce the 1:1 artifact philosophy in records/meta/ by retiring evidence files, deleting deprecated claims, and blocking outside references to docs/journals/ and plans/reports/."
status: completed
priority: P2
branch: "main"
tags: [meta, artifact-cleanup, 1to1, index-entry, validation, outside-reference]
blockedBy: []
blocks: []
created: "2026-06-01T07:34:11.310Z"
createdBy: "ck:plan"
source: skill
---

# Meta 1:1 Artifact Cleanup

## Overview

The `records/meta/` surface has accumulated overlapping artifacts: 96 index entries, 28 evidence files, 1 deprecated claim, and 2 stale `.deleted/` risk versions. The 1:1 artifact philosophy says one canonical artifact per concept — the index entry is canonical, evidence files are temporary scaffolding.

This plan implements the selected design from `plans/reports/brainstorm-260601-meta-1to1-artifact-cleanup.md`:

1. Add `self:` prefix support to source-ref validation so index entries can stand alone without external evidence files
2. Bulk-update all 96 index entries to replace `local:records/meta/evidence/...` refs with `self:` prefix
3. Delete all 28 evidence files, the deprecated claim, and `.deleted/` folder
4. Extend `record_delete` MCP tool to support `evidence` and `claim` types with hard-delete semantics
5. Add "Outside Reference Block" validation layer to ban `docs/journals/` and `plans/reports/` references in new records (grandfather existing)

## Phases

| Phase | Name | Status | Effort | Priority | Dependencies |
|-------|------|--------|--------|----------|-------------|
| 1 | [Self Prefix Support](./phase-01-self-prefix-support.md) | Pending | 2h | P1 | — |
| 2 | [Bulk Index Update](./phase-02-bulk-index-update.md) | Pending | 2h | P1 | 1 |
| 3 | [Evidence Deletion](./phase-03-evidence-deletion.md) | Pending | 2h | P1 | 2 |
| 4 | [Record Delete Extension](./phase-04-record-delete-extension.md) | Pending | 2h | P2 | 3 |
| 5 | [Outside Reference Block](./phase-05-outside-reference-block.md) | Pending | 3h | P2 | — |

## Dependencies

### Cross-Plan
- No active pending plans touch `records/meta/evidence/`, `schemas/index-entry.schema.json`, `record-validation-rules.js`, or the delete-record tool.
- Bridge-1 (`260601-bridge-1-evidence-first-auto-assist`) and Bridge-2 (`260601-bridge-2-candidate-to-experiment`) are completed and do not block this plan.

### Informed By
- `plans/reports/brainstorm-260601-meta-1to1-artifact-cleanup.md` — design selection and approach B
- `docs/artifact-concepts.md` — 1:1 artifact philosophy, evidence vs index entry roles
- `plans/260519-2326-docs-canonicalization-machine-extracted-index/` — index-first conventions and `source_refs` patterns
- `plans/260519-1710-extraction-tool-machine-extracted-index/` — `extract-index` behavior and evidence extraction

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Non-meta records (decisions, experiments) reference `local:records/meta/evidence/...` | Critical | Scan ALL fields (source_refs, decision_effect.affected_refs, notes, etc.) before Phase 3; re-route refs to `record:` or `self:` before deleting evidence |
| Extract-index reverts `self:` refs on next run | Critical | Update `index-entry-builder.js` to emit `self:` for meta evidence files (or skip meta evidence in `walkEvidenceFiles`) |
| MCP tools (create/update) reject `self:` prefix | High | Update `source-ref-validator.js` to accept `self:` prefix before `local:` branch |
| `self:` prefix not validated by all 5 layers | Medium | Update schema regex, record-validation-rules.js, source-ref-validator.js, negative fixtures, and extract-index tool |
| Evidence path resolution bug (`evidences/` vs `evidence/`) | Medium | `resolveRecordDir` uses `${type}s` which gives `evidences/`; use inline path resolution in `delete-record-tool.js` |
| Evidence file deletion removes source material for future extraction | Low | Git history preserves all evidence files; index entries are the canonical artifact |
| Outside reference block has false positives | Medium | Use precise patterns matching complete file paths only (`docs/journals/*.md`), not conceptual mentions |
| `record_delete` tool hard-delete bypasses audit trail | Medium | Evidence and claim are not audit records; gate log still records the deletion; `.deleted/` already has stale risks |
| Existing `legacy:plans/reports/` and `legacy:docs/journals/` refs in records | Low | Grandfathered — validation only applies to records with `created_at >= 2026-06-01` |

## Success Metrics

| Metric | Target |
|--------|--------|
| `records/meta/evidence/` is empty | Yes |
| `records/meta/claims/` is empty | Yes |
| `records/meta/risks/.deleted/` is empty | Yes |
| 96 index entries have `self:` source refs (not `local:records/meta/evidence/...`) | Yes |
| `pnpm validate:records` passes after all changes | Yes |
| `pnpm test` passes after all changes | Yes |
| `record_delete` tool supports `evidence` and `claim` types | Yes |
| New records with `created_at >= 2026-06-01` fail validation if they reference `docs/journals/` or `plans/reports/` | Yes |
| All existing records with `legacy:docs/` or `legacy:plans/` still pass validation (grandfathered) | Yes |
| MCP tools (create/update) accept `self:` prefix in source_refs | Yes |
| Extract-index does not revert `self:` refs back to `local:` for meta evidence | Yes |
| No dangling `local:records/meta/evidence/` refs in any record field | Yes |

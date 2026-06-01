---
title: "Bridge 1 — Evidence-First Auto-Assist for Vendor Doc Ingestion"
description: "Close Bridge 1 (Doc → Candidate Assertion) of the trajectory. Add candidate status to the index schema, build a vendor-doc assist MCP tool, and hard-block product consumption of unverified vendor assertions."
status: pending
priority: P1
branch: "main"
tags: [product-build, bridge-1, vendor-docs, mcp-tool, index-schema, validation]
blockedBy: []
blocks: []
created: "2026-06-01T04:11:50.256Z"
createdBy: "ck:plan"
source: skill
---

# Bridge 1 — Evidence-First Auto-Assist for Vendor Doc Ingestion

## Overview

The current system stops at Bridge 1. Vendor docs (e.g., `records/vnstock/vendor-docs/unified-ui-snapshot/`, `llms.txt`) are stored as raw reference material but cannot be machine-ingested into the index because they lack the `## Findings` convention and evidence frontmatter. The gap is: "no candidate-extraction tool, and vendor docs do not author to `## Findings` convention."

This plan implements the selected design from `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md`: vendor docs stay as raw reference in `records/<surface>/vendor-docs/`. A new MCP tool `workflow_vendor_doc_assist` reads a vendor doc + existing index, suggests `## Findings` bullets and frontmatter. The human writes the final evidence file. `extract-index` produces index entries with `status: candidate` (new status). Product gates hard-block on `candidate`.

## Background

From `docs/trajectory.md` §The Four Bridges:

> Bridge 1: Doc → candidate assertion. Vendor markdown is parsed into atomic candidate assertions. Today: humans hand-author evidence from doc reading. Gap: no candidate-extraction tool, and vendor docs do not author to `## Findings` convention.

From the brainstorm report:

> Approach B (Evidence-First with Auto-Assist) selected. Vendor docs stay as raw reference. A new MCP tool `workflow_vendor_doc_assist` reads a vendor doc + existing index, suggests `## Findings` bullets and frontmatter. The human writes the final evidence file. `extract-index` produces index entries with `status: candidate`. Product gates hard-block on `candidate`.

## Phases

| Phase | Name | Status | Effort | Priority | Dependencies |
|-------|------|--------|--------|----------|-------------|
| 1 | [Schema+Status Enum](./phase-01-schema-status-enum.md) | Pending | 1h | P1 | — |
| 2 | [Vendor Doc Assist Tool](./phase-02-vendor-doc-assist-tool.md) | Pending | 3h | P1 | 1 |
| 3 | [Validation Hard-Block](./phase-03-validation-hard-block.md) | Pending | 2h | P1 | 1, 2 |
| 4 | [Index Query Filter](./phase-04-index-query-filter.md) | Pending | 1h | P2 | 1, 2 |
| 5 | [End-to-End Test](./phase-05-end-to-end-test.md) | Pending | 2h | P1 | 3, 4 |

## Dependencies

### Cross-Plan
- None. No active unfinished plans touch `schemas/index-entry.schema.json`, `tools/learning-loop-mcp/tools/`, or the validation layer.

### Informed By
- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — design selection and artifact model.
- `docs/trajectory.md` — Bridge 1 description and the four bridges architecture.
- `docs/artifact-concepts.md` — index entry status values, dimension overview, proof authority.
- `plans/260519-1710-extraction-tool-machine-extracted-index/` — existing `extract-index` behavior and `index-entry-builder.js` STATUS_MAP.
- `plans/260521-0200-mcp-workflow-layer/` — existing MCP tool patterns (`workflow_verify_evidence`, `workflow_convert_evidence`).
- `plans/260527-validation-mcp-centralization/` — `index_validate` tool and `record-validation-rules.js` layer structure.

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `candidate` status leaks into product consumption | Critical | Hard-block in validation layer (Layer 4); `list-verified` defaults to `active` only |
| `workflow_vendor_doc_assist` suggestions are low-quality | Medium | Confidence score threshold; human always writes final evidence |
| Schema change breaks existing index entries | Medium | Only adds `candidate` to enum; does not change existing `active`/`superseded`/`pending_approval` behavior |
| Validation hard-block rejects legitimate pending_approval | Low | `candidate` and `pending_approval` are distinct; block only `candidate` |
| Index query filter default behavior changes silently | Low | `list-verified` and `search-index` get explicit `--include-candidates` flag; default false |
| Vendor doc freshness not tracked | Medium | Out of scope for this plan; noted in brainstorm as future work |

## Success Metrics

| Metric | Target |
|--------|--------|
| `candidate` added to `index-entry.schema.json` status enum | Yes |
| `extract-index` maps `pending` → `candidate` (was `pending_approval`) | Yes |
| `workflow_vendor_doc_assist` MCP tool registered and callable | Yes |
| Tool returns suggested findings with confidence >0.7 for known vendor doc | Yes |
| `validate_records` rejects `candidate` entries referenced by product code | Yes |
| `list-verified` does not return `candidate` without `--include-candidates` | Yes |
| `search-index` defaults to `active` only | Yes |
| End-to-end test: vendor doc → assist → evidence → extract → candidate → validate → reject | Yes |
| `pnpm check` passes after all changes | Yes |
| All existing tests pass (no regression) | Yes |

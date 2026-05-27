---
title: "Validation MCP Centralization"
description: "Move all validation logic from tools/validate-records/ into tools/learning-loop-mcp/core/, move fixtures/ into tools/learning-loop-mcp/fixtures/, and make the CLI a thin MCP stdio shim. Delete the standalone CLI. Zero logic changes."
status: pending
priority: P1
branch: "main"
tags: [refactor, mcp, validation, cli-shim, product-build]
blockedBy:
  - "260527-restructure-coordination-and-references"
blocks: []
created: "2026-05-27T02:50:07.435Z"
createdBy: "ck:plan"
source: skill
---

# Validation MCP Centralization

## Overview

The `fixtures/` directory at repo root and `tools/validate-records/` CLI are orphaned. The MCP server owns CRUD; it should also own validation. This plan moves all validation modules into `tools/learning-loop-mcp/core/`, moves `fixtures/` into `tools/learning-loop-mcp/fixtures/`, and replaces the standalone CLI with a thin stdio shim that delegates to the MCP server. `pnpm check` stays green throughout.

**Key principle:** Refactor-only, zero logic changes. Every function body, schema, and fixture stays identical — only paths and ownership change.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Tests-First MCP Validation + CLI Shim](./phase-01-tests-first-mcp-validation-cli-shim.md) | Pending | 2h | P1 |
| 2 | [Move Validation Modules into MCP Core](./phase-02-move-validation-modules-into-mcp-core.md) | Pending | 1h | P1 |
| 3 | [Move Fixtures and Wire Negative Runner](./phase-03-move-fixtures-and-wire-negative-runner.md) | Pending | 1h | P1 |
| 4 | [Create CLI Shim and Delete Old CLI](./phase-04-create-cli-shim-and-delete-old-cli.md) | Pending | 1h | P1 |
| 5 | [Integration Validation](./phase-05-integration-validation.md) | Pending | 1h | P1 |

## Dependencies

- Phase 1 must complete before Phase 2 (tests define the contract that the move must satisfy).
- Phase 2 must complete before Phase 3 (core modules must exist before fixtures reference them).
- Phase 3 must complete before Phase 4 (fixture runner must resolve from new path before CLI shim calls it).
- Phase 4 must complete before Phase 5 (full pipeline must exist before integration validation).

## Cross-Plan Relationships

- **Blocked by:** `260527-restructure-coordination-and-references` (this plan moves files inside `tools/learning-loop-mcp/`; the restructure must be done first so paths are stable).
- **Informed by:** `260521-1843-mcp-tool-agentization` (established MCP-first pattern for wrapping CLI tools).
- **Informed by:** `260512-1724-validator-simplification-pass` (prior work simplifying the validator; this plan is the final consolidation).

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `pnpm check` script references deleted `tools/validate-records/` | High | Audit `package.json` scripts and `pnpm check` definition before commit |
| Fixture path resolution breaks after move | High | Negative runner resolves fixtures relative to `__dirname` in core, not cwd |
| MCP server spawn overhead in CI | Low | ~200ms cold start; acceptable for validation runs |
| Import path breaks inside moved modules | Medium | All imports rewritten from `../../` to `#lib/` or relative within MCP tree |
| Docs/plans reference old `fixtures/` at root | Low | Historical docs stay; active docs (README, operator-guide) update |
| `allow_disallowed_fixtures` param lost in MCP tool | Medium | Preserve in `index_validate` schema; wire to negative runner |

## Success Metrics

| Metric | Target |
|--------|--------|
| `pnpm validate:records` exits 0 | Yes |
| `pnpm validate:records --allow-disallowed-fixtures` exits 0 | Yes |
| `pnpm check` exits 0 | Yes |
| `tools/validate-records/` exists | No |
| `fixtures/` at repo root exists | No |
| MCP `index_validate` returns same errors as old CLI | Yes |
| Test coverage for negative fixtures via MCP | Yes |

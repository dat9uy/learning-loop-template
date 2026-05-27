---
title: "CLI-to-MCP Shim Migration"
description: "Migrate all remaining standalone CLIs into thin MCP stdio shims. Move logic into learning-loop-mcp/core/, delete standalone directories, update package.json scripts. Refactor-only, zero logic changes."
status: completed
priority: P1
branch: "main"
tags: [refactor, mcp, cli-shim, product-build]
blockedBy: []
blocks: []
created: "2026-05-27T03:29:14.614Z"
createdBy: "ck:plan"
source: skill
---

# CLI-to-MCP Shim Migration

## Overview

8 standalone CLIs live outside the MCP server. 5 have inverted dependency arrows (MCP tool imports from CLI module). 2 have no MCP tool at all. The `validate-records` CLI was already migrated to a thin MCP shim. This plan migrates the remaining 7 CLIs, deletes the disabled `generate-docs` CLI, and deletes all standalone CLI directories.

**Key principle:** Refactor-only, zero logic changes. Every function body stays identical — only paths and ownership change.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Tests-First Read-Only Shims](./phase-01-tests-first-read-only-shims.md) | Pending | 1h | P1 |
| 2 | [Move Write Logic to Core and Shim](./phase-02-move-write-logic-to-core-and-shim.md) | Pending | 2h | P1 |
| 3 | [Greenfield MCP Tools and Shims](./phase-03-greenfield-mcp-tools-and-shims.md) | Pending | 2h | P1 |
| 4 | [Integration Validation and Cleanup](./phase-04-integration-validation-and-cleanup.md) | Pending | 1h | P1 |

## Dependencies

- Phase 1 must complete before Phase 2 (shim pattern proven on trivial cases).
- Phase 2 must complete before Phase 3 (complex patterns inform greenfield tools).

## Cross-Plan Relationships

- **Informed by:** `260527-validation-mcp-centralization` (established the shim pattern for `validate-records`).
- **Informed by:** `260521-1843-mcp-tool-agentization` (established MCP-first wrapping pattern).

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `pnpm check` references deleted paths | High | Audit scripts before each commit |
| Import paths break during module move | Medium | Use `#lib/` and `#mcp/` aliases |
| MCP server spawn overhead in CI | Low | ~200ms per shim; acceptable |
| `verify-claim` multi-call shim complexity | Medium | Document exception; keep single transport open |
| Tests break when modules move | Medium | Update imports; run `pnpm test` after each phase |
| `manifest.json` misses new tools | Medium | Add entries during Phase 3; validate with integration test |

## Success Metrics

| Metric | Target |
|--------|--------|
| `pnpm validate:records` exits 0 | Yes |
| `pnpm validate:plan-loop` exits 0 | Yes |
| `pnpm verify:claim -- --claim ...` exits 0 | Yes |
| `pnpm generate:capabilities` exits 0 | Yes |
| `pnpm extract:index` exits 0 | Yes |
| `pnpm search:index` exits 0 | Yes |
| `pnpm list:verified` exits 0 | Yes |
| `pnpm list:probes` exits 0 | Yes |
| `pnpm check:budget` exits 0 | Yes |
| `pnpm check` exits 0 | Yes |
| Standalone CLI directories exist | No |
| `generate-docs` script exists | No |

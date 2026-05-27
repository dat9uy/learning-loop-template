---
title: "Tools/ Simplification & MCP Agent Surface"
description: >-
  Phased refactor of the tools/ directory: eliminate 82-file constraint-gate
  duplication, refactor standalone CLI tools for MCP-safe imports, namespace
  all 33 MCP tools by domain, and build an agent-facing manifest with quickstart
  recipes.
status: completed
priority: P1
branch: "main"
tags:
  - product-build
  - meta
  - tooling
  - mcp
  - agent-experience
blockedBy:
  - "260524-unified-coordination-gate"
blocks: []
created: "2026-05-27T00:31:53.519Z"
createdBy: "ck:plan"
source: skill
---

# Tools/ Simplification & MCP Agent Surface

## Overview

`tools/` has grown to 193 files across 13 subdirectories. Three critical problems:

1. **Dead-code duplication:** `tools/constraint-gate/` (82 files) duplicates `tools/coordination-gate/` almost identically — same 33-tool manifest, same server.js, same core gate logic. Plan `260524-unified-coordination-gate` extracted `coordination-gate/core/` as the single source of truth, but `constraint-gate/` was never deleted.

2. **Standalone CLI tools are MCP-unsafe:** `extract-index.js`, `verify-claim.js`, `generate-capabilities.js`, etc. call `process.exit()` at module level. When imported by MCP tool wrappers, they kill the entire server. Red-team finding R1 (plan `260521-1843`) flagged this as Critical.

3. **Flat tool list is un-navigable for agents:** 33 MCP tools with names like `workflow_self_improvement`, `update_observation` have no semantic grouping, ordering hints, or lifecycle context. Agents discover them as an undifferentiated flat list.

## Key Principle

**Refactor-only, no logic changes.** Every phase preserves exact behavior. Tests are the contract.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Refactor Standalone Tools to Pure Functions](./phase-01-refactor-standalone-tools-to-pure-functions.md) | Pending | 3h | P1 |
| 2 | [Delete Constraint-Gate Duplication + Redirect Scripts](./phase-02-delete-constraint-gate-duplication-redirect-scripts.md) | Pending | 1h | P1 |
| 3 | [Expand tools/lib/ Shared Kernel](./phase-03-expand-tools-lib-shared-kernel.md) | Pending | 2h | P2 |
| 4 | [Namespace MCP Tool Names](./phase-04-namespace-mcp-tool-names.md) | Pending | 2h | P1 |
| 5 | [Agent Manifest + Skill Documentation](./phase-05-agent-manifest-skill-documentation.md) | Pending | 1h | P2 |

## Dependencies

- Phase 1 must complete before Phase 3 (shared kernel imports from refactored tools)
- Phase 2 must complete before Phase 3 (delete duplicate first so only one source of truth remains)
- Phase 2 must complete before Phase 4 (namespace changes on the canonical MCP server, not the duplicate)
- Phase 4 must complete before Phase 5 (manifest references namespaced names)

## Cross-Plan Relationships

- **Blocked by:** `260524-unified-coordination-gate` (core extraction must be done; this plan deletes the leftover duplicate and namespaces the canonical tools)
- ~~**Blocks:** `260524-learning-loop-meta-gaps`~~ (completed 2026-05-27)
- **Informed by:** `260521-1843-mcp-tool-agentization` (wrapped standalone tools; this plan makes the underlying tools MCP-safe)
- **Informed by:** `260522-2100-mcp-record-crud-gate-simplification` (established MCP-first record access; this plan namespaces those tools)

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| `process.exit()` missed in refactor | Critical | Lint rule `no-process-exit` outside `main()`; code review checklist |
| Import path breaks after `constraint-gate/` deletion | Medium | `rg "constraint-gate"` must return zero before commit |
| MCP client caches old tool names | Medium | Restart all agent sessions after Phase 4; document in SKILL.md |
| `tools/lib/` creates circular imports | Medium | Import graph: `coordination-gate/core/` -> `tools/lib/` only; no reverse |
| Agent manifest drifts from actual tools | Low | Generate manifest from `manifest.json` + tool descriptions in CI |

## Success Metrics

| Metric | Target |
|--------|--------|
| `tools/` file count | < 100 (from 193) |
| Duplicate code (`constraint-gate/`) | 0 files |
| `process.exit()` in exported functions | 0 occurrences |
| MCP tool names with domain prefix | 33 / 33 |
| Agent quickstart recipes documented | 2+ (product_build, record_verification) |
| `pnpm test` pass rate | 100% after each phase |

---
title: "Dead Code Cleanup — Post Phase A Sweep"
description: "Remove 42 confirmed-dead files identified by fallow dead-code --format json and verified by researcher agents. Splits into 5 deletion phases + 1 unused-export cleanup phase."
status: pending
priority: P2
branch: "main"
tags: [cleanup, dead-code, fallow, post-phase-a]
blockedBy: ["260612-1700-meta-surface-re-debate"]
blocks: []
created: "2026-06-13T10:00:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Dead Code Cleanup — Post Phase A Sweep

## Overview

After completing `plans/260612-1700-meta-surface-re-debate` (Phase A), fallow identified 179 issues (83 unused files, 92 unused exports). Two researcher agents verified each file against the live codebase. **42 files are confirmed dead** — the rest are false positives from fallow's static analysis missing runtime-loaded hooks, MCP tools, and core modules.

**Source:** `fallow dead-code --format json` (2026-06-13)
**Verification:** Two parallel researcher agents cross-checked every file via grep/import analysis.

### What fallow got wrong (NOT deleting)

| Category | Files | Why they're live |
|----------|-------|------------------|
| Hooks (`hooks/bash-gate.js`, `inbound-gate.js`, `write-gate.js`) | 3 | Loaded by `.claude/settings.json` + `.factory/settings.json` |
| `hooks/lib/protocol-adapter.js` | 1 | Imported by all 3 hooks |
| Coordination CJS wrappers (`.claude/coordination/hooks/*.cjs`) | 6 | Referenced in `settings.json` |
| Core writers (`budget-checker.js`, `decision-writer.js`, etc.) | 6 | Imported by MCP server via `tools/manifest.json` dynamic loading |
| MCP tool files (13 workflow tools) | 13 | Registered in `tools/manifest.json`, loaded at runtime |
| Scout test fixtures (8 live tests) | 8 | Matched by `pnpm test` globs |
| `tools/lib/yaml-parse-wrapper.js` | 1 | Imported by core modules |
| `tools/lib/frontmatter-splitter.js` | 1 | Imported by core modules |

## Phases

| Phase | Name | Files | Status | Effort | Dependencies |
|-------|------|-------|--------|--------|--------------|
| 1 | [Delete One-off Scripts](./phase-01-delete-one-off-scripts.md) | 15 | pending | 15min | — |
| 2 | [Delete Dead Core Modules](./phase-02-delete-dead-core-modules.md) | 6 | pending | 15min | — |
| 3 | [Delete Dead Tool Directories](./phase-03-delete-dead-tool-directories.md) | 9 | pending | 15min | — |
| 4 | [Delete Dead CLI Shims](./phase-04-delete-dead-cli-shims.md) | 9 | pending | 15min | — |
| 5 | [Delete Dead Fixtures and Tests](./phase-05-delete-dead-fixtures-and-tests.md) | 5 | pending | 15min | — |
| 6 | [Remove Unused Exports](./phase-06-remove-unused-exports.md) | 92 exports | pending | 30min | 1-5 |

## Success Criteria

- [ ] All 42 confirmed-dead files deleted
- [ ] `pnpm test` passes after each phase
- [ ] `fallow dead-code --format json` total_issues reduced from 179 to ~85 (remaining = false positives + macro-client exports)
- [ ] No regressions in MCP server startup or hook execution

## Risk Assessment

- **Low risk:** All deletions verified by grep — no runtime imports exist
- **Watch:** `core/index.js` barrel deletion — verify MCP server doesn't import from it (researcher confirmed it doesn't)
- **Deferred:** `product/web/src/lib/macro-client.ts` unused exports (18 exports) — requires product preflight gate

---
title: Unified Coordination Gate — Claude Code + Droid CLI
description: >-
  Extract shared coordination core from tools/constraint-gate, create universal
  hook scripts usable by both Claude Code and Droid CLI, and establish .factory/
  config mirror so changes in one place apply to both agent surfaces.
status: pending
priority: P1
branch: main
tags:
  - product-build
  - meta
  - tooling
  - droid
  - claude-code
blockedBy: []
blocks: []
created: '2026-05-23T18:47:43.196Z'
createdBy: 'ck:plan'
source: skill
---

# Unified Coordination Gate — Claude Code + Droid CLI

## Overview

The coordination system (constraint gates, preflight checks, observation discipline) currently lives in two places:
1. **Claude Code hooks** (`.claude/coordination/hooks/`) — CJS scripts that gate Bash/Edit/Write and intercept user prompts
2. **MCP server** (`tools/constraint-gate/`) — ESM modules that expose 32+ tools for record CRUD, workflow orchestration, and gate decisions

The hooks duplicate logic from the MCP server (pattern matching, observation reading, budget evaluation, gate decisions). This means:
- Bug fixes require changes in two places
- The system only works for Claude Code (hooks are `.claude/`-specific)
- Droid CLI cannot enforce the same safety rules

This plan extracts a **shared coordination core** from `tools/constraint-gate/`, creates **universal hook scripts** that work for both Claude Code and Droid CLI, and establishes a **`.factory/` config mirror** so both agent surfaces share the same enforcement logic.

## Key Principle

**Change in one place, apply in both.** The shared core (`tools/coordination-gate/core/`) is the single source of truth. Both `.claude/` and `.factory/` configurations are thin wrappers that point to the same scripts.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Research](./phase-01-research.md) | Pending | 1h | Completed |
| 2 | [Core-Extraction](./phase-02-core-extraction.md) | Pending | 3h | Completed |
| 3 | [Hook-Unification](./phase-03-hook-unification.md) | Pending | 4h | Completed |
| 4 | [Factory-Config](./phase-04-factory-config.md) | Pending | 2h | Completed |
| 5 | [Verification](./phase-05-verification.md) | Pending | 2h | Completed |

## Dependencies

- Phase 1 must complete before Phase 2 (research informs extraction scope)
- Phase 2 must complete before Phase 3 (core must exist before hooks can use it)
- Phase 3 must complete before Phase 4 (hooks must exist before Droid can point to them)
- Phase 4 must complete before Phase 5 (config must exist before verification)

## Cross-Plan Relationships

- **Complements**: `260524-learning-loop-meta-gaps` (MCP CRUD gaps — this plan does not touch MCP tools, only the core they depend on)
- **Informed by**: `260522-0930-gate-hardening-block-mode` (block mode behavior — preserved in universal hooks)
- **Informed by**: `260522-1500-artifact-aware-gate` (artifact-aware gating — preserved in universal hooks)

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Hook behavior changes during unification | High | Preserve exact logic; only move code, don't change it |
| CJS/ESM interop issues | Medium | Use `createRequire` bridge; test all imports |
| Droid CLI hook format differences | Medium | Research Droid hook protocol first; adapt output format |
| Path resolution breaks (GATE_ROOT, etc.) | Medium | Centralize resolve-root in core; test with env overrides |
| Existing tests fail after refactor | Medium | Run full test suite after each phase |

## Success Criteria

- [ ] All gate logic lives in `tools/coordination-gate/core/` (single source of truth)
- [ ] `.claude/coordination/hooks/` are thin wrappers (<50 lines each) calling universal core
- [ ] `.factory/coordination/hooks/` exist and point to same universal scripts
- [ ] `.factory/settings.json` configures Droid hooks matching `.claude/settings.json`
- [ ] `.factory/skills/` contains Droid-compatible versions of learning-loop and constraint-gate skills
- [ ] MCP server imports from `core/` (no duplication)
- [ ] All existing tests pass: `pnpm test` green
- [ ] New integration test verifies both Claude and Droid hook paths produce identical decisions
- [ ] No behavioral changes to gate decisions (refactor-only, no logic changes)

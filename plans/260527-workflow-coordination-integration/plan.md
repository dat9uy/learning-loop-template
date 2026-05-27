---
title: "Workflow Coordination Integration"
description: "Replace procedural workflow runner with surface-aware registry. Refactor MCP tools to return recommendations instead of spawning child processes. Add pre-commit safety net."
status: pending
priority: P1
branch: "main"
tags: [coordination, mcp, workflow, registry, pre-commit]
blockedBy: []
blocks: []
created: "2026-05-27T06:53:06.425Z"
createdBy: "ck:plan"
source: skill
---

# Workflow Coordination Integration

## Overview

Replace `workflows.json` and `workflow-runner.js` (procedural child-process automation) with a surface-agnostic workflow registry in `tools/learning-loop-mcp/core/`. Refactor `workflow_notify_artifact` and `workflow_trigger` MCP tools to return structured recommendations instead of spawning CLI scripts. Add a `simple-git-hooks` pre-commit hook as a commit-time safety net. Update skill documentation and agent manifest to reflect the new agent-intentional model.

This plan implements **Approach D** from `plans/reports/260527-workflow-coordination-integration.md`.

## Background

The current system has `workflows.json` at `.claude/coordination/workflows.json` defining 4 file-change-triggered workflows that spawn CLI processes via `workflow-runner.js`. Three problems: paradigm mismatch (procedural automation on a conversational agent system), surface asymmetry (hardcoded `.claude` paths), and agent burden (must remember to call `workflow_notify_artifact`). The red team found command injection, stdio corruption, and race conditions in the original design (plan `260521-0200-mcp-workflow-layer`).

## Key Design Decisions

1. **Agent as executor** — `workflow_notify_artifact` evaluates triggers and returns `recommended_next_tools`; the agent decides whether to call them.
2. **No hidden automation** — Hooks never invoke workflow tools automatically; they may emit advisory reminders only.
3. **Pre-commit as safety net** — `simple-git-hooks` runs `pnpm validate:records && pnpm extract:index` before every commit, catching missed validation.
4. **Standalone CLI scripts preserved** — `extract-index-cli.js`, `validate-records-cli.js`, `generate-capabilities-cli.js` remain for CI/manual use.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Registry Core](./phase-01-registry-core.md) | Pending | 2h | — |
| 2 | [Notify Artifact Refactor](./phase-02-notify-artifact-refactor.md) | Pending | 3h | 1 |
| 3 | [Trigger Workflow Refactor](./phase-03-trigger-workflow-refactor.md) | Pending | 2h | 1 |
| 4 | [Delete Procedural Runner](./phase-04-delete-procedural-runner.md) | Pending | 1h | 2, 3 |
| 5 | [Pre-commit Hook](./phase-05-pre-commit-hook.md) | Pending | 1h | — |
| 6 | [Skill & Manifest Update](./phase-06-skill-manifest-update.md) | Pending | 1h | 2, 3 |
| 7 | [Integration Verification](./phase-07-integration-verification.md) | Pending | 2h | 1–6 |

## Dependencies

### Cross-Plan
- `260521-0200-mcp-workflow-layer` (done) — Original workflow layer; red team findings inform this plan.
- `260527-validation-mcp-centralization` (done) — Validation tools (`index_validate`, `index_extract`) already centralized in MCP.
- `260527-0000-tools-simplification-mcp-agent-surface` (done) — CLI shims migrated; standalone scripts confirmed CI-ready.

### Internal
- Phase 1 must complete before Phases 2 and 3 (registry is imported by both refactored tools).
- Phases 2 and 3 can run in parallel after Phase 1.
- Phase 4 (delete runner) must wait for Phases 2 and 3 (tools must no longer import `workflow-runner.js`).
- Phase 5 (pre-commit) is independent and can run in parallel with Phases 1–4.
- Phase 6 (skill/manifest update) depends on Phases 2 and 3 (descriptions reference new behavior).
- Phase 7 (integration verification) depends on all previous phases.

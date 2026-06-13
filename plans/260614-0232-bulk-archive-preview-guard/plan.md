---
title: "Bulk Archive Preview Guard"
description: "Add a tool-level preview/confirm guard to meta_state_archive for multi-id overrides to prevent accidental bulk archival without review."
status: completed
priority: P1
effort: 2h
branch: main
tags: [mcp, meta-state, archive, guardrail]
created: 2026-06-14
---

## Overview

Add a preview/confirm guard to `meta_state_archive` when `override` contains more than one id. Without `confirm: true`, the tool returns a preview list of each target with `id`, `entry_kind`, `status`, and `description` (or `description_preview`), plus `ready: false`. Only when `confirm: true` is passed does the tool proceed with the archive. Single-id overrides continue to work without confirmation.

## Phases

| Phase | Status | File |
|-------|--------|------|
| 1 - Add preview/confirm guard to archive tool | completed | [phase-01-archive-preview-guard.md](phase-01-archive-preview-guard.md) |

## Key Files

- `tools/learning-loop-mcp/tools/meta-state-archive-tool.js` — tool handler and schema
- `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` — existing tests

## Acceptance Criteria

- `meta_state_archive({ override: [id1, id2] })` returns a `preview` array and `ready: false` without archiving.
- `meta_state_archive({ override: [id1, id2], confirm: true })` archives valid findings and returns archived/already_archived/not_found/rejected as before.
- Single-id override still archives directly (no breaking change).
- Tool description is updated.
- Tests cover preview, confirmation, single-id bypass, and rejection of non-findings in preview.
- All existing tests still pass.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing MCP callers that pass multi-id override | Low | High | Only changes behavior when `confirm` is absent; callers can add `confirm: true` to restore prior behavior |
| Test flakiness from temp directory cleanup | Low | Low | Use existing test pattern with `mkdtempSync` and `rmSync` |

## Unresolved Questions

- None.

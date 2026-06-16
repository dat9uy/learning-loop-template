---
title: "Fix session_id discoverability in learning-loop MCP"
description: "Surface session_id in compact output, warm-tier hints, and tool docs so assistants stop client-side filtering."
status: completed
priority: P1
effort: 2h
branch: main
tags: [mcp, meta-state, discoverability, session_id]
created: 2026-06-14
---

## Overview

P1 from debug report `debugger-260614-0207-session-06085a38-meta-state-process-gaps.md`.
The assistant in session `06085a38` tried to filter `meta_state_list({ compact: true })` client-side by `session_id`, but compact output strips `session_id`. It never discovered the first-class `session_id` filter on the tool itself.

This plan closes the discoverability gap with four small, non-breaking changes.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Fix session_id discoverability | pending | [phase-01-fix-session-id-discoverability.md](./phase-01-fix-session-id-discoverability.md) |

## Key Files

- `tools/learning-loop-mcp/core/loop-introspect.js` — `summarize()` and `DISCOVERABILITY_HINTS`
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — tool description and schema
- `AGENTS.md` — meta_state_list filter table
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js`
- `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js`
- `tools/learning-loop-mcp/__tests__/meta-state-session-id-roundtrip.test.js`

## Risks

- Low. All changes are additive (new field in compact output, new hint string, doc updates). No existing behavior is removed.
- Test count assertions increase from 14 to 15 hints; this is a known, expected change.

## Acceptance Criteria

- `meta_state_list({ compact: true })` returns `session_id` for entries that have it.
- `loop_describe` warm tier includes a hint about `meta_state_list({ session_id })` narrow query.
- All existing tests still pass; updated tests cover the new behavior.
- No direct JSONL edits; use MCP tools only.

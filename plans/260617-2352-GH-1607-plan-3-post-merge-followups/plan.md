---
title: "Phase C Plan 3 — Post-Merge Follow-ups (4 findings)"
description: "Address 4 non-blocking findings raised by code review of PR #4 (Plan 3 cut-over): (1) delete broken meta_state_refresh_tools — Mastra MCPServer SDK incompatibility, (2) patch F4 evidence_code_ref drift (line 38 → 13), (3) fix master tracker C7 group names, (4) strengthen mutex test timestamp assertion."
status: completed
priority: P3
branch: "260617-2352-GH-1607-plan-3-post-merge-followups"
tags: [phase-c, post-merge, hygiene, follow-up]
blockedBy: ["260617-1950-phase-c-plan-3-cut-over"]
blocks: []
created: "2026-06-17T23:52:00.000Z"
createdBy: "ck:code-review"
source: skill
related:
  - plans/reports/reviewer-260617-phase-c-plan-3-cut-over.md (the PR #4 review baseline, if present)
  - plans/260617-1950-phase-c-plan-3-cut-over/plan.md (the merged plan; this plan addresses spec drift introduced there)
  - meta-260617T2356Z-pr-4-plan-3-cut-over-shipped-meta-state-refresh-tools-to-the (F1; refresh-tools broken)
  - meta-260617T2356Z-f4-meta-260616t2123z-the-learning-loop-mastra-peer-mcp-serve (F2; F4 evidence_code_ref drift)
  - meta-260617T2357Z-master-tracker-c7-line-193-lists-groups-as-coordination-meta (F3; tracker group names wrong)
  - meta-260617T2357Z-tools-learning-loop-mastra-tests-connect-mcp-server-mutex-te (F4; ms-resolution test gap)
  - meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ (F4-original; resolved 2026-06-17; patch in Phase 2)
  - tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js (Phase 1 delete)
  - tools/learning-loop-mcp/core/mcp-server-reload.js (Phase 1 delete; lifted in Plan 3 Group 6 but unused post-delete)
  - tools/learning-loop-mcp/__tests__/meta-state-refresh-tools-tool.test.js (Phase 1 delete)
  - tools/learning-loop-mastra/tools/manifest.json (Phase 1 remove entry)
  - tools/learning-loop-mastra/agent-manifest.json (Phase 1 remove from meta_state group)
  - tools/learning-loop-mcp/agent-manifest.json (Phase 1 remove from legacy manifest if still referenced)
  - tools/learning-loop-mcp/tools/manifest.json (Phase 1 remove legacy entry)
  - docs/mcp-server-restart-protocol.md (Phase 1 rewrite — restart-only path)
  - docs/project-changelog.md (Phase 1 update — note deletion)
  - tools/learning-loop-mastra/server.js (Phase 2 anchor; line 13 PREFIX)
  - plans/reports/productization-260612-1530-master-tracker.md (Phase 3 line 193 fix)
  - tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js (Phase 4 assertion strengthening)
---

# Phase C Plan 3 — Post-Merge Follow-ups

## Overview

PR #4 (Plan 3 cut-over) shipped and merged with 4 non-blocking findings flagged in code review. This plan addresses them in 4 short phases. All phases are independent; can land in 1-4 commits per operator preference. Estimated total effort: **1-2 hours**.

## Scope

| Phase | Subject | Effort | Risk | Phase File |
|-------|---------|--------|------|------------|
| 1 | Delete `meta_state_refresh_tools` + `core/mcp-server-reload.js` | 30 min | Low | `phase-01-delete-broken-refresh-tools.md` |
| 2 | Patch F4 `evidence_code_ref` line 38 → 13 | 5 min | Low | `phase-02-patch-f4-evidence-ref.md` |
| 3 | Fix master tracker C7 group names | 5 min | Low | `phase-03-fix-tracker-c7-groups.md` |
| 4 | Strengthen mutex test timestamp assertion | 15 min | Low | `phase-04-strengthen-mutex-test.md` |

## Decision Context

**Option A approved (operator decision 2026-06-17):** delete the broken `meta_state_refresh_tools` rather than bind `globalThis.__loopMcpServer` in the mastra server. Rationale:
- The tool's body (`server._registeredTools` mutation + `server.setToolRequestHandlers()` + `server.sendToolListChanged()`) targets the legacy `@modelcontextprotocol/sdk` SDK's private internals. Mastra's `MCPServer` class is a different SDK with no analogous surface (verified: zero `_registeredTools` references in `tools/learning-loop-mastra/`). Even with `globalThis` bound, the body would not work.
- Operator hot-reload is preserved via `pnpm gate:server` restart (~1s cost). Droid orchestrator manages mastra server lifecycle post-cut-over.
- KISS/YAGNI: a fail-safe broken tool is worse than no tool. Deleting also removes `core/mcp-server-reload.js` (Plan 3 Group 6 lift) which becomes dead code post-delete.

## Acceptance Gate

> **After this plan lands, `meta_state_refresh_tools` is no longer registered (manifest count 39, not 40); `core/mcp-server-reload.js` + its test are deleted; F4 (`meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ`) has `evidence_code_ref: tools/learning-loop-mastra/server.js:13`; master tracker C7 line 193 lists the 5 actual manifest groups (gate, workflow, meta_state, introspection, runtime_agnostic); `connect-mcp-server-mutex.test.js` either uses a higher-resolution ordering proof or its comment matches the assertion strength; `pnpm test` reports 0 failures.**

## Out of Scope

- Mastra-native hot-reload tool (deferred — operator restart is sufficient).
- Other Plan 3 spec drift not surfaced by code review.

## Dependencies

**Blocked by:** `260617-1950-phase-c-plan-3-cut-over` (merged 2026-06-17).
**Blocks:** none.

## References

- PR #4 code review (in-session)
- 4 findings in `meta-state.jsonl` (linked above)
- Plan 3 plan + phase file (linked above)

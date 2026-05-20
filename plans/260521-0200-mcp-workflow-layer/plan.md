---
title: "MCP Workflow Layer + Minimal Hook"
description: "Shrink PreToolUse hooks to hard-blocking safety net; move policy and workflow triggers to constraint-gate MCP server"
status: pending
priority: P1
branch: "main"
tags: [coordination, mcp, hooks, workflow]
blockedBy: []
blocks: []
created: "2026-05-21T19:07:44.300Z"
createdBy: "ck:plan"
source: skill
---

# MCP Workflow Layer + Minimal Hook

## Overview

Replace the current PreToolUse hooks (write-coordination-gate, bash-coordination-gate) with a minimal hard-blocking safety net. Move all policy logic (domain rules, staleness checks, budget evaluation) and workflow triggers into the constraint-gate MCP server. This provides audit trail + reactive workflows (e.g., auto-run index extraction on evidence changes) without the security regression of pure MCP enforcement.

## Key Decisions

- **Approach 2 selected** from brainstorm `brainstorm-260521-mcp-workflow-layer.md`
- **Hook shrinks** but retains hard blocks for: `records/observations/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, catch-all `**`, plus evidence write-path observation check
- **MCP expands** with `notify_artifact_change` and `trigger_workflow` tools
- **Workflow registry** at `.claude/coordination/workflows.json` maps artifact changes to tool invocations
- **TDD ordering**: tests first, then implementation per phase
- **Security guardrails**: command allowlist for workflows, stdio isolation, log rotation, no raw prompt PII in audit logs

## Phases

| Phase | Name | Status | Priority | Effort | Dependencies |
|-------|------|--------|----------|--------|-------------|
| 1 | [Tests for Minimal Hook](./phase-01-tests-for-minimal-hook.md) | Pending | P1 | 2h | — |
| 2 | [Shrink Write Coordination Gate](./phase-02-shrink-write-coordination-gate.md) | Pending | P1 | 3h | 1 |
| 3 | [Expand MCP Server with Workflow Tools](./phase-03-expand-mcp-server-with-workflow-tools.md) | Pending | P1 | 4h | 2 |
| 4 | [Workflow Registry and Integration](./phase-04-workflow-registry-and-integration.md) | Pending | P2 | 3h | 3 |
| 5 | [Update Documentation](./phase-05-update-documentation.md) | Pending | P2 | 1.5h | 4 |

## Acceptance Criteria

- Every evidence write where agent calls `notify_artifact_change` appears in `gate-log.jsonl`
- `extract-index` is triggered automatically on evidence change; logs success/failure within 60 seconds
- Hook test suite passes; hook retains hard blocks for observations, schemas, build artifacts, and unknown paths
- No regression in existing `server.test.js` or `gate-logic.test.js`
- `records/observations/**` still blocks unconditionally at hook level
- Workflow spawns use isolated stdio (no MCP transport corruption)
- `gate-log.jsonl` has size-based rotation (10 MB rollover, 5 backups)
- Rollback procedure documented: one-command revert to previous hook

## Dependencies

- Predecessor plan `260521-0104-add-update-observation-to-mcp-server` (completed) — `update_observation` tool must exist

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP server crash → agent bypasses policy | High | Hook retains hard blocks for observations, schemas, build artifacts, unknown paths even without MCP |
| Agent forgets to call MCP for docs/plans writes | Medium | Inbound gate still warns; agent trained to check gate |
| Workflow script failure silently drops | Medium | Workflows fire-and-forget; failures logged to separate file; agent can query status |
| Hook and MCP policy diverge over time | Low | Hook only enforces unconditional blocks; all policy lives in MCP |
| Workflow spawn corrupts MCP stdio transport | High | All spawns use `{ stdio: 'pipe' }` with detached process; no inherited stdout |
| Concurrent append corrupts gate-log.jsonl | Medium | Workflow processes log to separate `.claude/coordination/workflow-log.jsonl`; only MCP appends to gate-log |
| Unbounded gate-log.jsonl growth | Medium | Size-based rotation at 10 MB, keep 5 backups |
| Command injection in workflow registry | High | Command allowlist: only `node` with paths under `tools/`; no shell execution |
| F12 marker race causes missed escalation | Medium | Fix F12 with atomic write (temp + rename) before shrinking hook |
| No rollback if minimal hook fails | High | Keep `.bak` until full validation cycle; document one-command rollback |

## Red Team Review

### Session — 2026-05-21
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 7 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Catch-all removal creates security regression | Critical | Accept | Phase 2 |
| 2 | Risk table mitigation claim is false | Critical | Accept | plan.md |
| 3 | Hook-MCP race window on evidence writes | Critical | Accept | Phase 3 |
| 4 | MCP stdio transport corruption from workflows | Critical | Accept | Phase 3 |
| 5 | Phase 1 TDD test harness hangs on stdin | Critical | Accept | Phase 1 |
| 6 | Command injection via workflow registry | High | Accept | Phase 3, 4 |
| 7 | Operator prompt PII leaked into audit log | High | Accept | Phase 3 |
| 8 | Hook test suite invisible to pnpm test | High | Accept | Phase 1, 2 |
| 9 | Dead workflow trigger (observation-changed) | High | Accept | Phase 4 |
| 10 | F12 marker-file race unaddressed | High | Accept | Phase 2 |
| 11 | gate-log.jsonl concurrent append corruption | High | Accept | Phase 3 |
| 12 | Bash gate shrink target based on non-existent code | High | Accept | Phase 2 |
| 13 | extract-index is full-scan and hard-stops on errors | High | Accept | Phase 4 |
| 14 | workflows.json fail-open breaks acceptance criteria | High | Accept | Phase 4 |
| 15 | No rollback procedure | Medium | Accept | Phase 2 |

### Whole-Plan Consistency Sweep
All 15 findings integrated. Verified no stale terms remain:
- No "5-second" references
- No "150 lines" targets
- No raw shell-string command references
- `observation-changed` only referenced as explicitly excluded
- All risk tables consistent across phases
- Acceptance criteria aligned with voluntary audit trail model
- Zero unresolved contradictions

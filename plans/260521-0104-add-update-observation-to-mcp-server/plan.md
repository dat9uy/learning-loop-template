---
title: "Add update_observation to constraint-gate MCP server"
description: ""
status: pending
priority: P2
branch: "main"
tags: []
blockedBy: []
blocks: []
created: "2026-05-20T17:59:00.665Z"
createdBy: "ck:plan"
source: skill
---

# Add update_observation to constraint-gate MCP server

## Overview

Add an `update_observation` MCP tool to the constraint-gate server so agents can toggle observation status (active/inactive/archived) without leaving the MCP protocol. This closes the gap where `record_observation` only creates new observations and duplicates are rejected, forcing operators to use Bash or manual edits to change status.

Discovered during evidence-file authoring for fundamental capability closeout (journal 260521).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Decision](./phase-01-decision.md) | Pending |
| 2 | [Tests](./phase-02-tests.md) | Pending |
| 3 | [Implementation](./phase-03-implementation.md) | Pending |
| 4 | [Verification](./phase-04-verification.md) | Pending |

## Dependencies

<!-- Cross-plan dependencies -->

## Red Team Review

### Session — 2026-05-21
**Findings:** 15 (12 accepted, 3 pending user review)
**Severity breakdown:** 4 Critical, 7 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Missing path traversal guard in `updateObservation` write-back | Critical | Accept | Phase 3 |
| 2 | No authorization check — any MCP client can inactivate observations | Critical | Accept | Phase 3 |
| 3 | MCP tool bypasses write gate for `records/observations/**` | Critical | Accept | Phase 3 |
| 4 | `observation-evidence-write-path` already inactive — verification steps wrong | Critical | Accept | Phase 4 |
| 5 | `updateObservation` matches by `id` but gate logic uses `constraint_type` | Critical | Accept | Phase 3 |
| 6 | Race condition on temp file `.tmp` suffix | High | Accept | Phase 3 |
| 7 | Missing import update in `server.js` | High | Accept | Phase 3 |
| 8 | No test for symlink attack on update path | High | Accept | Phase 2 |
| 9 | Production observation modified in-place without rollback | High | Accept | Phase 4 |
| 10 | `updated_at` timestamp manipulation disables inbound gate | High | Accept | Phase 3 |
| 11 | No `updateObservation` export breaks TDD import | High | Accept | Phase 2 |
| 12 | `pnpm validate:records` may fail on modified observations | High | Accept | Phase 3 |
| 13 | `records/decisions/index.yaml` does not exist | Medium | Accept | Phase 1 |
| 14 | `z.enum` usage unverified in codebase | Medium | Accept | Phase 3 |
| 15 | Inbound gate staleness not accounted for in verification | Medium | Accept | Phase 4 |

### Whole-Plan Consistency Sweep

- All 15 findings accepted and integrated into target phases.
- Phase 1: Journal reference clarified (gap discovered in follow-up session, not original journal).
- Phase 2: "Path traversal" changed to "symlinks" in requirements (updateObservation has no path param).
- Phase 3: Architecture updated with symlink guard, path re-validation, unique temp suffix, immutability whitelist, and `z.string().refine()` instead of `z.enum`.
- Phase 4: Overview and requirements rewritten to use temporary observation for e2e testing instead of production file; inbound gate marker step added.
- **Unresolved contradictions:** None.

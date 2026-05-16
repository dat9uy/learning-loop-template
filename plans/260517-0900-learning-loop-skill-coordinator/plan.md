---
title: "Learning-Loop Skill Coordinator"
description: "Transform learning-loop into a universal skill coordinator. PreToolUse hook gates write-capable external skills through learning-loop, which checks state, builds constraint prompts, and returns instructions for Claude to execute target skills under constraints."
status: pending
priority: P1
branch: "main"
tags: [learning-loop, coordinator, hooks, skills, coordination]
blockedBy: []
blocks: []
created: "2026-05-17T09:00:00Z"
createdBy: "ck:plan"
source: skill
brainstorm: plans/reports/brainstorm-20260516-learning-loop-skill-coordination.md
---

# Learning-Loop Skill Coordinator

## Overview

Transform learning-loop from a prompt-authoring skill into a universal skill coordinator. A PreToolUse hook intercepts write-capable skill invocations and routes them through learning-loop, which checks budget/validation state, builds constraint prompts with write allowlists/forbidlists, and returns instructions for Claude to execute the target skill under constraints.

**Architecture:** Three-layer hybrid:
1. **Hook** (rigid) — PreToolUse on Skill tool, reads skill-registry.json, blocks registered skills
2. **CLAUDE.md rules** (routing) — tells Claude to invoke learning-loop when blocked
3. **Coordinator** (logic) — learning-loop checks state, builds constraints, invokes target skill

**Scope:** Only write-capable profiles (code-generation, plan-execution). Read-only skills (test, scout, research, code-review) bypass. External-system profile defined but not used in v1. Project-local hook only.

**Brainstorm:** `plans/reports/brainstorm-20260516-learning-loop-skill-coordination.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Protocol Verification](./phase-00-protocol-verification.md) | Pending |
| 1 | [Coordination Config Schema](./phase-01-coordination-config-schema.md) | Pending |
| 2 | [Hook Script (TDD)](./phase-02-hook-script-tdd.md) | Pending |
| 3 | [Hook Registration](./phase-03-hook-registration.md) | Pending |
| 4 | [SKILL.md Coordinator Expansion](./phase-04-skill-md-coordinator-expansion.md) | Pending |
| 5 | [CLAUDE.md Rules](./phase-05-claude-md-rules.md) | Pending |
| 6 | [Integration Test](./phase-06-integration-test.md) | Pending |

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Trigger mechanism | PreToolUse hook on Skill tool (hard gate). Fallback: UserPromptSubmit hook on /ck:* patterns if Skill tool doesn't exist. |
| Coordinator | learning-loop skill (expanded) |
| Scope | Only write-capable profiles (code-generation, plan-execution, external-system) |
| Hook location | Project-local (`.claude/settings.local.json`) — add hooks alongside existing permissions |
| Skill invocation | Coordinator builds constraint prompt; Claude follows it. NOT programmatic skill dispatch. |
| Write enforcement | Advisory (prompt-level). No filesystem-level enforcement in v1. |
| Config format | JSON |
| Non-skill users | Accepted gap — no file-level enforcement |
| Config integrity | Fail-open in v1 (git tracks changes). CI check deferred to v2. |

## Red Team Review

### Session — 2026-05-17
**Findings:** 11 deduplicated from 28 raw (4 reviewers)
**Severity breakdown:** 5 Critical, 4 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | "Skill" tool may not exist — no evidence in codebase | Critical | Accept | Phase 0 (verify first) |
| 2 | Infinite loop — hook blocks coordinator's own invocations | Critical | Accept | Phase 2 (bypass mechanism) |
| 3 | Skills can't invoke other skills — no API exists | Critical | Accept | Phase 4 (prompt-based, not dispatch) |
| 4 | Hook protocol field names wrong (input.tool vs tool_name) | Critical | Accept | Phase 2 |
| 5 | No project CLAUDE.md — Phase 5 targets phantom file | High | Accept | Phase 5 (create, not modify) |
| 6 | Write allowlists are advisory only | High | Accept | plan.md (documented) |
| 7 | Post-execution steps undefined | Critical | Accept | Phase 4 (remove from v1 or specify) |
| 8 | coordinator-rules.md is a content vacuum | High | Accept | Phase 4 (must have actual content) |
| 9 | settings.json may shadow global hooks | High | Accept | Phase 3 (verify merge behavior) |
| 10 | Config files have no integrity protection | Critical | Reject (v1) | Known limitation |
| 11 | Test file extension mismatch (.js vs .cjs) | Medium | Accept | Phase 2 (use .cjs) |

### Key Design Pivot

Red team found zero evidence that the "Skill" tool exists as a PreToolUse-interceptable tool. Phase 0 verifies this empirically before any implementation. If the Skill tool doesn't exist, the design pivots to a UserPromptSubmit hook that detects /ck:* patterns in user messages.

## Dependencies

- State-machine plan (`260516-1200-state-machine-for-irreversible-operations`) — completed, provides budget checking infrastructure
- Learning-loop orchestration (`260513-1538-learning-loop-orchestration`) — completed, provides orchestration patterns

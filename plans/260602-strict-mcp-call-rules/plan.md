---
title: "Strict MCP-Call Rules: Gate Scope Predicate + SessionStart Hook"
description: "Implements the design in plans/reports/brainstorm-260602-strict-mcp-call-rules.md. Two TDD phases: (1) gate scope_predicate field on meta_state_promote_rule and loadPromotedRules so the new rule-project-skill-boundary only fires in projects that have their own .mcp.json; (2) project-level .factory/hooks.json + loop-surface-inject.cjs that auto-injects loop_describe({tier:\"summary\"}) on Droid SessionStart events, closing G7 (loop_describe adoption = 0 outside tests). Addresses prompt/behavior gap that 260602-self-enforcing-loop and 260602-meta-state-lifecycle-tidy left open."
status: pending
priority: P2
branch: "main"
tags: [meta, gate, mcp, enforcement, anti-pattern, hook, session-start, tdd, followup]
blockedBy:
  - 260602-self-enforcing-loop
blocks: []
related:
  - plans/reports/brainstorm-260602-strict-mcp-call-rules.md
  - plans/reports/research-260602-droid-session-start-support.md
  - 260602-meta-state-lifecycle-tidy
  - meta-260601T1353Z-use-mcp-skill-scripts-under-factory-skills-use-mcp-scripts-r
  - tools/learning-loop-mcp/core/gate-logic.js
  - tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js
  - tools/learning-loop-mcp/hooks/bash-gate.js
  - tools/learning-loop-mcp/hooks/write-gate.js
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
  - ~/.factory/settings.json
created: "2026-06-02T07:50:00Z"
createdBy: "ck:plan --tdd (ck CLI blocked by G8 false positive; created via Create tool per AGENTS.md fallback)"
source: skill
---

# Strict MCP-Call Rules: Gate Scope Predicate + SessionStart Hook

## Overview

Implements the design in `plans/reports/brainstorm-260602-strict-mcp-call-rules.md` (which is grounded in `plans/reports/research-260602-droid-session-start-support.md`). Two TDD phases ship a new gate-enforced rule and a new Droid `SessionStart` hook to close two prompt/behavior gaps:

- **Gap 1 (misrouting):** An agent inside a project that has its own `.mcp.json` called `ck:use-mcp` — a cross-project tool-discovery skill. The skill's scripts were not installed; the install was blocked by the bash gate. The original entry (`meta-260601T1353Z-...`) was resolved as "tool missing" with no persistent rule. Nothing prevents recurrence.
- **Gap 2 (adoption):** `loop_describe` was shipped in `260602-self-enforcing-loop` with AGENTS.md/CLAUDE.md recommendations. The follow-up `260602-meta-state-lifecycle-tidy` plan measured adoption = 0 in real sessions (G7, out of scope).

The fix is **mechanical enforcement** for both: a gate-enforced rule with a `scope_predicate` that only fires in projects that have their own MCP server, plus a Droid `SessionStart` hook that auto-injects the loop surface at session start.

**Surface:** `meta` (changes to the loop's own machinery). Both phases are loop-internal; no `product/**` writes.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [G8 Observation + Scaffolding](./phase-00-g8-observation-and-scaffolding.md) | pending |
| 1 | [Gate Scope Predicate](./phase-01-gate-scope-predicate.md) | pending |
| 2 | [SessionStart Hook](./phase-02-session-start-hook.md) | pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-self-enforcing-loop` | done | Foundation: `meta_state_promote_rule`, `loadPromotedRules`, `applyPromotedRules`, `loop_describe` |
| Complementary (no blocker) | `260602-meta-state-lifecycle-tidy` | pending (0/4) | Different gaps: G8 false-positive fix, G9 introspect filter, sweep tool, auto_resolve cleanup. This plan does not touch any of those code paths. |
| References | `260601-bridge-2-candidate-to-experiment` | (closed) | The journal that contains the original misrouting observation (`meta-260601T1353Z-...`) |

## Resolved Decisions (from brainstorm + research)

1. **Discovery event:** Droid `SessionStart` (first-class hook, stdout → context). Research evidence: `plans/reports/research-260602-droid-session-start-support.md` cites Factory `reference/hooks-reference.md` and `guides/hooks/session-automation.md`. The `UserPromptSubmit` + marker-file fallback is retained only as defense-in-depth in the Risks section.
2. **Cache invalidation:** No cache. Live read on every `SessionStart` (YAGNI).
3. **Rule name:** `rule-project-skill-boundary`.
4. **Rule pattern:** `**/.factory/skills/{use-mcp,find-skills}/**` (glob). Catches the two known cross-project tool-discovery skills.
5. **Rule scope:** `scope_predicate: "project_has_learning_loop_mcp"` — only fires when the project has `.mcp.json` AND registers a `learning-loop-mcp` server entry. Plain projects get no noise.
6. **Hook config location:** Project-level `.factory/hooks.json` (per Factory's new convention). Project-scoped, commits to the repo. The hook script lives at `.factory/hooks/loop-surface-inject.cjs`.
7. **Hook matcher:** `startup` (canonical). Optionally also `resume`/`clear`/`compact` for resilience — Phase 2 decision.
8. **No `ck` CLI use during scaffolding:** `ck plan create` is blocked by the active `rule-no-new-artifact-types` regex (matches the word `create`). Per AGENTS.md fallback, the plan and phase files are written via the `Create` tool directly. Recorded as a live G8 instance in Phase 0.

## Context Tiering

Not applicable — this plan does not modify `loop_describe`. The `SessionStart` hook calls `loop_describe({tier:"summary"})` and inherits its existing context-size contract (~1KB summary).

## Source Documents

- `plans/reports/brainstorm-260602-strict-mcp-call-rules.md` — design (3 approaches evaluated, B+C chosen)
- `plans/reports/research-260602-droid-session-start-support.md` — evidence chain for `SessionStart` lifecycle support
- `docs/philosophy.md` — loop philosophy
- `docs/observation-vs-meta-state.md` — layer separation
- `tools/learning-loop-mcp/core/gate-logic.js` — `loadPromotedRules` (line 434), `applyPromotedRules` (line 471), `isGlobScopeWhitelisted` (line 411)
- `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — current zod schema (line 23)
- `tools/learning-loop-mcp/hooks/bash-gate.js` — `loadPromotedRules` consumer (line 103)
- `tools/learning-loop-mcp/hooks/write-gate.js` — `loadPromotedRules` consumer (line 144)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — `loop_describe` MCP tool (called by the hook)
- `~/.factory/settings.json` — current user-level hook config (no `SessionStart` yet)
- `meta-260601T1353Z-...` — the misrouting observation this plan addresses
- `260602-self-enforcing-loop/plan.md` — RT findings 7 (status:disabled), 14 (agent meta-cognition), 15 (operator preview) directly inform this design

## Success Criteria (Whole-Plan)

- [ ] `meta_state_promote_rule` accepts a new optional `scope_predicate` field (`none` | `project_has_learning_loop_mcp`)
- [ ] `loadPromotedRules` evaluates `scope_predicate` against project context; rules with `none` fire globally (current behavior); rules with `project_has_learning_loop_mcp` only fire when the project has `.mcp.json` + `learning-loop-mcp` entry
- [ ] New meta-state entry `meta-260602T0750Z-...` exists with `status: "active"`, `enforcement: "gate"`, `rule_id: "rule-project-skill-boundary"`, `scope_predicate: "project_has_learning_loop_mcp"`
- [ ] The new entry is enforced end-to-end (glob match in matching project, no match in plain project)
- [ ] New project-level `.factory/hooks.json` registers `SessionStart` with matcher `startup`
- [ ] New `.factory/hooks/loop-surface-inject.cjs` exits silently when no `.mcp.json` or no `learning-loop-mcp` entry
- [ ] New script spawns the MCP server and calls `loop_describe({tier:"summary"})` in matching project; prints a 1-2KB block to stdout
- [ ] `pnpm test` passes (current 423 + 11 new = 434/434 after red-team +1 G8 smoke test)
- [ ] `pnpm validate:records` passes
- [ ] No regression in existing 4 promoted-rule integration tests
- [ ] G8 false-positive observation recorded in `meta-state.jsonl` via `meta_state_report` (Phase 0 deliverable)

## Red Team Review

### Session — 2026-06-02
**Status:** NOT RUN (default `--tdd` mode does not include red-team; user did not request `--hard` or `--deep`). Risks surfaced during brainstorming are documented inline in the phase files. Operator may run `/ck:plan red-team plans/260602-strict-mcp-call-rules/` for a formal pass before cook.

## Whole-Plan Consistency Sweep

After writing the phase files, re-read `plan.md` + `phase-00-*.md` + `phase-01-*.md` + `phase-02-*.md`. Search for:

- Stale terms: `rule-no-cross-project-skill-in-project` (old name) should NOT appear; only `rule-project-skill-boundary`
- Stale fallback: `UserPromptSubmit` + marker file should appear only in Risks (defense-in-depth), not in the canonical implementation
- Stale assumptions: `ck plan create` should be noted as blocked-by-G8; scaffold via `Create` tool per AGENTS.md
- Cross-file consistency: `scope_predicate` enum values match between the zod schema (Phase 1), the loadPromotedRules filter (Phase 1), and the meta-state entry (Phase 1 deliverable)
- Stale field name: `meta_state_promote_rule` schema does not currently have `scope_predicate`; phase-01 must add it
- Hook config: `SessionStart` event is referenced consistently; `matcher: "startup"` is the default
- File paths: `.factory/hooks.json` (project root) + `.factory/hooks/loop-surface-inject.cjs` (script) — verify both paths are consistent across the report and the design

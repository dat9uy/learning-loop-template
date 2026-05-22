---
title: "Artifact-Aware Gate Enforcement"
description: "Implement the three-layer defense from brainstorm report 260522: artifact-aware write gate (primary), plan template with Phase 0 loop pre-flight (secondary), and CI validator script (tertiary). Enforces learning-loop compliance at the write boundary without modifying skills."
status: pending
priority: P1
branch: "main"
tags: [gate, enforcement, learning-loop, product-build, coordination]
blockedBy: []
blocks: []
created: "2026-05-22T01:19:01.344Z"
createdBy: "ck:plan"
source: skill
---

# Artifact-Aware Gate Enforcement

## Overview

Implement the three-layer defense from `plans/reports/brainstorm-260522-loop-coordination-integration.md` to bridge the gap between global skills and the local learning-loop record system. No skill changes — enforcement happens at the write boundary via the existing gate infrastructure.

**Layer 1 (Primary)**: Artifact-aware write gate. When writing `plans/**/plan.md` with `tags: [product-build]`, the gate checks for decision records. When writing `product/**`, the gate infers the surface and checks for decisions. Start in **warn** mode; graduate to **escalate** after validation.

**Layer 2 (Secondary)**: Plan templates with Phase 0 loop pre-flight. Product-build plans declare surfaces and verify decision records before implementation phases.

**Layer 3 (Tertiary)**: CI validator script (`tools/validate-plan-loop.js`) scans plans for missing loop phases and decision coverage.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Gate Content Scanning](./phase-01-gate-content-scanning.md) | Pending |
| 2 | [Surface Inference & Product Code Gating](./phase-02-surface-inference-product-code-gating.md) | Pending |
| 3 | [Plan Template Update](./phase-03-plan-template-update.md) | Pending |
| 4 | [CI Validator Script](./phase-04-ci-validator-script.md) | Pending |
| 5 | [CLAUDE.md Documentation](./phase-05-claude-md-documentation.md) | Pending |
| 6 | [Integration & Final Validation](./phase-06-integration-final-validation.md) | Pending |

## Current Status

Validation complete. All critical questions answered; plan updated accordingly. Ready for cook.

## Validation Results

**Date**: 2026-05-22
**Trigger**: `/ck:plan validate` after plan creation
**Questions asked**: 5
**Answers applied**: 5

| # | Question | Answer | Plan Impact |
|---|----------|--------|-------------|
| 1 | Hook content access — does PreToolUse receive file content? | Verified: hooks receive `tool_input.content` for Write, `tool_input.new_string` for Edit (`.claude/coordination/hooks/README.md:55-61`). No MCP/agentize needed. | Phase 1: added content source verification note |
| 2 | Existing completed plans without Phase 0? | Grandfather — skip completed/cancelled plans in validator | Phase 4: added grandfather clause + test case |
| 3 | Template discoverability for `ck:plan` skill? | Three-channel approach: `CLAUDE.md` instructs agents, `learning-loop` skill references template, gate enforces mechanically | Phase 3: added "Template Discoverability Mechanism" section |
| 4 | Unknown `product/<segment>` paths trigger warnings? | Intentional — surface must be explicit | No change; confirmed in risk assessment |
| 5 | Gate performance with extra stat call? | Acceptable for now; may push to MCP/separate agent later | No change; performance benchmark in phase 6 |

**Unresolved contradictions**: 0

## Dependencies

- `plans/260522-0000-records-surface-restructure/` (pending) — touches same gate files (`gate-utils.cjs`, `gate-logic.js`). Our plan modifies `write-coordination-gate.cjs` (hook) which is not directly modified by the restructure plan, but shared utilities may conflict. Both plans support dual path conventions (flat + surface-first) to remain compatible regardless of execution order.
- `plans/reports/brainstorm-260522-loop-coordination-integration.md` — source of the three-layer defense design.
- `pnpm validate:records` and `pnpm check` must work on current main.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Gate response mode | `warn` (default), `escalate` (opt-in) | Start permissive; graduate after operator validates across 3+ builds |
| Path convention | Dual: surface-first + flat fallback | Compatible with pending surface-restructure plan regardless of execution order |
| Content scanning | Read file directly, 2KB limit | No marker file drift; latency acceptable for first-write-only |
| Plan template | Advisory only | Gate is mechanical; template guides operator |
| Journal handling | Allow unconditionally + suggest | Journals are agent observations, not formal records |

## Risks

| Risk | Mitigation |
|------|------------|
| Surface-restructure plan conflicts with our gate changes | Dual path support; phase 6 integration test validates both conventions |
| Gate content scanning adds latency | First-write-only; 2KB limit; benchmark in phase 6 |
| Frontmatter parsing is fragile | Fail-open design; malformed frontmatter → allow write |
| Operator ignores warnings | Escalate mode available; CI validator catches post-facto |
| Journal suggestion spam | Emit once per session; suppress duplicates |

## Success Criteria

- All gate tests pass (7 content-scanning + 9 surface-inference)
- Validator tests pass (7 cases)
- Integration test passes (full workflow simulation)
- No regressions in existing test suites
- Gate latency < 50ms for content scan
- Validator latency < 1s
- `pnpm check` completes successfully

## Cross-Plan Coordination

The pending `260522-0000-records-surface-restructure` plan updates `WRITE_PATH_PATTERNS` in `gate-utils.cjs` and `gate-logic.js`. Our plan adds new functions (`readDecisionRecords`, `inferSurface`, `hasDecisionRecords`) to `gate-utils.cjs` and modifies `write-coordination-gate.cjs`. The restructure plan does not modify `write-coordination-gate.cjs` directly.

**Resolution**: Both plans add to `gate-utils.cjs` (different functions). Merge conflict risk is low. If both plans execute in the same session, coordinate via git to merge `gate-utils.cjs` changes. Our plan's new functions are additive and should apply cleanly on top of the restructure's pattern updates.

## Cook Handoff

Run after plan approval:

```bash
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260522-1500-artifact-aware-gate/plan.md
```

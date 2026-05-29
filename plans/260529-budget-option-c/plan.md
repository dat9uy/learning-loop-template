---
title: "Option C: Agent-Managed Budget, Gate Removes Enforcement"
description: "Remove budget exhaustion escalation from the constraint gate. The gate becomes meta-level only (observation existence). The agent manages budget decisions using domain observations and records reasoning in meta-state. This is the long-term direction from the budget escalation brainstorm."
status: completed
priority: P1
branch: "main"
tags: [budget, gate, meta-state, agent-prompt, domain-separation]
blockedBy: []
blocks: []
created: "2026-05-29T11:02:56.548Z"
createdBy: "ck:plan"
source: skill
---

# Option C: Agent-Managed Budget, Gate Removes Enforcement

## Overview

The Option A fix (scoped budget escalation) made the gate correctly scope escalation to matching constraint types. However, the gate still cannot distinguish between an idempotent re-run (same host, safe) and a fresh install in a new container (violates budget). The gate is a regex-based string matcher with no runtime context. It should not be enforcing domain resource limits.

This plan implements the long-term direction from `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md`: remove budget enforcement from the gate entirely. The gate becomes meta-level only ("does an observation exist for this constraint?"). The agent, which has runtime context (host fingerprint, container ID, command history), becomes responsible for reading domain observations, checking budget and ledger context, and deciding whether to proceed. The agent records its reasoning in meta-state via `meta_state_report` for auditability.

## Background

From `docs/observation-vs-meta-state.md`:

> The gate reads domain observations to check if they exist (meta-level: "has someone recorded this constraint?"). The gate does not enforce domain resource limits (domain-level: "do we have budget left?").

The current gate still has a `budgetStatus` branch in `makeGateDecision`. This branch blocks all `vendor-api` commands when the budget is exhausted, even when the agent could determine the command is safe. Removing this branch means:

- The gate passes `vendor-api` commands when an observation exists (fresh, not stale)
- The agent must call `budget_check` before executing vendor commands
- The agent must check the ledger fingerprint before proceeding
- The agent records its reasoning in meta-state

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Gate Budget Removal](./phase-01-gate-budget-removal.md) | Pending | 2h |
| 2 | [Meta-State Category Extension](./phase-02-meta-state-category-extension.md) | Pending | 1h |
| 3 | [Agent Prompt Update](./phase-03-agent-prompt-update.md) | Pending | 1h |
| 4 | [Integration Validation](./phase-04-integration-validation.md) | Pending | 2h |

## Dependencies

### Cross-Plan
- None. This plan extends the completed `260529-budget-escalation` (Option A) but does not overlap files.
- `260529-budget-escalation` is `completed` — no conflict.

### Informed By
- `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md` — the brainstorm that identified Option C
- `docs/observation-vs-meta-state.md` — the layer separation design
- `260529-budget-escalation` (Option A) — the scoped escalation fix that this plan extends

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent forgets to check budget before vendor command | Medium | Agent prompt update + meta-state audit trail |
| Budget observation goes stale | Low | Inbound gate already warns on stale observations |
| Gate removal weakens safety | Low | Gate still blocks commands without any observation; `side-effect-import` hard block stays |
| `side-effect-import` false positives | Low | Only vnstock-specific; no other packages use this pattern |
| Test suite has 224+ tests; mass change is risky | Medium | TDD: write tests first, then remove code, then verify all tests pass |
| MCP server `gate_check` still enforces budget (gate-tool.js) | Critical | Include gate-tool.js in Phase 1; remove budget logic there too |
| Ledger format is ad-hoc; agent reads directly | Medium | Document ledger format in agent prompt; future: add ledger-reading MCP tool |
| Budget-check meta-state entries have 24h TTL | Medium | Budget-check entries are audit trail; consider longer TTL or dedicated audit file |

## Validation Log

### Validation Session 1 — 2026-05-29

**Red team findings adjudicated:**
| # | Severity | Finding | Decision |
|---|----------|---------|----------|
| 1 | Critical | Gate removal leaves zero safety net | Accepted: agent owns budget, prompt + meta-state audit trail |
| 2 | High | `gate-tool.js` still enforces budget | Accepted: remove budget from `gate-tool.js` in Phase 1 |
| 3 | High | `cross-surface.test.js` missing vendor-api cases | Accepted: add vendor-api test case in Phase 1 |
| 4 | High | `write-gate.js` does not read budgets | Accepted: no change needed for write-gate, verified |
| 5 | High | `budget_check` does not return fingerprint | Accepted: agent reads ledger directly, documented in Phase 3 |
| 6 | High | Zod enum requires code change + MCP restart | Accepted: keep strict enum, add vendors as needed |
| 7 | Medium | Budget-check entries have 24h TTL | Accepted: keep 24h TTL, meta-state is ephemeral by design |
| 8 | Medium | Ledger format is ad-hoc | Accepted: agent reads directly, future: add ledger tool if needed |
| 9 | Medium | `evaluateBudget` is dead code in gate | Accepted: keep as utility, move to `budget-checker.js` in future if desired |
| 10 | Medium | `side-effect-import` only covers vnstock | Accepted: add generic rule to agent prompt in Phase 3 |

**User decisions (validation interview):**
1. Remove budget from `gate-tool.js` (consistent with gate hooks)
2. Keep strict Zod enum for `affected_system` (add vendors as needed)
3. Keep 24h TTL for budget-check entries (meta-state is ephemeral)
4. Keep direct file read for ledger (simpler, no new tool)
5. Implement Option C now (clean separation, agent has `budget_check`)

**Verification Results:**
- Claims checked: 15
- Verified: 12 | Failed: 0 | Unverified: 3
- Tier: Standard
- Unverified: `__tests__/gate-logic-budget.test.js` existence (not found, may be named differently), `observation-vnstock-device-slot-ledger.yaml` schema (ad-hoc, not validated), `meta-state.jsonl` compaction behavior (not tested)

## Success Metrics

| Metric | Target |
|--------|--------|
| Gate no longer contains `budgetStatus` in `makeGateDecision` | Yes |
| `budget_check` tool returns generic fields (no vnstock-specific schema) | Yes |
| `meta_state_report` accepts `category: "budget-check"` | Yes |
| Agent prompt includes budget-check rule | Yes |
| Agent can execute safe idempotent command when budget is 1/1 | Yes |
| Meta-state contains `budget-check` entry after execution | Yes |
| All 224+ tests pass | Yes |
| `side-effect-import` hard block unchanged | Yes |
| `gate-tool.js` (MCP server) no longer enforces budget | Yes |

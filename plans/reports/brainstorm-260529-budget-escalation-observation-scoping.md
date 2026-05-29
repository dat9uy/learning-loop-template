---
date: "2026-05-29T00:00:00Z"
tags: [brainstorm, budget, gate, observation, meta-state, domain]
---

# Budget Escalation and Observation Scoping

## Problem Statement

The gate's budget escalation logic conflates two layers:

1. **Domain-level resource budget** (vnstock vendor device slots, `budget: 1`, `current: 1`) — tracks how many slots the operator has left.
2. **Meta-level constraint enforcement** (gate blocks commands based on regex patterns) — the gate says "this command pattern is risky."

The gate treats an exhausted domain budget as a **global escalation** against any constrained command, regardless of whether the command actually touches that domain. A `pnpm add` (constraint: `package-manager`) gets blocked by a `vnstock_vendor` budget exhaustion. The error message blames the wrong constraint.

Additionally, the budget counter has no context awareness: it cannot distinguish between an idempotent re-run on the same host (safe, no new slot) and a fresh install in a new container (violates budget).

## Findings

### Finding 1: Orthogonal escalation

`makeGateDecision` checks budget exhaustion **before** checking whether the command's constraint matches the budget's constraint_type.

```javascript
// Current behavior: any exhausted budget blocks any constrained command
if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
  if (constraintMatch) {
    return {
      decision: "escalate",
      reason: `Budget exhausted for constraint "${constraintMatch}".`
      // ^ wrong: reports the command's constraint, not the budget's resource
    };
  }
}
```

### Finding 2: Context-blind counter

The budget is `budget: 1, current: 1`. It does not know:
- Which host fingerprint is running the command
- Whether the command is idempotent (same host, same device_id)
- Whether the command is safe (runtime probe, not installer)

The ledger (`observation-vnstock-device-slot-ledger`) has this context, but the gate does not read it.

### Finding 3: The separation between meta and domain is muddy

The gate (meta-level) should enforce: "Is there an observation for this constraint?" The domain observation should enforce: "Do we have budget for this resource?" Currently, the gate does both.

## Evaluated Approaches

### Option A: Scoped Budget Escalation (Immediate Fix)

**Idea:** Only escalate when the exhausted budget's `constraint_type` matches the command's `constraintMatch`.

**Change:**
- `evaluateBudget` returns the matched observation's `constraint_type` and `external_system`/`resource`
- `makeGateDecision` checks: `budgetStatus.constraint_type === constraintMatch`
- Error message: `Budget exhausted for "vendor-api" (vnstock_vendor device_slots: 1/1 used)`

**Pros:**
- Fixes the UX bug (no more `package-manager` blocked by `vnstock`)
- Minimal code change (5 lines in `gate-logic.js`)
- Backward compatible

**Cons:**
- Does not solve context-awareness (Problem 2)
- Still blocks all `vendor-api` commands when budget is exhausted

**Verdict:** Recommended for immediate implementation.

### Option B: Context-Aware Budget in Gate

**Idea:** The gate reads `device_id` and `fingerprint` from the budget observation and checks whether the current context matches.

**Pros:**
- Would solve both problems at the gate level

**Cons:**
- The gate is a regex-based string matcher; it has no runtime context (host fingerprint, container ID)
- Complexity explosion: the gate would need to run environment probes
- The gate should be a lightweight safety net, not a resource orchestrator

**Verdict:** Rejected — over-engineering.

### Option C: Agent-Managed Budget, Gate Removes Enforcement

**Idea:**
- The gate stops enforcing budget exhaustion entirely
- The gate only checks: "Is there an active observation for this constraint?" (meta-level)
- The agent reads the domain observation (`budget: 1`, `current: 1`) before executing vendor commands
- The agent records its reasoning in `meta-state.jsonl` (e.g., "same fingerprint, idempotent, safe to proceed")

**Critical clarification:** This does NOT move budget data into meta-state. The budget stays in `records/observations/`. The meta-state only tracks the agent's reasoning.

**Pros:**
- Solves both problems cleanly
- Gate stays simple (meta-level only)
- Agent has context to make smart decisions
- Aligns with existing meta-state registry design

**Cons:**
- Agent must reliably check the budget before proceeding
- Softer guard than a hard gate stop
- Requires MCP tool for agent to query budget

**Verdict:** Recommended as long-term direction.

### Option D: Hybrid — Gate Blocks, Agent Overrides

**Idea:** Gate blocks all `vendor-api` commands when budget is exhausted. Agent can request override via MCP tool if context is safe.

**Pros:**
- Conservative default + agent override
- Audit trail in meta-state

**Cons:**
- More moving parts
- Override mechanism could be abused

**Verdict:** Not recommended. If the agent is trusted to override, the gate is just friction. If not trusted, the override is a bypass.

## Final Recommendation

**Option A now, Option C as the long-term direction.**

1. **Immediate:** Scope the budget escalation to matching constraint types. This is a bug fix, not a design change.
2. **Future:** Remove budget enforcement from the gate. The gate should only enforce observation existence. The agent should manage budget decisions using the domain observation and the meta-state registry.

## Layer Separation (to be documented)

| Layer | Home | What it tracks | Who owns it |
|-------|------|----------------|-------------|
| **Domain** | `records/observations/*.yaml` | Budget numbers, device IDs, fingerprints | Operator (via MCP CRUD tools) |
| **Meta** | `tools/learning-loop-mcp/meta-state.jsonl` | Agent reasoning, findings, decisions | Agent (via MCP tools) |
| **Gate** | `core/gate-logic.js` | Constraint pattern matching, observation existence | Code (regex, rules) |

**Rule:** The gate reads domain observations to check existence, but does not enforce domain resource limits. Budget enforcement belongs to the agent, with reasoning captured in meta-state.

## Implementation Considerations

### Option A implementation

- Modify `evaluateBudget` in `gate-logic.js` to return `constraint_type` and `resource` fields
- Modify `makeGateDecision` to check `budgetStatus.constraint_type === constraintMatch`
- Update error message to include `external_system` and `resource`
- Update tests in `__tests__/cross-surface.test.js` and `gate-logic.test.js`

### Option C prerequisites

- `meta_state_report` tool must be available (already implemented in `260527-meta-state-registry`)
- Agent prompt update: "Before executing vendor-api commands, check `observation-vnstock-resource-budget`"
- MCP tool for agent to read budget observation without triggering the gate

## Risks

| Risk | Mitigation |
|------|------------|
| Agent forgets to check budget | Agent prompt + meta-state logging for audit |
| Budget observation goes stale | Inbound gate already warns on stale observations |
| Gate removal weakens safety | Gate still blocks commands without any observation |

## Success Metrics

- Option A: `pnpm add` no longer blocked by `vnstock` budget; correct error message for `vendor-api` commands
- Option C: Agent can execute safe idempotent commands when budget is exhausted; meta-state records the reasoning

## Next Steps

1. Implement Option A (scoped escalation) as a fix PR
2. Document the layer separation in `docs/observation-vs-meta-state.md`
3. Update agent prompts to reference budget observations before vendor commands
4. When agent budget management proves reliable, remove budget branch from `makeGateDecision`

## Option C Design Decisions (Resolved 2026-05-29)

### 1. Meta-state category — `budget-check` (generic, not vnstock-specific)

Add `budget-check` to the `meta_state_report` category enum. The entry schema:

```json
{
  "id": "meta-260529T1530Z-budget-check-vnstock-device-slots",
  "category": "budget-check",
  "severity": "warning",
  "affected_system": "vnstock_vendor",
  "description": "Agent checked budget before vendor-api command. Budget: 1/1, fingerprint matches ledger entry 0637fff6c615f57b73e646206fdf774d. Decision: proceed (idempotent re-run).",
  "evidence": {
    "observation": "records/observations/observation-vnstock-resource-budget.yaml",
    "ledger": "records/observations/observation-vnstock-device-slot-ledger.yaml"
  },
  "status": "reported"
}
```

### 2. `budget_check` MCP tool — keep minimal

The tool returns budget numbers, stale status, and window state. It does NOT return fingerprint or ledger context. The agent reads the ledger observation separately via `index_search` or direct file read. This keeps the tool generic and applicable to any external system.

### 3. `side-effect-import` hard block — stays in gate

This is a command-level safety rule (importing reactivates cleared devices), not a resource-level rule. The gate enforces it because it has zero false positives: any `import vnstock_data` is dangerous. This is a domain-specific exception that belongs in the gate as a hard block, similar to `records/observations/**` writes.

### 4. Budget branch removal — remove now from `makeGateDecision`

The gate's budget check is a blunt instrument that blocks all `vendor-api` commands when budget is 1/1. The Option A fix made it correctly scoped, but it still cannot distinguish idempotent re-runs from new installs. The agent has the ledger context to make this distinction.

### Agent Flow (Option C)

```
1. Gate passes vendor-api command
   → observation exists, fresh, not stale
2. Agent calls budget_check(system="vnstock", resource="device-slots")
   → sees budget: 1, current: 1, remaining: 0
3. Agent reads observation-vnstock-device-slot-ledger
   → checks fingerprint match against current host
4. Agent decides: "same fingerprint as ledger entry, idempotent, safe"
5. Agent calls meta_state_report(category="budget-check", ...)
   → records reasoning in meta-state.jsonl
6. Agent proceeds with command
```

### Gate Logic (Option C)

```javascript
// makeGateDecision — budget branch removed
if (constraintMatch === "side-effect-import") {
  return { decision: "block", ... }; // hard block stays
}

// No budget escalation. Gate is meta-level only.

// Constraint matched but no active observation → block
if (!observationStatus?.found) {
  return { decision: "block", ... };
}

return { decision: "ok" };
```

## Implementation Plan for Option C

### Phase 1: Remove budget branch from gate
- `gate-logic.js`: remove `budgetStatus` from `makeGateDecision` signature
- `bash-gate.js`: remove `readBudgets` and `evaluateBudget` loop
- `budget-checker.js` and `check-budget-tool.js`: keep as agent tools (no changes)
- Tests: update all budget-escalation tests to expect `ok` instead of `escalate`

### Phase 2: Extend meta-state category enum
- `meta-state-report-tool.js`: add `budget-check` to category enum
- `meta-state.js`: add `budget-check` validation (if any)
- `meta-state.test.js`: add test for budget-check entry

### Phase 3: Update agent prompt
- `AGENTS.md` / `CLAUDE.md`: add agent rule: "Before executing vendor-api commands, check budget observation and ledger"
- Add rule: "Record budget-check reasoning in meta-state via meta_state_report"

### Phase 4: Integration validation
- End-to-end test: agent executes `curl api.vnstock.com` when budget is 1/1
- Gate should pass (observation exists)
- Agent should check budget, read ledger, record meta-state, then proceed
- Verify meta-state.jsonl contains budget-check entry

## Risks (Updated)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent forgets to check budget | Medium | Agent prompt + meta-state audit trail |
| Budget observation goes stale | Low | Inbound gate already warns on stale observations |
| Gate removal weakens safety | Low | Gate still blocks commands without any observation; side-effect-import hard block stays |
| `side-effect-import` false positives | Low | Only vnstock-specific; no other packages use this pattern |

## Success Metrics (Updated)

- Option A: `pnpm add` no longer blocked by `vnstock` budget; correct error message for `vendor-api` commands (COMPLETED)
- Option C: Agent can execute safe idempotent commands when budget is exhausted; meta-state records the reasoning
- Option C: `budget_check` tool returns generic fields, not vnstock-specific
- Option C: Gate no longer contains `budgetStatus` in `makeGateDecision`

## Unresolved Questions

- Should the `sudo` constraint have its own budget observation, or should `sudo` be treated differently from `vendor-api`? (sudo is a system-level capability, not a vendor resource)
- Should we add a `budget-check` severity enum (e.g., `proceed`, `stop`, `ask-operator`) or keep the generic `warning`/`escalate`?

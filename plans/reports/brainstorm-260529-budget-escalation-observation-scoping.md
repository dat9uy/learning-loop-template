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

## Unresolved Questions

- Should the `sudo` constraint have its own budget observation, or should `sudo` be treated differently from `vendor-api`? (sudo is a system-level capability, not a vendor resource)
- How does the agent report "I checked the budget and it was safe" vs "I checked the budget and it was exhausted but I overrode"? The meta-state registry's `meta_state_report` tool handles this, but the schema for budget-related entries is not yet defined.

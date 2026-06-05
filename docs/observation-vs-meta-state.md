---
date: "2026-05-29T00:00:00Z"
tags: [meta-state, observation, separation, domain, gate]
---

# Observation vs. Meta-State: Layer Separation

This document defines the boundary between two systems that sound similar but serve different purposes: **observations** (domain-level, operator-managed, YAML) and **meta-state** (meta-level, agent-maintained, JSONL). The gate sits between them. Getting this boundary wrong leads to the two problems documented in `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md`.

## The Three Layers

| Layer | Home | What it tracks | Who owns it | Durability |
|-------|------|----------------|-------------|------------|
| **Domain** | `records/observations/*.yaml` | External system state (budgets, device slots, vendor API status) | Operator (via MCP CRUD tools) | Durable, versioned |
| **Meta** | `tools/learning-loop-mcp/meta-state.jsonl` (exposed as 10 MCP tools: `meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`, `meta_state_promote_rule`, `meta_state_log_change`, `meta_state_sweep`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, plus `meta_state_query_drift` planned) | System-level findings (agent decisions, reasoning, bug reports) AND change-log entries (agent logs its own system modifications) | Agent (via MCP `meta_state_*` tools) | Discriminated union: `entry_kind: "finding"` is ephemeral (24h TTL with auto-resolve); `entry_kind: "change-log"` is immutable audit log (no TTL, no auto-resolve) |
| **Gate** | `core/gate-logic.js` | Constraint pattern matching, observation existence | Code (regex, rules) | Stateless, reads fresh every call |

## Rule: The Gate Is Meta-Only

The gate **reads** domain observations to check if they exist (meta-level: "has someone recorded this constraint?"). The gate **does not** enforce domain resource limits (domain-level: "do we have budget left?").

**What the gate does:**
- Match command strings against regex patterns (`patterns.json`)
- Strip message flags (`-m`, `--message`, `--title`, `--description`, `--body`) and their values before matching to prevent false positives from quoted commit messages, PR titles, etc.
- Check if an active observation exists for the matched constraint
- Block commands that have no observation ("no one has approved this constraint")
- Escalate when an observation is stale ("operator may have changed state, verify first")

**What the gate does NOT do:**
- Track `budget` vs `current` counters
- Know which host fingerprint is running the command
- Decide whether a command is idempotent or safe
- Enforce domain-specific resource limits

Budget enforcement belongs to the **agent**, which has the context to make smart decisions. The agent reads the domain observation, checks the context, decides whether to proceed, and records its reasoning in meta-state.

## The Funnel

```
Command string
      |
      v
  Gate: "Does an observation exist for this constraint?"
      |
      +-- no observation  -> BLOCK (observation_required)
      |
      +-- stale observation -> ESCALATE (verify first)
      |
      +-- fresh observation -> OK (pass to agent)
      |
      v
  Agent: "Given the domain state, is this command safe?"
      |
      +-- checks budget numbers, fingerprint, context
      +-- reads domain observation (not gate)
      +-- decides proceed / stop / ask operator
      |
      v
  Meta-State: "I checked the budget and decided X because Y"
      |
      +-- records reasoning in meta-state.jsonl
      +-- future sessions can query this finding
```

## Why This Separation Matters

### The sudo example

A `sudo` command is matched by the gate's `sudo` pattern. The gate checks: is there an active observation for `sudo`? If yes, it passes. The gate does not check whether the `sudo` command is for `vnstock` installation or for `git pull`. That is the agent's job.

### The budget example

A `vendor-api` command (e.g., `curl` to the vendor API) matches the `vendor-api` pattern. The gate checks: is there an active observation for `vendor-api`? If yes, it passes. The agent then reads `observation-vnstock-resource-budget.yaml` and sees `budget: 1, current: 1`. The agent decides:
- Same host fingerprint as registered device? Safe, proceed.
- Fresh container with new fingerprint? Dangerous, stop or ask operator.

The agent records this reasoning in meta-state: `meta_state_report({ type: "budget-check", reason: "same fingerprint, idempotent, safe" })`.

## The Traps

### Trap 1: Gate enforces domain budgets

If the gate checks `budget >= current`, it blocks all `vendor-api` commands globally when the budget is exhausted. A `pnpm add` (constraint: `package-manager`) gets blocked by the `vnstock` budget because the gate treats budget exhaustion as a global escalation. This is the bug described in `brainstorm-260529-budget-escalation-observation-scoping.md`.

### Trap 2: Budget data moves into meta-state

If the agent puts `budget: 1, current: 1` into `meta-state.jsonl`, it conflates domain state with meta-state. Domain state must stay in `records/observations/`. Meta-state tracks reasoning, not numbers.

### Trap 3: Agent ignores domain state

If the agent skips reading the budget observation and just proceeds, it may consume a device slot without checking. The gate is a safety net, not a replacement for agent judgment.

## The Correct Flow

1. **Gate passes** → command has a fresh observation for its constraint
2. **Agent reads domain observation** → checks budget, fingerprint, context
3. **Agent decides** → proceed, stop, or ask operator
4. **Agent records meta-state** → reasoning for future sessions

The gate is the first filter. The agent is the second filter. The meta-state is the audit trail.

## Related Documents

- `docs/philosophy.md` — why the loop exists, how to reason with it
- `docs/record-system-architecture.md` — data model, state machine, provenance chain
- `docs/trajectory.md` — long-term direction, the four bridges
- `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md` — the discussion that produced this separation

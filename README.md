# Learning Loop Template

A self-referential coordination system for agents that forget.

Agents have no persistent memory across sessions. Each agent starts fresh — it does not know what the last agent proved, what failed, or what was decided. Without a record, every session repeats the same discoveries and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge, and over time gives the loop its own self-model so it can maintain itself.

**The product is not the template. The product is the loop's self-model** — what it knows about itself, how that knowledge is structured, and how it influences future behavior.

---

## What the loop is

The loop has one bound surface and one trajectory.

**The meta-surface** is the only bound surface — a 4-kind discriminated union in `meta-state.jsonl`:

| Kind | Role | Lifespan |
|------|------|----------|
| `finding` | A loop-self-diagnostic observation | 24h TTL → ack → active → resolve |
| `change-log` | An immutable audit record of a system change | Forever |
| `rule` | A promoted invariant the loop enforces (`gate` or `agent` enforcement) | Forever (until superseded) |
| `loop-design` | A deferred design that will create or modify rules, schemas, or tools | Active → inactive → archived |

The 21+ `meta_state_*` MCP tools in `tools/learning-loop-mcp/tools/` are the only authoritative interface to the meta-surface. Direct writes to `meta-state.jsonl` are blocked by both write and bash gates.

**The trajectory**: knowledge moves from human-readable docs into the loop, one mechanism at a time. Today's docs are tomorrow's tools. Today's escape hatches are tomorrow's MCP tools. The loop's destination is the limit of that gradient.

**Everything else is design exploration.** The legacy `records/<vendor>/` content is archived for forensic continuity — not a contract. The product surface (what the loop builds on top of vendor APIs) is unbound and re-debated from the meta-surface. The substrate (vnstock, fastapi, tanstack, etc.) is replaceable; what makes the loop valuable is the registry's ability to provoke and capture learning, not the substrate's identity.

---

## How the loop works

### The two-tier governance model

| Tier | Governs | Workflow |
|------|---------|----------|
| **External boundary** | Vendor APIs, device slots, resource budgets, install/runtime contracts, production writes | The loop: observations gate the agent; meta-state records the reasoning |
| **Internal implementation** | Refactoring, naming, structure, patterns within approved boundaries | `ck:*` skills: plan → cook → review, cited in the meta-surface |

A refactor that touches no external system does not need a decision record. A vendor API change always does. The question is never "is this big enough?" — it is "does this touch an external boundary?"

### The constraint gate

Commands that touch irreversible external systems (docker, sudo, package installs, vendor APIs) are gated by a two-layer enforcement system:

1. **PreToolUse hooks** — universal bash-gate, write-gate, and inbound-state-gate that intercept tool calls for both Claude Code and Droid CLI
2. **MCP server** (`tools/learning-loop-mastra/server.js`) — meta-surface tools, constraint checks (`gate_check`, `gate_mark_preflight`), and workflow tools

The gate reads runtime state from `runtime-state.jsonl` and decides: `ok`, `block` (observation required), or `escalate` (budget exhausted). All gate logic lives in `tools/learning-loop-mcp/core/` — single source of truth.

### The escape hatch rule

`docs/` is outside the loop. If an agent must open a doc to know what to do next, that knowledge is a **gap** — it belongs in records, tools, or MCP tools, not in a human-readable file. The same applies to `ck:*` skills: they are escape hatches, not authorities. The trajectory is to internalize both into the loop.

What survives the internalization gradient is irreducible judgment — the "why" behind loop design. Everything else moves.

### The internalization rule

The loop does not internalize everything it touches. Three classes:

| Class | Authority | What "cite" means |
|-------|-----------|-------------------|
| **The contract** (rule, decision boundary, consult-gate) | The loop, no exceptions | It is the cite target |
| **Internal implementation** (refactor, scaffold, test, review) | The skill executes; the loop records | `evidence_journal` on the resulting `finding` or `change-log` |
| **External system** (vendor API, device slot, budget) | The operator is the source; the loop is a consumer | Observations are operator-authored |

**Cite the code, not the markdown.** A code-pointed finding with `mechanism_check: true` is durable; a markdown citation is the escape hatch.

---

## Lanes

| Path | Purpose |
|------|---------|
| `meta-state.jsonl` | The loop's self-model. 4-kind discriminated union. |
| `runtime-state.jsonl` | Mutable operator state: ledger events and budget states for external systems. |
| `tools/learning-loop-mcp/` | MCP server, gate logic, validation, and workflow tools. Single source of truth for both Claude Code and Droid CLI. |
| `records/_unbound/` | Archived legacy product-surface content (observations, decisions, etc.), not a contract. |
| `product/<stack>/` | Per-stack runtime probes. Phase A of the productization master tracker re-debates the product surface. |
| `plans/<date>-<slug>/` | Active and historical plans. The pre-mortem channel. |
| `docs/` | Policy, philosophy, trajectory. Escape hatch, not source of truth. |
| `docs/journals/` | Session reflections. Meta-surface-adjacent but not meta-surface records. |

---

## Where to start

| If you want to... | Read |
|-------------------|------|
| Understand why the loop exists | `docs/philosophy.md` |
| Know where the loop is heading | `docs/trajectory.md` |
| Get the agent coordination reference | `AGENTS.md` |
| Learn the day-to-day mechanics | `docs/operator-guide.md` |
| Understand the 4-kind union and status transitions | `docs/meta-state-lifecycle.md` |
| See the constraint gate architecture | `docs/system-architecture.md` |
| Understand observation vs. meta-state separation | `docs/observation-vs-meta-state.md` |

---

## Quick commands

```bash
pnpm test                 # run the test suite
pnpm test:cold-session    # cold-session discoverability test (3-day cadence)
pnpm gate:server          # start the MCP server standalone
```

---

## What stays human forever

Autonomy is on the meta-surface axis, not the judgment axis. The operator remains the authority on:

- **Meta-surface scope.** What the loop is allowed to learn about itself, what findings get promoted to rules.
- **Irreversible operations.** Anything the constraint gate gates today stays gated.
- **The meta-surface system itself.** Findings, rules, and loop-designs are operator-ackable. The loop may surface signals; it does not redefine its own success criteria.
- **Philosophy.** The "why" behind loop design stays in docs.

The meta-state system is the most dangerous component to give full autonomy to, because it is the one that decides what the rest of the loop learns.

---

## The destination

A self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior. The gradient moves knowledge from human-readable docs into machine-driven loop mechanics, one bridge at a time.

As of 2026-06-12, the meta-surface (Bridge 5+6) is the active front. Bridges 1-4 are deferred and unbound — the product surface is re-debated from the meta-surface. See `docs/trajectory.md` for the full picture.

**Skills execute; the loop records; the meta-surface is the only thing that survives.**

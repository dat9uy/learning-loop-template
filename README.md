# Learning Loop Template

A self-referential coordination system for agents that forget.

Agents have no persistent memory across sessions. Each agent starts fresh — it does not know what the last agent proved, what failed, or what was decided. Without a record, every session repeats the same discoveries and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge, and over time gives the loop its own self-model so it can maintain itself.

**The product is not the template. The product is the loop's self-model** — what it knows about itself, how that knowledge is structured, and how it influences future behavior.

---

## What the loop is

The loop has one bound surface and one trajectory.

**The meta-surface** is the only bound surface — a 4-kind discriminated union (`finding` | `change-log` | `rule` | `loop-design`) in `meta-state.jsonl`. The union definition and lifespan model live in `AGENTS.md` §1; the status transitions in `docs/meta-state-lifecycle.md`. The loop's tools (read **and** write) are the only authoritative interface to the meta-surface — all three runtimes ride the stateless CLI `tools/learning-loop-mastra/bin/loop.mjs` (the MCP server keeps only a residue). Direct writes to `meta-state.jsonl` are blocked by both write and bash gates.

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
2. **Tool surface** — the loop's tools ride the stateless CLI `tools/learning-loop-mastra/bin/loop.mjs` on all runtimes; the MCP server (`tools/learning-loop-mastra/mastra/server.js`) keeps a residue. Both carry meta-surface tools and constraint checks (`gate_check`, `gate_mark_preflight`)

The gate reads runtime state from `runtime-state.jsonl` and decides: `ok`, `block` (observation required), or `escalate` (budget exhausted). All gate logic lives in `tools/learning-loop-mastra/core/` — single source of truth.

### The escape hatch rule

`docs/` is outside the loop. If an agent must open a doc to know what to do next, that knowledge is a **gap** — it belongs in records, tools, or MCP tools, not in a human-readable file. The same applies to `ck:*` skills: they are escape hatches, not authorities. The trajectory is to internalize both into the loop.

What survives the internalization gradient is irreducible judgment — the "why" behind loop design. Everything else moves.

### The internalization rule

The loop does not internalize everything it touches — it internalizes the *contract* (full authority), cites the *internal implementation* (records that it happened, does not replace it), and reads the *external system* (consumer, not source). The three-class framework and the citation path live in `AGENTS.md` §2 (and `docs/loop-engine.md` for the concept).

**Cite the code, not the markdown.** A code-pointed finding with `mechanism_check: true` is durable; a markdown citation is the escape hatch.

---

## Lanes

| Path | Purpose |
|------|---------|
| `meta-state.jsonl` | The loop's self-model. 4-kind discriminated union. |
| `runtime-state.jsonl` | Mutable operator state: ledger events and budget states for external systems. |
| `tools/learning-loop-mastra/` | MCP server, gate logic, validation, and workflow tools. Single source of truth for all runtimes. |
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
| Understand the engine invariant and concept vocabulary | `docs/loop-engine.md` |
| Understand the 4-kind union and status transitions | `docs/meta-state-lifecycle.md` |
| See the constraint gate architecture | `docs/architecture.md` |
| See the runtime participation contract | `docs/runtime-contract.md` |
| Understand observation vs. meta-state layer separation | `docs/meta-state-lifecycle.md` § Layer Separation |

---

## Quick commands

```bash
pnpm test                 # run the test suite
pnpm test:cold-session    # cold-session discoverability test (3-day cadence)
pnpm gate:server          # start the MCP server standalone
node tools/learning-loop-mastra/bin/loop.mjs list   # list the loop's tool surface
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

The meta-surface (Bridge 5+6) is the active front. Bridges 1-4 are deferred and unbound — the product surface is re-debated from the meta-surface. See `docs/trajectory.md` for the full picture.

**Skills execute; the loop records; the meta-surface is the only thing that survives.**

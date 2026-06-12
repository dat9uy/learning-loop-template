# Learning Loop Template

A self-referential coordination system for agents that forget.

The loop exists because **agents have no persistent memory across sessions**. Each agent starts fresh. Without a record, every session repeats the same discoveries, re-runs the same experiments, and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge — and, over time, gives the loop its own self-model so it can maintain itself.

The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior.

## What the loop actually is

The loop has one **bound surface** and one **trajectory**.

- **The meta-surface** (the only bound surface) — a 4-kind discriminated union of records (`finding | change-log | rule | loop-design`) in `meta-state.jsonl`. It is the loop's self-model: diagnostic observations, immutable audit trail of system changes, promoted invariants, and deferred designs. The 21 MCP tools in `tools/learning-loop-mcp/tools/meta-state-*-tool.js` are the only authoritative interface.
- **The trajectory** — knowledge moves from human-readable docs into the loop, one mechanism at a time. Today's docs are tomorrow's tools. Today's escape hatches are tomorrow's MCP tools. The loop's destination is the limit of that gradient.

Everything else is **design exploration**: the legacy `records/<vendor>/{decisions,experiments,risks,observations}.yaml` content is archived for forensic continuity and explicitly *not* a contract that constrains the loop. The product surface (what the loop builds on top of vendor APIs) is unbound and re-debated from the meta-surface once it ships. The substrate (vnstock, fastapi, tanstack, etc.) is replaceable; what makes the loop valuable is the registry's ability to provoke and capture learning, not the substrate's identity.

## The two-tier governance model

| Tier | Governs | Workflow |
|---|---|---|
| **External boundary** | Vendor APIs, device slots, resource budgets, install/runtime contracts, production writes | The loop: observations gate the agent; the agent checks budget + fingerprint + context; meta-state records the reasoning |
| **Internal implementation** | Refactoring, naming, structure, patterns within approved boundaries | `ck:*` skills: plan → cook → review |

A refactor that touches no external system does not need a decision record. A vendor API change always does. The question is never "is this big enough?" The question is "does this touch an external boundary?"

The line between the two tiers is **mechanical**, not aspirational: the constraint gate (universal bash-gate + write-gate + inbound-state-gate + MCP `check_gate`) reads observation records and resource budgets from `records/observations/` and decides `ok | block | escalate`. The gate is the first filter. The agent is the second filter. The meta-state registry is the audit trail. See `docs/observation-vs-meta-state.md` for the full separation.

## Internalize vs. depend on global skills

`docs/` is outside the loop. If an agent must open a doc to know what to do next, that knowledge is a **gap** — it belongs in records, observations, or MCP tools, not in a human-readable file. This is `docs/philosophy.md`'s "Docs Are the Escape Hatch" rule.

The same rule applies to **skills**. The `ck:*` skill family (e.g. `ck:plan`, `ck:cook`, `ck:journal`) is markdown-shaped, session-loaded, and not recorded in the meta-surface as authoritative. They are powerful and useful, but they are *escape hatches* — they describe how to do the work, but the work itself must be loop-citable.

**The dependency-balance convention (operator-confirmed, 2026-06-12):**

1. **Plan-file authoring → internalize.** The plan file (`plans/<date>-<slug>/plan.md`) is the pre-mortem contract. The `ck:plan` skill is one way to write a plan file, not the only way. Whatever tool scaffolds the plan, the resulting `change-log` entry with `change_target: 'plans/.../plan.md'` is what makes the plan loop-citable.
2. **Code execution mechanics → depend on `ck:*` skills, but cite them.** Scaffolding, cooking, testing, review — these are skill-shaped. The rule: the skill invocation must be cited in the resulting `finding` or `change-log` entry's `evidence_journal`. A skill run the loop does not know about is a `/ck:cook` on 2026-05-22 waiting to happen (experiment: `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml`).
3. **The contract itself → internalize, no exceptions.** The rule (`pattern` + `enforcement`), the decision boundary, the `decision_effect.allowed_actions` / `blocked_actions` — these are meta-surface events. Skills may *apply* the contract; they do not *define* it.

**Long-term:** after the meta-surface productizes, the loop will own the `ck:plan`, `ck:cook`, and `ck:journal` skills as MCP tools. The migration sequence is `ck:plan` (smallest, lowest risk) → `ck:journal` (citation-only) → `ck:cook` (largest, highest risk). During the migration, the markdown skills remain the readable spec; the MCP tools become the authoritative executors. The escape hatch becomes a tool.

## Lanes

| Path | Purpose |
|---|---|
| `meta-state.jsonl` | The loop's self-model. 4-kind discriminated union: `finding` (diagnostic), `change-log` (immutable audit), `rule` (promoted invariant), `loop-design` (deferred design). |
| `tools/learning-loop-mcp/` | MCP server, gate logic, validation, and workflow tools. Single source of truth for both Claude Code and Droid CLI. The 21 `meta_state_*` tools are the only authoritative interface to the meta-surface. |
| `records/observations/` | Constraint observations + resource budgets (mutable state, operator-managed). The gate reads these; agents read these. |
| `records/<vendor>/` | **Forensic stub.** Legacy product-surface content (decisions, experiments, risks, claims, evidence) is archived here for continuity. Not bound; not a contract. Re-debated from the meta-surface. |
| `product/<stack>/` | Per-stack runtime probes (and, post-approval, product code). Phase A of the productization master tracker (`plans/reports/productization-260612-1530-master-tracker.md`) re-debates the product surface. |
| `plans/<date>-<slug>/` | Active and historical plans. The pre-mortem channel: forward-looking artifacts that bound the investigation before it starts. Cited from the resulting finding via `evidence_journal`. |
| `docs/` | Policy, operator guides, philosophy, trajectory. **Escape hatch, not source of truth.** Anything an agent must read from `docs/` to execute correctly is a gap the loop has not yet closed. |
| `docs/journals/` | Session reflections. Meta-surface-adjacent (may contain experiment-worthy observations) but not meta-surface records. |
| `.claude/coordination/`, `.factory/coordination/` | Hooks (universal bash/write/inbound gates) for Claude Code and Droid CLI. Thin wrappers around `tools/learning-loop-mcp/hooks/`. |

## Documentation Index

| Doc | When to read |
|---|---|
| `docs/philosophy.md` | **Read this first.** Why the loop exists, how to reason with it, the three pillars + the skill-authority pillar, and the internalize-vs-escape-hatch gradient. |
| `docs/trajectory.md` | The destination, the bridges (2026-06-12 reframe: meta-surface is the only bound surface; product surface is re-debated from the meta-surface; skill migration is the post-productization track), and what stays human forever. |
| `AGENTS.md` | The coordination system reference for agents: hooks, MCP tools, gate protocols, meta-surface workflow, internalization rule. The gate-truth for every agent in every session. |
| `docs/operator-guide.md` | First run / day-to-day intake, bootstrap, runtime, agent flow — mechanics after you understand the philosophy. |
| `docs/charter.md` | Present-tense system description: scope, operating rules, the canary for "what the system actually is right now." |
| `docs/meta-state-lifecycle.md` | The 4-kind union, status transitions, fingerprint lifecycle, archive mechanics. |
| `docs/observation-vs-meta-state.md` | The hard separation between domain observations (operator-managed, mutable state) and meta-state findings (agent-maintained, post-hit reasoning). The gate is meta-only. |
| `docs/record-system-architecture.md` | Legacy product-surface record roles, hierarchy, state machine. **Read for forensic continuity only** — the product surface is unbound. |
| `docs/artifact-concepts.md` | Legacy product-surface schema reference. Same caveat. |
| `docs/system-architecture.md` | Constraint gate architecture, inbound/outbound gates, MCP server, workflows. |
| `docs/red-team-review.md` | Review dimensions and when to apply external review in the loop. |
| `docs/journals/` | Session journals, including all post-260602 SP0–SP3 cook journals and reflection notes. |
| `plans/reports/` | Brainstorm and design reports. Many voided by the 2026-06-12 reframe; check the in-place header status. |

## Quick Commands

```bash
pnpm check                # validate records (alias of validate:records)
pnpm validate:records     # JSON-schema + cross-ref validation
pnpm bootstrap:api        # provision product/api/.venv (uv sync + SHA-pinned vnstock installer)
pnpm check:budget         # check resource budget state (--system <name> --resource <name>)
pnpm test:cold-session    # session-start cold-session test (3-day cadence)
```

`pnpm bootstrap:api` is operator-gated: it consumes a vendor device slot and requires `VNSTOCK_API_KEY`. See `docs/operator-guide.md` → "API Stack Bootstrap".

## Constraint Enforcement

Commands that touch irreversible external systems (docker, sudo, package installs, vendor APIs) are gated by a two-layer enforcement system:

1. **PreToolUse hooks** — universal bash-gate, write-gate, and inbound-state-gate that intercept tool calls automatically for both Claude Code and Droid CLI
2. **MCP server** (`tools/learning-loop-mcp/server.js`) — the meta-surface tools (`meta_state_*`), constraint checks (`check_gate`, `gate_check`, `gate_mark_preflight`), record workflows, and prompt generation

The gate reads observation records and resource budgets from `records/observations/` and decides: `ok`, `block` (observation required), or `escalate` (budget exhausted). All gate logic lives in `tools/learning-loop-mcp/core/` — single source of truth for both agent surfaces. See `docs/operator-guide.md` → "Resource Budget & State-Machine" and "Skill Coordination".

## Where to Start

- **New here** → `docs/philosophy.md` (read first), then `docs/operator-guide.md`
- **Understanding the meta-surface** → `docs/meta-state-lifecycle.md` + `AGENTS.md` §3
- **Building on top of a verified library** → `plans/reports/brainstorm-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10
- **Constraint gate & budget enforcement** → `docs/operator-guide.md` "Resource Budget & State-Machine"
- **Internalization rule** → `AGENTS.md` §6 — cite the code, not the markdown
- **The long-term direction** → `docs/trajectory.md` §1 (destination) and §4 (bridges, 2026-06-12 reframe)

## Guardrails

Do not copy application code, generated files, raw data, secrets, local config, private artifacts, or historical repo state into this template. External execution, package installation, live calls, product approval, and product code all require explicit scoped approval. Observation records are the authoritative source for external system state — check them before asking the operator about device slots, budgets, or operational constraints. The meta-state registry is the loop's self-model; the only authoritative interface is the 21 `meta_state_*` MCP tools. Direct writes to `meta-state.jsonl` and to `records/**` are blocked by both write and bash gates; use the canonical tools.

**Skills execute; the loop records; the meta-surface is the only thing that survives.** The plan-file convention is what makes that sentence operational — it is the artifact where operator intent meets agent execution without either one bypassing the loop.

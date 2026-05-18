# Learning Loop Template

Product-agnostic scaffold for evidence → records → decisions → proposal-only product ideas, with a stateful constraint enforcement layer that gates irreversible operations (vendor APIs, device slots, production writes) behind observation records and resource budgets. Domain content is added under review; product code only after an approved build experiment.

## Lanes

| Path | Purpose |
|---|---|
| `records/` | claim / risk / experiment / decision / capability / observation / evidence ledger |
| `records/observations/` | constraint observations + resource budgets (mutable state, operator-managed) |
| `product/<stack>/` | per-stack capability scripts (and, post-approval, product code) |
| `docs/` | policy + operator guides |
| `tools/` | validators + verification helpers |
| `tools/constraint-gate/` | MCP server + gate logic for command gating |
| `.claude/coordination/` | hooks, profiles, and skill registry for write-path enforcement |
| `plans/` | active and historical plans + brainstorm reports |

## Documentation Index

| Doc | When to read |
|---|---|
| `docs/philosophy.md` | **Read this first.** Why the loop exists, how to reason with it, and the "How to Reason With the Loop" practices |
| `docs/operator-guide.md` | First run / day-to-day intake, bootstrap, runtime, agent flow — mechanics after you understand the philosophy |
| `docs/charter.md` | Scope + operating rules |
| `docs/record-system-architecture.md` | Entity roles, record hierarchy, state machine, verification axes |
| `docs/artifact-reference.md` | Typed record schemas, dimension semantics, capability-term glossary |
| `docs/red-team-review.md` | Review dimensions, classifications, and when to apply external review in the loop |
| `docs/journals/` | Session journals |

## Quick Commands

```bash
pnpm check                # validate records (alias of validate:records)
pnpm validate:records     # JSON-schema + cross-ref validation
pnpm bootstrap:api        # provision product/api/.venv (uv sync + SHA-pinned vnstock installer)
pnpm check:budget         # check resource budget state (--system <name> --resource <name>)
```

`pnpm bootstrap:api` is operator-gated: it consumes a vendor device slot and requires `VNSTOCK_API_KEY`. See `docs/operator-guide.md` → "API Stack Bootstrap".

## Constraint Enforcement

Commands that touch irreversible external systems (docker, sudo, package installs, vendor APIs) are gated by a two-layer enforcement system:

1. **PreToolUse hooks** — intercept Bash/Edit/Write/Skill calls automatically
2. **MCP server** — explicit `check_gate` / `record_observation` / `update_observation` tools

The gate reads observation records and resource budgets from `records/observations/` and decides: `ok`, `block` (observation required), or `escalate` (budget exhausted). See `docs/operator-guide.md` → "Resource Budget & State-Machine" and "Skill Coordination".

## Where to Start

- **New here** → `docs/operator-guide.md`
- **Understanding record types** → `docs/artifact-reference.md`
- **Authoring a capability record** → `docs/operator-guide.md` "Capability Runtime Experiment" + `schemas/capability.schema.json`
- **Building product on top of a verified library** → `plans/reports/brainstorm-260511-0030-external-skills-integration.md`
- **Constraint gate & budget enforcement** → `docs/operator-guide.md` "Resource Budget & State-Machine"
- **How observations work** → `schemas/observation.schema.json` + `records/observations/`

## Guardrails

Do not copy application code, generated files, raw data, secrets, local config, private artifacts, or historical repo state into this template. External execution, package installation, live calls, product approval, and product code all require explicit scoped approval. Observation records are the authoritative source for external system state — check them before asking the operator about device slots, budgets, or operational constraints.

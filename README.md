# Learning Loop Template

Product-agnostic scaffold for evidence → records → decisions → proposal-only product ideas. Domain content is added under review; product code only after an approved build experiment.

## Lanes

| Path | Purpose |
|---|---|
| `records/` | claim / risk / experiment / decision / capability / observation / evidence ledger |
| `product/<stack>/` | per-stack capability scripts (and, post-approval, product code) |
| `docs/` | policy + operator guides |
| `tools/` | validators + verification helpers |
| `plans/` | active and historical plans + brainstorm reports |

## Documentation Index

| Doc | When to read |
|---|---|
| `docs/operator-guide.md` | First run / day-to-day intake, bootstrap, runtime, agent flow |
| `docs/charter.md` | Scope + operating rules |
| `docs/lab-model.md` | Entity roles + verification axes |
| `docs/artifact-reference.md` | Typed record schemas, dimension semantics, capability-term glossary |
| `docs/red-team-review.md` | Review classifications |
| `docs/journals/` | Session journals |

## Quick Commands

```bash
pnpm check                # validate records (alias of validate:records)
pnpm validate:records     # JSON-schema + cross-ref validation
pnpm bootstrap:api        # provision product/api/.venv (uv sync + SHA-pinned vnstock installer)
```

`pnpm bootstrap:api` is operator-gated: it consumes a vendor device slot and requires `VNSTOCK_API_KEY`. See `docs/operator-guide.md` → "API Stack Bootstrap".

## Where to Start

- **New here** → `docs/operator-guide.md`
- **Understanding record types** → `docs/artifact-reference.md`
- **Authoring a capability record** → `docs/operator-guide.md` "Capability Runtime Experiment" + `schemas/capability.schema.json`
- **Building product on top of a verified library** → `plans/reports/brainstorm-260511-0030-external-skills-integration.md`

## Guardrails

Do not copy application code, generated files, raw data, secrets, local config, private artifacts, or historical repo state into this template. External execution, package installation, live calls, product approval, and product code all require explicit scoped approval.

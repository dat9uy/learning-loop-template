# Handoff

## Current State

This learning-loop template is active with `vnstock_data` as the first domain. Reusable docs, schemas, validators, verification helpers, and populated record folders cover evidence, claims, experiments, decisions, risks, and (newly) capability records.

**Active approved decisions in this product line:**

- `decision-20260510T160000Z-capabilities-stack-migration` — capability scripts live under `product/<stack>/capabilities/<scope>/`; capability records may cite `local:product/*/capabilities/...` (per-record-type allowlist).
- `decision-20260510T170623Z-vnstock-installer-bootstrap` — two-stage `pnpm bootstrap:api` provisions `product/api/.venv` (public deps via `uv sync`, vnstock vendor via SHA-pinned `install-vnstock.sh`).

## Capability Term Glossary

The word "capability" carries three distinct meanings in this repo. Always qualify in writing.

| Term | Path | Created when | Role |
|---|---|---|---|
| **Capability script** | `product/<stack>/capabilities/<scope>/*.py` (e.g. `product/api/capabilities/vnstock-data/capability-01-reference.py`) | During runtime-verification work for a library. | Standalone Python feasibility probe. Tests API-return-data runtime. Shares the per-stack environment (`product/<stack>/`). |
| **Capability record** | `records/capabilities/capability-*.yaml` | During pre-build phase 01 of a product-build plan. | Record-style YAML mapping verified library surfaces (claims) to product surfaces (route_class, view_class). Schema: `schemas/capability.schema.json`. Field shape: `stack`, `surface`, `maps[]`. |
| **Capability Runtime Experiment** | (concept, not a path) | When verifying a library's `runtime` dimension. | Pattern documented in `docs/operator-guide.md` → "Capability Runtime Experiment". The experiment record is the ledger entry; capability scripts are its execution substrate. |

Disambiguation rule: bare "capability" defaults to **capability record** in product-build plans. Frozen records before 2026-05-10 may mention older paths/terms and remain unchanged by policy.

## Start Here

1. Run validation:

```bash
pnpm check
```

2. Read the core docs:
   - `docs/lab-model.md`
   - `docs/operator-guide.md`
   - `docs/claim-verification.md`
3. Create evidence under `records/evidence/<scope>/` before adding claims.
4. Create or update claim, risk, experiment, decision, and capability records that cite durable local evidence or `record:` refs.

## Active Content

| Directory | State |
|-----------|-------|
| `records/claims/` | Active claims (install sandbox, device limit mechanism, capabilities stack allowlist) |
| `records/experiments/` | Approved experiments (install, capabilities runtime, bootstrap runtime) |
| `records/decisions/` | Approved decisions (convention adoption, device clearance, capabilities-stack-migration, installer-bootstrap, yaml-parser-swap) |
| `records/risks/` | Active risks (external installer) |
| `records/evidence/vnstock-data/` | Evidence capsules for vnstock domain |
| `records/evidence/loop/` | Loop self-improvement evidence |
| `records/evidence/meta/` | Meta-process triggers and conventions |
| `records/capabilities/` | Empty by design until a product-build plan authors capability records |
| `product/api/` | Python stack: `pyproject.toml` (public deps only), `.venv` (provisioned by `pnpm bootstrap:api`), `scripts/install-vnstock.sh` (SHA-pinned vendor installer) |
| `product/api/capabilities/vnstock-data/` | Python capability scripts (Reference / Market / Fundamental / Insights / Macro) |
| `plans/` | Active and historical plans + brainstorm reports |
| `docs/journals/` | Session journal entries |

## Empty By Design

- `records/backlog-items/` contains only directory keepers.
- `records/capabilities/` contains only directory keepers (first records land in the next product-build plan).
- `records/observations/` contains only directory keepers.
- `records/validation-gates/` contains only directory keepers.
- `plans/templates/` is empty.

## Approval Boundaries

Default work is read-only or metadata-only. Ask before any external command, package installation, live service call, secret/config access, raw output capture, product approval, or product implementation.

## Bootstrap & Validation Commands

```bash
pnpm check                # validate records (alias of validate:records)
pnpm validate:records     # JSON-schema + cross-ref validation
pnpm bootstrap:api        # provision product/api/.venv (operator-gated; consumes a vendor device slot)
```

`pnpm bootstrap:api` is not part of default validation. Run it only when establishing the Python stack environment from a fresh clone, or after a vendor SHA rotation. See `docs/operator-guide.md` → "API Stack Bootstrap".

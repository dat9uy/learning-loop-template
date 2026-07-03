# Operator Guide — Vnstock Appendix

This appendix contains vnstock-specific examples, commands, and paths that were extracted from the generic operator guide. The generic guide now uses placeholder patterns; this document provides the concrete vnstock implementation.

## Stacks and Capability Locations (Vnstock)

| Stack | Manifest | Runtime probe root |
|---|---|---|
| Python API | `product/api/pyproject.toml` | `product/api/capabilities/` |
| TypeScript web | `product/web/package.json` when introduced | `product/web/capabilities/` |

Every `product/<stack>/` directory must contain a stack manifest such as `pyproject.toml`, `package.json`, or `go.mod`. The validator only allows `local:product/*/capabilities/...` for capability records; all other record types keep the default `records/evidence` local source root.

## Capability Generation (Vnstock)

Run `pnpm generate:capabilities` after product surface changes to regenerate capability records from native self-descriptions. This eliminates drift by construction — records are always derived from ground truth.

The generation pipeline uses **per-surface adapters** that read native self-descriptions and emit normalized capability entries:

| Surface | Adapter | Product source |
|---|---|---|
| `HTTP/REST` | FastAPI adapter — inlines OpenAPI generation | `product/api/src/main.py` |
| `TanStack Start route` | TanStack adapter — reads router.tsx + route files | `product/web/src/router.tsx` + `routes/**/*.tsx` |

Generated records are minimal: `type`, `schema_version`, `stack`, `surface`, `maps[]` with `source` only. No `id`, `status`, `created_at`, `updated_at`, `source_refs`, or `supersedes`.

`pnpm check` runs `generate:capabilities --dry-run` to detect stale records before validation and tests.

#### Extending the Surface Registry

To add a new surface (e.g., gRPC, GraphQL, Django REST):

1. Create `tools/generate-capabilities/adapters/<surface-kebab>-adapter.js`
2. Export an `async function extract(root) => { entries: [{source, domain}] }`
3. Register it in `tools/generate-capabilities/adapters/registry.js`
4. Add the surface string to the `surface` enum in `schemas/capability.schema.json`
5. Document the new surface in this section

Unsupported surfaces throw at generation time, so the registry must be fully populated.

## API Stack Bootstrap

Bootstrap the Python API stack from the repo root with:

```bash
pnpm bootstrap:api
```

The command runs two explicit stages: `uv sync` installs public dependencies in `product/api/.venv`, then `product/api/scripts/install-vnstock.sh` runs the SHA-pinned vnstock vendor installer with `product/api` as `HOME`. Stage 2 requires an operator-provided `VNSTOCK_API_KEY`, may consume a vendor device slot, and must not be run from package install hooks.

## Runtime Probe Experiment (Vnstock Environment)

When user asks to create runtime probes (standalone feasibility scripts) for a library or SDK:

- Runtime probes are standalone scripts under `product/<stack>/capabilities/<scope>/` that test whether a library's API returns usable data. They use minimal calls per API surface area (one script per domain layer).
- Runtime probes are distinct from product code (they do not implement product features) and distinct from basic runtime proof (they test API-return-data, not just import/load).
- Runtime probes verify the `runtime` dimension of an assertion (index entry or frozen-legacy claim). The experiment record carries `verification.proves: runtime` with `output: sample-output` or `runtime-captured`.
- The runtime probes are the execution substrate; the experiment record is the ledger entry. Scripts may be segmented (e.g., cell markers, regions, or blocks) for interactive or whole-script execution.
- Runtime probes may live in `product/<stack>/` before product approval because they are feasibility probes, not product implementations.
- **Environment model:** Runtime probes share a persistent dependency environment with their stack. The environment root is `product/<stack>/` (language-specific: `product/web/node_modules/` for TS/JS, `product/api/.venv/` for Python, `product/<stack>/vendor/` for Go, etc.). Runtime probes run against this environment, not a disposable temp install. Future product code in the same stack uses the same environment and the same library installation.
- This per-stack environment is intentional. It respects external constraints such as vendor device limits, license activations, or authenticated registries by keeping all execution on the registered device while avoiding cross-runtime coupling.
- Required experiment steps: create runtime probes, run against live endpoints using the shared environment, capture metadata + schema-shape + redacted sample output, update the corresponding index entry's source evidence `validation_status` to `passed`, then run `pnpm extract:index`.

## Resource Budget Example (Vnstock)

External systems with irreversible operations (vendor APIs with device slots, production databases, rate-limited endpoints) need structural enforcement — not just agent memory. The learning-loop skill acts as gatekeeper: before producing a prompt for a budget-consuming action, it checks resource state and blocks when budget is exhausted.

### When This Applies

- Task involves an external system where actions cannot be undone (e.g., vendor device registration, production writes)
- A resource budget observation exists under `records/observations/*-resource-budget.yaml`

### How It Works

1. **Budget observation** — `records/observations/<scope>-resource-budget.yaml` tracks `budget` (max), `current` (used), `last_verified`, and `validation_window`
2. **Check tool** — `pnpm check:budget -- --system {system} --resource {resource}` returns JSON with current state
3. **Skill gating** — learning-loop skill calls the tool before prompt generation:
   - Budget exhausted → BLOCKED signal (no prompt produced)
   - Validation window active → DEFERRED signal (no state-changing actions)
   - Stale data (>7 days) → WARNING (ask operator to confirm)
   - Budget available → constrained prompt with budget context embedded
4. **Operator-only writes** — agent never mutates budget YAML; operator updates after each action

### Key Rules

- Plans with irreversible operations MUST declare a resource budget
- ANY check failure on a budget-consuming action = STOP (not fix-and-retry)
- After a budget-consuming action, agent reports result and waits for operator confirmation
- Validation window: no state-changing actions between clearance and final report
- When a guard/gate blocks an action, trace the full dependency chain back to resource budgets before attempting workarounds. If the chain ends at an exhausted budget, report the constraint to the operator immediately — do not burn cycles on bypasses

### Detailed References

- Rules: `.claude/skills/learning-loop/references/resource-budget-rules.md`
- Prompt templates: `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md`
- Schema: `schemas/resource-budget.schema.json`

# Charter

## Objective

Generate product proposals from structured knowledge, reviewed experiments, and explicit decisions — with a stateful constraint enforcement layer that gates irreversible operations behind observation records and resource budgets. The lab measures what a learning loop can justify from records, not what an agent remembers from another codebase.

For the system's intended long-term direction (incremental autonomy on the verification axis), see `docs/trajectory.md`.

## Scope

The template contains:

- a small typed record ledger (frozen-legacy claims, index entries, risks, experiments, decisions, capability records, observations);
- dedicated evidence files under `records/evidence/`;
- per-stack scaffolding under `product/<stack>/` (stack manifest + runtime probes + bootstrap helpers) for runtime-verification work;
- proposal-only experiments;
- guardrails for provenance and review.

### Constraint Enforcement Layer

The template also contains a stateful enforcement layer for irreversible operations:

- **Observation records** (`records/observations/`) — mutable state captures for external system constraints (device slots, resource budgets, behavioral findings). Operator-managed; agent-readable.
- **Resource budgets** — observation files with `*-resource-budget.yaml` suffix track `budget`/`current` counts, `validation_window` state, and `last_verified` timestamps.
- **Constraint gate** (`tools/constraint-gate/`) — MCP server + pure gate logic that checks commands against observation state and returns `ok` / `block` / `escalate`.
- **Coordination hooks** (`.claude/coordination/hooks/`) — PreToolUse hooks that intercept Bash, Edit/Write, and Skill calls to enforce gate decisions and write-path boundaries.
- **Domain-aware write gate** (`.claude/coordination/hooks/write-coordination-gate.cjs`) — blocks file writes based on path domain rules.

This layer addresses the gap between "agent remembers to check" and "system enforces the check." The gate is only as good as its observations — keeping observations in sync with external reality (especially after operator-provided state changes) is an active area of work.

The template does not contain product application code (no FastAPI source, no UI source, no database, no live runtime integration). Capability scripts under `product/<stack>/capabilities/` are feasibility probes, not product code.

## Operating Rules

1. Records preserve verification, proof, and evidence metadata.
2. Experiments may consume only reviewed evidence and approved upstream records.
3. Product output is a proposal or no-build decision unless a later plan approves implementation.
4. Existing projects are provenance sources, not design sources.
5. Product stack choices remain recommendations until a build experiment is approved.
6. Commands touching irreversible external systems must pass the constraint gate. The gate reads observation records and resource budgets — stale observations produce wrong decisions.
7. Observation records are the authoritative source for external system state. Check them before asking the operator.

## Initial Folder Ownership

- `records/`: source YAML records (frozen-legacy claims, index entries, risks, experiments, decisions, capability records, observations) plus dedicated evidence files.
- `records/observations/`: constraint observations and resource budgets (mutable, operator-managed).
- `docs/`: project metadata and learning-loop policy docs.
- `product/<stack>/`: per-stack home for runtime probes, stack manifest, and stack-specific bootstrap helpers. No product application code until an approved build experiment.
- `tools/`: validation and verification scripts.
- `tools/constraint-gate/`: MCP server, gate logic, patterns, and observation writer.
- `tools/extract-index/`: reads evidence markdown `## Findings` sections, parses atomic assertions tagged with `[topic-tag]`, and writes `records/index/*.yaml` entries.
- `.claude/coordination/`: hooks, gate audit log, and observation records.
- `plans/`: active and historical plans + brainstorm reports.

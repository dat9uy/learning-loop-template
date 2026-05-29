# Charter

## Objective

Generate product proposals from structured knowledge, reviewed experiments, and explicit decisions — with a stateful constraint enforcement layer that gates irreversible operations behind observation records and resource budgets. The lab measures what a learning loop can justify from records, not what an agent remembers from another codebase.

For the system's intended long-term direction (incremental autonomy on the verification axis), see `docs/trajectory.md`.

## Scope

The template contains:

- a small typed record ledger (index entries, risks, experiments, decisions, capability records, observations);
- dedicated evidence files under `records/<surface>/evidence/`;
- per-stack scaffolding under `product/<stack>/` (stack manifest + runtime probes + bootstrap helpers) for runtime-verification work;
- proposal-only experiments;
- guardrails for provenance and review.

### Constraint Enforcement Layer

The template also contains a stateful enforcement layer for irreversible operations:

- **Observation records** (`records/observations/`) — mutable state captures for external system constraints (device slots, resource budgets, behavioral findings). Operator-managed; agent-readable. The gate checks these for **existence** (meta-level: "has someone recorded this constraint?"), not for **resource limits** (domain-level: "do we have budget left?"). See `docs/observation-vs-meta-state.md` for the full separation.
- **Resource budgets** — observation files with `*-resource-budget.yaml` suffix track `budget`/`current` counts, `validation_window` state, and `last_verified` timestamps. The gate reads these to verify the observation is present and fresh; budget enforcement is the agent's responsibility.
- **Meta-state registry** (`tools/learning-loop-mcp/meta-state.jsonl`) — agent-maintained findings about system-level issues (e.g., "I checked the budget and it was safe because the fingerprint matched"). Ephemeral (24h TTL). Not used by the gate. Separate from observations.
- **Constraint gate** (`tools/learning-loop-mcp/`) — MCP server + pure gate logic in `core/` that checks commands against observation state and returns `ok` / `block` / `escalate`. The gate enforces pattern matching + observation existence; it does not enforce domain resource budgets.
- **Coordination hooks** (`.claude/coordination/hooks/`) — PreToolUse hooks that intercept Bash, Edit/Write, and Skill calls to enforce gate decisions and write-path boundaries.
- **Domain-aware write gate** (`.claude/coordination/hooks/write-coordination-gate.cjs`) — blocks file writes based on path domain rules.

This layer addresses the gap between "agent remembers to check" and "system enforces the check." The gate is the first filter (observation existence). The agent is the second filter (budget context, fingerprint checks). The meta-state registry is the audit trail (agent reasoning). The gate is only as good as its observations — keeping observations in sync with external reality (especially after operator-provided state changes) is an active area of work.

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
- `tools/learning-loop-mcp/`: MCP server, gate logic, validation, index extraction, and workflow tools. Single source of truth for both Claude Code and Droid CLI.
- CLI shims (`tools/*-cli.js`): thin stdio clients that spawn the MCP server. `pnpm extract:index`, `pnpm validate:records`, `pnpm check:budget`, etc.
- `.claude/coordination/`: hooks, gate audit log, and observation records.
- `plans/`: active and historical plans + brainstorm reports.

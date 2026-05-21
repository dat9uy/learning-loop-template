# Record System Architecture

This document describes the record system's data model, core hierarchy, state machine, and product generation loop. For entity roles and verification axes, use the `workflow_intake_orient` MCP tool.

## Record Ledger

Records are human-edited source files under `records/`. They describe frozen-legacy claims, index entries, experiments, decisions, risks, capability records, and observations in a small typed format. Evidence files live under `records/<surface>/evidence/` and are cited by records. Observation files live under `records/observations/` and capture mutable external system state. Index entries live under `records/<surface>/index/` as machine-derived YAMLs that are agent-owned and human-read-only.

## Core Hierarchy

```text
records/<surface>/evidence/ -> durable source material
records/<surface>/index/    -> machine-extracted assertions (agent-owned, human-read-only)
records ledger            -> risks + experiments + decisions + capability records
records/<surface>/claims/ -> frozen-legacy (read-only audit trail, no new entries)
records/observations/  -> mutable external state (device slots, budgets, constraints)
runtime probes         -> product/<stack>/capabilities/ (runtime-verification substrate)
constraint gate        -> tools/constraint-gate/ + .claude/coordination/hooks/
index extractor        -> tools/extract-index/ (CLI: pnpm extract:index)
derived claim assurance -> effective assurance from verification dimensions and decisions
generated views        -> disabled until model settles
```

Short version:

```text
records/<surface>/evidence -> records/<surface>/index/ (machine-extracted assertions) + risks + experiments -> dimensions -> runtime probes (product/<stack>/capabilities/) -> capability records (records/<surface>/capabilities/) -> decisions
                                      |
                                      v
                    observations + budgets -> constraint gate -> command gating
```

Runtime probes are standalone feasibility probes that test API-return-data runtime. They live in `product/<stack>/capabilities/` before product approval because they are not product implementations. Capability records are the YAML ledger entries that bind verified library surfaces to product surfaces; they are authored only during a product-build plan.

## Machine-Extracted Index

The record system has three territories:

- `docs/` — human-only escape hatch. Intentionally informal. May diverge from records.
- `records/<surface>/evidence/` — human-authored markdown, source of truth. Agent may create under explicit operation; agent never edits existing.
- `records/<surface>/index/` — machine-derived YAMLs. Agent-owned, human-read-only. Assertions are extracted atomically from evidence `## Findings` sections.

Claims are frozen-legacy (read-only audit trail, no new entries). State queries route to `records/<surface>/index/` first; frozen claims serve historical audit only.

The extraction is performed by `tools/extract-index/extract-index.js` (invoked via `pnpm extract:index`). Evidence files must include frontmatter with `capability`, `dimension`, `scope`, and `validation_status` (passed/pending/failed); files missing these fields are skipped.

### Provenance Chain

```text
experiment.id -> evidence_refs[] -> ## Findings bullet -> records/<surface>/index/<assertion-id>.yaml
```

Index entries are self-contained — agents can answer state queries from the YAML alone without reading source evidence. `source_refs` and `experiment_refs` inside each entry point to the underlying evidence and experiments for deeper audit queries.

### Status Derivation

Index entry `status` (`active | superseded | pending_approval`) derives from the source evidence's `validation_status`, not from an editorial lifecycle:

- `evidence.validation_status: passed` -> `index.status: active`
- `evidence.validation_status: pending` -> `index.status: pending_approval`
- `evidence.validation_status: failed` -> extraction skipped (no entry written)

Supersession never happens automatically. An index entry is only superseded when a later evidence file contains explicit `## Confirmation / Disproof Notes` that contradict the earlier assertion; without such explicit disproof, duplicate assertions are aggregated instead.

### Pre-Write Aggregation

Before writing, the extractor merges `source_refs` by assertion ID (stable hash from `capability`, `dimension`, `scope`, and assertion text) and computes `n_count` (number of distinct source evidence files). This produces one YAML entry per unique assertion, even when the same assertion appears in multiple evidence files.

## State-Machine Layer

The system has two distinct state models:

### Record State (Immutable Ledger)

Experiments, decisions, risks, and capability records follow editorial lifecycle states (`draft` -> `reviewed` -> `approved`). These are append-oriented — new records, not mutations. Claims are frozen-legacy and no longer follow this lifecycle. Index entries (`extracted-assertion`) derive their `status` directly from evidence `validation_status`; they do not follow the editorial lifecycle.

### Observation State (Mutable Enforcement)

Observations and resource budgets are **mutable state captures** of external system reality. They differ from records in key ways:

| Property | Records | Observations |
|---|---|---|
| Mutability | Append-only (new records) | Mutable (update in place) |
| Source of truth | Evidence + experiments | External system reality |
| Lifecycle | draft -> reviewed -> approved | active -> archived |
| Authority | Index-first scanning | Operator-managed; agent-readable |
| Enforcement | Indirect (via decisions) | Direct (constraint gate blocks/escalates) |

### Constraint Gate Decision Tree

```
Command -> matchConstraintPattern()
  ├─ no match -> ok
  └─ match -> checkObservationExists()
       ├─ no observation -> block (observation_required)
       └─ observation found -> evaluateBudget()
            ├─ budget ok -> ok
            └─ budget exhausted / window active -> escalate
```

### The Sync-State Problem

The gate is only as good as its observations. When an operator resolves a constraint externally (e.g., clears a device slot), the observation must be updated before the next gated command. This is an active area of work — the gap between "operator changes reality" and "observation reflects reality" is the sync-state problem. See `plans/reports/debugger-260517-1430-observation-update-miss-meta-process.md`.

## Product Generation Loop

The loop reads the record ledger (index entries, frozen-legacy claims, experiments, decisions, capability records) and emits a proposal or a no-build decision. Capability records are runtime-derived from product surfaces via per-surface adapters; they describe what the product implements, not what it should implement. The loop does not create product code in this template.

When the loop needs to issue commands that touch irreversible external systems, it passes through the constraint gate. The gate reads observation records and resource budgets to decide whether the command is allowed (`ok`), requires an observation first (`block`), or needs operator intervention (`escalate`). This keeps the loop honest about resource state without relying on agent memory.

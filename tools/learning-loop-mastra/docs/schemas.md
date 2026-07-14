# Schemas — Canonical Reference

> Single source of truth for meta-state, runtime-state, wire envelope, and parity.
> Other docs (AGENTS.md, journals) link here instead of duplicating.

## 1. Overview

The learning loop uses three schema surfaces:

- **Meta-state** (`meta-state.jsonl`) — the self-model registry. A 4-kind
  discriminated union: `finding`, `change-log`, `rule`, `loop-design`.
- **Runtime-state** (`runtime-state.jsonl`) — the mutable sidecar. 2 kinds:
  `ledger-event`, `budget-state`.
- **Wire envelope** — how MCP tools accept/return data. Two forms:
  SDK `{item: X}` and MCP tool-result `{content: [{type, text}]}`.

## 2. Meta-state — the 4-kind discriminated union

Source of truth: `core/meta-state.js` (the Zod schemas). This doc is the
design-decisions layer; the Zod schemas are the runtime-checked layer.

### 2.1 finding

**Purpose:** Observations about the loop's own behavior — bugs, gaps,
anti-patterns, budget checks.

**Created by:** `meta_state_report`

**Key fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | auto | `meta-YYMMDDTHHmmZ-slug` |
| `entry_kind` | `"finding"` | default | Discriminator |
| `category` | enum | yes | `gate-logic-bug`, `record-repair-gap`, `schema-drift`, `mcp-tool-missing`, `budget-check`, `loop-anti-pattern` |
| `severity` | enum | yes | `warning`, `escalate` |
| `affected_system` | enum | yes | `meta`, `gate-logic`, `record-validation`, `index-extractor`, `mcp-tools`, `workflow-registry`, `vnstock_vendor`, `vnstock`, `fastapi`, `tanstack`, `product`, `api`, `web`, `meta-state-tools`, `runtime-state` |
| `description` | string | yes | min 20 chars |
| `status` | enum | auto | `open` / `resolved` / `superseded` (+ `archived` runtime-applied, outside the enum). The legacy `reported`/`active`/`stale`/`auto-resolved` statuses were collapsed in plan 260707-0812; read sites use `isOpen`/`isStaleView` from `core/stale-view.js`. |
| `evidence_code_ref` | string | no | e.g. `path/to/file.js:line` |
| `code_fingerprint` | string | auto | `sha256:<64-hex>` — set by SP2 grounding |
| `mechanism_check` | boolean | auto | Opt-in for grounding checks; defaults to true when `evidence_code_ref` is set |
| `expires_at` | string | auto | Vestigial — no longer written by any tool. Legacy entries may still carry the field for read-compat. |
| `reopens` | string[] | no | Finding ids whose stale lifecycle this entry re-surfaces |

**Status lifecycle:**

```
open (newly reported; replaces reported/active/stale)
  ↓ meta_state_resolve / meta_state_supersede / meta_state_dispatch_finding
resolved (terminal, closed)
superseded (terminal, consolidated into a change-log)
archived (runtime-applied, outside the enum)
```

**Full schema:** 30+ fields. See `core/meta-state.js:56-111` for the complete
`metaStateFindingEntrySchema`.

### 2.2 change-log

**Purpose:** Immutable audit log of system changes (schema, rule, tool, policy,
surface, lifecycle, manifest).

**Created by:** `meta_state_log_change`

**Key fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | auto | `meta-YYMMDDTHHmmZ-slug` |
| `entry_kind` | `"change-log"` | yes | Discriminator |
| `change_dimension` | enum | yes | `semantic`, `mechanical`, `surface` |
| `change_target` | string | yes | Specific path or identifier |
| `change_diff` | object | yes | `{added: [], removed: [], changed: []}` |
| `reason` | string | yes | min 20 chars |
| `status` | `"active"` | always | Immutable — change-logs never change status |
| `supersedes` | string | no | ID of a previous change-log entry this replaces |
| `consolidates` | string | no | Comma-separated finding ids this consolidates |

**Full schema:** `core/meta-state.js:117-158`.

### 2.3 rule

**Purpose:** Promoted gate/agent rules with their own lifecycle. Created when
a finding is promoted via `meta_state_promote_rule`.

**Created by:** `meta_state_promote_rule`

**Key fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | `rule-<slug>` (stable, not timestamp-based) |
| `entry_kind` | `"rule"` | default | Discriminator |
| `origin` | string | yes | Finding id that originated this rule |
| `enforcement` | enum | yes | `gate`, `agent` |
| `pattern_type` | enum | yes | `regex`, `glob`, `determinism-checklist`, `agent-checklist` |
| `pattern` | string | yes | The pattern (regex body, glob path, or session_id) |
| `status` | enum | default | `active`, `inactive` |
| `description` | string | yes | min 20 chars |

**Full schema:** `core/meta-state.js:164-197`.

### 2.4 loop-design

**Purpose:** Deferred design notes with their own lifecycle. Active → inactive
when the proposed work ships.

**Created by:** `meta_state_propose_design`

**Key fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | auto | `meta-YYMMDDTHHmmZ-slug` or `loop-design-<slug>` |
| `entry_kind` | `"loop-design"` | default | Discriminator |
| `title` | string | yes | min 10 chars |
| `status` | enum | default | `active`, `inactive` |
| `proposed_design_for` | string[] | yes | Forward: ids of rules/schemas/tools this will create or modify |
| `addresses` | string[] | default `[]` | Backward: ids of findings this responds to |
| `description` | string | yes | min 20 chars |
| `affected_system` | enum | yes | Same enum as finding |
| `severity_hint` | enum | no | `low`, `medium`, `high` |

**Full schema:** `core/meta-state.js:203-225`.

## 3. Runtime-state — the sidecar

Source of truth: `schemas/runtime-state.schema.json` (project root).

Runtime-state is the mutable sidecar (`runtime-state.jsonl`). Meta-state is the
canonical registry (`meta-state.jsonl`). Per the 2026-06-19 direction-clarification,
they remain separate files.

### 3.1 ledger-event

**Purpose:** Records ledger events (writes, reads, mutations) for audit.

**Key fields:** `affected_system`, `kind` (`"ledger-event"`), `id`, `source_ref`
(pattern: `^local:meta-state:.+$`), `value`, `delta`, `fingerprint`,
`timestamp`, `status` (`active`, `cleared`, `reconciled`), `metadata`.

### 3.2 budget-state

**Purpose:** Tracks budget consumption (token counts, API calls).

**Key fields:** Same shape as ledger-event, with `kind` = `"budget-state"`.

## 4. Wire envelope

Source of truth: `core/envelope-stripper.js`.

Two distinct envelope forms exist in the MCP ecosystem:

1. **SDK form** — `{item: X}`. Stripped by `stripEnvelope(v)`.
   Used by per-field `z.preprocess(stripEnvelope, ...)` in legacy workflows.

2. **MCP tool-result form** — `{content: [{type: "text", text: JSON.stringify(inner)}]}`.
   Stripped by `stripMcpContentEnvelope(v)`.
   Used by `createLoopWorkflow` factory-level preprocess so agent callers
   wrapping input in tool-result form are handled transparently.

Both forms are fail-closed: malformed input falls through to the raw value.

## 5. Parity contract

Source of truth: `schema-parity.js` (top-level, NOT under `core/`).

The parity contract ensures MCP client schemas match Zod-derived schemas.
When both schemas carry matching metadata, the output is byte-identical.
Metadata-asymmetric cases produce a parity-clean rebuild that may add or
drop `.describe()` strings.

**Audit trail:** `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop`
documents the migration history.

## 6. Cross-references

- `AGENTS.md` §1 — the meta-surface and 3-layer architecture
- `loop_describe({tier: "warm"})` — live tool/rule/finding surface
- `core/meta-state.js` — runtime Zod schemas (the machine-checked layer)
- `schemas/runtime-state.schema.json` — JSON Schema for runtime-state rows
- `core/envelope-stripper.js` — wire envelope implementation
- `schema-parity.js` — parity contract implementation

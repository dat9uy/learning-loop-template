# AGENTS.md — Agent Surfaces Reference

Shared coordination rules for every agent runtime (Claude Code, Droid CLI, Mastra Code). All gate logic lives in `tools/learning-loop-mastra/core/` (single source of truth). All runtimes use the same universal hooks via thin wrappers or declarative config.

This is the thin root entry doc. It keeps the load-bearing layer definitions and the 4-kind union, then points into `docs/` for depth. The engine invariant and concept vocabulary live in `docs/loop-engine.md`; the runtime participation contract in `docs/runtime-contract.md`; the mechanism (gate system, 3-layer architecture, meta-state self-learning loop) in `docs/architecture.md`; the 4-kind lifecycle in `docs/meta-state-lifecycle.md`; the long-term direction in `docs/trajectory.md`.

**The meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface.** This document is the gate-truth for every agent in every session.

---

## 1. The Meta-Surface (the only bound surface)

### 1.1 The 3 layers (Core / Mastra shell / Runtime interface)

The meta-surface is implemented across 3 layers:

- **Core (functional).** Pure logic. Zero `@mastra/*` imports. Lives at
  `tools/learning-loop-mastra/core/`. Codifies the FCIS invariant (see
  `core/README.md`). Owns: meta-state, gate decisions, schema validation,
  fingerprint computation, drift detection.

- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
  Lives at `tools/learning-loop-mastra/mastra/`: `server.js`,
  `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`,
  `schema-parity.js`, `schemas.js`, `workflows/`, `agents/`. May import
  core; core may NOT import the shell.

  > **Path invariant (Phase E Plan 6):** shell files MUST live at
  > `tools/learning-loop-mastra/mastra/` and MUST NOT be at the top level of
  > `tools/learning-loop-mastra/`. Enforced by
  > `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`.

- **Runtime interface (contract).** The contract that agent runtimes sign
  to integrate with the loop. Lives at `tools/learning-loop-mastra/interface/`.
  A runtime satisfies the MCP-transport conformance checklist (see
  `interface/CONTRACT.md`); the transport-agnostic participation contract
  lives at `docs/runtime-contract.md`. **Hooks** (universal scripts in
  `hooks/legacy/` + per-runtime shim files in `.claude/coordination/hooks/`,
  `.factory/coordination/hooks/`, or declarative `.mastracode/hooks.json`)
  are boundary adapters within Runtime interface — they translate
  runtime-specific protocol to/from Core. Policy lives in Core, not in hooks.

```
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Runtime Interface                                │
└─────────────────────────┬──────────────────────────────────┘
                          │ satisfies
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 2: Mastra Shell                                     │
└─────────────────────────┬──────────────────────────────────┘
                          │ wraps
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 1: Core                                             │
└────────────────────────────────────────────────────────────┘
```

The meta-surface is the loop's self-model. It is the **only contract** the loop writes. Everything else (the substrate, the product surface, the legacy `records/<vendor>/` content) is design exploration, archived for forensic continuity, and explicitly not a contract that constrains the loop.

**The meta-surface lives in one place:** `meta-state.jsonl` at the project root. It is implemented across the 3 layers (see §1.1): Core owns the data model, Mastra shell owns the tool surface, Runtime interface owns the agent runtime. It is a 4-kind discriminated union:

| Kind | Role | Lifespan |
|---|---|---|
| `finding` | A loop-self-diagnostic observation. Ephemeral; 24h TTL until acked. | 24h → ack → active → resolve |
| `change-log` | An immutable audit record of a system change. No TTL. | Forever |
| `rule` | A promoted invariant the loop enforces. Two enforcement classes: `gate` (hard-block) and `agent` (consult). | Forever (until superseded) |
| `loop-design` | A deferred design that will create or modify rules, schemas, or tools. | Active → inactive (when shipped) → archived |

**The product surface (decisions, experiments, risks, observations, capability records, vendor records, claim records, index entries, resource budgets) is unbound.** The Bridge 5 codegen engine has the ability to generate product-surface records; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are design exploration, not contracts. **All product-surface record CRUD is paused; no new product records are generated, validated, or migrated.** Legacy product records in `records/<vendor>/` are archived, not deleted.

**The substrate** (the vendor APIs the loop operates against — vnstock, fastapi, tanstack, etc.) is replaceable. It exists to provoke learning; the learning is not *about* the substrate.

For the gate system internals (inbound/outbound gate flows, MCP tool flow, staleness, known issues F1–F13), see `docs/architecture.md`. For the engine invariant (deterministic-step / agentic-step / record / rule / promotion) and the two-surface split, see `docs/loop-engine.md`.

---

## 6. Internalization Rule (source_refs and evidence_code_ref)

**The loop does not internalize everything it touches.** It internalizes the *contract* (full authority), cites the *internal implementation* (recording, not replacement), and reads the *external system* (consumer, not source). This three-class framework is the operator-confirmed dependency-balance convention; see `docs/loop-engine.md` § "Three-class dependency balance" for the concept and `docs/philosophy.md` Pillar 4 for the deep treatment.

**The citation rule (internal-implementation class only):** when an agent needs to cite a design, finding, or external reference, **cite the code, not the markdown.** The canonical citation path is:

1. Report a `meta_state_report` finding with `evidence_code_ref` set to the code location.
2. In the record's `source_refs`, use `local:meta-state:<id>` where `<id>` is the finding's id.
3. Optional but recommended: set `mechanism_check: true` on the finding so `meta_state_derive_status` and `meta_state_check_grounding` can re-check it after refactors; refresh its path's hash in `file-index.jsonl` via `meta_state_refresh_file_index`.

Markdown paths (`local:plans/...`, `local:docs/...`) are the **escape hatch**, not the default. They are deprecated and rejected by `record_create_decision` for new entries. The SessionStart hook surfaces this rule in its discoverability hints; to suppress hints for context-budgeted sessions, set `LL_LOOP_INJECT_TIER=summary` (default is `warm`).

---

## 10. Where This Project Is Heading

The long-term direction lives in `docs/trajectory.md` — read it before reasoning about loop design. The destination: *a self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The Bridges table (the gate-truth gradient from human-driven to machine-driven) is canonical in `docs/trajectory.md` §4; the engine/instance inversion and the skill-migration track are there too. See `docs/loop-engine.md` for the engine invariant that underpins the trajectory.

---

## 11. Runtime Interface Ownership (R2)

Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, and for Mastra Code: declarative config in `.mastracode/{mcp,hooks,settings,database}.json`) is owned by the corresponding runtime agent. **Cross-runtime edits require operator approval.** Each runtime agent works on its own branch; cross-runtime edits require an operator-approved PR. The `interface/CONTRACT.md` conformance checklist is the loop's concern; the runtime's coordination directory is the runtime's concern. Enforcement: git branch protection + PR review + the R2 write-gate (LIM-3 caller identity + LIM-4 path traversal). See `docs/security/plan-5-hardening.md` for the gating chain, R2 allowlist schema, and the operator runbook for diagnosing `cross_runtime_write_denied`.
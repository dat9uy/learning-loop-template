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
  `create-loop-{tool,workflow,agent}.js`, `handler-adapter.js`,
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
  `hooks/universal/` + per-runtime shim files in `.claude/coordination/hooks/`,
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

Markdown paths (`local:plans/...`, `local:docs/...`) are the **escape hatch**, not the default. They are deprecated and rejected by `record_create_decision` for new entries. The SessionStart hook surfaces this rule in its discoverability hints: `session-start-inject-discoverability.cjs` and `session-start-inject-process-hints.cjs` inject the full hint sets as system-reminders via `hookSpecificOutput.additionalContext` (each under the 10k-char cap; the sidecar `.claude/session-context.json` remains the audit artifact).

---

## 7. Local Fallow Gate Self-Verify (`pnpm gate:self-verify`)

**The contract.** local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings. Fallow may report `crap: ?` and `introduced: true` on baselined functions when Istanbul coverage fails to match — a local artifact, NOT a real CI regression. Two coupled issues produce this:

1. **Coverage-matching artifact** — Fallow's coverage matcher can fail for some functions despite 100% statement coverage in `coverage-final.json`, yielding `crap: ?` and a false `introduced: true`.
2. **Cascading file-index desync** — editing a source file changes its SHA-256, desyncing `file-index.jsonl`, which fails the cold-tier grounding test, which produces incomplete coverage, which compounds the false positives.

**The ritual.** Use `pnpm gate:self-verify` instead of bare `pnpm fallow:gate` during fix loops. It re-seeds `file-index.jsonl` (so coverage matches current fingerprints), regenerates Istanbul coverage with `pnpm test`, then delegates to `pnpm fallow:gate`. The wrapper prints the local-verification caveat at startup.

**Cross-check rule.** If fallow reports an introduced finding that lacks `crap` or `coverage_pct`, treat it as coverage-unmatched (local artifact), not a regression. The CI SARIF is the source of truth — do not chase `introduced: true` findings locally.

**When to use which gate:**

| Gate | Use case |
|---|---|
| `pnpm test` | Iterative test feedback during development |
| `pnpm fallow:gate` | Stable coverage+complexity audit AFTER refresh_file_index |
| `pnpm gate:self-verify` | Pre-push local CI-equivalent (test + coverage + fallow) |

The pre-commit hook (`simple-git-hooks.pre-commit`) still runs `pnpm test && pnpm fallow:gate` directly because it operates on already-committed state where fingerprints are stable. The `gate:self-verify` wrapper is the fix-loop companion; it does not replace the pre-commit hook.

---

## 8. Git Union Merge Driver (one-time per-clone setup)

`.gitattributes` marks `runtime-state.jsonl` and `change-log.jsonl` as `merge=union` so parallel PRs that each append a line at EOF auto-merge instead of conflicting. The attribute only names the driver — **the driver command must be configured in each clone** (`git config` is per-clone and not committable). Run once per clone:

```bash
git config merge.union.driver "git merge-file --union %A %O %B"
```

**Arg order is load-bearing.** `git merge-file <current> <base> <other>` writes the union result into the first argument. The driver must write into `%A` (ours — the file git reads the result from), with `%O` (ancestor) as base and `%B` (theirs) as other: `%A %O %B`. The widely-cited `git merge-file --union %O %A %B` is **wrong** — it writes the result into `%O` and leaves `%A` unchanged, so git silently keeps only "ours" and drops the other side. That is the exact data-loss the union attribute exists to prevent. Verified by `plans/260715-0801-change-log-stream-split-tier1` Phase 4 dry-run (two branches from a shared base, each appending a change-log at the same EOF position: corrected driver keeps both lines, 0 duplicate ids; wrong driver keeps only one).

**One-time per-clone setup script:** `bash tools/scripts/setup-git-merge-drivers.sh`. Idempotent; detects a wrong-order existing config and refuses to silently overwrite (pass `--force` to overwrite). After running, `git config --get merge.union.driver` returns the canonical value. Plan 260715-1608 Phase 4 hardened this surface with the script + a shell test under `tools/scripts/__tests__/setup-git-merge-drivers.test.js`. Ephemeral CI runners cannot run the per-clone script, so `.github/workflows/meta-state-refs-check.yml` configures the driver via `git config merge.union.driver` in its checkout step (Plan 260715-1608 Phase 4 F13 middle-ground).

Without this config, `merge=union` is a silent no-op and parallel change-log PRs hit a normal content conflict (resolvable by the manual `git merge-file --union` recipe documented in the `meta-260709T1017Z` finding history).

---

## 10. Where This Project Is Heading

The long-term direction lives in `docs/trajectory.md` — read it before reasoning about loop design. The destination: *a self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The Bridges table (the gate-truth gradient from human-driven to machine-driven) is canonical in `docs/trajectory.md` §4; the engine/instance inversion and the skill-migration track are there too. See `docs/loop-engine.md` for the engine invariant that underpins the trajectory.

---

## 11. Runtime Interface Ownership (R2)

Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, and for Mastra Code: declarative config in `.mastracode/{mcp,hooks,settings,database}.json`) is owned by the corresponding runtime agent. **Cross-runtime edits require operator approval.** Each runtime agent works on its own branch; cross-runtime edits require an operator-approved PR. The `interface/CONTRACT.md` conformance checklist is the loop's concern; the runtime's coordination directory is the runtime's concern. Enforcement: git branch protection + PR review + the R2 write-gate (LIM-3 caller identity + LIM-4 path traversal). See `docs/security/plan-5-hardening.md` for the gating chain, R2 allowlist schema, and the operator runbook for diagnosing `cross_runtime_write_denied`.

---

## 12. How to Approach: Placing Procedural Knowledge

When you add procedural knowledge — a triage procedure, a guardrail, a surfacing rule, a contract note — decide where it belongs on the injection × consumption two axes (see `docs/philosophy.md` § "Skills Are the Same Kind of Escape Hatch" for the model; `docs/loop-engine.md` for the invariant these axes rest on):

1. **Identify the instruction.** What is the procedure, the guardrail, or the surfacing rule you are adding? Name it before placing it.
2. **Injection axis — when does it need to surface?** If timing matters (the instruction must appear at the right moment, not when the model happens to open it), it needs *deterministic injection* — a hook or gate surfaces it — so it belongs at least at **state-2**. If the model opening it ad hoc is enough, *agentic injection* (state-1) suffices.
3. **Consumption axis — who decides?** If the content needs model judgment (read prose, weigh context, decide), consumption stays *agentic* — it lives at **state-2**, the loop's permanent home for judgment-bound content. If the judgment can be fully encoded (a rule or gate fires without the model), consumption is *deterministic* — it goes to **state-3 (encoded)**.
4. **Guardrails.** Actions on operator-judgment boundaries (consult-gates — see `docs/loop-engine.md` escape-hatch #5 "What stays human forever" and #6 "Adversarial mindset") must be deterministic: **state-3 for the guardrail**, even when the content it guards stays at state-2.
5. **Cross-reference.** `docs/loop-engine.md` for the invariant (`deterministic-step` / `agentic-step`); `docs/philosophy.md` for the two-axis model and the three states.

The lens in one line: state-1 (agentic injection, agentic consumption) is an unwired instruction the model opens ad hoc — a gap, not a permanent dependency. State-2 (deterministic injection, agentic consumption) is where the loop lives — it injects deterministically, consumes agenticly. State-3 (deterministic injection, deterministic consumption) is the terminus for what can be fully encoded.
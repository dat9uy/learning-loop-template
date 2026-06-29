# AGENTS.md — Agent Surfaces Reference

> **2026-06-12 from-scratch rewrite.** The previous version of this document is preserved at `AGENTS.old.260612-1300.md` for forensic continuity. The rewrite drops all product-surface framing (decisions, experiments, risks, observations, capability records, vendor directories) from the top of the document. **The meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface.** This document is the gate-truth for every agent in every session. See `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8.2 and §3.10 for the full reframe, and `plans/reports/consistency-260612-1300-mastra-research-report.md` for the operational source of truth.

Shared coordination rules for both Claude Code and Droid CLI. All gate logic lives in `tools/learning-loop-mastra/core/` (single source of truth). Both surfaces use the same universal hooks via thin wrappers.

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
  to integrate with the loop. Lives at `tools/learning-loop-mastra/interface/`
  (NEW in Phase E.1b, ships in Plan 2). A runtime satisfies the 5 contract
  requirements (see `interface/CONTRACT.md`). **Hooks** (universal scripts in
  `hooks/legacy/` + per-runtime shim files in `.claude/coordination/hooks/`,
  `.factory/coordination/hooks/`) are boundary adapters within Runtime
  interface — they translate runtime-specific protocol to/from Core. Policy
  lives in Core, not in hooks.

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

**The product surface (decisions, experiments, risks, observations, capability records, vendor records, claim records, index entries, resource budgets) is unbound.** The Bridge 5 codegen engine has the ability to generate product-surface records; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are design exploration, not contracts. They may or may not be the right shape after the meta-surface re-debates the product surface. **All product-surface record CRUD is paused; no new product records are generated, validated, or migrated.** Legacy product records in `records/<vendor>/` are archived, not deleted.

> **Phase D shipped (2026-06-24):** the MCP server `tools/learning-loop-mastra/mastra/server.js` is the canonical server. It exposes 44 tools across 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent), all bound to the meta-surface per §1. The 3 meta-state agents (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`) ship with `memory: false`; per-agent `memory` config is Phase 5 (per `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§8 Q5`). The meta-surface is still the only bound surface — Phase D added 14 net tools (3 agents + 2 storage workflows + 8 run_workflow_* + 1 runtime_agnostic) without violating §1.

**The substrate** (the vendor APIs the loop operates against — vnstock, fastapi, tanstack, etc.) is replaceable. It exists to provoke learning; the learning is not *about* the substrate. Recent examples of substrate-independent learning: `meta-260606T2106Z-agent-called-meta-state-log-change-...` (the loop noticing its own retry pathology) — no relationship to any vendor.

**Why this matters for every section below:** the top of this document is meta-surface infrastructure (gates, hooks, meta-state tools, the registry). The middle of this document is meta-surface protocol (how to cite, how to record, how to resolve). The bottom of this document is meta-surface trajectory (where the loop is heading). The product surface does not appear because it is unbound.

---

## 2. Hook Matrix

| Surface | Hook | Wrapper | Universal Script |
|---------|------|---------|------------------|
| Claude Code | Bash gate | `.claude/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` |
| Claude Code | Write gate | `.claude/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/write-gate.js` |
| Claude Code | Inbound gate | `.claude/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js` |
| Droid CLI | Execute gate | `.factory/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` |
| Droid CLI | Write gate | `.factory/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/write-gate.js` |
| Droid CLI | Inbound gate | `.factory/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js` |

### Gate Descriptions

- **Bash/Execute gate** — blocks commands matching constraint patterns (docker, sudo, package-manager, vendor-api, side-effect-import) without active runtime-state entries, and blocks all direct writes to `records/**` and `runtime-state.jsonl` via redirects/heredocs/tee.
- **Write gate** — blocks Edit/Write/Create/ApplyPatch to `records/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, `runtime-state.jsonl`, and unknown multi-segment paths. Allowed: `docs/**`, `plans/**`, `product/**`, `tools/**`, `.claude/**`, `.factory/**`, single-segment files. (The `product/**` and `records/**` allowances are substrate carry-overs from the legacy product-surface era; the meta-surface does not need them.)
  - **Note (2026-06-22, Plan 2 PR):** `.gitignore` was expanded from `records/meta/.cache/` → `records/meta/`. The product-surface meta directory (legacy `records/<vendor>/` files + cold-tier cache) is now fully git-ignored, consistent with the 2026-06-12 reframe. The legacy `records/<vendor>/` content is archived in-place, not deleted. The write-gate's `records/**` block stays in place for runtime writes (a different concern from git-ignoring generated content).
- **Inbound gate** — warns when operator state-change messages may have stale observations.
- **Consult-gate `rule-no-orphaned-evidence`** — blocks `meta_state_resolve` when any active finding with `mechanism_check: true` has a stale `code_fingerprint` (source code drifted since fingerprint was stored). Refresh via `meta_state_refresh_fingerprint` to unblock.
- **Consult-gate `rule-no-new-artifact-types`** — blocks commands matching the refined regex `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`. Fixes the G8 subcommand-class false positive (7 recurrences, 2026-06-02..2026-06-06).
- **Consult-gate `rule-cold-session-test-must-pass-before-resolution`** — gates `meta_state_resolve` on the cold-session discoverability test passing. First instance of `pattern_type: resolution-evidence-required`.
- **Consult-gate `rule-project-skill-boundary`** — blocks cross-project `ck:use-mcp` / `ck:find-skills` skill invocations in projects that already have a local learning-loop-mcp server (glob `.factory/skills/{use-mcp,find-skills}/**`, scope predicate `project_has_learning_loop_mcp`).
- **MCP server** (`tools/learning-loop-mastra/mastra/server.js`) — 44 tools across 6 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-24). All 44 are bound to the meta-surface per §1 (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3).

### Runtime-Agnostic Pattern (rule-runtime-agnostic-features)

Every feature must work identically on Claude Code and Droid CLI (and future runtimes). The shim-not-fork pattern is the canonical way to achieve this:

- **Core logic** lives in `tools/learning-loop-mastra/core/` (not under `.claude/` or `.factory/`).
- **Surface shims** (`.claude/coordination/hooks/*.cjs` and `.factory/coordination/hooks/*.cjs`) are thin wrappers; the universal hook does the real work.
- **Hook I/O** goes through `tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js` (`parseInput`, `formatOutput`, `normalizeToolName`).
- **MCP tools** are registered in `tools/learning-loop-mastra/agent-manifest.json`.
- **Cross-surface iteration** uses the `core/surfaces.js` helper (`SURFACES`, `getAllCoordinationPaths`, `writeToAllSurfaces`, `readFromAllSurfaces`, `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces`). Do not hard-code `.claude/` or `.factory/` paths.
- **New runtimes** append to `SURFACES` in `core/surfaces.js` (one line, no other code changes).

The rule is codified as `rule-runtime-agnostic-features` in `meta-state.jsonl`. Audit a feature with the `check_runtime_agnostic` MCP tool. The pattern is regression-tested by `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`.

### Inbound State Gate — Meta-State First

**When the inbound state gate fires** (visible as a `INBOUND STATE GATE:` block in the operator message or session context), **read `meta-state.jsonl` (last 20 lines) BEFORE attempting any bash command**. The named observations in the gate warning are often a subset; the full escalation context (recent `change-log` and `finding` entries) lives in the registry.

**Why**: the gate is a SIGNAL that the operator just changed something external to the loop (cleared a device, reset state, etc.). The named observations are a *symptom* (they may be stale). The *cause* — the operator's intent and any prior gate-bug recurrences — is in `meta-state.jsonl`. Skipping this read reproduces known gate-bug classes (e.g., the G8 subcommand-class false positive, 5 documented recurrences in `meta-state.jsonl`).

**Concrete protocol**:
1. Gate fires → read `meta-state.jsonl` (last 20 lines, or use `meta_state_list` MCP tool with `entry_kind` filter).
2. Scan for recent `change-log` entries (operator intent) and `finding` entries (known gate bugs that may escalate).
3. If a matching prior finding exists, apply the operator-approved workaround BEFORE running the corresponding bash command.
4. Only then proceed to update affected observations via `meta_state_report` MCP tool.

**Defense in depth**: the hook message itself leads with the meta-state hint (see `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js#buildContextMessage`), but this AGENTS.md rule is the canonical source.

### Discovery: `loop_describe`

Call `loop_describe({tier: "warm"})` at session start to discover the loop's operational surface and active rules. The tool returns a tiered view to control context bloat:

| Tier | Returns | Size | When |
|---|---|---|---|
| `summary` | counts only | <1KB | pre-flight |
| `hot` | active promoted rules + tool names | ~5KB | "is X safe?" |
| `warm` | active surface + tool descriptions + findings | 10-25KB | default; session start |
| `cold` | full history + all findings | 25-100KB | audit only |

The response includes a `tier` field (robustness echo) and a `degraded` flag when partial data is returned. On `degraded: true`, retry with `tier: "summary"` or proceed with partial data.

`loop_describe` composes with `meta_state_list`; use `meta_state_list` for detailed filtering and `loop_describe` for operational context.

### Protocol Adapter

The universal hooks handle tool name differences between surfaces:
- `Bash` (Claude) ↔ `Execute` (Droid)
- `Write` (Claude) ↔ `Create` (Droid)
- `Edit`, `ApplyPatch` — same in both

---

## 3. Meta-Surface Tools (the canonical MCP CRUD surface)

> **Schema reference:** see `tools/learning-loop-mastra/docs/schemas.md` for the
> canonical schema doc (4 meta-state kinds, runtime-state, wire envelope, parity).

**All meta-surface mutations go through MCP tools.** Both gates unconditionally block direct file writes (Edit/Write/Bash redirects) to `meta-state.jsonl`, `runtime-state.jsonl`, and to `records/**`. There is no observation-dance, no pre-authorized path, and no bypass.

### Available Meta-Surface Tools

| Tool | Purpose |
|------|---------|
| `meta_state_report` | Create a finding (ephemeral, 24h TTL) |
| `meta_state_list` | Query the registry (filterable by `entry_kind`, `status`, `category`, `session_id`, etc.) |
| `meta_state_ack` | Promote a finding from `reported` to `active` (removes 24h TTL) |
| `meta_state_resolve` | Mark a finding as resolved (consults active rules; may require fingerprint refresh) |
| `meta_state_promote_rule` | Promote a finding into a `rule` entry (enforcement: gate \| agent) |
| `meta_state_sweep` | Mark past-TTL findings stale; auto-resolve findings whose file was modified |
| `meta_state_log_change` | Create a `change-log` entry (immutable audit log; no TTL) |
| `meta_state_patch` | Update an existing entry with CAS via `_expected_version` (closes the CRUD-U gap documented in `meta-260608T0848Z-crud-coverage-gap-...`) |
| `meta_state_derive_status` | Compute derived status of a finding (SP1; pure function over `evidence_code_ref`) |
| `meta_state_check_grounding` | SHA-256 fingerprint check; drift detection (SP2) |
| `meta_state_refresh_fingerprint` | Re-compute and store the current fingerprint after a refactor |
| `meta_state_query_drift` | Aggregate drift events across the registry (SP3) |
| `meta_state_propose_design` | Create a `loop-design` entry (the "design, not yet shipped" surface) |
| `meta_state_relationships` | 1-hop inbound/outbound cross-reference traversal |
| `meta_state_batch` | Atomic batch CRUD: one tool, one lock, one cache invalidation (cap 500 ops) |
| `meta_state_archive` | Move entries to `meta-state.jsonl`'s archive; structural fix for size-overrun findings |
| `loop_describe` | Discover the loop's operational surface, active rules, and curated instructions (introspection; `tier: summary \| hot \| warm \| cold`) |
| `loop_get_instruction` | Return a curated instruction from `loop_describe`'s `discoverability_hints` or `process_hints` block by key |
| `gate_check` | Consult a constraint gate (e.g., `bash-docker`, `write-records`, `vendor-api`); returns `ok` / `block` / `escalate` |
| `gate_mark_preflight` | Mark the preflight checklist complete for a surface (legacy substrate carry-over; the meta-surface does not require preflight) |
| `budget_check` | Check resource budget for an external system (e.g., `vnstock` device-slots) |

**Use the canonical MCP tools for all meta-surface mutations.** Do not use `node -e` scripts importing `core/meta-state.js` directly — this is the escape-hatch abuse closed in plans `260608-1015-meta-state-patch-tool-and-wire-format-fix` and `260608-2255-index-extractor-optimization`.

**Why the registry is the product**: the loop's destination is a self-referential system whose self-model (this registry) influences its own behavior. Findings promote to rules; rules enforce invariants. Drift between recorded state and actual state is detected mechanically. The substrate is replaceable; what makes the loop valuable is the registry's ability to provoke and capture learning, not the substrate's identity.

### Operational Rule

The SessionStart hook runs `loop_describe({ tier: "warm" })` and surfaces both `discoverability_hints` (meta-surface contracts) and `process_hints` (agent behavior rules). Read these blocks before answering "what's next?" style questions. For long-running `pnpm test` discipline (read-loop, stuck-detection), call `loop_get_instruction({key: 'pnpm-test-discipline'})` — see `tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS`.

---

## 4. Write Gate Block Protocol

When the gate blocks with `decision: block`:

1. **Identify if the artifact is required.** If the plan phase lists the file as a deliverable, it is required.
2. **For `records/**` paths:** Use the appropriate meta-surface MCP tool to create or update the meta-surface entry that references the record. The MCP server writes directly — no gate bypass. **Note:** meta-surface entries live in `meta-state.jsonl`, not in `records/`. A reference to a `records/<vendor>/foo.yaml` file is a `source_ref` in a `change-log` entry, not a write to the product record itself.
3. **For `schemas/**` paths:** Use `AskUserQuestion` to surface the block to the operator with: what file is blocked, why, why it's needed, and options to approve or skip.
4. **Never use Bash to circumvent a write-gate block.** If Edit/Write is blocked, using Bash (sed, cat, echo, redirect) to modify that same path is a circumvention, not a solution.
5. **Never assume `--auto` mode overrides mechanical blocks.** `--auto` skips review gates, NOT PreToolUse hook blocks. A blocked tool is a hard stop.

---

## 5. Artifact-Level Loop Rules

### Meta-Surface Writes (the only kind in scope)

- Writing to `meta-state.jsonl` requires a valid meta-surface tool call (`meta_state_report`, `meta_state_log_change`, `meta_state_propose_design`, etc.). There is no preflight marker for meta-surface writes; the tool itself is the gate.
- The gate checks for consult-rule violations on every meta-surface tool call (e.g., `rule-no-orphaned-evidence` blocks `meta_state_resolve` if the finding has a stale `code_fingerprint`).
- Direct writes to `meta-state.jsonl` are blocked by both write and bash gates. The only way to mutate the registry is through the meta-surface tools.

### Substrate Writes (legacy carry-overs, not the meta-surface)

The following substrate carry-overs are retained for forensic continuity but are not the meta-surface:

- **Product code writes (`product/**`):** legacy carry-over from the substrate era. The `gate_mark_preflight` MCP tool creates a marker in `.claude/coordination/.loop-preflight-<surface>` with a 30-minute TTL. The meta-surface does not require preflight; this is a substrate concern. If the operator re-debates the product surface and binding is restored, the preflight gate is one of the first things to revisit.
- **Journal writes (`docs/journals/**`):** allowed unconditionally. These are meta-surface-adjacent (they may contain experiment-worthy observations), but they are not meta-surface records.
- **Plan writes (`plans/**`):** allowed unconditionally. Plans reference the meta-surface via `source_refs`; they do not contain meta-surface records themselves.

### Gate Response Modes

`GATE_RESPONSE_MODE` controls behavior for **non-artifact** gate checks only (unknown paths, observation staleness). Artifact-aware checks always block.

- `warn` (default): allow the write, emit JSON warning.
- `escalate`: block the write, require operator approval.
- Set via `GATE_RESPONSE_MODE` environment variable.

---

## 6. Internalization Rule (source_refs and evidence_code_ref)

**The loop does not internalize everything it touches.** It internalizes the *contract* (full authority), cites the *internal implementation* (recording, not replacement), and reads the *external system* (consumer, not source). This three-class framework is the operator-confirmed dependency-balance convention from `docs/philosophy.md` Pillar 4 and the 2026-06-12 §11.7 consensus in `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md`. The rule below is the citation form of the framework — the part that says *how* to record an internal-implementation event in the meta-surface.

| Class | Authority | What "cite" means in this class |
|---|---|---|
| **The contract** (rule, decision boundary, consult-gate pattern) | The loop, no exceptions | Not citable; it is the cite target. Promoted via `meta_state_promote_rule`. |
| **Internal implementation** (refactor, scaffold, test, review — anything a `ck:*` skill does) | The skill executes; the loop records | `evidence_journal` on the resulting `change-log` or `finding` points at the artifact the skill produced. A skill run the loop does not know about is a bypass waiting to happen. |
| **External system** (vendor API, device slot, budget, install/runtime contract) | The operator is the source; the loop is a consumer | Not citable. Observations are operator-authored. The loop queries them, does not define them. |

The most common failure mode of the naive reading ("if the loop touches it, the loop owns it") is a closed loop with no ground truth — see `docs/philosophy.md` Pillar 4 and the failure-mode genealogy in §11.7.1 (the four registry attempts that failed as a pre-mortem home because each encoded a post-state). The plan file (`plans/<date>-<slug>/plan.md`) is the pre-mortem channel precisely because it preserves the temporal direction: the plan is a *pre*-state, the meta-surface is a *post*-state, the two are linked by `evidence_journal`, not collapsed into one shape.

**The citation rule (internal-implementation class only):** when an agent needs to cite a design, finding, or external reference, **cite the code, not the markdown.** The canonical citation path is:

1. Report a `meta_state_report` finding with `evidence_code_ref` set to the code location (e.g., `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js#buildDiscoverabilityHints`).
2. In the record's `source_refs`, use `local:meta-state:<id>` where `<id>` is the finding's id.
3. Optional but recommended: set `mechanism_check: true` on the finding so `meta_state_derive_status` and `meta_state_refresh_fingerprint` can re-check it after refactors.

Markdown paths (`local:plans/...`, `local:docs/...`) are the **escape hatch**, not the default. They are deprecated and rejected by `record_create_decision` for new entries. Use them only as a *transitional* bridge when a design has no code point yet: file `meta_state_log_change` with `change_target: '<plan-path>'`, then cite the resulting change-log id (`local:meta-state:<id>`) in `source_refs` — the change-log id is the code-pointed cite target; the markdown path is only the artifact being logged, not a citation form. The escape-hatch pattern is also the philosophy: skill markdown is the readable spec for internal-implementation work, and the migration to loop-owned MCP tools is Phase G of the productization master tracker (cite-or-else, not replacement).

The SessionStart hook surfaces this rule in its discoverability hints. To suppress hints for context-budgeted sessions, set `LL_LOOP_INJECT_TIER=summary` (default is `warm`). The downgrade is logged as a `hint-downgrade` finding per session.

**Cross-reference script** (for "X is related to Y" prompts): before patching a finding with cross-references, read the 11th hint in `loop_describe({tier: "warm"}).discoverability_hints`. The canonical script is `(1) meta_state_relationship_validate to lint, (2) meta_state_report({reopens: [orphan_ids]}), (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step`. The hint is the source of truth; this sentence is just a pointer so the agent does not skip it. The legacy 2-step `meta_state_migrate_expired_to_stale` call was removed in plan 260611-1000-remove-expired-status.

## 7. Side-Effect Import Rule (all vendor SDKs)

If any vendor SDK import triggers device registration or authentication (e.g., `import vnstock_data`, `import vendor_data`), do not import it directly. Use `importlib.util.find_spec()` for safe checks. If the gate blocks with `side-effect-import`, respect the block. Do not attempt to bypass it.

## 8. Cold-Session Test Onboarding

Fresh clones require `pnpm test:cold-session` once to seed `.cold-session-sentinel.json`. The freshness test in normal `pnpm test` enforces a 3-day cadence. Run `pnpm test:cold-session` whenever the sentinel asserts stale.

## 9. Implementation Workflows (meta-surface only)

**No product-surface workflows are in scope.** The legacy product-build and direct-cook workflows from the substrate era (which referenced `record_create_decision`, `product/**` preflight, and `records/<vendor>/` directories) are **not** part of the meta-surface. They are retained in `AGENTS.old.260612-1300.md` for forensic continuity but are voided by the 2026-06-12 reframe.

The meta-surface workflow is:

1. **Discover** — call `loop_describe({tier: "warm"})` to read active rules and findings.
2. **Cite** — follow the Internalization Rule (§6). Cite code, not markdown.
3. **Record** — use `meta_state_report`, `meta_state_log_change`, or `meta_state_propose_design` to mutate the registry. Cite the entry id (`local:meta-state:<id>`) in any downstream references.
4. **Resolve** — when a finding's `evidence_code_ref` is no longer valid, use `meta_state_refresh_fingerprint` to update the fingerprint, then `meta_state_resolve` to mark it resolved.
5. **Promote** — when a finding recurs or has cross-surface implications, use `meta_state_promote_rule` to lift it into a `rule` entry.
6. **Drift-check** — periodically call `meta_state_query_drift` to surface findings whose code has drifted since the fingerprint was stored.

**Agent Rule**

**Never ignore gate block decisions.** If blocked by a consult-gate, fix the underlying issue (refresh the fingerprint, update the source, resolve the parent finding) and retry. Do not use Bash to circumvent a gate block.

---

## 10. Where This Project Is Heading

The long-term direction lives in `docs/trajectory.md` (read it before reasoning about loop design). This section is the AGENTS-level summary that agents need on every session.

> **2026-06-12 operator reframe:** Bridge 5 and Bridge 6 are no longer separate bridges. They are one atomic front called the **meta-surface**. All Bridge 1-4 work is **deferred and unbound** — the product surface is being re-debated by the meta-surface itself. The Bridges table below reflects this. See `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8.2 and §3.10 for the full reframe. The consistency report at `plans/reports/consistency-260612-1300-mastra-research-report.md` is the operational source of truth for this section.

**The loop has shifted from vnstock-driven to self-learning driven.** The substrate is replaceable; what makes the loop valuable is its ability to provoke and capture learning *about itself*. The destination is a self-referential system where the loop's self-model (the meta-state registry) influences its own behavior — findings promote to rules, rules enforce invariants, drift is detected mechanically, and the operator's cognitive load is bounded by the registry's own queryability. **As of 2026-06-12, the meta-surface (Bridge 5+6) is the active front. Bridges 1-4 are deferred and unbound; the product surface is re-debated from the meta-surface once it ships.**

### The Bridges (2026-06-12 reframe — meta-surface as the only bound surface)

The destination sentence: *A self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The gradient moves knowledge from human-readable docs into machine-driven loop mechanics, one bridge at a time. **As of 2026-06-12, the gradient has been collapsed to one active front: the meta-surface (Bridge 5+6). Bridges 1-4 are deferred until the meta-surface ships, and the product surface they were building toward is unbound (re-debated from the meta-surface).**

| # | Bridge | Status (2026-06-12) | What it removes (when shipped) |
|---|---|---|---|
| 1 | Doc → candidate assertion | **DEFERRED + UNBOUND** — humans hand-author evidence; no candidate-extraction tool; the product surface is re-debated from the meta-surface, so the candidate shape is unknown. Report voided by re-debate 2026-06-12. | The need to re-read vendor docs every session — **once re-debated** |
| 2 | Candidate → experiment plan | **DEFERRED + UNBOUND** — humans design experiment YAMLs from scratch; the candidate-to-experiment pipeline is product-surface design that needs re-debate. Report voided by re-debate 2026-06-12 (self-flagged as "untested end-to-end"). | The need to author experiment YAMLs from scratch — **once re-debated** |
| 3 | Class-level experiment approval | **DEFERRED + UNBOUND** — every experiment gates on `status: approved`; no class-pattern field. The class-approval mechanism is product-surface design. | Per-experiment operator approval — **once re-debated** |
| 4 | Candidate-vs-validated status | **DEFERRED + UNBOUND** — status enum is `active \| superseded \| pending_approval`; no `candidate` slot. The candidate-vs-validated distinction is product-surface design. | Ambiguity about vendor-claims vs proven assertions — **once re-debated** |
| 5 | Schema as source of truth | **PARTIALLY SHIPPED (Approach 2)** — 4 record types (experiment, risk, decision, observation) are schema-derived via `core/schema-to-zod.js`. **Approach 3 (full codegen for writers + validators) is the active work**, scoped to the meta-surface only. Product-surface schemas are **unbound**; the codegen engine has the ability to generate them, but no product records are bound. | The hand-written tool zod + writer + validator triplet per record type — **for meta-surface records** |
| 6 | **Self-model as product** | **Shipped (SP0–SP3) and growing** — meta-state registry; 4-kind union (finding \| change-log \| rule \| loop-design); 5 active rules; 3 active loop-designs; all agent affordances operational. **Part of the Bridge 5+6 atomic meta-surface front.** | The operator's need to remember "which gate changed when" — `meta_state_derive_status` reasons about drift instead |

**The current focus is the meta-surface (Bridge 5+6, in no particular order).** The loop's center of gravity has shifted from substrate-driven learning (proving vnstock assertions) to self-learning (proving the loop's own behavior). SP0 (self-modification affordance) shipped the ability to log any system change. SP1 (derivation query) shipped the ability to ask "is this finding still true?". SP2 (grounding check) shipped SHA-256 fingerprinting. SP3 (drift query) shipped aggregate drift surfacing. All four sub-projects together moved the loop's own runtime state from operator-memory to a machine-queryable self-model. **As of 2026-06-12, the meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface.**

#### Engine vs Instance (the 2026-06-12 inversion)

- **Engine** (what Bridge 5 produces): a schema-to-code generator that takes any JSON Schema and emits writers + validators. Provable against the meta-surface because the meta-surface is small (4 entry kinds), stable (locked since SP3 shipped 2026-06-05), and self-owned (the loop is its own designer).
- **Instance (bound)** — only the meta-surface: `finding`, `change-log`, `rule`, `loop-design` entries in `meta-state.jsonl`. The engine's only validated output.
- **Instance (unbound)** — all product-surface schemas. The engine has the ability to generate them; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are **unbound**; they are design exploration, not contracts.

This eliminates the 11 drift cells by construction: there is no product instance to drift against.

#### Bridges 1-4 voided (2026-06-12)

The 2026-06-12 reframe voids all prior "Bridge 1-4 shipped" or "Bridge 1-4 design approved" claims. The reports themselves remain in `plans/reports/` as historical engineering record, but their status is marked "voided by re-debate, 2026-06-12". The reason: the product surface is being redesigned by the meta-surface, and the schemas + integration shapes those reports were building toward are no longer the right ones to commit to. The pattern: a bridge can be "built" in the sense that all the code and tests are present, but "unbuilt" in the sense that the contract it was built against is voided. The 2026-06-12 reframe collapses the two senses by anchoring the contract to the meta-surface. Once the meta-surface is the only bound surface, the only "built" bridges are the ones that operate on the meta-surface (which is none of Bridges 1-4; those are all product-surface by definition).

**Reports voided (in-place header edit, not deleted):**
- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — "Status: Design approved, awaiting plan" → voided
- `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` — "Status: approved, ready for /ck:plan" → voided
- All `plans/<date>-bridge-{1,2,3,4}-*/` plan directories — treated as historical record, not as in-flight work

**What stays valid (the engineering is real, the contracts are not):**
- The pipeline implementations (MCP tools, schema files, validators) remain in the repo. They are not deleted; they are unbound.
- The findings and rules about *how* the pipeline was built (test coverage, error paths, performance benchmarks) are valid historical record.

#### Sequencing decision rule (operator-stated, 2026-06-12, supersedes 2026-06-11)

> **The meta-surface (Bridge 5+6) is the active front, in no particular order. All Bridge 1-4 work is deferred. The Bridge 5 codegen engine ships first, scoped to the meta-surface only. The Mastra migration's Phase 0-5 follow, also meta-surface only. Product-surface binding is the Bridge 7 question, deferred until after the meta-surface ships.**

#### Where this prediction is wrong — three failure modes

1. **SP3 schemas are still in flux.** If the SP3 schemas are still being edited (e.g., new fields, status enum changes), Approach 3 will need to be redone as SP3 settles. *Test: check the git history on `schemas/*.schema.json` since 2026-06-05; if the diff is non-trivial, defer Approach 3.*
2. **The meta-surface engine produces output that is not equivalent to the existing hand-written meta-state tools.** The 16 `meta_state_*` tools in `tools/learning-loop-mastra/tools/legacy/meta-state-*-tool.js` have hand-written logic (e.g., `meta_state_derive_status`, `meta_state_check_grounding`). If the Bridge 5 engine's output for the meta-surface types does not match the existing hand-written behavior, the cut-over breaks. *Test: at Bridge 5 Phase 0, generate meta-state zod from the engine and compare against `buildZodSchemaFor('observation', ...)` and the hand-written `meta-state-*-tool.js` schemas. Any divergence is a blocker.*
3. **The product surface re-debate (Bridge 7) reveals that the meta-surface shape is also wrong.** If the loop, using its own meta-surface as substrate, concludes that the 4-kind union (`finding | change-log | rule | loop-design`) does not generalize, the meta-surface itself is in scope for re-debate. *Test: at post-meta-surface, audit whether the 4-kind union is still the right shape for the product surface the loop is designing. If not, the meta-surface is in scope too.*

### The Storage Layer Trajectory (Approach A → SQLite)

The scout closeout grew `meta-state.jsonl` from ~130 entries to 500+. The cold tier, compact mode, and `readRegistry()` re-parsed the 540KB JSONL on every call. Plan `260608-2255-index-extractor-optimization` shipped a structural fix across three layers (no more threshold-bump cures):

1. **Layer 1 — `index_extract` pipeline:** content-hash-keyed skip; reuses `evidence_immutable_hash`.
2. **Layer 2 — `readRegistry()` hot path:** process-lifetime LRU keyed on `root` + mtime + size. Invalidation hooked into every `writeEntry`/`updateEntry`/batch/archive.
3. **Layer 2.5 — `meta_state_batch`:** atomic primitive (one tool, one lock, one invalidation; cap 500 ops).
4. **Layer 3 — `loop_describe` cold/compact tier:** pre-computed `records/meta/.cache/loop-describe-cold.json` sidecar (gitignored; sha-keyed).
5. **`meta_state_archive`:** structural fix for the 2 active `*size-overrun*` findings; no more threshold bumps.

**SQLite is parked, not jumped to.** Approach A gets 90% of the benefit at 20% of the touch surface. Pre-conditions to un-park (per `docs/trajectory.md`): registry > 2x current size (~1000 entries), inverse-index computation > 50ms, drift query > 200ms. Migration path: dual-write JSONL + SQLite for 1 release, then flip the default reader to SQLite and demote the JSONL to a write-archive.

### Open Forward Decisions

Three structural decisions are filed as `loop-design` entries (active):

1. **Tiered meta-state migration (Model C).** Template ships clean. Findings stay operator-local. Promoted rules exportable as a YAML bundle and PR'd back to the template. Implementation: `meta_state_export_rules` MCP tool.
2. **Composite loss function for self-referential learning.** Drift recovery rate + findings-per-promoted-rule ratio. Surface through `meta_state_query_drift`.
3. **Operator-capture guard.** A `loop_discovered` vs `operator_ack` annotation on change-log entries. Ratio is the operator-capture index. Schema decision is open; the question is whether the annotation lives in the change-log entry, in a derived metric, or both.

**What stays human forever**: product scope, irreversible operations, class-approval definitions, decisions and risks, philosophy, and the loop's self-model boundaries. The operator remains the authority on what the loop is allowed to learn about itself. The meta-state system is the most dangerous component to give full autonomy to, because it is the one that decides what the rest of the loop learns.

---

## 11. Runtime Interface Ownership (R2)

Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent. **Cross-runtime edits require operator approval.**

**Convention:**
- Each runtime agent works on its own branch (e.g., `claude-code/interface-v2`, `mastra-code/interface-v1`).
- Cross-runtime edits (e.g., a Claude Code session editing `.factory/`) require an operator-approved PR.
- The `interface/CONTRACT.md` 5-requirement contract is the loop's concern; the runtime's coordination directory is the runtime's concern.

**Enforcement:** Git branch protection + PR review. The bundled hardening plan (`hardening-r2-lim3-lim4`) ships the write-gate (LIM-3 caller identity + R2 write-gate + LIM-4 path traversal) for security-critical enforcement.

---

## 12. What changed in this rewrite (2026-06-12)

This rewrite is a from-scratch replacement of the previous `AGENTS.md`. The previous version is preserved at `AGENTS.old.260612-1300.md` for forensic continuity. Concrete changes:

- **Dropped:** the "MCP-First Record Access" section's `record_*` CRUD table (the legacy product-surface CRUD list). The legacy `records/<surface>/{decisions,experiments,risks}.yaml` directory layout (`Surface-First Directory Layout`) — F5 of the consistency report. The "Product-Build Plans" / "Product Code Writes" / "Journal Writes" subsections of "Artifact-Level Loop Rules" (legacy product-surface carry-overs). The "Budget-Check Rule" (referenced `observation-vnstock-device-slot-ledger`, a product-surface artifact). The "Implementation Workflows" Use Case A and Use Case B (referenced `record_create_decision` and `product/**` preflight). The "Substrate vs. Product vs. Template" table (the product layer is now unbound; only substrate and template remain). The Record ID Convention `{type}-{surface}-{YYMMDD}T{HHmm}Z-{slug}` (a product-surface convention; meta-surface entries use their own id scheme from the meta-state schema).
- **Reorganized:** the doc now leads with §1 "The Meta-Surface (the only bound surface)" as the opening thesis. The Hook Matrix and discovery sections are infrastructure (§2). The Meta-Surface Tools are the canonical CRUD surface (§3) — replacing the old product-record CRUD table with the actual 21 meta-surface tools. Write Gate Block Protocol is unchanged in intent (§4). Artifact-Level Loop Rules now distinguish meta-surface writes (the only kind in scope) from substrate carry-overs (§5). Internalization Rule (§6) is reframed around the three-class dependency-balance convention (contract / internal-implementation / external) from `docs/philosophy.md` Pillar 4 — "the loop does not internalize everything it touches" replaces the naive "cite the code, not the markdown" reading. Side-Effect Import Rule (§7) and Cold-Session Test Onboarding (§8) are unchanged. Implementation Workflows (§9) is reduced to the 6-step meta-surface workflow. The "Where This Project Is Heading" section (§10) is the rewrite from the previous turn (Bridges table, Engine vs Instance, Bridges 1-4 voided, sequencing decision rule, three failure modes, Storage Layer Trajectory, Open Forward Decisions).
- **Added:** the from-scratch rewrite header at the top, pointing at the backup, the reframe, and the consistency report. §1's meta-surface thesis (4-kind union, product-surface unbound, substrate replaceable, why this matters for every section below). The 6-step meta-surface workflow in §9.
- **Net effect:** the document is now ~5x more focused on the meta-surface and ~5x less focused on the legacy product surface. The product surface is mentioned only where it is unbound (the §1 thesis) or as a substrate carry-over (the §5 substrate subsection).

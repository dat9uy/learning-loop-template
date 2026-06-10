# AGENTS.md — Agent Surfaces Reference

Shared coordination rules for both Claude Code and Droid CLI. All gate logic lives in `tools/learning-loop-mcp/core/` (single source of truth). Both surfaces use the same universal hooks via thin wrappers.

## Hook Matrix

| Surface | Hook | Wrapper | Universal Script |
|---------|------|---------|------------------|
| Claude Code | Bash gate | `.claude/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Claude Code | Write gate | `.claude/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Claude Code | Inbound gate | `.claude/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |
| Droid CLI | Execute gate | `.factory/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Droid CLI | Write gate | `.factory/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Droid CLI | Inbound gate | `.factory/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |

### Gate Descriptions

- **Bash/Execute gate** — blocks commands matching constraint patterns (docker, sudo, package-manager, vendor-api, side-effect-import) without active observations, and blocks all direct writes to `records/**` via redirects/heredocs/tee.
- **Write gate** — blocks Edit/Write/Create/ApplyPatch to `records/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, and unknown multi-segment paths. Allowed: `docs/**`, `plans/**`, `product/**`, `tools/**`, `.claude/**`, `.factory/**`, single-segment files.
- **Inbound gate** — warns when operator state-change messages may have stale observations.
- **Consult-gate `rule-no-orphaned-evidence`** — blocks `meta_state_resolve` when any active finding with `mechanism_check: true` has a stale `code_fingerprint` (source code drifted since fingerprint was stored). Refresh via `meta_state_refresh_fingerprint` to unblock.
- **Consult-gate `rule-no-new-artifact-types`** — blocks commands matching the refined regex `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`. Fixes the G8 subcommand-class false positive (7 recurrences, 2026-06-02..2026-06-06).
- **Consult-gate `rule-cold-session-test-must-pass-before-resolution`** — gates `meta_state_resolve` on the cold-session discoverability test passing. First instance of `pattern_type: resolution-evidence-required`.
- **Consult-gate `rule-project-skill-boundary`** — blocks cross-project `ck:use-mcp` / `ck:find-skills` skill invocations in projects that already have a local learning-loop-mcp server (glob `.factory/skills/{use-mcp,find-skills}/**`, scope predicate `project_has_learning_loop_mcp`).
- **MCP server** (`tools/learning-loop-mcp/server.js`) — 52 tools for constraint checks, record CRUD, preflight gating, meta-state lifecycle, and workflow orchestration. Grouped in `tools/learning-loop-mcp/agent-manifest.json`.

### Inbound State Gate — Meta-State First

**When the inbound state gate fires** (visible as a `INBOUND STATE GATE:` block in the operator message or session context), **read `meta-state.jsonl` (last 20 lines) BEFORE attempting any bash command**. The named observations in the gate warning are often a subset; the full escalation context (recent `change-log` and `finding` entries) lives in the registry.

**Why**: the gate is a SIGNAL that the operator just changed something external to the loop (cleared a device, reset state, etc.). The named observations are a *symptom* (they may be stale). The *cause* — the operator's intent and any prior gate-bug recurrences — is in `meta-state.jsonl`. Skipping this read reproduces known gate-bug classes (e.g., the G8 subcommand-class false positive, 5 documented recurrences in `meta-state.jsonl`).

**Concrete protocol**:
1. Gate fires → read `meta-state.jsonl` (last 20 lines, or use `meta_state_list` MCP tool with `entry_kind` filter).
2. Scan for recent `change-log` entries (operator intent) and `finding` entries (known gate bugs that may escalate).
3. If a matching prior finding exists, apply the operator-approved workaround BEFORE running the corresponding bash command.
4. Only then proceed to update affected observations via `record_observation` MCP tool.

**Defense in depth**: the hook message itself leads with the meta-state hint (see `tools/learning-loop-mcp/hooks/inbound-gate.js#buildContextMessage`), but this AGENTS.md rule is the canonical source.

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

## MCP-First Record Access

**All `records/**` writes go through MCP tools.** Both gates unconditionally block direct file writes (Edit/Write/Bash redirects) to `records/**`. There is no observation-dance, no pre-authorized path, and no bypass.

### Available MCP CRUD Tools

| Tool | Purpose |
|------|---------|
| `record_create_decision` | Create a decision YAML in `records/<surface>/decisions/` |
| `record_update_decision` | Update an existing decision record |
| `record_create_experiment` | Create an experiment YAML in `records/<surface>/experiments/` |
| `record_update_experiment` | Update an existing experiment record |
| `record_create_risk` | Create a risk YAML in `records/<surface>/risks/` |
| `record_update_risk` | Update an existing risk record |
| `record_create_observation` | Create an observation YAML in `records/observations/` |
| `record_update_observation` | Update an existing observation's status |
| `workflow_notify_artifact` | Log a file change and evaluate triggered workflows |
| `index_validate` | Validate all YAML records against schemas |
| `index_extract` | Rebuild the index from evidence/capability files |
| `capability_generate` | Generate capability records from product surfaces |
| `gate_mark_preflight` | Mark preflight checklist complete for a surface (unlocks product/** writes for 30 min) |

See `tools/learning-loop-mcp/agent-manifest.json` for full tool grouping and quickstart recipes.

**Use the canonical MCP tools (`meta_state_report`, `meta_state_patch`, `meta_state_batch`, `meta_state_archive`, `meta_state_log_change`, `meta_state_resolve`) for all meta-state mutations.** Do not use `node -e` scripts importing `core/meta-state.js` directly — this is the escape-hatch abuse closed in plans `260608-1015-meta-state-patch-tool-and-wire-format-fix` and `260608-2255-index-extractor-optimization`.

### Meta-State Group (the loop's self-model)

The `meta_state` group is the loop's self-model, not bookkeeping. It carries findings, change-logs, promoted rules, and loop-designs in a 4-member discriminated union. Mutations must go through these tools; direct I/O to `meta-state.jsonl` is the canonical anti-pattern tracked by `meta-260606T2102Z-agent-used-direct-file-i-o-...`.

| Tool | Purpose |
|------|---------|
| `meta_state_report` | Create a finding (ephemeral, 24h TTL) |
| `meta_state_list` | Query the registry (filterable by `entry_kind`, `status`, `category`, etc.) |
| `meta_state_ack` | Promote a finding from `reported` to `active` (removes 24h TTL) |
| `meta_state_resolve` | Mark a finding as resolved (consults active rules; may require fingerprint refresh) |
| `meta_state_promote_rule` | Promote a finding into a `rule` entry (enforcement: gate \| agent) |
| `meta_state_sweep` | Auto-resolve expired findings; auto-resolve findings whose file was modified |
| `meta_state_log_change` | Create a `change-log` entry (immutable audit log; no TTL) |
| `meta_state_patch` | Update an existing entry with CAS via `_expected_version` (closes the CRUD-U gap documented in `meta-260608T0848Z-crud-coverage-gap-...`) |
| `meta_state_derive_status` | Compute derived status of a finding (SP1; pure function over `evidence_code_ref`) |
| `meta_state_check_grounding` | SHA-256 fingerprint check; drift detection (SP2) |
| `meta_state_refresh_fingerprint` | Re-compute and store the current fingerprint after a refactor |
| `meta_state_query_drift` | Aggregate drift events across the registry (SP3) |
| `meta_state_propose_design` | Create a `loop-design` entry (the "design, not yet shipped" surface) |
| `meta_state_relationships` | 1-hop inbound/outbound cross-reference traversal |
| `meta_state_batch` | Atomic batch CRUD: one tool, one lock, one cache invalidation (cap 500 ops) |
| `meta_state_archive` | Move entries to `records/observations/.archive/YYYY-MM/`; structural fix for size-overrun findings |

**Operational rule**: the SessionStart hook runs `loop_describe({ tier: "warm" })` and surfaces a `discoverability_hints` block teaching the Internalization Rule, the meta-vs-product surface split, and the most recent active findings. Read this block before answering "what's next?" style questions.

**Why the registry is the product**: the loop's destination (per `docs/trajectory.md` § The Sixth Bridge) is a self-referential system whose self-model (this registry) influences its own behavior. Findings promote to rules; rules enforce invariants. Drift between recorded state and actual state is detected mechanically. The substrate (currently vnstock) is replaceable; what makes the loop valuable is the registry's ability to provoke and capture learning, not the substrate's identity.

### Record ID Convention

`{type}-{surface}-{YYMMDD}T{HHmm}Z-{slug}` — e.g., `decision-product-260522T0930Z-use-vnstock-sdk`

### Surface-First Directory Layout

```
records/
├── <surface>/
│   ├── decisions/*.yaml
│   ├── experiments/*.yaml
│   └── risks/*.yaml
├── observations/*.yaml
├── meta/
│   ├── evidence/*.md
│   └── capabilities/*.yaml
└── index.yaml
```

## Write Gate Block Protocol

When the gate blocks with `decision: block`:

1. **Identify if the artifact is required.** If the plan phase lists the file as a deliverable, it is required.
2. **For `records/**` paths:** Use the appropriate MCP CRUD tool to create or update the record. The MCP server writes directly — no gate bypass.
3. **For `schemas/**` paths:** Use `AskUserQuestion` to surface the block to the operator with: what file is blocked, why, why it's needed, and options to approve or skip.
4. **Never use Bash to circumvent a write-gate block.** If Edit/Write is blocked, using Bash (sed, cat, echo, redirect) to modify that same path is a circumvention, not a solution.
5. **Never assume `--auto` mode overrides mechanical blocks.** `--auto` skips review gates, NOT PreToolUse hook blocks. A blocked tool is a hard stop.

## Artifact-Level Loop Rules

### Product-Build Plans
- All plans with `tags: [product-build]` MUST declare surfaces in Phase 0.
- Decision records MUST exist in `records/<surface>/decisions/` before implementation phases begin **(product-build plans only)**. Use `record_create_decision` MCP tool.
- Missing decision records **always block** (exit 2) — regardless of `GATE_RESPONSE_MODE`.

### Product Code Writes
- Writing to `product/**` requires a valid preflight marker for the inferred surface.
- Surface inference: all `product/**` paths → surface `product`.
- The gate checks `.claude/coordination/.loop-preflight-<surface>` for a marker with a valid timestamp within 30-minute TTL.
- Missing or expired preflight markers **always block** (exit 2) — regardless of `GATE_RESPONSE_MODE`.
- The block message includes a `preflight_checklist` (6 steps) and `surface` field.
- Use `gate_mark_preflight` MCP tool to create the marker. Direct writes to `.loop-preflight-*` files are blocked by both write and bash gates.

### Journal Writes
- `docs/journals/**` is allowed unconditionally.
- Agents SHOULD suggest using `record_create_experiment` when journals contain experiment-worthy observations.

### Gate Response Modes
`GATE_RESPONSE_MODE` controls behavior for **non-artifact** gate checks only (unknown paths, observation staleness). Artifact-aware checks always block.

- `warn` (default): allow the write, emit JSON warning.
- `escalate`: block the write, require operator approval.
- Set via `GATE_RESPONSE_MODE` environment variable.

## Budget-Check Rule (vendor-api commands)

Before executing any `vendor-api` command (e.g., `curl` to vendor APIs, vendor SDK calls):

1. Call `budget_check(system="vnstock", resource="device-slots")` (or appropriate system/resource)
2. If budget observation is stale or missing, stop and ask the operator
3. If budget is exhausted (`remaining: 0`), read `observation-vnstock-device-slot-ledger` to check host fingerprint
4. Decide:
   - Same fingerprint as registered device → safe, proceed
   - New fingerprint → dangerous, stop or ask operator
5. Record your reasoning via `meta_state_report(category="budget-check", ...)` with:
   - `affected_system`: the vendor system name (e.g., `vnstock_vendor`)
   - `description`: budget numbers, fingerprint match result, and decision
   - `evidence_code_ref`: the budget observation path
6. Only proceed after recording the budget-check meta-state entry

## Internalization Rule (source_refs and evidence_code_ref)

When an agent needs to cite a design, finding, or external reference, **cite the code, not the markdown.** The canonical citation path is:

1. Report a `meta_state_report` finding with `evidence_code_ref` set to the code location (e.g., `tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints`).
2. In the record's `source_refs`, use `local:meta-state:<id>` where `<id>` is the finding's id.
3. Optional but recommended: set `mechanism_check: true` on the finding so `meta_state_derive_status` and `meta_state_refresh_fingerprint` can re-check it after refactors.

Markdown paths (`local:plans/...`, `local:docs/...`) are the **escape hatch**, not the default. They are deprecated and rejected by `record_create_decision`. For designs that have no code point yet, use `meta_state_log_change` with `change_target: '<plan-path>'` and cite the resulting change-log id in `source_refs`.

The SessionStart hook surfaces this rule in its discoverability hints. To suppress hints for context-budgeted sessions, set `LL_LOOP_INJECT_TIER=summary` (default is `warm`). The downgrade is logged as a `hint-downgrade` finding per session.

## Side-Effect Import Rule (all vendor SDKs)

If any vendor SDK import triggers device registration or authentication (e.g., `import vnstock_data`, `import vendor_data`), do not import it directly. Use `importlib.util.find_spec()` for safe checks. If the gate blocks with `side-effect-import`, respect the block. Do not attempt to bypass it.

## Implementation Workflows

### Use Case A — Direct Cook

For quick product changes:

1. Use `gate_mark_preflight` MCP tool to unlock product/** writes for the target surface.
2. `/ck:cook evidence.md` or `/ck:cook <file>`
3. Gate validates product code writes have a valid preflight marker.

### Use Case B — Plan Then Cook

For features requiring research:

1. `/ck:plan` (produces plan.md with Phase 0 surface declaration)
2. Use `record_create_decision` MCP tool for required decision records (plan gate).
3. Use `gate_mark_preflight` MCP tool to unlock product/** writes.
4. `/ck:cook plan.md`

### Agent Rule

**Never ignore gate block decisions.** If blocked by preflight gate, use `gate_mark_preflight` MCP tool and retry. If blocked by records gate, use MCP CRUD tools to create the missing record. Do not use Bash to circumvent a gate block.

### Cold-session Test Onboarding

Fresh clones require `pnpm test:cold-session` once to seed `.cold-session-sentinel.json`. The freshness test in normal `pnpm test` enforces a 3-day cadence. Run `pnpm test:cold-session` whenever the sentinel asserts stale.

## Where This Project Is Heading

The long-term direction lives in `docs/trajectory.md` (read it before reasoning about loop design). This section is the AGENTS-level summary that agents need on every session.

**The loop has shifted from vnstock-driven to self-learning driven.** The substrate (vnstock, then any real vendor API) is replaceable; what makes the loop valuable is its ability to provoke and capture learning *about itself*. The destination is a self-referential system where the loop's self-model (the meta-state registry) influences its own behavior — findings promote to rules, rules enforce invariants, drift is detected mechanically, and the operator's cognitive load is bounded by the registry's own queryability. This is why Bridge 6 (self-model) is the active front while Bridges 1–5 (content + schema codegen) remain aspirational: the loop has learned that the highest-leverage work is on its own machinery, not on the vendor substrate.

### The Six Bridges

The destination sentence: *A self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The gradient moves knowledge from human-readable docs into machine-driven loop mechanics, one bridge at a time.

| # | Bridge | Status | What it removes (when shipped) |
|---|---|---|---|
| 1 | Doc → candidate assertion | **Not shipped** — humans hand-author evidence from doc reading; no candidate-extraction tool, vendor docs do not author to `## Findings` | The need to re-read vendor docs every session |
| 2 | Candidate → experiment plan | **Not shipped** — humans design experiment YAMLs from scratch; no `propose_design_for` mapping | The need to author experiment YAMLs from scratch |
| 3 | Class-level experiment approval | **Not shipped** — every experiment gates on `status: approved`; no class-pattern field | Per-experiment operator approval |
| 4 | Candidate-vs-validated status | **Not shipped** — status enum is `active \| superseded \| pending_approval`; no `candidate` slot | Ambiguity about vendor-claims vs proven assertions |
| 5 | Schema as source of truth | **Not shipped** — for every record type, four parallel hand-written "field catalogues" exist (schema + tool zod + writer + validator). 11 drift cells across experiment + risk | The hand-written tool zod + writer + validator triplet per record type |
| 6 | **Self-model as product** | **Shipped (SP0–SP3) and growing** — meta-state registry; 4-kind union (finding \| change-log \| rule \| loop-design); 5 active rules; 3 active loop-designs; all agent affordances operational | The operator's need to remember "which gate changed when" — `meta_state_derive_status` reasons about drift instead |

**The current focus is Bridge 6, not Bridges 1–5.** The loop's center of gravity has shifted from substrate-driven learning (proving vnstock assertions) to self-learning (proving the loop's own behavior). SP0 (self-modification affordance) shipped the ability to log any system change. SP1 (derivation query) shipped the ability to ask "is this finding still true?". SP2 (grounding check) shipped SHA-256 fingerprinting. SP3 (drift query) shipped aggregate drift surfacing. All four sub-projects together moved the loop's own runtime state from operator-memory to a machine-queryable self-model.

Bridges 1–4 move *content* from docs into machine-actionable records. Bridge 5 moves the loop's own *code* from hand-written to schema-derived. Bridge 6 moves the loop's own *runtime state* from operator-memory to a machine-queryable self-model. **Bridges 1–5 are aspirational; Bridge 6 is the active front.**

### Substrate vs. Product vs. Template

Three layers, distinct lifespans, distinct homes:

| Layer | Role | Lifespan | Lives in |
|---|---|---|---|
| **Template** | Static rules of the game — gates, hooks, schemas, MCP tools | Frozen-ish; evolves through formal change-log entries | `tools/learning-loop-mcp/`, `schemas/`, `.claude/coordination/` |
| **Self-model (product)** | The loop's learning about itself — findings, rules, drift, lifecycle | Grows continuously per operator; change-log tier is durable | `meta-state.jsonl` + 16 `meta_state_*` MCP tools |
| **Substrate** | Real surface area the loop operates against so it generates real findings. Replaceable. | Disposable — exists to provoke learning, not to be learned *about* | `records/vnstock/`, `product/api/` |

The substrate exists to provoke learning; the learning is not *about* the substrate. A recent example: `meta-260606T2106Z-agent-called-meta-state-log-change-...` (subtype `tool-retry-loop`) is the loop noticing its own retry pathology. That finding has no relationship to vnstock. It is the loop learning about the loop.

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

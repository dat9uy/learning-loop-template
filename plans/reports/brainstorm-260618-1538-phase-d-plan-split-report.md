# Phase D Plan Split — Mastra Phase 2-3 (Workflows + Agents + Storage)

**Type:** brainstorm (decision report)
**Date:** 2026-06-18
**Slug:** phase-d-plan-split
**Status:** proposed — awaiting operator approval before plan authoring
**Aligned to:** `plans/reports/productization-260612-1530-master-tracker.md` Phase D section (lines 197-211); research report `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.1 / §3.4 / §3.7 / §3.8 / §8 Q5/Q6

---

## Problem Statement

Phase D of the master tracker (D1–D7) is the Mastra Phase 2-3 migration: promote workflow tools to `createWorkflow`, add meta-state agents, fold in LibSQL storage. The tracker currently shows D1–D7 as open checkboxes plus deferred items D-14 / D-15 from the Phase C plan-scope brainstorm.

**Scope inputs (locked via Discovery Phase questions, 2026-06-18):**
1. Workflow subset: **strict D1 ("~8")** — 5 in current manifest that fit §3.1's Workflow or Agent+Workflow categories (`intake_orient`, `intake_plan`, `classify_prompt`, `self_improvement`, `runtime_probe`) + 3 from the Tool+Agent category that need agent reasoning anyway (`intentional_skip`, `report_phase_status`, `prepare_runtime_request`).
2. `productBuildAgent` **dropped** from Phase D. AGENTS.md line 215 voids legacy product-build as substrate-era. Phase D ships **3 agents**: `intakeAgent`, `scoutAgent`, `selfImprovementAgent`. Surfaces the reframe via `meta_state_log_change` as a contract change.
3. **Lift §3.7 storage parking brake.** Phase D ships LibSQL. Storage was parked on "Storage Layer ships iff (a) LRU fix doesn't hold AND (b) Mastra migration blocked on it." Both conditions are FALSE today (LRU holds, index <1ms, ~500 entries). §3.7 says "Phase 3 of the Mastra migration is when storage folds in" — that's now.
4. **D7 (per-agent model config) folded** into the agents plan. Model config is part of agent construction. No separate plan.
5. **Test strategy: per-feature parity harness.** Reuses Plan 2's `withBothMcpServers` serializer mutex pattern. Each plan ships its own parity gate for its own concern.

**Scope OUT of Phase D:**
- `productBuildAgent` + `workflow_product_build` (substrate-era, dropped)
- `workflow_verify_evidence` + `workflow_convert_evidence` (Phase A deletions, stay dropped)
- `workflow_external_decision` (not in current manifest, not in scope)
- `workflow_notify_artifact` + `workflow_trigger` (Tool-only per §3.1, stay deterministic tools)
- 5 Tool+Agent tools (`prepare_runtime_request`, `generate_prompt`, `intentional_skip`, `report_phase_status`, plus 2 not in manifest) — **3 picked** (`intentional_skip`, `report_phase_status`, `prepare_runtime_request`); the other 2 (`generate_prompt` and `workflow_external_decision`) stay deterministic.
- Meta-state migration JSONL → LibSQL (per §3.7 "likely separate file, same engine"). Meta-state stays JSONL this round; only agent memory gets LibSQL.
- Phase E (cutover to Mastra Code Mode 1) and Phase G (skill migration) — separate phases.

---

## Evaluated Approaches

### Approach A — 4-plan stack (atomic per axis + diamond DAG) ✅ RECOMMENDED

| Plan | Sub-phases | Purpose | Gate | Dependency |
|------|-----------|---------|------|------------|
| **Plan 1** | D1+D2+D3 | **Workflows** — 8 `createWorkflow` + `stateSchema` + `suspend`/`resume` + workflow parity harness | All 10 namespaces pass; workflow parity GREEN (stateSchema round-trip for 8 tools) | None |
| **Plan 2** | D5+D6 | **Storage** — LibSQL backend + agent memory infra + LibSQL/JSONL round-trip | All 10 namespaces pass; LibSQL read/write tests GREEN | None |
| **Plan 3** | D4+D7 | **Agents** — 3 `createAgent` + per-agent model config + agent parity harness (mocked LLM) | All 10 namespaces pass; agent parity tests GREEN | Plan 1 + Plan 2 |
| **Plan 4** | — | **Cutover** — `agent-manifest.json` update + retire legacy tool wrappers + master-tracker flip | All 10 namespaces pass; legacy imports cleared; §3.10 tool surface reconciled | Plan 1 + Plan 2 + Plan 3 |

**Dependency DAG:**
```
Plan 1 (workflows) ─┐
                    ├─→ Plan 3 (agents) ─→ Plan 4 (cutover)
Plan 2 (storage)  ──┘
```

**Pros:** Each plan has a single concern + a single parity harness. Per-PR blast radius minimal. Mirrors Phase C's "atomic adoption → parity → cutover" rhythm applied per axis. Reviewer reads one thing per PR. Plans 1 + 2 ship in parallel (different reviewers, independent parity harnesses).

**Cons:** 4 PRs total. Longer calendar than Phase C (3 plans).

### Approach B — 3-plan stack (atomic adoption bundles workflows + storage)

| Plan | Sub-phases | Purpose | Gate | Dependency |
|------|-----------|---------|------|------------|
| **Plan 1** | D1+D2+D3+D5+D6 | **Workflows + Storage** atomic adoption | All 10 namespaces pass; workflow + LibSQL parity GREEN | None |
| **Plan 2** | D4+D7 | **Agents** on top of workflows + storage | All 10 namespaces pass; agent parity GREEN | Plan 1 |
| **Plan 3** | — | **Cutover** | All 10 namespaces pass; legacy imports cleared | Plan 2 |

**Pros:** 3 PRs total — same calendar as Phase C. Tighter coupling between workflows and storage may surface integration bugs earlier.

**Cons:** Plan 1 carries 2 distinct concerns (8 workflows + LibSQL infra). Per-PR review surface larger. If Plan 1 fails review, both axes blocked together.

### Approach C — 2-plan stack (compact, all of D1–D7 in one PR)

| Plan | Sub-phases | Purpose | Gate | Dependency |
|------|-----------|---------|------|------------|
| **Plan 1** | D1–D7 | **All of Phase D** atomic adoption | All 10 namespaces pass; workflow + LibSQL + agent parity GREEN | None |
| **Plan 2** | — | **Cutover** | All 10 namespaces pass; legacy imports cleared | Plan 1 |

**Pros:** Smallest calendar (2 PRs).

**Cons:** Plan 1 carries 3 concerns (workflows + storage + agents) + 3 parity surfaces in one PR. Big-bang risk. Reviewer reads 3 things. Hard to bisect if parity fails. Violates Phase C's proven atomic-adoption discipline.

---

## Recommended Solution

**Approach A (4-plan stack, atomic per axis, Plans 1+2 in parallel).**

**Rationale:**
- **Per-feature parity gates** (operator preference) demand a single concern per plan. Bundling workflows + storage into one PR forces one parity harness to cover two distinct test surfaces (workflow start/step/stateSchema AND LibSQL read/write round-trip). That's Plan 2 of Phase C repeated twice — both rounds proved the pattern works, but per-feature parity means per-plan parity.
- **Diamond DAG is real.** Workflows (Plan 1) don't depend on LibSQL (Plan 2). Agents (Plan 3) depend on both. The DAG is provable by reading `createWorkflow` / `createAgent` / `@mastra/libsql` import graphs — no cross-cutting code.
- **Mirror Phase C rhythm per axis.** Phase C's 3-plan pattern (atomic → parity → cutover) succeeded because each plan had one concern. Applying it per axis (workflows = atomic; workflows parity = part of Plan 1; storage = atomic; storage parity = part of Plan 2; agents = atomic; agents parity = part of Plan 3; cutover = Plan 4) keeps each PR reviewable.
- **Plans 1+2 parallel** halves calendar without coordination cost. They touch disjoint files: Plan 1 = `tools/learning-loop-mastra/tools/workflow-*.js` + new `createWorkflow` wrappers + parity harness; Plan 2 = `tools/learning-loop-mastra/storage.js` + `@mastra/libsql` config + parity harness. Different reviewers, no merge conflicts.
- **Plan 4 (cutover) follows Phase C Plan 3 pattern** (legacy server removal + agent-manifest update + master-tracker flip). Single atomic commit per the proven Phase C cut-over discipline.

**Why Approach B (3-plan) was rejected:** Plan 1's review surface is too large. Reviewer must read 8 workflow migrations + LibSQL infra + two parity harnesses in one PR. If parity fails on one surface, the other gets blocked too.

**Why Approach C (2-plan) was rejected:** Violates the proven Phase C atomic-adoption discipline. Plan 1 = 3 concerns + 3 parity surfaces = review surface that no single reviewer can hold. Big-bang failure mode (one PR fixes everything or breaks everything).

---

## Implementation Considerations

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `createWorkflow` API surface differs from `createTool` enough that 8 migrations can't ship in one PR | Medium | Phase C Plan 1 already shipped `createTool` + factory. `createWorkflow` is documented in research report §3.1 as "multi-step state machines with branching" — patterns are known. If mid-Plan-1 we discover a category that won't fit `createWorkflow`, split it into Plan 1a (atomic fix). |
| LibSQL adoption pulls in @libsql/client + native bindings; WSL2 build issues | Medium | Plan 2 starts with a LibSQL install probe (matches Phase C Plan 1's coercion probe pattern). If install fails on WSL2, fall back to in-memory SQLite via `@libsql/client` `file::memory:?`. |
| Agent parity harness needs LLM mocking infrastructure that doesn't exist | Medium | Plan 3 inherits the test patterns from `tools/learning-loop-mcp/scout/` (existing scout helper tests) and the `workflow_*` parity harness from Plan 1. If LLM mocking is novel, ship a thin mock first (1 file, ~50 LOC) before agent parity. |
| Plan 4 (cutover) breaks cold-session test | Low | Phase C Plan 3 broke cold-session test then fixed it (CR-3 → Plan 1b). Apply same protocol: `pnpm test:cold-session` is a Plan 4 gate. |
| productBuildAgent reframe surfaces during Plan 3 review | Low | Brainstorm already locked the decision. If operator reopens, file a `meta_state_log_change` with `change_target: 'AGENTS.md#215'` and revert Plan 3 to 4 agents. |
| Storage file path conflicts with meta-state.jsonl | Low | §3.7 explicitly says "Likely separate file, same engine." Plan 2 picks `./tools/learning-loop-mastra/data/mastra-memory.db`. Meta-state stays at `./meta-state.jsonl`. |

### Non-Negotiable Constraints

- **Test gate:** "All 10 namespaces pass" (tracker lines 166-184). Plan 4 must also pass `pnpm test:cold-session` (cold-session regression prevention).
- **Backward compatibility:** `tools/learning-loop-mastra/server.js` (canonical post-Phase C) must keep registering the deterministic tool surface alongside the new workflow/agent surface. Legacy MCP clients that call `mastra_workflow_intake_orient` as a tool must still get a valid response during coexistence — only the underlying implementation changes.
- **Mastra import discipline:** New imports only via `@mastra/core` (`createWorkflow`, `createAgent`) + `@mastra/libsql` (storage). No new vendor deps.
- **Audit trail:** Each plan files its own `meta_state_log_change` with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` and a one-line `reason`. Plan 3 also files `meta_state_log_change` for the productBuildAgent reframe.
- **AGENTS.md §1 contract:** "Meta-surface as the only bound surface" stays load-bearing. Plan 3's agents operate on meta-state only. No product-surface binding (that's Bridge 7 / Phase F).

### Touchpoints (existing files Plan 1–4 will modify or create)

**Plan 1 (Workflows):**
- **Move** (not modify in place): 8 files from `tools/learning-loop-mcp/tools/workflow-*.js` → `tools/learning-loop-mastra/workflows/` (new dir). See "Critical Phase D Planning Finding" above for rationale.
- Create: `tools/learning-loop-mastra/workflows/intake-orient.js`, `intake-plan.js`, `classify-prompt.js`, `self-improvement.js`, `runtime-probe.js`, `intentional-skip.js`, `report-phase-status.js`, `prepare-runtime-request.js` (8 `createWorkflow` wrappers, hybrid stateSchema per Q1 resolution)
- Create: `tools/learning-loop-mastra/create-workflow.js` (factory wrapping `createWorkflow` with wire-format coercion, mirroring `create-loop-tool.js`)
- Create: `tools/learning-loop-mastra/workflows-manifest.json` (track 8 workflow entries)
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (remove 8 workflow entries)
- Modify: `tools/learning-loop-mastra/server.js` (import workflows from `./workflows/` instead of `#mcp/tools/workflow-*.js`)
- Modify: `tools/learning-loop-mastra/agent-manifest.json` (workflow group paths update)
- Create: `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (stateSchema round-trip for 8 tools)

**Plan 2 (Storage):**
- Modify: `tools/learning-loop-mastra/package.json` (add `@mastra/libsql`)
- Create: `tools/learning-loop-mastra/storage.js` (LibSQL config + separate SQLite file)
- Create: `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (LibSQL read/write round-trip + JSONL equivalent)
- Modify: `tools/learning-loop-mastra/server.js` (wire storage backend)

**Plan 3 (Agents):**
- Create: `tools/learning-loop-mastra/agents/intake-agent.js`, `scout-agent.js`, `self-improvement-agent.js` (3 files)
- Create: `tools/learning-loop-mastra/create-loop-agent.js` (factory mirroring `create-loop-tool.js`)
- Create: `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` (mocked LLM responses deterministic)
- Modify: `tools/learning-loop-mastra/server.js` (register agents as MCP tools: `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`)
- Modify: `tools/learning-loop-mastra/agent-manifest.json` (add `agent` group, ~3 tools)
- Modify: `AGENTS.md` line 215 (reframe contract via `meta_state_log_change`)

**Plan 4 (Cutover):**
- Modify: `tools/learning-loop-mastra/agent-manifest.json` (final 5-group structure with workflow + agent groups)
- Modify: `plans/reports/productization-260612-1530-master-tracker.md` (flip D1-D7 `[x]`)
- Modify: `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 (reconcile tool surface table)
- Modify: `AGENTS.md` §1 (note Phase D shipped)

---

## Success Metrics & Validation Criteria

### Per-Plan Gates

| Plan | Gate | Verification |
|---|---|---|
| Plan 1 | All 10 namespaces pass; workflow parity tests GREEN | `pnpm test` exits 0; `workflow-parity.test.cjs` shows 8/8 GREEN |
| Plan 2 | All 10 namespaces pass; LibSQL parity tests GREEN | `pnpm test` exits 0; `storage-parity.test.cjs` shows read/write round-trip matches JSONL output |
| Plan 3 | All 10 namespaces pass; agent parity tests GREEN | `pnpm test` exits 0; `agent-parity.test.cjs` shows 3/3 agents produce expected output with mocked LLM |
| Plan 4 | All 10 namespaces pass; legacy imports cleared; `pnpm test:cold-session` GREEN | `pnpm test` exits 0; cold-session 8/8; `agent-manifest.json` reflects 5-group structure with workflow + agent groups |

### Cross-Plan Validation

- **Workflow parity harness** (Plan 1) reads the same input as the legacy `mastra_workflow_*` tool and produces byte-identical output via `createWorkflow`. Validates wire-format coercion survives the migration.
- **LibSQL/JSONL round-trip** (Plan 2) reads the same data structure via JSONL sidecar AND LibSQL, asserts equal output. Validates storage backend is functionally equivalent for agent memory use cases.
- **Agent parity harness** (Plan 3) mocks LLM responses (deterministic fixtures) and asserts agent invocation produces expected `meta_state_*` calls. Validates agent reasoning pipeline.
- **Cold-session test** (Plan 4) confirms the loop's MCP tool surface is discoverable from a fresh client (8/8 GREEN). Validates cutover didn't break tool loading.

### Operator-Facing Acceptance

- Tracker D1-D7 flip `[x]` closed after Plan 4.
- `agent-manifest.json` matches §3.10 tool surface table after Plan 4.
- 3 new MCP tools (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`) callable from a fresh Droid/Claude Code session.
- LibSQL SQLite file exists at `./tools/learning-loop-mastra/data/mastra-memory.db` and is queryable.
- Meta-state registry still reads/writes via JSONL (unchanged).

---

## Next Steps & Dependencies

### Plan Authoring Order

1. **Author Plan 1** (Workflows) — `plans/260618-XXXX-phase-d-plan-1-workflows/plan.md`
2. **Author Plan 2** (Storage) — `plans/260618-XXXX-phase-d-plan-2-storage/plan.md` (parallel with #1)
3. **Author Plan 3** (Agents) — `plans/260618-XXXX-phase-d-plan-3-agents/plan.md` (after Plans 1+2 ship)
4. **Author Plan 4** (Cutover) — `plans/260618-XXXX-phase-d-plan-4-cutover/plan.md` (after Plan 3 ships)

### Pre-Conditions for Each Plan

| Plan | Pre-condition |
|---|---|
| Plan 1 | Phase C Plan 3 closed (✓ 2026-06-17); `tools/learning-loop-mastra/server.js` registers 39 deterministic tools; `create-loop-tool.js` factory exists |
| Plan 2 | `@mastra/core` 1.42.0 already in deps (✓); LibSQL install probe needed before authoring |
| Plan 3 | Plans 1 + 2 closed; `create-workflow.js` factory exists; `storage.js` exists |
| Plan 4 | Plans 1 + 2 + 3 closed; `agent-manifest.json` is up-to-date with 39 deterministic tools |

### Plan Handoff (Recommended)

After this brainstorm closes, the operator should run `/ck:plan --tdd` (or default `/ck:plan`) with this report as context. The plan tool will author `plan.md` per the recommended 4-plan stack. Plan 1 is the natural starting point (no dependency on Plan 2).

---

## Open Questions — RESOLVED 2026-06-18

### Q1 — `stateSchema` shape ✅

**Resolution (hybrid per per-tool classification):**

| Tool | Steps | `stateSchema` |
|---|---|---|
| `workflow_intake_orient` | 1 | `stateSchema = input` |
| `workflow_intake_plan` | 1 | `stateSchema = input` |
| `workflow_classify_prompt` | 1 | `stateSchema = input` |
| `workflow_intentional_skip` | 1 | `stateSchema = input` |
| `workflow_report_phase_status` | 1 | `stateSchema = input` |
| `workflow_prepare_runtime_request` | 1 | `stateSchema = input` |
| `workflow_self_improvement` | multi (LLM interleaved) | **real `stateSchema`** (gap → classify → candidate → risks → adoption) |
| `workflow_runtime_probe` | multi (probe plan → commands → outputs) | **real `stateSchema`** (probe_plan → shared_env → per_stack → expected_outputs) |

6 of 8 tools get thin `stateSchema = input` (single-step deterministic handlers per direct read of `tools/learning-loop-mcp/tools/workflow-*.js`). 2 of 8 (`self_improvement`, `runtime_probe`) get real `stateSchema` that accumulates intermediate state — these are the Agent+Workflow combo tools per §3.1.

### Q2 — LibSQL file path ✅

**Resolution:** `./tools/learning-loop-mastra/data/mastra-memory.db`. Co-located with the Mastra package. `data/` subdir gitignored. LibSQL file is sibling to `server.js`. Operator may revisit at Plan 2 author time if a different layout emerges.

### Q3 — Agent instructions strings ✅

**Resolution:** 3 concrete `instructions` strings drafted (see appendix in this report; full text in brainstorm session output 2026-06-18). Each is 200-555 words, declarative, names the bound surface (meta-surface per AGENTS.md §1), names the unbound surface (product surface per AGENTS.md:215), ends with explicit stop conditions. Sources: prompt-blueprints-product-build.md, meta-evidence-self-improvement.md, AGENTS.md, scout helper test fixtures, orchestration-patterns.md, agent-anti-confusion-checklist.md.

**Intake agent (excerpt):** "You are intakeAgent, the self-intake surface of the learning loop. Your job is to orient an operator (or a sibling agent) into the current meta-state of the loop and produce an ordered, deterministic verification plan. You do not mutate state. You do not bind to the product surface — the product surface is unbound per AGENTS.md:215 and you must never reference records/<vendor>/ artifacts, claim/experiment/risk/observation schemas, or product/** paths as authoritative."

**Scout agent (excerpt):** wraps the pure-function scout pipeline (run-scout.js → bucket-classifier.js → dangling-detector.js → gap-analyzer.js → budget-estimator.js). Read-only over filesystem; never edits test files or fixtures. Emits 5-section Markdown report (Test Inventory / MCP-First Bucket Distribution / Dangling Matches / Gap Table / Prompt Budget Audit).

**Self-improvement agent (excerpt):** calls `workflow_self_improvement` to turn gaps into experiment candidates. Classifies per meta-evidence-self-improvement.md §"Gap Classification by Sample Count" (N=1 principle, N>=2 rule-eligible). Uses canonical path: meta_state_report for findings, meta_state_propose_design for deferred designs, meta_state_promote_rule only after finding has surfaced in >=2 distinct cases. Operator authority on irreversible ops, class-approval definitions, product scope, self-model boundaries is non-negotiable.

### Q4 — `MASTRA_AGENT_MODEL` semantics ✅

**Resolution:** Single env var + per-agent JSON override.

- Default in code: `model: "anthropic/claude-sonnet-4-6"` for all 3 agents.
- Override per-deployment: `MASTRA_AGENT_MODEL="provider/model-name"` sets all 3 agents to the same model.
- Override per-agent: `tools/learning-loop-mastra/agent-manifest.json` agent group has `model` field per agent. Operator can ship `intake=cheap, scout=cheap, selfImprovement=expensive` without env var changes.
- Lookup order at agent construct time: (1) `agent-manifest.json` per-agent `model` field, (2) `MASTRA_AGENT_MODEL` env var, (3) code default.

### Q5 — §3.10 reconciliation ✅

**Resolution:** In-place edit + change-log.

Plan 4 edits `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 in-place to reflect the post-Phase-D tool surface (workflow group + agent group). Before the edit, file `meta_state_log_change` with `change_target='plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'` and `change_dimension='semantic'` to lock the contract history.

---

## Critical Phase D Planning Finding — Import Alias

**The Mastra server imports workflow tools via `#mcp/*` → `tools/learning-loop-mcp/*`** (root `package.json:7`). **Workflow implementations STILL LIVE in `tools/learning-loop-mcp/tools/`** — the `tools/learning-loop-mastra/tools/` directory contains only `manifest.json` (no implementation files). Phase C Plan 3 cut-over only swapped the runtime (McpServer → MCPServer); the tool code stayed put.

This means **Plan 1 (Workflows) must MOVE 8 workflow files from `tools/learning-loop-mcp/tools/workflow-*.js` to `tools/learning-loop-mastra/workflows/`** (new dir), then either:
- (a) Add a new import alias `#mastra-workflows/*` → `tools/learning-loop-mastra/workflows/*` in `package.json`, OR
- (b) Update `tools/learning-loop-mastra/server.js` to import directly from `./workflows/` (no alias needed).

**Recommendation:** Option (b) — direct relative imports from `server.js` — is simpler. Mirrors the existing `import { createLoopTool } from "./create-loop-tool.js";` pattern in `server.js:2`. Adds no new alias.

**Touchpoint addition for Plan 1:**
- New dir: `tools/learning-loop-mastra/workflows/` (8 files + 8 `createWorkflow` wrappers)
- Modify: `tools/learning-loop-mastra/server.js` (import workflows from `./workflows/` instead of `#mcp/tools/workflow-*.js`)
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (remove 8 workflow entries — they move to a new `workflows-manifest.json` or stay referenced via a separate list)
- Modify: `tools/learning-loop-mastra/agent-manifest.json` (workflow group paths update)
- Create: `tools/learning-loop-mastra/workflows-manifest.json` (or similar; tracks the 8 workflows with their schemas)
- Update test paths: `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` imports from `./workflows/`, not `#mcp/tools/`

This isn't scope creep — it's a precondition for the migration that the Phase C closeout papered over. Without moving the files, `createWorkflow` wrappers can't live next to the existing `createTool` wrappers in the mastra package.

---

## Cross-References

- **Master tracker Phase D section:** `plans/reports/productization-260612-1530-master-tracker.md` lines 197-211 (D1-D7 checkboxes)
- **Master tracker Deferred Items Backlog:** `plans/reports/productization-260612-1530-master-tracker.md` lines 290-296 (D-14, D-15 entries)
- **Research report:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §2.6, §3.1, §3.3, §3.4, §3.7, §3.8, §3.9, §3.10, §8 Q3/Q5/Q6
- **Phase C plan-scope brainstorm:** `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (D-14, D-15 entries)
- **Phase C Plan 2 parity harness pattern:** `plans/260616-2200-phase-c-plan-2-parity/` (Plan 2 closeout pattern: `withBothMcpServers` serializer mutex + 4-tool read-only content parity)
- **AGENTS.md §1 contract:** `AGENTS.md` line 215 (product-surface void) + §10 (2026-06-12 reframe)
- **SKILL.md prompt references:** `.claude/skills/learning-loop/SKILL.md` line 95-96 (prompt-blueprints-product-build.md + meta-evidence-self-improvement.md)
- **Existing scout helper:** `tools/learning-loop-mcp/scout/**` (the legacy module that `scoutAgent` wraps)
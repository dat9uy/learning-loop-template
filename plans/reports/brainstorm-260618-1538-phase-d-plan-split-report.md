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
| **Plan 2** | D5+D6 | **Storage** — LibSQL backend (Mastra runtime substrate) + LibSQL/JSONL round-trip | All 10 namespaces pass; LibSQL read/write tests GREEN | None |
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

---

## Plan 1 Execution: Process Learnings & Deferred Items

**Status:** Plan 1 shipped 2026-06-19 (PR #6, branch `260618-1911-phase-d-plan-1-workflows`). D1/D2/D3 tracker flips confirmed. This section captures the process that actually ran and the items that were explicitly deferred to downstream plans. The original decision (above) is preserved as the intent; this is the ground-truth post-execution.

### Process — What Actually Ran

Plan 1 was authored and executed as `plans/260618-1911-phase-d-plan-1-workflows/`, following the 6-phase structure documented in the plan. Several process patterns emerged that are worth carrying forward to Plans 2, 3, and 4.

**Phase structure (6 phases, 1 branch, ~6-9h):**

| Phase | Concern | TDD | Commit |
|---|---|---|---|
| 1 | File-move precondition | n/a (mechanical) | `5788890` |
| 2 | `createLoopWorkflow` factory | RED → GREEN (5 invariant tests) | `9241ce4` |
| 3 | 8 `createWorkflow` wrappers | TDD per workflow (8 direct unit tests) | `46419a0` |
| 4 | server.js wiring + manifests | n/a (config) | `36a5312` |
| 5 | MCP parity harness | TDD per workflow (9 MCP + 1 tools/list enumeration) | included in 46419a0 + 2603edd |
| 6 | Acceptance gate + closeout | verify-only | `365e444`, `25e2b03` |

**Process patterns that worked (carry forward to Plans 2, 3, 4):**

1. **TDD-per-workflow in Phase 3.** Each of the 8 workflows got its own direct unit parity test (`workflow-direct-parity.test.js`) before its wrapper was written. Blockers surfaced in isolation; no batched "8 didn't work" failure. **Apply to Plan 3's 3 agents** — write 1 direct unit parity test per agent, then implement.
2. **Empirical probe before parity batch.** Phase 5's first MCP test was a deliberate probe of `run_workflow_classify_prompt` to lock the MCP response format (`content[0].text` JSON envelope) before writing 7 more parity tests. The format was unknown at plan time (researcher B's CONCERN #1). **Apply to Plan 3 agent harness** — probe 1 agent's MCP response shape first, then batch the parity tests.
3. **Parity-faithful default for new features.** The Q1 conflict (brainstorm said "real stateSchema for 2 of 8"; researcher A said "all 8 thin") was resolved at plan-author time as **parity-faithful thin `stateSchema = input` for all 8**. Multi-step restructuring deferred to Plan 3 (where the agent consumer lives). This is the YAGNI-correct call: ship the factory that supports `stateSchema`, defer the restructuring to the plan that introduces the consumer. **Apply to Plan 2 LibSQL** — ship the storage backend parity-faithful, defer any "real storage schema" features to the plan that needs them.
4. **Factory as integration seam.** `createLoopWorkflow` mirrors `createLoopTool` 1:1 (parity-shim + `attachParityJSONSchema` + `normalizeSchema`). Plan 3's `createLoopAgent` should mirror both. The pattern is now: factory name = `create-loop-<x>.js`, factory accepts `{ id, description, inputSchema, ...}`, applies the same parity-shim treatment, returns the Mastra primitive.
5. **Per-plan `meta_state_log_change` with the same `change_target`.** Plan 1 filed `meta-260619T1320Z-plans-reports-productization-260612-1530-master-tracker-md` for the D1/D2/D3 flip. Plans 2, 3, 4 should each file their own with the same `change_target` so the audit trail is one entry per plan (not per checkbox).
6. **Count math locked in `tools/list` enumeration test.** The MCP `tools/list` enumeration test (Phase 5) asserts exactly 31 `mastra_*` + 8 `run_workflow_*` = 39 total. This is a regression guard that catches manifest drift. **Apply to Plan 4 cutover** — write the final enumeration test that asserts the post-cutover count.

**Process deltas from the original brainstorm (worth noting for operator review):**

1. **Q1 resolution diverged from the brainstorm's recommendation.** Brainstorm Q1 resolved as "hybrid per per-tool classification" — 2 of 8 (`self_improvement`, `runtime_probe`) get "real `stateSchema`" (multi-step), 6 of 8 get "thin `stateSchema = input`". The actual plan shipped **all 8 with thin `stateSchema = input`** (parity-faithful). The plan's "Q1 Conflict Resolution" section documents the rationale: the current code is single-step; restructuring to multi-step belongs in the plan that introduces the consumer (Plan 3 agents). The brainstorm's "real stateSchema" decision was based on a model of how these workflows *should* work; the plan's "thin stateSchema" is based on what they *do* work today. Both are defensible. **The plan-level resolution supersedes the brainstorm-level resolution.** If the operator wants multi-step restructuring back in scope, file a `meta_state_log_change` and add it to Plan 1a (atomic fix) before Plan 3.
2. **Factory filename.** Brainstorm references `create-workflow.js` (line 123, 268). Actual implementation is `create-loop-workflow.js` (mirrors `create-loop-tool.js` naming). Already corrected in the plan's "Whole-Plan Consistency Sweep" — carried here for record.
3. **Workflow filename convention.** Brainstorm references `intake-orient.js` (bare) in some places, `workflow-intake-orient.js` (prefixed) in others. Actual implementation uses `workflow-*.js` (prefixed) to match the existing `tools/` manifest convention and to make `run_<key>` MCP naming obvious. The plan was right; the brainstorm was inconsistent.
4. **Phase C-D manifest gap (4 tools in `tools/manifest.json` but not in legacy `agent-manifest.json`: `propose_design`, `relationships`, `re_verify`, `supersede`).** Brainstorm does not call this out. Plan 1's Phase 4 + 6 only updated the *mastra* `agent-manifest.json`. The legacy `tools/learning-loop-mcp/agent-manifest.json` is still missing those 4 tools. **Tracked as master-tracker item D-11, slated for Plan 3 (per tracker line 287).** Flagging here for operator awareness.
5. **`agent-manifest.json` workflow group arithmetic.** Brainstorm does not enumerate the post-Phase-4 group size. Actual: 11 entries total (8 `run_workflow_*` + 3 `mastra_workflow_*` stay-as-createTool). Plan 4 owns the final 5-group reconciliation.

### Deferred Items (consolidated)

All items deferred from Plan 1 with target plan and rationale. Each item has either (a) a concrete `evidence_code_ref` or (b) a `meta_state_log_change` id. **Not a re-litigation of Q1** — Q1 is resolved per the plan's "Q1 Conflict Resolution" section. These are the *follow-up* items that surfaced during execution and pre-merge review.

#### Plan 1a candidates (atomic fix, non-blocking)

If operator opens Plan 1a, all four items ship in one branch. Each is <50 LOC and has a test stub or design ready.

| # | Item | File | Effort | Source |
|---|------|------|--------|--------|
| 1.1 | Deep-equal structural parity for remaining 6 workflows (`workflow_intake_orient`, `workflow_intake_plan`, `workflow_prepare_runtime_request`, `workflow_self_improvement`, `workflow_report_phase_status`, `workflow_runtime_probe`) | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` | ~1h (6 `assert.deepStrictEqual` tests using `legacyToResult` helper, which already exists) | review-260619-1429 finding #2, #3 |
| 1.2 | Envelope-input tests for `workflow_self_improvement` and `workflow_intake_plan` to prove `stripEnvelope` preprocess handles the MCP envelope form when an agent caller wraps the input | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` | ~30min (2 tests passing the legacy envelope shape) | review-260619-1429 finding #3 |
| 1.3 | `id` shape validation in `createLoopWorkflow` factory (`/^[a-z][a-z0-9_]*$/`) | `tools/learning-loop-mastra/create-loop-workflow.js` | ~10min (1-line check + error message) | review-260619-1429 finding #10 (minor) |
| 1.4 | Explicit `runId` generation in `LoopMCPServer.convertWorkflowsToTools` (use `crypto.randomUUID()` when `proxiedContext.get("runId")` is undefined) | `tools/learning-loop-mastra/server.js:96` | ~30min (1 import + 1 line + 1 idempotency test) | review-260619-1429 finding #6 (medium) |
| 1.5 | **Schema fingerprint test for Mastra storage substrate.** List all tables + column counts in `mastra-memory.db` and assert against a known-good baseline snapshot. Detects schema drift early when `@mastra/libsql` is bumped past 1.13.0. ~30 LOC, ~1 test in `storage-parity.test.cjs` (or a separate `schema-fingerprint.test.cjs`). | `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (or new file) | ~30min | researcher-A-260619-2246 §"Open Questions" Q5; Plan 2 validate decision 2026-06-19 |

**Total Plan 1a effort:** ~2.5-3.5h. Single branch, single PR. **Recommendation:** file as `loop-design-phase-d-plan-1a-parity-tightening` and ship before Plan 3 (so Plan 3's agents inherit the tighter parity guarantees).

#### Plan 2 (storage, parallel, in flight per brainstorm)

No items deferred from Plan 1 → Plan 2. Plan 2 is independent of Plan 1. Plan 2's own deferred items (post-validate decision 2026-06-19):

- Schema fingerprint test for `@mastra/libsql` schema drift detection — promoted to Plan 1a item 1.5 (above). Plan 2 ships 11 tests in `storage-parity.test.cjs`; the schema fingerprint is a 12th test, deferred to Plan 1a.

#### Plan 3 (agents, blocked on Plans 1+2)

Items deferred from Plan 1 to Plan 3. Plan 3 inherits the workflow parity guarantees from Plan 1a (if 1a ships) or from Plan 1 (if not).

| # | Item | Source | Notes |
|---|------|--------|-------|
| 3.1 | **Multi-step `stateSchema` restructuring for `workflow_self_improvement` and `workflow_runtime_probe`.** The factory `createLoopWorkflow` supports `stateSchema` and `suspend`/`resume` already; the wrappers ship with thin `stateSchema = input` (parity-faithful). When Plan 3's agents consume these workflows, restructure to accumulate cross-step state. The current handlers are single-step; this is a consumer-driven change. | plan §"Q1 Conflict Resolution" | One-line addition at call site per workflow. Factory is ready. |
| 3.2 | **Agent reasoning for `workflow_intentional_skip` and `workflow_report_phase_status`.** These workflows are listed as "Tool+Agent" in the brainstorm Q1 table (line 27). Today they ship as pure-compute workflows. Plan 3 may add agent reasoning on top (e.g., the operator describes the skip, the agent proposes a structured record). | brainstorm line 27 | Not in Plan 1 scope; Plan 3 may revisit. |
| 3.3 | **D-11 (master tracker line 287):** Reconcile 4 tools missing from legacy `agent-manifest.json` (`propose_design`, `relationships`, `re_verify`, `supersede`). Pre-existing inconsistency between legacy `agent-manifest.json` and `tools/manifest.json`; not in Plan 1 scope. | tracker D-11 | One-line addition to legacy `agent-manifest.json` workflow group. |
| 3.4 | **Phase-report workflow utility.** `workflow_report_phase_status` returns `lifecycle_complete: bool`. With workflow execution now going through `createWorkflow`, the "phase" abstraction may no longer map cleanly. Confirm with Plan 3 author whether the workflow stays as-is or gets restructured. | review-260619-1429 unresolved question #4 | Open question — not blocking. |
| 3.5 | **TaskUpdate no-op gap mitigation (Plan 1b follow-up).** Plan 1b deleted the broken `mastra_task_update` wrapper (no `claude task update` subcommand; CLI exposes no programmatic task-update interface). New active finding `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` (status=`active`, `reopens: [meta-260622T1439Z-...]`) tracks the upstream gap. Plan 3 must choose: (a) per-agent workaround (string-match "Updated task #N" on native TaskUpdate stdout, ~30 LOC per agent), (b) accept the gap and document per-agent that the upstream fix is deferred, (c) gate agent task mutations on a `meta_state_derive_status` check that requires explicit operator ack. | `meta-260623T0223Z-...` (active; reopens `meta-260622T1439Z-...`); Plan 1b journal `docs/journals/260622-phase-d-plan-1b-shipped.md`; Plan 1b phase 2 | See "Plan 3 TaskUpdate Mitigation — Upstream Gap" sub-section below for full trade-off. Recommended: (b) for first agent cut; revisit if degenerate loops recur (same shape as session `caa56a15-...` 190-call loop on 2026-06-20). |

#### Plan 4 (cutover, blocked on Plans 1+2+3)

| # | Item | Source | Notes |
|---|------|--------|-------|
| 4.1 | **`agent-manifest.json` final 5-group reconciliation.** Phase 4 updated the mastra `agent-manifest.json` to add the 8 `run_workflow_*` entries alongside the 3 `mastra_workflow_*` entries. The final 5-group structure (gate, workflow, meta_state, introspection, runtime_agnostic) is correct as of Plan 1; Plan 4's reconciliation is mostly the agent group addition. | plan §"Phases" | Low effort. |
| 4.2 | **Cold-session discoverability enumeration of new 8 `run_workflow_*` tools.** The cold-session test currently reads from `.factory/mcp.json` and enumerates 31 tools; the new 8 `run_*` tools are exercised by `workflow-parity.test.cjs` but not by the cold-session test. Agents using the cold-session quickstart will not see `run_workflow_*` suggestions. | review-260619-1429 finding #10 (minor) + unresolved question #5 | Update `cold-session-discoverability.test.cjs` to enumerate 39. |
| 4.3 | **§3.10 reconciliation in `research-260611-2216-mastra-runtime-model-agnostic-productization.md`.** Plan 4 edits §3.10 to reflect the post-Phase-D tool surface (workflow group + agent group). | brainstorm Q5 resolution | Per Q5 protocol: file `meta_state_log_change` first. |
| 4.4 | **AGENTS.md §1 contract note** that Phase D shipped. | brainstorm Touchpoints Plan 4 | One-line addition. |

#### Out of scope (separate phases, not Phase D)

- **Phase E (cutover to Mastra Code Mode 1):** E1-E7. Tracked in master tracker.
- **Phase G (skill migration):** G1-G3. Tracked in master tracker.
- **D-16 (CI test-drift check):** `tools/ci/test-drift-check.js`. Separate track.
- **D-17 (fail-fast on manifest errors):** `server.js` strict mode. Separate track.
- **D-19 (LIM hardening):** 6 LIMs. Separate security/quality audit.

### Cross-Reference: Plan 1 Review Report

Full pre-merge review at `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md`. Verdicts: 0 critical / 6 important (5 addressed in `c3aba39`) / 4 minor (Plan 1a candidates) / praise for reuse-pattern discipline. All test counts verified: 1083 pass / 0 fail / 1 skipped (was 1080; +3 new tests added in `c3aba39`).

---

## Plan 2 Scope Clarification — Storage vs Memory (added 2026-06-19)

**Status:** Decision locked 2026-06-19 in brainstorm session. Pre-Plan-2 author work. The parent report's Plan 2 row (D5+D6) needed a scope disambiguation that the original Q1–Q5 resolutions did not fully spell out. The push-back was: "if Plan 3 ships 3 agents with memory omitted, why ship LibSQL in Plan 2?" — this section answers it.

### The conceptual split (Mastra layer)

Mastra has two distinct concepts that the operator-confused them as one. They are at different layers:

| Concept | Mastra primitive | Purpose | Wired on |
|---|---|---|---|
| **Storage** | `storage: new LibSQLStore({...})` (from `@mastra/libsql`) | Persistence backend for the Mastra app — workflow `stateSchema` runs, `suspend`/`resume` snapshots, thread/message persistence (for OM), traces | `Mastra` instance or `MCPServer` |
| **Memory** | `memory: { observationalMemory, workingMemory, semanticRecall, lastMessages }` on `Agent` | Per-agent conversation context (raw messages, observations, working memory, semantic recall) | Per-agent `Agent` constructor |

Per `.agents/skills/mastra/references/core-concepts.md`: "Memory: Maintain context through message history, working memory, semantic recall, and observational memory. Storage: Persist data with providers such as Postgres, LibSQL, and MongoDB." Memory and storage are listed as separate sub-systems.

**Storage is the substrate. Memory is a per-agent config that *uses* the substrate (when OM is enabled).** A `MCPServer` can have storage without memory (workflows persist, agents are stateless against OM). A `MCPServer` cannot have memory without storage (OM threads/messages need a backend).

Observational Memory itself is a 3-tier long-term memory layer on top of a single agent's conversation stream: an **Observer** sub-agent extracts observations from raw messages (default threshold: 30k unobserved tokens), a **Reflector** sub-agent compresses observations (default threshold: 40k observation tokens), and the user-facing actor agent reads the compressed layer in its context. The Observer/Reflector are framework-managed; the actor agent does not call them directly. See `node_modules/@mastra/core/dist/memory/types.d.ts#ObservationalMemoryOptions` for the full config surface.

### What Plan 2 ships (the substrate)

| Item | In Plan 2 | Source |
|---|---|---|
| `@mastra/libsql` dep in `tools/learning-loop-mastra/package.json` | ✓ | Brainstorm Q2 + Touchpoints Plan 2 |
| `tools/learning-loop-mastra/storage.js` — LibSQL config + wiring | ✓ | Brainstorm Touchpoints Plan 2 |
| File path `./tools/learning-loop-mastra/data/mastra-memory.db` (sibling to `server.js`) | ✓ | Brainstorm Q2 resolution |
| `data/` subdir gitignored | ✓ | Brainstorm Q2 resolution |
| Separate SQLite file from meta-state JSONL | ✓ | Research §3.7 (locked contract 2026-06-12) |
| `__tests__/storage-parity.test.cjs` — LibSQL read/write round-trip + JSONL equivalent | ✓ | Brainstorm Touchpoints Plan 2 |
| `server.js` wires storage backend into `Mastra`/`MCPServer` | ✓ | Brainstorm Touchpoints Plan 2 |

**What Plan 2 storage is used for (the user-facing wins):**

1. **Workflow `stateSchema` persistence.** Plan 1's `createLoopWorkflow` supports `stateSchema` + `suspend`/`resume`, but the 8 wrappers ship with thin `stateSchema = input` (parity-faithful — see parent report "Plan 1 Execution: Process Learnings" §"Process deltas" #1). When Plan 3 restructures `workflow_self_improvement` and `workflow_runtime_probe` to real multi-step `stateSchema`, the runs need a backend to persist cross-step state across MCP calls. Plan 2 ships the backend now; Plan 3 consumes it.
2. **`suspend`/`resume` snapshots.** Long-running workflows that pause for operator input persist their suspended state via the storage backend. Same prerequisite as #1.
3. **Mastra architectural closure.** A `MCPServer` without storage is a degenerate Mastra app. The research report §3.7 (locked contract 2026-06-12) places storage at "Phase 3 of the Mastra migration." The contract is: storage ships in Phase 3. Plan 2 = Phase 3.
4. **One-shot migration under low risk.** Going JSONL → LibSQL for meta-state (or any large registry) is invasive. Plan 2 = "lift the parking brake while the parking lot is empty." Forward-compatible with Bridge 7 (product-surface binding re-debate) where storage isolation may be needed for per-feature parity tests.

### What Plan 2 does NOT ship (deferred to a follow-up)

| Item | Status | Why |
|---|---|---|
| `memory: { observationalMemory: { ... } }` on agents | **OUT** | Plan 3 ships 3 agents with `memory` field omitted or `false`. Agents are memory-less against OM. |
| Per-agent `resourceId` / `threadId` scoping | **OUT** | Not needed while agents are memory-less. Comes with OM config in the follow-up plan. |
| `workingMemory` / `semanticRecall` configs | **OUT** | Same — agents are stateless against memory. |
| Observer / Reflector sub-agents | **OUT** | Only relevant if OM is enabled. |
| Meta-state migration JSONL → LibSQL | **OUT** | Per research §3.7: "Likely separate file, same engine." Meta-state stays JSONL this round; only the agent/workflow storage layer gets LibSQL. |

**The follow-up plan for agent memory is Phase 3.5 or Phase 5** (per research report §8 Q5: "Mastra Code's free Observational Memory is a Phase 5 bonus, not a Phase 3 requirement"). At that time, Plan 2's storage backend is the substrate; the per-agent memory config is the consumer.

### Plan 3 agent memory stance (locked 2026-06-19)

Each of the 3 agents in Plan 3 ships in this shape:

```js
new Agent({
  id: "intakeAgent", // or scoutAgent / selfImprovementAgent
  model: "anthropic/claude-sonnet-4-6",
  instructions: "...",
  tools: { ... meta_state_* + gate_* + ... },
  // memory: omitted — agent does not use Mastra's memory sub-system
  // storage: not configured per-agent (instance-level, set on Mastra instance)
})
```

- **No `memory` field** → agent does not create threads/messages/observations; OM is off.
- **No `resourceId` / `threadId` passed at call time** → no per-call thread creation; no token budget consumed by OM.
- **Per-call context assembly:** agent invokes `mastra_meta_state_list` (or the specific tool needed) at the start of each call to load relevant meta-state. The agent's "memory" of past sessions is the registry's queryable history — operator-acked, schema-validated, drift-checked.
- **Cross-session continuity** is the operator's job: `loop_describe({tier: "warm"})` at session start (per AGENTS.md §3 Operational Rule) loads discoverability hints; the agent reads the registry on demand.

**This aligns with AGENTS.md §1 contract:** "Meta-surface as the only bound surface." Per-agent memory (OM, working memory) is a product-surface concern that is being re-debated from the meta-surface. Shipping agents with `memory: false` keeps the meta-surface authoritative for cross-agent knowledge; per-agent conversation context is ephemeral and per-call.

It also aligns with §6 Internalization Rule: "The loop does not internalize everything it touches." Cross-agent knowledge flows through the registry (cited via `local:meta-state:<id>`), not through shared memory. The agents stay decoupled at the memory layer; they coordinate through the meta-surface.

### Future hooks (when memory gets added)

When the follow-up plan lands (likely Phase 3.5 or Phase 5), the natural progression is:

1. **Add `memory: { observationalMemory: { scope: 'resource', ... } }` to each agent.** Each agent gets its own `resourceId` (the operator) and `threadId` (per-call). Cross-session continuity for the same operator per agent. Per-agent OM config is the consumer; Plan 2's storage is the substrate.
2. **3 separate memories, not 1 shared.** Each agent owns its own memory. Cross-agent knowledge still flows through the registry, not memory. The Internalization Rule holds: OM is per-agent conversation context, not cross-agent coordination.
3. **Per-agent model + threshold tuning.** Intake = cheap, scout = cheap, self-improvement = expensive (per brainstorm Q4: `intake=cheap, scout=cheap, selfImprovement=expensive`). Different `messageTokens` / `observationTokens` / `model` per agent. Default `model: 'google/gemini-2.5-flash'` for Observer/Reflector (per the type definition) is overridable per agent.
4. **Bridge 7 storage migration.** When product-surface binding re-opens, the storage layer is the substrate. Per-feature parity tests can use LibSQL isolation; thread/messages/observations tables are already there.

**This is forward-compatible, not retrofitted.** Plan 2's storage schema includes the thread/messages/observations tables Mastra's OM expects. Plan 3's agents are memory-less but the runtime substrate is ready. Adding `memory: { observationalMemory: true }` later is a config change on each agent, not a migration.

### Why the push-back resolution lands here

The operator's push-back was: "if Plan 3 ships 3 agents with memory omitted, why ship LibSQL in Plan 2?" The resolution: **OM is not the primary driver for Plan 2. The primary drivers are workflow `stateSchema` persistence and Mastra architectural closure.** OM is a side benefit, not the goal. The storage substrate ships in Plan 2 because:

- The research contract (§3.7) places storage at "Phase 3 of the Mastra migration" — Plan 2 is Phase 3.
- Workflows need storage even if agents don't (state persistence, suspend/resume).
- Forward-compatibility: when OM config lands (Phase 3.5 or 5), Plan 2's storage is ready; no migration.
- One-shot migration under low registry size (~500 entries) is cheaper than under pressure at 5000+.

The user-facing value of Plan 2 is workflow persistence + Mastra architectural closure. Agent memory is a follow-up concern that uses the substrate Plan 2 ships, not a Plan 2 deliverable.

### Cross-references

- **Parent report** (this file): Plan 2 row in the Approach A table; Q2 resolution (file path `./tools/learning-loop-mastra/data/mastra-memory.db`); Touchpoints Plan 2; "Plan 1 Execution" §"Process deltas" #1 (Q1 conflict → parity-faithful thin `stateSchema`).
- **Research report** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §2.4 (`MCPServer` shape), §2.2 (Agent + memory), §3.7 (storage parking brake contract), §8 Q5 (OM is Phase 5, not Phase 3)
- **Mastra skill** `.agents/skills/mastra/SKILL.md` and `references/core-concepts.md` (4 memory sub-systems + storage as separate concerns)
- **Mastra SDK** `node_modules/@mastra/core/dist/memory/types.d.ts#ObservationalMemoryOptions` and `SharedMemoryConfig` (full config surface)
- **AGENTS.md** §1 (meta-surface as only bound surface), §3 Operational Rule (loop_describe at session start for cross-session continuity), §6 Internalization Rule (cross-agent knowledge goes through registry, not memory)

---

## Plan 3 TaskUpdate Mitigation — Upstream Gap (added 2026-06-23)

**Status:** Decision deferred to Plan 3 author. Locked 2026-06-23 in follow-up to Plan 1b's Path B ship (`9ee5eb8 fix(meta): apply Plan 1b review findings on top of Plan 1a`).

### Context

Plan 1a shipped a `mastra_task_update` wrapper in `tools/learning-loop-mcp/tools/task-update.js` to mitigate Claude Code's native `TaskUpdate` tool returning `"Updated task #N"` regardless of whether the status actually changed (the degenerate-loop root cause for session `caa56a15-2db7-4a83-9ec3-8ab26a8de2ff` 2026-06-20: 190 `TaskUpdate(taskId:5, status:completed)` calls in 150s). Plan 1a's wrapper shelled out to `claude task update --id X --status Y`.

Plan 1b's code review found the wrapper **broken in production**: `claude --help` exposes no `task` subcommand (verified 2026-06-22 23:38 UTC; only `agents`, `doctor`, `install`, `mcp`, `setup-token`, `update` are present). Plan 1b Phase 2 Path B deleted the wrapper, the test, and the manifest entry. The original finding `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` stays resolved (its closure note is correct: "Plan 1a Phase 9 ships the agreed fix" — the fix shipped, it just turned out to be broken). A new active finding `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` tracks the upstream gap with `reopens: [meta-260622T1439Z-...]` for structural lineage.

**The upstream gap:** no Claude Code programmatic task-update interface returns `{changed: bool}`. No CLI subcommand, no `@anthropic-ai/claude-agent-sdk` method, no MCP tool, no hook event. The native `TaskUpdate` tool is the only entry point; it does not expose a no-op signal. Until upstream changes, any agent that calls `TaskUpdate` in a loop cannot self-detect a no-op.

### Options for Plan 3

| Option | LOC | Risk | When to pick |
|---|---|---|---|
| **(a) Per-agent stdout parser** — wrap each agent's `TaskUpdate` calls, capture stdout, string-match `"Updated task #N"`, return `{changed: true}` only when the prior status is unknown. ~30 LOC per agent. | ~30 per agent (~90 total) | Brittle: string-match on a non-contracted output format. Will silently regress if Claude Code output format changes. | If Plan 3 agents need to mutate task state autonomously and we accept the brittleness. |
| **(b) Accept the gap, document per-agent** — Plan 3 agents do not call `TaskUpdate` autonomously. Task mutations are operator-driven or routed through `meta_state_*` registry. | ~0 | Agents cannot self-advance task state. Multi-step agent flows that depend on task state need operator intervention. | **Recommended** for first agent cut. Aligns with §6 Internalization Rule. |
| **(c) Gate via `meta_state_derive_status` ack** — agents can call `TaskUpdate`, but each call requires the agent to have an operator-acked `meta_state_derive_status` token first. Forces a meta-surface detour for every task mutation. | ~10 per agent | Operator friction. The 190-call loop is structurally impossible because each call requires a separate ack. | If Plan 3 ships agents that must self-advance and we want a hard structural stop on degenerate loops. |

### Recommendation

**Option (b) for first agent cut. Revisit if degenerate loops recur.**

Rationale:
- **YAGNI:** Plan 3 ships 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`). None of them need autonomous `TaskUpdate` mutations. `intakeAgent` is read-only (orient). `scoutAgent` is read-only (filesystem scout). `selfImprovementAgent` mutates meta-state (via `meta_state_*` tools), not native tasks.
- **DRY:** routing task mutations through the meta-state registry is one mechanism, not two. Agents gain task state via `meta_state_query_drift` (already on the registry surface) or by emitting `meta_state_report` entries that operators translate to task state. No need to re-invent a task-mutation layer.
- **KISS:** option (a) is brittle (string-match); option (c) adds operator friction for a 3-agent first cut. Option (b) is the simplest viable default.
- **Forward-compatible:** if Plan 3.5 or Plan 5 needs task mutation, options (a) or (c) can be added per-agent without changing the other two.

### The 190-call loop shape — what to watch for

If the upstream gap re-surfaces as a Plan 3 incident, the symptom will match session `caa56a15-...` exactly: an agent calls `TaskUpdate` in a tight loop, each call returns "Updated task #N", the agent cannot self-detect the no-op, and the loop consumes tokens until context budget or operator interrupt. The cold-tier discoverability hint already covers `pnpm-test-discipline` for similar loops; Plan 3 should add a `taskupdate-noop-undetected` hint that mirrors the same stop conditions. Filing: `meta_state_report({ category: "loop-anti-pattern", subtype: "taskupdate-noop-undetected" })` with `evidence_journal` pointing to the new incident.

### Cross-references

- **Active finding:** `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` (status=`active`, `reopens: [meta-260622T1439Z-...]`, `expires_at: null`).
- **Original finding (resolved, re-surfaced via `reopens`):** `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n`.
- **Plan 1b phase 2:** `plans/260622-2119-phase-d-plan-1b-review-fixups/phase-02-critical-fixes.md` Path B steps 1-6.
- **Plan 1b journal:** `docs/journals/260622-phase-d-plan-1b-shipped.md` Decisions #1, #5 + Forward-looking §"Plan 3 (agents) is unblocked".
- **Original degenerate loop trace:** `plans/reports/debug-260620-1713-caa56a15-stuck-taskupdate-loop-report.md`.
- **Code-reviewer report (Critical C1):** `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`.
- **Parent report (this file):** Deferred items table 3.5 (cross-references this section).
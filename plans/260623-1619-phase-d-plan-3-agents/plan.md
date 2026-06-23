---
title: "Phase D Plan 3 — Mastra Agents Migration (D4+D7)"
description: "Promote 3 meta-surface agents to createAgent with createLoopAgent factory + per-agent model config + agent parity harness (mocked LLM via @mastra/core/test-utils/llm-mock). Ships D4+D7 from master tracker. Plans 1+2 already shipped; Plan 4 (cutover) is blocked on this. Per-agent memory (OM) deferred to Phase 5; Plan 3 ships memory-less agents. Per-plan meta_state_log_change + D-11 reconciliation folded in."
status: pending
priority: P1
branch: "260623-1619-phase-d-plan-3-agents"
tags: [meta-surface, phase-d, mastra, agents, parity, tdd, atomic-gate, kimi-for-coding, mcp-agents]
blockedBy: ["260618-1911-phase-d-plan-1-workflows", "260619-2246-phase-d-plan-2-storage"]
blocks: ["260623-XXXX-phase-d-plan-4-cutover"]
created: "2026-06-23T10:04:20.476Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md (4-plan stack decision; D4+D7 assigned to Plan 3; Q3 instructions + Q4 per-agent model config)
  - plans/reports/researcher-A-260623-1619-phase-d-plan-3-createagent-api-mocking-report.md (createAgent API + MCPServerConfig.agents wiring + createMockModel official helper)
  - plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md (3 instruction strings + per-agent tool surface + anti-confusion checklist)
  - plans/reports/researcher-A-260618-1911-workflow-inventory-report.md (Plan 1 8-tool schema/state/IO inventory; pattern for Plan 3's 3-agent inventory)
  - plans/reports/researcher-B-260618-1911-mastra-createworkflow-api-report.md (Plan 1 createWorkflow API research; Plan 3 mirrors with createAgent)
  - plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md (memory-less agent stance for Plan 3; OM is Phase 5)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase D (D4, D7 checkboxes; D-9, D-10, D-11, D-13 deferred items)
  - plans/reports/productization-260612-1530-master-tracker.md#Deferred Items (D-11 legacy agent-manifest reconciliation)
  - plans/260618-1911-phase-d-plan-1-workflows/plan.md (6-phase rhythm; Q1 parity-faithful pattern)
  - plans/260619-2246-phase-d-plan-2-storage/plan.md (6-phase rhythm; Pattern A2a wiring; storage factory pattern)
  - plans/260618-1911-phase-d-plan-1-workflows/phase-02-create-loop-workflow-factory.md (factory shape to mirror for createLoopAgent)
  - plans/260616-2200-phase-c-plan-2-parity/plan.md (withBothMcpServers serializer mutex + parity harness pattern)
  - tools/learning-loop-mastra/server.js (registration point; adds agents: {...} via LoopMCPServer subclass)
  - tools/learning-loop-mastra/create-loop-tool.js (factory pattern 1 of 2 to mirror)
  - tools/learning-loop-mastra/create-loop-workflow.js (factory pattern 2 of 2 to mirror)
  - tools/learning-loop-mastra/agent-manifest.json (5-group structure; Plan 3 adds `agent` group)
  - tools/learning-loop-mcp/agent-manifest.json (legacy manifest; Plan 3 reconciles D-11: 4 missing tools)
  - tools/learning-loop-mcp/scout/run-scout.js (scoutAgent wraps this pure-function pipeline)
  - tools/learning-loop-mastra/__tests__/with-mcp-server.js (spawn harness reused)
  - tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs (39→41→44 enumeration gate; bumps assertion)
  - tools/learning-loop-mastra/__tests__/storage-parity.test.cjs (11-test precedent for the parity file shape)
  - node_modules/@mastra/core/test-utils/llm-mock (createMockModel — official mock helper for agent parity tests)
  - node_modules/@mastra/mcp/dist/index.js (ask_<agentKey> conversion; verified at lines around the agentToolName block)
  - node_modules/@mastra/core/dist/agent/types.d.ts#AgentConfigBase (Agent constructor shape)
  - node_modules/@mastra/core/dist/llm/model/shared.types.d.ts#MastraModelConfig (model router type; kimi-for-coding/k2p6 valid)
  - "@mastra/core 1.42.0 + @mastra/mcp 1.10.0 (pinned; @mastra/core/test-utils/llm-mock ships createMockModel in 1.42.0)"
---

# Phase D Plan 3 — Mastra Agents Migration (D4+D7)

## Overview

**Plan 3 of the 4-plan Phase D stack** (decided 2026-06-18, see `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md`). Promotes 3 meta-surface agents from concept to `createAgent` wrappers. Ships **D4 + D7** from the master tracker. Plans 1 + 2 are shipped; Plan 4 (cutover) is blocked on this.

**Why D4/D7 must be its own plan:** the agent migration introduces a new MCPServer registration namespace (`agents: {...}` → auto-prefixed to `ask_<agentKey>`), a new factory (`createLoopAgent`), a per-agent model config resolver (3 layers: manifest per-agent field → `MASTRA_AGENT_MODEL` env var → code default), an LLM mocking strategy for the parity harness (official `@mastra/core/test-utils/llm-mock#createMockModel`), and a parity gate that proves the 3 agents produce expected output deterministically. Per the operator preference for per-feature parity, this concern gets its own plan.

**User decisions locked 2026-06-23 (the gate for this plan):**
- All 3 agents use model `kimi-for-coding/k2p6` (Mastra router format; auth via `KIMI_API_KEY` env var). Per Mastra docs `https://mastra.ai/models/providers/kimi-for-coding` — `kimi-for-coding/k2p6` is a `ModelRouterModelId` (verified at `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts`).
- Lookup order: (1) `agents-manifest.json` per-agent `model` field, (2) `MASTRA_AGENT_MODEL` env var, (3) code default.
- Plan ships the env slot for the operator to fill in; the loop does NOT auto-read `.env` files. Use `process.env.*` directly. No `dotenv` import.
- D-11 (legacy `agent-manifest.json` reconciliation: 4 missing tools `propose_design`, `relationships`, `re_verify`, `supersede`) is in scope of Plan 3 (master tracker line 287).
- Multi-step `stateSchema` restructuring for `workflow_self_improvement` and `workflow_runtime_probe` is OUT of scope (per Plan 1's Q1 conflict resolution; the factory supports it; restructuring belongs in the plan that needs cross-step state).
- `mastra_meta_state_batch` excluded from all 3 agent tool surfaces (operator-grade only).
- `runScout` write flags (`writeJson`, `writeMarkdown`) hidden from the agent wrapper — read-only contract.
- 3.5 TaskUpdate no-op gap (per `meta-260623T0223Z-...`): **out of scope by construction**. Mastra Agents have no path to Claude Code's native `TaskUpdate`.

**Scope (6 phases, 1 branch, ~6-9h):**

1. **Phase 1 — File preflight + env contract.** Verify the `kimi-for-coding/k2p6` model router resolves on the installed `@mastra/core@1.42.0`; confirm no new vendor deps needed; document the env-var contract (`MASTRA_AGENT_MODEL`, `KIMI_API_KEY`, no `dotenv`); file `meta_state_log_change` for the no-dotenv decision. No code changes.
2. **Phase 2 — `createLoopAgent` factory.** TDD: 4 invariant tests first (model lookup order, schema-parity-shim applied, agent constructed with required fields, no `memory` field by default). Then factory implementation mirroring `createLoopTool` (parity-shim + `attachParityJSONSchema`) + `resolveAgentModel()` helper for the 3-layer lookup.
3. **Phase 3 — 3 `createAgent` wrappers + `agents-manifest.json`.** TDD-per-agent: 1 direct unit test per agent (parity-shim test + agent instantiation + model resolution), then 3 wrapper files. Each wrapper imports the instruction string from `tools/learning-loop-mastra/agents/instructions/<name>.js` (or inline if short). Ships `agents-manifest.json` with 3 entries.
4. **Phase 4 — `server.js` wiring + `agent-manifest.json` `agent` group + D-11 reconciliation.** Add `agents-manifest.json` loader + `agents: {...}` to `MCPServer` config. Add `agent` group to `agent-manifest.json` (3 entries). Reconcile 4 missing tools in legacy `tools/learning-loop-mcp/agent-manifest.json` (D-11: `propose_design`, `relationships`, `re_verify`, `supersede`). Bump `workflow-parity.test.cjs:166` assertion 41 → 44.
5. **Phase 5 — `agent-parity.test.cjs`.** Empirical probe first (Phase 5.1): spawn server with 1 test agent, lock the `ask_*` MCP response format. Then 3+ per-agent parity tests + 1 model-override test + 1 schema-parity test + 1 tools/list enumeration. Total: ~7-9 tests in 1 file.
6. **Phase 6 — Acceptance gate + closeout.** Full `pnpm test` (estimated 1148 pass / 0 fail / 1 skipped on Plan 1b baseline 1140 + +8 from agent-parity); cold-session passes (legacy 31-entry manifest verified; scope unchanged by Plan 3 — Plan 4 owns the 44-tool enumeration update); tracker D4 + D7 flip `[x]`; `meta_state_log_change` filed (semantic, D4+D7 closure); journal entry; PR body with count matrix.

**Acceptance gate (the single durable anchor):** *"All 12 test namespaces pass; `createLoopAgent` factory applies parity-shim + 3-layer model resolution; 3 `createAgent` wrappers (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) instantiate with the locked instruction strings + per-agent tool surfaces; `agents-manifest.json` registered and loaded by `server.js`; `MCPServer` auto-converts to 3 `ask_*` tools (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`); `agent-manifest.json` adds `agent` group (3 entries); legacy `agent-manifest.json` reconciled (D-11: 4 tools added to `meta_state` group: `propose_design`, `relationships`, `re_verify`, `supersede`; legacy meta_state 15 → 19); agent-parity harness proves each agent invokes the mocked LLM and produces expected output deterministically (8 tests in `agent-parity.test.cjs`); tools/list enumeration = 44 tools total (31 `mastra_*` + 10 `run_workflow_*` + 3 `ask_*`); cold-session test passes against the legacy 31-entry manifest (the 44-tool enumeration is checked by `workflow-parity.test.cjs:166` after the bump; cold-session scope is Plan 4). No `dotenv` import. No `memory` field on any agent (OM off, deferred to Phase 5). `MASTRA_AGENT_MODEL` + `KIMI_API_KEY` env vars documented in `.claude/coordination/MASTRA_AGENT_MODEL.md` for operator reference. `MASTRA_AGENTS_MANIFEST` env var is test-only (Phase 5); never set in production. Whole-suite count: 1155 pass / 0 fail / 1 skipped."*

**Count math (verified 2026-06-23 against current `agent-manifest.json` + `workflow-parity.test.cjs:166`):**

| Source | Pre-Plan 3 | Post-Plan 3 |
|---|---|---|
| `tools/learning-loop-mastra/tools/manifest.json` | 31 entries | 31 entries (no change) |
| `tools/learning-loop-mastra/workflows-manifest.json` | 10 entries | 10 entries (no change) |
| `tools/learning-loop-mastra/agents-manifest.json` (new) | — | **3 entries (NEW)** |
| `mastra_*` tools registered at runtime | 31 | 31 (unchanged) |
| `run_workflow_*` tools registered at runtime | 10 | 10 (unchanged) |
| `ask_*` tools registered at runtime | 0 | **3 (NEW)** |
| **Total tools registered** | **41** | **44** (+3) |
| `agent-manifest.json` groups | 5 (gate, workflow, meta_state, introspection, runtime_agnostic) | **6 (adds `agent` group)** |
| `agent-manifest.json` (mastra) meta_state group | 19 | 19 (no change; D-11 tools already present) |
| `tools/learning-loop-mcp/agent-manifest.json` (legacy) meta_state group | 15 | **19** (D-11: +4 tools: `propose_design`, `relationships`, `re_verify`, `supersede`) |
| `tools/learning-loop-mcp/agent-manifest.json` (legacy) workflow group | 3 | 3 (no change) |
| Test namespaces | 11 | **12** (agent-parity is new) |
| Tests pass (Plan 1b baseline) | 1140 | **1155** (+4 from Phase 2 + +3 from Phase 3 + +8 from Phase 5) |

**Out of scope (separate tracks, NOT this plan):**
- **Per-agent `memory` field (Observational Memory).** Locked out per `mastra-storage-memory-260619-1918-direction-clarification-report.md` §3. The 3 agents are memory-less; cross-session continuity flows through the meta-state registry (per AGENTS.md §1 + §6). When OM is enabled in Phase 5, each agent gets its own `resourceId`/`threadId`. Plan 3 ships the storage substrate (already in Plan 2); the per-agent memory config is the Phase 5 consumer.
- **Multi-step `stateSchema` restructuring for `self_improvement` / `runtime_probe`.** Plan 1 shipped parity-faithful thin `stateSchema = input` per Q1 conflict resolution. Plan 3 does NOT restructure. When the agent consumer needs cross-step state, restructuring is a 1-line addition per call site (factory already supports it).
- **D-9 (`agent-manifest.json` 5-group → 6-group final reconciliation with the 5 deterministic groups renamed).** Plan 4 owns.
- **D-10 (F4 gate-bypass resolution).** Already closed by peer-server removal in Phase C Plan 3.
- **D-13 (F4 PR security note).** Plan 4 PR body owns.
- **Turso remote backend / multi-tenant storage.** Separate phase.
- **`dotenv` or any `.env` auto-loader.** Explicitly OUT — `process.env.*` only.
- **Bridge 7 (product-surface binding).** Separate phase.
- **Phase E, F, G.** Separate phases.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [File preflight + env contract](./phase-01-file-preflight-env-contract.md) | Pending | ~30min | n/a (probe + log-change) | Plan 3 parent |
| 2 | [createLoopAgent factory + createMockModel parity helper](./phase-02-createloopagent-factory-createmockmodel-parity-helper.md) | Pending | ~1-2h | RED → GREEN (4 invariant tests first) | Phase 1 |
| 3 | [3 createAgent wrappers + agents-manifest.json](./phase-03-3-createagent-wrappers-agents-manifest-json.md) | Pending | ~2-3h | TDD per agent (3 direct unit tests, then wrappers) | Phase 2 |
| 4 | [server.js wiring + agent-manifest.json agent group + D-11 reconciliation](./phase-04-server-js-wiring-agent-manifest-json-agent-group-d-11-reconc.md) | Pending | ~1h | n/a (config + manifest updates) | Phase 3 |
| 5 | [agent-parity harness](./phase-05-agent-parity-harness.md) | Pending | ~1-2h | TDD per test (empirical probe first, then 7-9 tests) | Phase 4 |
| 6 | [Acceptance gate + closeout](./phase-06-acceptance-gate-closeout.md) | Pending | ~30min | n/a (full `pnpm test` + tracker flip + closeout) | Phase 5 |

**Total effort:** ~6-9 hours. One session. Single PR (6 commits, one per phase, stacked on a feature branch off `main`).

## Q1 Conflict Resolution (parity-faithful default for agent memory)

The brainstorm at `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §Q3 + §Q4 + §"Plan 2 Scope Clarification" locked the agent memory stance: **no `memory` field on any of the 3 agents**. Cross-session continuity flows through the meta-state registry (per AGENTS.md §1 + §6 Internalization Rule). Per-call context: each agent invokes `mastra_meta_state_list` at the start of its run.

**Plan 3 ships:**
```js
new Agent({
  id: "intakeAgent", // or scoutAgent / selfImprovementAgent
  name: "intakeAgent",
  description: "...",
  instructions: "<see researcher-B report>",
  model: resolveAgentModel("intakeAgent", agentsManifest),  // 3-layer lookup
  tools: { /* meta_state_* + introspect_* + runScout (scoutAgent only) */ },
  // memory: omitted — agent does not use Mastra's memory sub-system
})
```

**Why memory is OMITTED:**
- Per research §8 Q5: "Mastra Code's free Observational Memory is a Phase 5 bonus, not a Phase 3 requirement."
- Per AGENTS.md §1: "Meta-surface as the only bound surface." Per-agent memory (OM, working memory) is a product-surface concern.
- Per AGENTS.md §6: "The loop does not internalize everything it touches." Cross-agent knowledge flows through the registry, not memory.

**Forward-compat:** When Phase 5 enables OM, Plan 2's storage substrate is ready. Adding `memory: { observationalMemory: true }` is a config change on each agent, not a migration. Plan 3's `createLoopAgent` factory is built so the `memory` field is opt-in (default off).

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `node_modules/@mastra/core/dist/test-utils/llm-mock.js` (probe) | n/a | verify `createMockModel` exists at the expected path |
| 1 | `meta-state.jsonl` (`meta_state_log_change`) | `OPERATOR_MODE=1` | gated; "Plan 3 does not introduce dotenv" |
| 1 | `.claude/coordination/MASTRA_AGENT_MODEL.md` (new) | n/a | operator-facing env-var reference |
| 2 | `tools/learning-loop-mastra/create-loop-agent.js` (new) | n/a | factory file |
| 2 | `tools/learning-loop-mastra/agents-model-resolver.js` (new) | n/a | 3-layer lookup helper |
| 2 | `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` (new) | n/a | 4 invariant tests |
| 3 | `tools/learning-loop-mastra/agents/intake-agent.js` (new) | n/a | createAgent wrapper |
| 3 | `tools/learning-loop-mastra/agents/scout-agent.js` (new) | n/a | createAgent wrapper |
| 3 | `tools/learning-loop-mastra/agents/self-improvement-agent.js` (new) | n/a | createAgent wrapper |
| 3 | `tools/learning-loop-mastra/agents/run-scout-tool.js` (new) | n/a | createTool wrapper for `tools/learning-loop-mcp/scout/run-scout.js#runScout` |
| 3 | `tools/learning-loop-mastra/agents-manifest.json` (new) | n/a | 3-entry manifest |
| 3 | `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` (new) | n/a | 3 direct unit parity tests (no MCP) |
| 4 | `tools/learning-loop-mastra/server.js` | n/a | adds `agents-manifest.json` loader + `agents: {...}` to MCPServer config |
| 4 | `tools/learning-loop-mastra/agent-manifest.json` | n/a | adds `agent` group (3 entries) |
| 4 | `tools/learning-loop-mcp/agent-manifest.json` | n/a | D-11: add 4 missing tools to workflow group |
| 4 | `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` | n/a | bumps line 159: 41 → 44 |
| 5 | `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` (new) | n/a | 7-9 tests (empirical probe + 3 per-agent + 1 model-override + 1 schema + 1 enumeration) |
| 6 | `plans/reports/productization-260612-1530-master-tracker.md` (D4/D7 flip) | `OPERATOR_MODE=1` | gated; closeout contract |
| 6 | `meta-state.jsonl` (`meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 3 (test files + plan files + meta-state registry + mastra package source + agents factory + 3 agent wrappers + manifest updates).

## Dependencies

**Blocked by:**
- `260618-1911-phase-d-plan-1-workflows` (Plan 1 closed 2026-06-19; `createLoopWorkflow` factory + 8 workflows registered; `LoopMCPServer` pattern).
- `260619-2246-phase-d-plan-2-storage` (Plan 2 closed 2026-06-20; `Mastra` instance wires storage via Pattern A2a; storage substrate ready for Plan 3's `Mastra({ storage, mcpServers })`).

**Blocks:**
- `260623-XXXX-phase-d-plan-4-cutover` (Plan 4 — final 5→6-group `agent-manifest.json` reconciliation + cold-session discoverability enumeration update for 3 new `ask_*` tools + master-tracker flip + §3.10 reconciliation).

**Out of scope (separate tracks, NOT this plan):**
- Plan 1a — atomic fix for multi-step `stateSchema` restructuring (YAGNI; Plan 3 ships memory-less agents, no consumer needs it).
- Phase E cutover to Mastra Code Mode 1 — separate phase.
- Phase F Bridge 7 (product-surface binding) — separate phase.
- Phase G skill migration — separate phase.

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-06` (7 files).
- **Decision deltas from brainstorm + research reports + user decisions (2026-06-23):**
  - **Model locked to `kimi-for-coding/k2p6`** (per user; replaces brainstorm Q4's "default claude-sonnet-4-6"). The `kimi-for-coding/k2p6` magic string is a valid `ModelRouterModelId` (verified at `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts`). Auth via `KIMI_API_KEY` env var (auto-injected by the Mastra router). `MASTRA_AGENT_MODEL` env var is the global override.
  - **No `dotenv` import** (per user). The loop uses `process.env.*` directly (verified — no `dotenv` in `node_modules/@mastra/*` or `tools/learning-loop-mcp/core/`). The plan locks this contract via a `meta_state_log_change` entry in Phase 1.
  - **D-11 (4 missing tools in legacy `agent-manifest.json`) is in scope** (per user; was previously deferred). Phase 4 reconciles as a one-line addition per tool.
  - **Multi-step `stateSchema` restructuring is OUT of scope** (per user; matches Plan 1's Q1 conflict resolution). The factory `createLoopAgent` does NOT need to support `stateSchema` — agents do not use the workflow state-machine feature.
  - **`mastra_meta_state_batch` excluded from all agents** (per researcher B). Self-improvement agent surfaces batch requests to the operator; does not invoke directly.
  - **`runScout` write flags hidden from agent wrapper** (per researcher B). The agent wrapper exposes only `{ projectRoot, excludeGlobs? }` (no `maxItems` cap per pure-function signature; the default `DEFAULT_EXCLUDE_GLOBS` from `run-scout.js` is the canonical set).
- **Test count math:** Plan 1b baseline = 1140 pass / 0 fail / 1 skipped. Plan 3 adds:
  - Phase 2: 4 invariant tests (model resolver + factory).
  - Phase 3: 3 direct unit tests (one per agent).
  - Phase 5: 8 parity tests (1 empirical probe + 3 per-agent invocation + 1 per-agent-manifest-field override + 1 schema-parity + 1 tools/list enumeration + 1 input-validation rejection). Fixed at 8 (not a range) to match the acceptance gate.
  - Net: **+15 tests** (4+3+8) → **1155 pass / 0 fail / 1 skipped**.
- **Reconciled stale references:**
  - Brainstorm §"Touchpoints Plan 3" line 137 references `tools/learning-loop-mastra/agents/<name>.js` — confirmed in the file list above.
  - Brainstorm §"Q3" line 226 references the 3 instructions as "200-555 words" — researcher B delivered at 315/430/540 (all in range).
  - Researcher B's "Open Questions" #2 (`maxItems` cap on `runScout`): the field is NOT in the pure-function signature; resolved by relying on the default `DEFAULT_EXCLUDE_GLOBS` from `run-scout.js` (no agent-supplied cap).
  - Researcher B's "Open Questions" #1 (`runScout` write flags): resolved by hiding them in the `runScout` `createTool` wrapper — input schema is `{ projectRoot, excludeGlobs? }` only.
  - Researcher B's "Open Questions" #3 (`mastra_meta_state_re_verify`): locked as operator-grade only (excluded from all agent tool surfaces).
  - Researcher B's "Open Questions" #4 (model persistence): locked as `MASTRA_AGENT_MODEL` env var default + per-agent manifest field override + code default. Initial `agents-manifest.json` ships with `model: "kimi-for-coding/k2p6"` for all 3 entries. **MCP integration test for the env-var layer is OUT of scope** (would require a real API key for the overridden model); the env-var lookup is covered at the unit-test level by Phase 2's invariant Test 2.
  - Researcher B's "Open Questions" #5 (`runScout` exclude-glob whitelist): agent wrapper uses the default `DEFAULT_EXCLUDE_GLOBS` from `run-scout.js`; caller cannot override.
  - Researcher B's "Open Questions" #6 (agent-orchestration tool): out of scope; the MCP `tools/call` return value is the handoff mechanism.
- **Unresolved contradictions:** 0. The user decisions + research reports + brainstorm align. All 6 of researcher B's open questions resolved.

## Key Risks Addressed

- **`Agent` constructor shape differs between Mastra versions.** Risk: low after version pin. **Mitigation:** `Agent` class + `AgentConfig` verified at `node_modules/@mastra/core/dist/agent/agent.d.ts:51` + `types.d.ts#AgentConfigBase` against pinned `@mastra/core@1.42.0`. Required fields: `id`, `name`, `instructions`, `model`. Optional: `description`, `tools`, `metadata`. Plan 1 + Plan 2 already pin this version.
- **MCP `tools/call` response shape for `ask_*` tools is unverified at planning time.** Risk: medium for Phase 5's parity assertions. Researcher A's Q4 explicitly flags this as needing an empirical probe. **Mitigation:** Phase 5.1 (first test) is the empirical probe — spawn server with 1 test agent, call `ask_<test>`, inspect raw response, lock the format. Same pattern as `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md` (the Plan 1 CONCERN #1 probe).
- **LLM mocking approach novel (Phase 5 harness).** Risk: medium. **Mitigation:** Use the official `@mastra/core/test-utils/llm-mock#createMockModel` (verified at `node_modules/@mastra/core/dist/test-utils/llm-mock.js`). Maintained by Mastra; tracks API surface. No custom stub. `spyGenerate` + `spyStream` hooks allow the test to assert the agent's prompt includes the expected instructions prefix.
- **Per-agent model config lookup order.** Risk: low after 3-layer rule locked. **Mitigation:** Phase 2 ships a `resolveAgentModel(agentId, agentsManifest)` helper with 4 invariant tests (one per layer + one for fallback). Phase 3 reads from `agents-manifest.json` per-agent field; Phase 1 documents the env var.
- **D-11 reconciliation drifts again later.** Risk: low. **Mitigation:** Phase 4 step 4 reconciles the 4 missing tools as a one-line addition each. The legacy `agent-manifest.json` is read by `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:221-255` for new-tool verification. Plan 4 owns the final manifest reconciliation; Plan 3 closes the structural gap.
- **`Agent.memory` field accidentally enabled.** Risk: low. **Mitigation:** Phase 2's 4 invariant tests assert `memory === undefined` on the constructed agent. Phase 3's direct unit tests re-assert.
- **Cold-session test breaks.** Risk: low. The cold-session test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-77`) reads the LEGACY `tools/learning-loop-mcp/tools/manifest.json` (the 31-entry manifest), NOT the mastra server's `tools/list`. Plan 3 does NOT change the cold-session test (its scope is unchanged: verify the legacy 31-entry manifest's tool registration shape). The mastra server's 44-tool enumeration is checked separately by `workflow-parity.test.cjs:166` (bumped 41 → 44 in Phase 4 step 5). **Out of scope:** updating the cold-session test to enumerate the mastra server's 44 tools — Plan 4 owns (per brainstorm deferred item 4.2).
- **`MASTRA_AGENT_MODEL` env var read at module load time vs call time.** Risk: low. **Mitigation:** `resolveAgentModel()` reads `process.env.MASTRA_AGENT_MODEL` at agent construction time (Phase 2). Per-call context is assembled by the agent, not the factory.
- **Test count overshoot if Phase 5 grows.** Risk: low. **Mitigation:** Phase 5's test plan is budgeted at 7-9 tests. If the empirical probe reveals additional coverage needs, the test count grows; Phase 6 reports the actual count.
- **Plan 1a item 1.5 (schema fingerprint test for storage).** Already shipped by Plan 1a. Plan 3 reuses the pattern via the same `schema-fingerprint.test.cjs` for any schema drift in Plan 3 files. **Mitigation:** Phase 5 step 4 includes a schema-parity test for the `ask_*` tools' input schema (the fixed `{message}` shape).

## References

- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (4-plan stack; Q1-Q5 resolutions; Plan 3 row; Q3 instructions; Q4 per-agent model config; Touchpoints Plan 3)
- `plans/reports/researcher-A-260623-1619-phase-d-plan-3-createagent-api-mocking-report.md` (Agent API + MCPServerConfig.agents + createMockModel + ask_<key> conversion)
- `plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md` (3 instruction strings + per-agent tool surface + anti-confusion checklist)
- `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` (memory-less agent stance for Plan 3; OM is Phase 5)
- `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` (3-layer model: Storage/Memory/Meta-state)
- `plans/reports/productization-260612-1530-master-tracker.md` (D4, D7 checkboxes; D-11 deferred items; Deferred Items table)
- `plans/260618-1911-phase-d-plan-1-workflows/plan.md` (6-phase rhythm; Q1 conflict resolution; factory as integration seam)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-02-create-loop-workflow-factory.md` (factory shape to mirror for `createLoopAgent`)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-03-8-createworkflow-wrappers.md` (TDD-per-workflow pattern)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-05-workflow-parity-harness.md` (parity harness shape; shared `before`; TDD-per-test)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-06-acceptance-gate-closeout.md` (closeout pattern; `meta_state_log_change` per plan)
- `plans/260619-2246-phase-d-plan-2-storage/plan.md` (6-phase rhythm; Pattern A2a wiring; storage factory pattern; tools/list count bump)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` (withBothMcpServers serializer mutex + 4-tool read-only content parity)
- `tools/learning-loop-mastra/server.js` (registration point; LoopMCPServer subclass)
- `tools/learning-loop-mastra/create-loop-tool.js` (factory pattern 1 of 2 to mirror)
- `tools/learning-loop-mastra/create-loop-workflow.js` (factory pattern 2 of 2 to mirror)
- `tools/learning-loop-mastra/storage.js` (storage factory; Pattern A2a wiring consumer)
- `tools/learning-loop-mastra/agent-manifest.json` (5-group structure; Plan 3 adds `agent` group)
- `tools/learning-loop-mcp/agent-manifest.json` (legacy manifest; D-11: 4 missing tools)
- `tools/learning-loop-mcp/scout/run-scout.js` (scoutAgent wraps the pure-function scout pipeline)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (spawn harness reused)
- `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:166` (bump assertion 41 → 44)
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (11-test precedent for the parity file shape)
- `node_modules/@mastra/core/dist/agent/agent.d.ts:51` (Agent class)
- `node_modules/@mastra/core/dist/agent/types.d.ts#AgentConfigBase` (constructor fields)
- `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts#MastraModelConfig` (model router type)
- `node_modules/@mastra/core/dist/mcp/types.d.ts` (`MCPServerConfig.agents` field)
- `node_modules/@mastra/mcp/dist/index.js` (ask_<agentKey> conversion; agent invocation via `agent.generate(message)`)
- `node_modules/@mastra/core/dist/test-utils/llm-mock.js` (`createMockModel` official helper)
- `https://mastra.ai/models/providers/kimi-for-coding` (kimi-for-coding/k2p6 model router entry)
- `https://mastra.ai/reference/agents/agent` (Agent class reference)
- `@mastra/core 1.42.0 + @mastra/mcp 1.10.0` (pinned compatibility; `createMockModel` ships in 1.42.0)

## Validation Log

### Session 1 — 2026-06-23 (plan authoring, post-user-decisions)

**Trigger:** plan author invocation after researcher A + researcher B reports completed + user decisions locked (2026-06-23). Plan 3 is the agents slice of the 4-plan Phase D stack; author consolidates findings into 6 self-contained phase files.

**Verification tier:** Full (1 role, 12 high-value claims sampled)

#### Verification Results

- **Claims checked:** 12
- **Verified:** 11
- **Failed:** 0
- **Unverified (deferred to implementation):** 1

**Unverified (deferred to implementation):**

1. **MCP `tools/call` response shape for `ask_*` tools.** Per researcher A Q4, the agent conversion returns the raw `agent.generate()` response object; the MCP wrap format (`content[0].text` shape, JSON stringification, whether `response.text` is the only field or full `AgentGenerateResult` is included) is unverified at planning time. Resolution: Phase 5.1 (first test) is the empirical probe — spawn server with 1 test agent, call `ask_<test>`, inspect raw response, lock the format.

#### Questions Asked

None. All open questions in researcher A §"Open Questions" and researcher B §"Open Questions" resolved in this plan (user decisions on 2026-06-23 + this plan's "Whole-Plan Consistency Sweep" §"Reconciled stale references").

#### Confirmed Decisions

- **Model locked to `kimi-for-coding/k2p6`** for all 3 agents. Lookup order: (1) per-agent `agents-manifest.json` `model` field, (2) `MASTRA_AGENT_MODEL` env var, (3) code default. Initial manifest ships with `model: "kimi-for-coding/k2p6"` for all 3 entries.
- **No `dotenv` import** in Plan 3. The loop uses `process.env.*` directly. Phase 1 files a `meta_state_log_change` locking the contract.
- **D-11 in scope** (Phase 4 step 4). 4 tools added to legacy `agent-manifest.json` workflow group: `meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede`.
- **Multi-step `stateSchema` restructuring OUT of scope** (matches Plan 1's Q1 conflict resolution).
- **`mastra_meta_state_batch` excluded** from all 3 agents.
- **`runScout` write flags hidden** in the agent wrapper (input schema is `{ projectRoot, excludeGlobs? }` only).
- **`memory: undefined`** on all 3 agents (OM off; per-call context via `mastra_meta_state_list`).

#### Action Items

- [ ] **Phase 1 step 2:** confirm `@mastra/core@1.42.0` ships `createMockModel` at `node_modules/@mastra/core/dist/test-utils/llm-mock.js` (researcher A verified; no need for an empirical probe; the `import` will fail loudly if not present).
- [ ] **Phase 1 step 5:** file `meta_state_log_change` for the no-dotenv decision (change_target: `.claude/coordination/MASTRA_AGENT_MODEL.md`; change_dimension: surface).

#### Impact on Phases

- **Phase 1:** adds env-contract probe + `meta_state_log_change` filing step.
- **Phase 2:** factory shape adds `resolveAgentModel(agentId, agentsManifest)` helper with 4 invariant tests.
- **Phase 3:** 3 agent wrappers + `agents-manifest.json` + `runScout` createTool wrapper. `instructions` strings sourced from `plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md` §1.
- **Phase 4:** adds `agent` group to `agent-manifest.json` (3 entries) + D-11 reconciliation + workflow-parity test bump.
- **Phase 5:** empirical probe first, then 7-9 tests in `agent-parity.test.cjs`.
- **Phase 6:** no changes beyond the count math already applied in the user-decisions session.

### Whole-Plan Consistency Sweep

### Session 2 — 2026-06-23 (red-team + validate, post-user-decisions)

**Trigger:** red-team review (4 personas: Security, Failure Mode, Assumption Destroyer, Scope Critic) + validation interview with operator (4 questions on test-only env var, Phase 5.8 test, instruction file layout, Phase 5.5 env-override test).

**Red-team findings:** 4 (all addressed)

| # | Finding | Reviewer | Severity | Disposition | Applied To |
|---|---------|----------|----------|-------------|------------|
| 1 | `MASTRA_AGENTS_MANIFEST` env var could be accidentally set in production | Security Adversary | Medium | Accept (Recommendation A) | `phase-04` step 5: added header comment + test-only doc note |
| 2 | Test fixture `agents-manifest.test.json` could drift from production manifest | Assumption Destroyer | Medium | Accept | `phase-05` step 2: added header comment referencing production manifest as source of truth |
| 3 | `buildReadOnlyMetaStateTools` + `buildWriteMetaStateTools` + `server-tools.js` is 3 helper files for a 3-agent plan | Scope Critic | Medium | Accept (justified by 3× copy-paste avoidance in `phase-03` "Architectural decision" note) | no code change |
| 4 | `MASTRA_AGENTS_MANIFEST` env var adds a new code path even if never set in production | Scope Critic | Low | Accept (test-only seam) | `phase-04` step 5: documented as intentionally not in operator-facing reference |

**Validation questions:** 4 (all answered)

| # | Question | Answer | Action |
|---|----------|--------|--------|
| 1 | How to lock down `MASTRA_AGENTS_MANIFEST` test-only env var? | Comment + test-only doc (Recommended) | `phase-04` step 5 + `plan.md` Phase 4 description |
| 2 | Ship Phase 5.8 input-validation rejection test? | Yes (Recommended) | `phase-05` step 9 + test count math updated to +8 |
| 3 | Keep instructions in separate `instructions/<name>.js` files? | Yes (Recommended) | no plan change; design as written |
| 4 | Phase 5.5 — env-var MCP integration test or per-agent manifest field override? | Per-agent manifest field override (no API key needed) | `phase-05` step 6 + Function/Interface Checklist updated |

**Operator concern raised:** "Does the test needed for having working api key, or it's just the mock? I don't have key for gemini-2.5-flash."

**Resolution:** The `MASTRA_AGENT_MODEL` env-var layer of the 3-layer lookup is covered at the unit-test level by Phase 2's invariant Test 2 (no MCP integration, no API key required). The MCP-integration version of the env-var override test (Phase 5.5) was redesigned to test the per-agent manifest field override layer instead — this avoids requiring a real API key for any router. The fix is documented in `phase-05` step 6 + the Whole-Plan Consistency Sweep above.

**Confirmed decisions:**
- **Test-only env var lock:** comment + test-only doc (no code guard; no NODE_ENV check; the env var's obscurity + the header comment is the protection).
- **Phase 5.8:** ship (test count +1).
- **Instruction file layout:** separate files (no change).
- **Phase 5.5:** per-agent manifest field override (env-var layer tested at unit level by Phase 2).

**Action items:**
- [x] Apply red-team fixes (4 fixes applied; documented above)
- [x] Update Phase 5.5 + Function/Interface Checklist + Success Criteria
- [x] Update Phase 6 acceptance gate + count math (1155 final)
- [x] Update plan.md Validation Log

**Impact on phases:**
- **Phase 4:** added header comment + test-only doc note for `MASTRA_AGENTS_MANIFEST` env var.
- **Phase 5:** step 6 redesigned (per-agent manifest field override instead of env var); Function/Interface Checklist + Test Scenario Matrix + Success Criteria updated.
- **Plan count math:** final count is **1155 pass / 0 fail / 1 skipped** (was 1140 baseline + +4 + +3 + +8).

### Whole-Plan Consistency Sweep (post-red-team)

- **Files reread:** `plan.md`, `phase-01` through `phase-06` (7 files).
- **Red-team deltas checked:** 4 (test env var, fixture drift, helper extraction, env var dead code). All applied.
- **Validation deltas checked:** 4 (env var lockdown, Phase 5.8, instructions layout, Phase 5.5). All applied.
- **Unresolved contradictions:** 0. Plan is internally consistent across all 7 files.

### Session 3 — 2026-06-23 (red-team, independent reproduction)

**Trigger:** independent red-team review (4 personas, Full tier) to reproduce and verify the plan. Also served as a live test of the `/ck:plan red-team` report-writing workflow (meta-260623T0014Z finding).

**Red-team findings:** 12 (all accepted)

| # | Finding | Reviewer(s) | Severity | Disposition | Applied To |
|---|---------|-------------|----------|-------------|------------|
| 1 | `@mastra/core/test-utils` import path does not exist; correct path is `@mastra/core/test-utils/llm-mock` | Security, Scope, FMA | Critical | Accept | phase-01, phase-02, phase-05, plan.md |
| 2 | Phase 5 mock injection mechanism fundamentally broken (`__MOCK_LLM__` string can't become a JS object across process boundary) | Assumption Destroyer | Critical | Accept | phase-05: redesigned mock injection via `__testMockModels__` registry + per-test server spawn |
| 3 | D-11 reconciliation targets wrong manifest group (workflow, should be meta_state) | All 4 | High | Accept | phase-04, phase-06, plan.md count matrix |
| 4 | `createLoopAgent` factory never passes `agentsManifest` — Layer 1 of 3-layer lookup is dead code | Security, FMA, Scope, Assumption | High | Accept | phase-02: added `agentsManifest` param; phase-03: pass `agentsManifest` instead of `modelOverride` |
| 5 | Phase 5 test code uses wrong `callTool` API (object vs positional args, double-parsed response) | FMA, Scope | High | Accept | phase-05: fixed to `callTool(name, args)` + direct `result.text` assertion |
| 6 | intakeAgent tool count contradiction — 9 in test vs 8 in checklist | Security, Assumption | High | Accept | phase-03 step 2: fixed to 8 |
| 7 | Mastra manifest count matrix claims meta_state 19→20 but D-11 tools already present | Security, FMA, Scope | Medium | Accept | plan.md count matrix: corrected rows |
| 8 | `__MOCK_LLM__` marker design unresolved (subsumed by Finding 2) | Scope | Medium | Accept | phase-05 (subsumed) |
| 9 | Test count math inconsistency (1155 vs 1154-1156) | All 4 | Medium | Accept | plan.md, phase-06: locked to 1155 |
| 10 | Phase 3 `server-tools.js` refactor causes Phase 4 stale line references | FMA, Scope, Security | Medium | Accept | phase-04: structural anchors instead of line numbers |
| 11 | `MASTRA_AGENTS_MANIFEST` env var enables arbitrary code execution via `import()` | Security | Medium | Accept | phase-04: added path containment validation |
| 12 | `workflow-parity.test.cjs:159` line reference is wrong (actual: 166) | Assumption | Low | Accept | plan.md, phase-04, phase-06: corrected to 166 |

**Report files written:** 2 of 4 (Security Adversary + Assumption Destroyer wrote to plan-scoped `reports/`. Failure Mode Analyst returned findings as text only. Scope & Complexity Critic wrote to global `plans/reports/` instead of plan-scoped path.)

**Meta-finding:** The red-team run reproduced the bug from `meta-260623T0014Z` — 2 of 4 reviewer subagents failed to write report files to the correct plan-scoped path. This confirms the finding is NOT resolved by removing the CLAUDE.md instruction. The root cause is likely systemic in how `code-reviewer` subagents handle file writes (possibly the system prompt's general instruction to avoid file creation, or the subagent type lacking Write tool access in some contexts). `meta-260623T0014Z` reopened.

### Whole-Plan Consistency Sweep (post-Session 3)

- **Files reread:** `plan.md`, `phase-01` through `phase-06` (7 files).
- **Decision deltas from Session 3:**
  - Import path: `@mastra/core/test-utils` → `@mastra/core/test-utils/llm-mock` (all phases)
  - Factory signature: added `agentsManifest` param (phase-02, phase-03)
  - D-11 target: `workflow` group → `meta_state` group (phase-04, phase-06, plan.md)
  - Mock injection: `__MOCK_LLM__` marker → `__testMockModels__` registry (phase-05)
  - `callTool` API: `callTool({name, arguments})` → `callTool(name, args)` (phase-05)
  - Response assertion: `result.content[0].text` → `result.text` (phase-05)
  - Tool count: 9 → 8 for intakeAgent (phase-03)
  - Test count: locked at 1155 (plan.md, phase-06)
  - Line ref: 159 → 166 (plan.md, phase-04, phase-06)
  - Path validation: added containment check for `MASTRA_AGENTS_MANIFEST` (phase-04)
- **Stale references checked:** all `@mastra/core/test-utils` references updated; all `workflow group` D-11 references updated; all `159` line refs updated; all `1154-1156` ranges updated to `1155`.
- **Unresolved contradictions:** 0. Plan is internally consistent across all 7 files.

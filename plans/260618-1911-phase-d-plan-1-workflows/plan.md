---
title: "Phase D Plan 1 — Mastra Workflows Migration (D1+D2+D3)"
description: "Promote 8 deterministic workflow_* tools to createWorkflow with createLoopWorkflow factory + per-workflow parity harness. Ships D1+D2+D3 from master tracker. Plans 1+2 ship in parallel; Plan 3 (agents) and Plan 4 (cutover) are blocked on this. Parity-faithful migration: thin stateSchema for all 8; multi-step stateSchema deferred to Plan 1a/Plan 3 per brainstorm Q1 conflict resolution."
status: completed
priority: P1
branch: "260618-1911-phase-d-plan-1-workflows"
tags: [meta-surface, phase-d, mastra, workflows, parity, tdd, atomic-gate]
blockedBy: ["260617-1950-phase-c-plan-3-cut-over"]
blocks: ["phase-d-plan-3-agents", "phase-d-plan-4-cutover"]
created: "2026-06-18T19:11:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md (4-plan stack decision; D1+D2+D3 assigned to Plan 1; Plan 1 + Plan 2 parallel)
  - plans/reports/researcher-A-260618-1911-workflow-inventory-report.md (8-tool schema/state/IO inventory)
  - plans/reports/researcher-B-260618-1911-mastra-createworkflow-api-report.md (createWorkflow API + createLoopWorkflow factory spec)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase D (D1, D2, D3 checkboxes)
  - plans/260616-2200-phase-c-plan-2-parity/plan.md (withBothMcpServers serializer mutex + parity harness pattern)
  - plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md (peer server + createLoopTool factory Plan 1 mirrors)
  - plans/260617-1950-phase-c-plan-3-cut-over/plan.md (C6+C7 closed 2026-06-17; legacy server deleted; mastra canonical)
  - tools/learning-loop-mcp/tools/workflow-*.js (8 source files to move)
  - tools/learning-loop-mastra/create-loop-tool.js (factory pattern to mirror)
  - tools/learning-loop-mastra/server.js (registration point; adds workflows: {...})
  - tools/learning-loop-mastra/tools/manifest.json (29-entry deterministic manifest; 8 workflow entries removed in Phase 4)
  - tools/learning-loop-mastra/agent-manifest.json (5-group structure; workflow group paths update in Phase 4)
  - @mastra/core 1.42.0 + @mastra/mcp 1.10.0 (pinned in package.json; workflow API verified 2026-06-18)
  - zod 4.4.3 (exact pin; parity-shim infra reused)
---

# Phase D Plan 1 — Mastra Workflows Migration (D1+D2+D3)

## Overview

**Plan 1 of the 4-plan Phase D stack** (decided 2026-06-18, see `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md`). Promotes 8 deterministic `workflow_*` tools from `createTool` wrappers to `createWorkflow` wrappers. Ships **D1+D2+D3** from the master tracker. Plans 1 + 2 ship in parallel (different files, different reviewers); Plan 3 (agents) and Plan 4 (cutover) are blocked on this.

**Why C4/D1-D3 must be its own plan:** the workflow migration introduces a new MCPServer registration namespace (`workflows: {...}`), a new factory (`createLoopWorkflow`), a file-move precondition (the workflow files still live in `tools/learning-loop-mcp/tools/` even though they are wired into `tools/learning-loop-mastra/server.js` via `#mcp/*`), and a parity gate. Per the operator preference for per-feature parity, each concern gets its own plan. Plans 1 + 2 are independent; Plans 3 + 4 depend on both.

**Scope (6 phases, 1 branch, ~6-9h):**

1. **Phase 1 — File-move precondition.** Move 8 `workflow-*.js` files from `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/workflows/`. Update 8 internal `import` paths (most files import `#lib/*` and `#mcp/core/*` only — verify). Temporarily disable workflow loading in `server.js` to keep mastra parity GREEN during the move.
2. **Phase 2 — `create-loop-workflow.js` factory.** TDD: 4 invariant tests first (description required, single-step linear chain, parity JSON Schema applied, factory returns a workflow with `.createRun()`). Then factory implementation mirroring `createLoopTool` (parity-shim + `adaptLegacyHandler`).
3. **Phase 3 — 8 `createWorkflow` wrappers + workflows-manifest.json.** TDD-per-workflow: write the `createLoopWorkflow({ id, description, inputSchema, steps: [{...}] })` call for each of 8 workflows; verify direct unit tests (no MCP) produce the same output as the legacy handler. Ship `workflows-manifest.json` with the 8 entries.
4. **Phase 4 — server.js wiring + manifests.** Update `server.js` to register `workflows: {...}` from `workflows-manifest.json`. Remove 8 entries from `tools/manifest.json`. Update `agent-manifest.json` workflow-group paths to reference the new `run_<key>` naming (MCPServer adds `run_` prefix automatically).
5. **Phase 5 — Workflow parity harness.** Spawn the mastra server; for each of 8 workflows, call `run_<key>` via the existing `withMcpServer` helper, assert `result.status === "success"` and the `result.result` matches the legacy output (deep-equal where structurally comparable).
6. **Phase 6 — Acceptance gate + closeout.** All 10 test namespaces pass against the mastra server; 8/8 workflow parity tests GREEN; flip tracker D1/D2/D3 `[x]`; file `meta_state_log_change`; journal entry; PR body with parity matrix.

**Acceptance gate (the single sentence, durable anchor):** *"All 10 test namespaces pass; 8 of 8 migrated workflows produce output identical (byte-equal where structured, deep-equal otherwise) to the legacy handler when invoked via `run_<key>` MCP tool call; cold-session discoverability test confirms the (Phase-1-updated) legacy manifest's 31 remaining entries all register with name/description/schema, and the mastra server's `tools/list` enumerates all 39 tools (28 deterministic `mastra_*` createTool + 3 stay-as-createTool `mastra_workflow_*` + 8 new `run_workflow_*` createWorkflow) with valid inputSchemas."*

**Count math (verified 2026-06-18 against `tools/learning-loop-mastra/tools/manifest.json` + `tools/learning-loop-mcp/tools/manifest.json`):**

| Source | Pre-Phase-4 | Post-Phase-4 |
|---|---|---|
| `tools/learning-loop-mcp/tools/manifest.json` | 39 entries | 31 entries (8 in-scope workflows removed in Phase 1) |
| `tools/learning-loop-mastra/tools/manifest.json` | 39 entries (28 det + 11 workflow-related) | 31 entries (28 det + 3 stay-as-createTool workflow) |
| `tools/learning-loop-mastra/workflows-manifest.json` (new) | — | 8 entries |
| `mastra_*` tools registered at runtime | 39 | 31 (5 gate + 19 meta_state + 3 introspection + 1 runtime_agnostic + 3 stay-as-createTool workflow) |
| `run_workflow_*` tools registered at runtime | 0 | 8 |
| **Total tools registered** | **39** | **39** (no count change; renames + namespace split only) |

**Out of scope (separate tracks, NOT this plan):**
- **`stateSchema` with multi-step accumulation** for `self_improvement` and `runtime_probe` — brainstorm Q1 declared these as "real stateSchema"; this plan ships them as parity-faithful thin single-step (current code is single-step). Restructuring into multi-step agents is **Plan 1a** (atomic fix) or absorbed into **Plan 3** (agents) — operator decision at Plan 3 author time.
- **LibSQL storage backend** — Plan 2 (parallel).
- **Agent parity harness** — Plan 3 (after Plan 1 ships).
- **`agent-manifest.json` 5-group rename / final reconciliation** — Plan 4 (cutover).
- **`§3.10` reconciliation in research report** — Plan 4.
- **Workflow `suspend`/`resume`** — not needed for current handlers. The factory supports it; no migration calls it. If Plan 3 agents need it, the factory is ready.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [Phase 1 — File-move precondition](./phase-01-file-move-precondition.md) | Completed | ~30min | n/a (mechanical move) | Plan 1 parent |
| 2 | [Phase 2 — `create-loop-workflow` factory](./phase-02-create-loop-workflow-factory.md) | Completed | ~1h | RED → GREEN (5 invariant tests first) | Phase 1 |
| 3 | [Phase 3 — 8 `createWorkflow` wrappers](./phase-03-8-createworkflow-wrappers.md) | Completed | ~2-3h | TDD per workflow (8 direct unit tests, then wrappers) | Phase 2 |
| 4 | [Phase 4 — server.js wiring + manifests](./phase-04-server-js-wiring-manifests.md) | Completed | ~1h | n/a (config + manifest updates) | Phase 3 |
| 5 | [Phase 5 — Workflow parity harness](./phase-05-workflow-parity-harness.md) | Completed | ~1-2h | TDD per workflow (9 MCP `run_<key>` tests) | Phase 4 |
| 6 | [Phase 6 — Acceptance gate + closeout](./phase-06-acceptance-gate-closeout.md) | Completed | ~30min | n/a (full `pnpm test` + tracker flip + closeout) | Phase 5 |

**Total effort:** ~6-9 hours. One session. Single PR (6 commits, one per phase, stacked on a feature branch off `main`).

## Q1 Conflict Resolution (parity-faithful default)

The brainstorm at `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §Q1 classified:
- **Real stateSchema (2 of 8):** `self_improvement`, `runtime_probe`
- **Thin stateSchema (6 of 8):** `intake_orient`, `intake_plan`, `classify_prompt`, `intentional_skip`, `report_phase_status`, `prepare_runtime_request`

Researcher A's empirical inventory at `plans/reports/researcher-A-260618-1911-workflow-inventory-report.md` reads the actual code:
- **Real state (1 of 8):** `intake_orient` (reads YAML dirs + `runtime-state.jsonl`)
- **Thin / pure compute (7 of 8):** all others

**Resolution (this plan):** parity-faithful thin `stateSchema = input` for **all 8**. The current code is single-step; Plan 1 ships parity-faithful migration. Multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` is deferred to Plan 1a or absorbed into Plan 3 (agents) — operator's call at Plan 3 author time. The factory `createLoopWorkflow` supports `stateSchema` already (Phase 2 design), so the future restructuring is a 1-line addition per call site, not a factory change.

**YAGNI rationale:** shipping 2 of 8 with `stateSchema` for a feature they don't currently use adds code without behavior. Per the parity gate (Phase 5), the test is "produces the same output as the legacy handler" — not "uses state machine features." Restructuring belongs in the plan that introduces the consumer (Plan 3 agents), not the migration plan.

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `tools/learning-loop-mcp/tools/workflow-*.js` (8 files moved) | none | file move, no product/** write |
| 1 | `tools/learning-loop-mastra/workflows/workflow-*.js` (8 files created) | none | new dir |
| 2 | `tools/learning-loop-mastra/create-loop-workflow.js` | none | new factory file |
| 2 | `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` | none | TDD tests |
| 3 | `tools/learning-loop-mastra/workflows/workflow-{name}.js` (8 wrapper files) | none | createWorkflow wrappers |
| 3 | `tools/learning-loop-mastra/workflows-manifest.json` | none | 8-entry manifest |
| 3 | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` | none | direct unit parity (no MCP) |
| 4 | `tools/learning-loop-mastra/server.js` | none | adds `workflows: {...}` |
| 4 | `tools/learning-loop-mastra/tools/manifest.json` | none | remove 8 entries |
| 4 | `tools/learning-loop-mastra/agent-manifest.json` | none | workflow group paths update |
| 5 | `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` | none | MCP parity harness |
| 6 | `plans/reports/productization-260612-1530-master-tracker.md` (D1/D2/D3 flip) | `OPERATOR_MODE=1` | gated; closeout contract |
| 6 | `meta-state.jsonl` (`meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 1 (test files + plan files + meta-state registry + mastra package source).

## Dependencies

**Blocked by:**
- `260617-1950-phase-c-plan-3-cut-over` (Phase C Plan 3 closed 2026-06-17; legacy server deleted; mastra canonical; provides the empty `workflows: {...}` slot in `MCPServer` config that Plan 1 fills).

**Blocks:**
- `phase-d-plan-3-agents` (Plan 3 — 3 `createAgent` wrappers; depends on Plan 1's `createLoopWorkflow` factory pattern + `workflows-manifest.json` shape + parity gate proven against the migrated subset).
- `phase-d-plan-4-cutover` (Plan 4 — `agent-manifest.json` final 5-group structure + master-tracker flip + `§3.10` reconciliation; depends on Plan 1's `agent-manifest.json` workflow-group path updates).

**Out of scope (separate tracks, NOT this plan):**
- Plan 2 (storage) — parallel; ships before Plan 3.
- Plan 1a — potential atomic fix for multi-step `stateSchema` restructuring if Plan 3 author time surfaces the need.
- Phase E cutover to Mastra Code Mode 1 — separate phase.
- Phase G skill migration — separate phase.

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-06` (6 files).
- **Decision deltas from brainstorm + research reports:**
  - **Count math (corrected from red team BLOCKER #1):** pre-Phase-4 mastra = 39 tools; post-Phase-4 = 39 tools (no count change). The 8 in-scope workflows rename from `mastra_workflow_*` to `run_workflow_*`; the 3 stay-as-createTool workflows (`generate_prompt`, `notify_artifact`, `trigger`) keep `mastra_workflow_*` names. Manifest drops from 39 to 31; new `workflows-manifest.json` has 8; MCPServer registers 31 `mastra_*` + 8 `run_*` = 39 total. **NOT 47 (29 + 8 = 37) as the original draft claimed.**
  - **Q1 conflict** (brainstorm vs researcher A): resolved as parity-faithful default (all 8 thin `stateSchema = input`). Documented in the "Q1 Conflict Resolution" section above.
  - **`createLoopWorkflow` factory name** (brainstorm says `create-workflow.js`; researcher B proposes `create-loop-workflow.js`): aligned with existing `create-loop-tool.js` naming convention → `create-loop-workflow.js`.
  - **File-move scope** (brainstorm says move + new alias; critical Phase D finding picks direct relative imports): no new import alias needed (option b); `server.js` imports from `./workflows/` directly.
  - **`agent-manifest.json` workflow group** (currently 11 entries): drops to 8 `run_<key>` workflows + 3 stay-as-createTool (`workflow_generate_prompt`, `workflow_notify_artifact`, `workflow_trigger`). Phase 4 updates the workflow group to reference the 8 new `run_<key>` names; the 3 stay-as-tool entries remain in the `mastra_*` set.
  - **MCPServer naming**: workflow keys are unprefixed (MCPServer adds `run_`). Final MCP names: `run_workflow_intake_orient`, `run_workflow_intake_plan`, ..., `run_workflow_runtime_probe`.
- **Test count math:** Plan 1's namespace 10 baseline is 70 tests (post-Phase C). Phase 2 adds 4 invariant factory tests. Phase 3 adds 8 direct unit parity tests. Phase 5 adds 9 MCP tests (1 empirical probe + 8 per-workflow parity; the 9th `tools/list` enumeration test is bundled). Total +21 = **91 tests** by Phase 5. Phase 6 (gate run) is verify-only.
- **Reconciled stale references:**
  - "Workflows need stateSchema for orientation context" (D2 from tracker) — applies to FUTURE multi-step state, not current handlers. Plan 1 ships the factory that supports it; Plan 3 agents consume it.
  - "suspend/resume for operator checkpoints" (D3 from tracker) — factory supports it; no current handler needs it. Plan 1 ships the capability; Plan 3 or Plan 1a consumes it.
- **Unresolved contradictions:** 0. Q1 conflict resolved explicitly in the section above. CONCERN #1 (workflow MCP output format) from researcher B is an **implementation-time probe** documented in Phase 5 — not a blocker for plan authoring.

## Key Risks Addressed

- **`createWorkflow` API surface differs from `createTool` enough that 8 migrations can't ship in one PR.** Risk: medium. Researcher B verified the API against 5 Mastra docs pages (workflow, step, workflow-state, suspend-and-resume, control-flow). The factory `createLoopWorkflow` is the integration seam; if a workflow can't fit, it surfaces as a test failure in Phase 3 with the specific schema delta. Mitigation: TDD-per-workflow in Phase 3 means each workflow's blocker is isolated to one PR reviewable chunk.
- **File-move breaks callers** (`#mcp/*` imports from `tools/learning-loop-mcp/tools/`). Risk: low. Researcher A verified the 8 files import `#lib/*` (3 files) and `#mcp/core/envelope-stripper.js` (2 files); no other internal cross-imports. Mitigation: Phase 1 moves files, updates import paths, runs the full test suite before Phase 2.
- **`agent-manifest.json` workflow group has 11 entries today; Plan 1 reduces to 8.** Risk: medium for downstream consumers reading the manifest. Mitigation: Phase 4 keeps the 3 stay-as-tool entries (`generate_prompt`, `notify_artifact`, `trigger`) in the workflow group under their `mastra_*` names; the 8 new `run_<key>` entries get added; total workflow group = 11 (same as before) but 3 are `mastra_*` createTool and 8 are `run_*` createWorkflow. Plan 4 owns the final reconciliation.
- **Workflow MCP output format (`content` vs `structuredContent`).** Risk: high for Phase 5's parity assertions. Researcher B marked this as CONCERN #1 (blocking for parity test design). Mitigation: Phase 5's first test (workflow #1) is the empirical probe — spawn server, call `run_workflow_intake_orient`, inspect raw response, lock the format before writing 7 more tests.
- **Q1 classification drift between brainstorm and inventory.** Risk: low after resolution documented. Mitigation: explicit "Q1 Conflict Resolution" section above + Phase 3 comment in each wrapper stating "thin stateSchema parity-faithful; multi-step restructuring deferred."
- **Cold-session test breaks.** Risk: low. Cold-session test enumerates `tools/list` from a fresh client; new `run_<key>` tools must appear. Mitigation: Phase 5 parity harness doubles as the cold-session surface (8 calls + 8 `tools/list` entries).

## References

- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (4-plan stack decision; Q1-Q5 resolutions)
- `plans/reports/researcher-A-260618-1911-workflow-inventory-report.md` (8-tool inventory)
- `plans/reports/researcher-B-260618-1911-mastra-createworkflow-api-report.md` (createWorkflow API + factory spec)
- `plans/reports/productization-260612-1530-master-tracker.md` §Phase D (D1-D7 checkboxes)
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md` (peer server + createLoopTool factory Plan 1 mirrors)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` (parity harness pattern; withBothMcpServers serializer mutex)
- `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` (C6+C7 closure; mastra canonical server)
- `tools/learning-loop-mcp/tools/workflow-*.js` (8 source files to move)
- `tools/learning-loop-mastra/create-loop-tool.js` (factory pattern to mirror)
- `tools/learning-loop-mastra/legacy-handler-adapter.js` (legacy handler adapter; reused)
- `tools/learning-loop-mastra/schema-parity.js` (parity-shim; reused)
- `tools/learning-loop-mastra/server.js` (registration point)
- `tools/learning-loop-mastra/tools/manifest.json` (29-entry deterministic manifest)
- `tools/learning-loop-mastra/agent-manifest.json` (5-group structure)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (existing spawn harness)
- `zod` `4.4.3` exact pin (parity-shim uses `z.toJSONSchema`)
- `@mastra/core` 1.42.0 + `@mastra/mcp` 1.10.0 (pinned)

## Validation Log

### Session 1 — 2026-06-18 (validate subcommand, post-red-team)

**Trigger:** validate subcommand invocation after red team review surfaced 4 BLOCKERs + 14 MINORs; all BLOCKERs were addressed in the consistency sweep. Verify plan accuracy against the actual codebase before final approval.

**Verification tier:** Full (6 phases, 4 roles, 15+ claims/phase budget — sampled 18 high-value claims)

#### Verification Results

- **Claims checked:** 18
- **Verified:** 14
- **Failed:** 1
- **Unverified:** 3 (deferred to implementation)

**Failures:**

1. **[Fact Checker] Phase 4 step 4a incorrect.** Plan claims legacy `tools/learning-loop-mcp/agent-manifest.json` needs the same `mastra_workflow_*` → `run_workflow_*` renames. **Actual:** legacy file uses BARE names (`workflow_intake_orient`, not `mastra_workflow_intake_orient`) — see line 14-23 of `tools/learning-loop-mcp/agent-manifest.json`. The `check_runtime_agnostic` tool reads this legacy file (`tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:221-255`) to verify new tools are listed. The 8 in-scope workflow names ARE listed in the legacy file (line 14-22) but the file is for the legacy server (deleted by Phase C Plan 3). **Decision needed:** remove the 8 names from legacy `agent-manifest.json` workflow group OR leave as-is (legacy introspection compatibility).

**Unverified (deferred to implementation):**

1. **Workflow MCP output format (researcher B CONCERN #1).** Empirical probe in Phase 5 step 1-3; not pre-verified.
2. **`buildParitySchema` + `adaptLegacyHandler` reuse** in `createLoopWorkflow` factory. Code exists; runtime compatibility with `createWorkflow` will be tested in Phase 2 invariant tests.
3. **`mcp-config.test.js` and other downstream tests** that read `agent-manifest.json` expecting specific tool counts. Not exhaustively verified; Phase 4 step 4a should grep for these.

#### Questions Asked

(See `AskUserQuestion` transcript below.)

#### Questions & Answers

1. **[Scope] Legacy `agent-manifest.json` handling** — Plan claimed step 4a needed renames; verification showed the file uses BARE names (`workflow_intake_orient`, not `mastra_workflow_*`). Decision: **Remove the 8 in-scope workflow names from the legacy `agent-manifest.json` workflow group** (alignment with Phase 1's `tools/manifest.json` removal). The 3 stay-as-createTool stay.

2. **[Architecture] Q1 conflict resolution placement** — multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` belongs in which plan? Decision: **Plan 3 (agents).** The restructuring is part of the consumer's design (an agent that needs cross-step accumulation). The plan that introduces the consumer owns the workflow restructuring. Plan 1 ships parity-faithful; factory supports `stateSchema` already; one-line addition at call site when Plan 3 ships.

3. **[Risk] Workflow MCP output format** — CONCERN #1 (researcher B): MCP `tools/call` response shape for workflow-backed tools is unverified. Decision: **Accept empirical probe.** Phase 5 step 1-3 spawns server with one workflow, locks the format, then 8 parity tests. Same pattern as `researcher-B-260618-1418-e2e-parity-test-design-report.md`.

4. **[Scope] Parity gate scope** — should the 3 stay-as-createTool workflows (`generate_prompt`, `notify_artifact`, `trigger`) be in the parity gate? Decision: **8/8 in-scope only.** The 3 stay-as-createTool are not migrated; their parity is the existing Phase C Plan 2 byte-identical test (`coerce-correctness.test.js` covers them). Plan 1's gate is the 8 migrations.

#### Confirmed Decisions

- **Legacy `agent-manifest.json`:** remove 8 in-scope workflow names (workflow_intake_orient, workflow_intake_plan, workflow_classify_prompt, workflow_prepare_runtime_request, workflow_self_improvement, workflow_intentional_skip, workflow_report_phase_status, workflow_runtime_probe). Keep the 3 stay-as-createTool (workflow_generate_prompt, workflow_notify_artifact, workflow_trigger).
- **Q1 multi-step stateSchema:** Plan 3's responsibility. Plan 1's factory supports `stateSchema`; one-line addition at call site when Plan 3 ships.
- **CONCERN #1:** empirical probe acceptable.
- **Parity scope:** 8/8 in-scope only.

#### Action Items

- [ ] **Phase 4 step 4a:** correct the legacy agent-manifest action. Replace the "apply same renames" language with "remove 8 in-scope workflow names" (the file uses bare names, not `mastra_workflow_*`).

#### Impact on Phases

- **Phase 4 step 4a:** corrected. The legacy `tools/learning-loop-mcp/agent-manifest.json` workflow group has 11 entries; after removal it has 3 entries (the stay-as-createTool).
- **Other phases:** no changes. Q1 conflict resolution already documented; CONCERN #1 already addressed in Phase 5 step 1-3; parity scope already 8/8.

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-file-move-precondition.md, phase-02-create-loop-workflow-factory.md, phase-03-8-createworkflow-wrappers.md, phase-04-server-js-wiring-manifests.md, phase-05-workflow-parity-harness.md, phase-06-acceptance-gate-closeout.md
- **Decision deltas checked:** 4 (legacy agent-manifest, Q1 placement, CONCERN #1, parity scope)
- **Reconciled stale references:**
  - `mastra_workflow_intake_orient` / `mastra_workflow_intake_plan` references in `phase-04` lines 107-108, 116 — these are CORRECT (renames for the MASTRA `agent-manifest.json`, which uses `mastra_*` prefixed names). The legacy file uses BARE names; corrected in step 4a.
  - `// TODO(plan-1a)` in `phase-03` line 179 success criteria — replaced with architecture-anchored language to match the actual code comment pattern in step 4.
  - `29 + 8 = 37` / `47 total` references in historical correction note (plan.md line 134) — kept as-is (historical record of what was wrong).
- **Unresolved contradictions:** 0. Plan is internally consistent across all 7 files. Q1 conflict resolution is consistent in plan.md §"Q1 Conflict Resolution", phase-03 step 4, and phase-03 success criteria. Legacy agent-manifest handling is consistent in phase-04 step 4a and the Validation Log.
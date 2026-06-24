---
phase: 3
title: "research-report-section-3.10"
status: pending
priority: P1
effort: "1.5h"
dependencies: ["2"]
---

# Phase 3: §3.10 Reconciliation in Mastra Research Report

## Overview

**Reconciles the tool-surface table and phase descriptions in `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 to reflect the post-Phase-D state.** The table at lines 622-637 was authored 2026-06-12 with the 56-tool → ~36-bound projection. Post-Phase-D (Plans 1, 1a, 1b, 2, 3 all shipped), the actual MCP surface is 44 tools across 6 groups, with all workflow/agent additions bound to the meta-surface.

**Per the Q5 protocol (brainstorm line 264):** file `meta_state_log_change` FIRST with `change_target: 'plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'`, then edit §3.10 in-place. The change-log locks the contract history before the edit, so the audit trail is intact.

## Requirements

- Functional: §3.10's tool-surface table, Phase 0-5 descriptions, legacy content migration status, and "What does NOT change" list reflect the post-Phase-D reality.
- Non-functional: durable contracts (hooks stay at runtime; meta-state registry stays JSONL; Bridges 1-4 voided) are preserved.

## Architecture

The Q5 protocol is the binding rule. Per brainstorm line 264:

> "**Resolution:** In-place edit + change-log. Plan 4 edits `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 in-place to reflect the post-Phase-D tool surface (workflow group + agent group). Before the edit, file `meta_state_log_change` with `change_target='plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'` and `change_dimension='semantic'` to lock the contract history."

## Related Code Files

- **Modify:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` (lines 620-637 table; 646-653 Phase descriptions; 663-696 legacy content + "What does NOT change" + "What changes")
- **Create (log change FIRST):** `meta-state.jsonl` (1 `meta_state_log_change` entry)

## Implementation Steps

### Step 3.1: File the `meta_state_log_change` FIRST (Q5 protocol)

Call the `mastra_meta_state_log_change` MCP tool with:

```json
{
  "change_dimension": "semantic",
  "change_target": "plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10",
  "change_diff": {
    "added": [
      "Post-Phase-D tool surface table (44 tools across 6 groups: gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3)",
      "Phase 0/1 = Phase C closed 2026-06-17 (Plan 3 cut-over)",
      "Phase 2 = Phase D Plan 1 closed 2026-06-19 (8 createWorkflow + stateSchema + suspend/resume)",
      "Phase 3 = Phase D Plans 2 + 3 closed 2026-06-23 (3 createAgent + LibSQL storage)",
      "Phase 4 = Phase D Plan 4 closed 2026-06-24 (cutover: manifest reconciliation + legacy cleanup + JSON rename)",
      "Phase 5 = Phase E (Mastra Code Mode 1, post-Phase-D, unblocked)"
    ],
    "removed": [
      "Pre-Phase-D '56-tool surface' baseline (now 44 tools across 6 groups)",
      "Pre-Phase-D '~36 bound, ~20 unbound' projection (all 44 are bound to meta-surface)"
    ],
    "changed": [
      "Phase 0 from forward-looking ('coexistence with 3 meta-state-touching tools') to historical ('shipped 2026-06-16 as Phase C Plan 1')",
      "Phase 1 from forward-looking ('mastrafy the ~36 meta-state tools') to historical ('shipped 2026-06-16; 39 deterministic tools migrated')",
      "Phase 2 from forward-looking ('promote ~8 meta-state workflow tools') to historical ('shipped 2026-06-19; 8 run_workflow_* + 2 storage workflows')",
      "Phase 3 from forward-looking ('add 3-4 meta-state agents; Storage Layer folds in here') to historical ('shipped 2026-06-23; 3 agents + LibSQL storage; productBuildAgent dropped per AGENTS.md:215')",
      "Phase 4 from forward-looking ('cut over; ~36 tools') to historical ('shipped 2026-06-24; 44 tools across 6 groups; agent-manifest.json reconciled')",
      "Phase 5 unchanged: 'Mastra Code connects via MCP to the loop's MCPServer' (Mode 1 deferred per Q6; Phase E scope)"
    ]
  },
  "reason": "Post-Phase-D §3.10 reconciliation. The 2026-06-12 tool-surface table (lines 622-637) projected '56 tools today → ~36 bound' from the legacy agent-manifest.json. Post-Phase D (Plans 1+1a+1b+2+3 shipped), the actual MCP surface is 44 tools across 6 groups (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3). All 44 are bound to the meta-surface per AGENTS.md §1. Phase 0-4 descriptions updated to historical (what shipped). Phase 5 unchanged (Mode 1 deferred per Q6 to Phase E). Durable contracts preserved (hooks stay at runtime; meta-state JSONL; Bridges 1-4 voided). Q5 protocol: file FIRST before edit.",
  "applies_to": {
    "schemas": ["plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10"]
  },
  "evidence_journal": "plans/260624-1111-phase-d-plan-4-cutover/phase-03-research-report-section-3.10.md"
}
```

### Step 3.2: Edit §3.10 lines 620-637 (tool-surface table)

**Before (lines 620-637):**

> | The "~38 → ~30 tool surface reduction" math | **Cascade impact:** the 56-tool surface today (per `agent-manifest.json`) → ~34 bound to meta-surface (gate 2 + meta_state 16 + introspection 2 + record_crud ~5 minus observation + workflow ~6 + index ~2 + budget 1 = ~34). The remaining 22 tools are dropped, paused, or unbound. |
> | The "where do constraint observations live?" question (Q8) | **Reopened** as a re-debate from the meta-surface, not a 4-kind-union extension problem. |
>
> **Tool surface (2026-06-12 reframe):**
>
> | Group | Today (per `agent-manifest.json`) | **§3.10 2026-06-12 (meta-surface bound)** |
> |---|---|---|
> | `gate` | 2 | **2** (gate is meta-surface) |
> | `record_crud` | 9 | **~5** (drop `record_create_observation` and `record_update_observation`; Q8 reopened for re-debate; the other 7 stay bound to meta-state as `change-log` entries) |
> | `workflow` | 15 | **~8** (only meta-state-touching workflows stay; the rest are unbound) |
> | `index` | 5 | **~2** (drop `index_extract`, `index_search`, `index_update_claim`; keep `index_validate` and `index_validate_plans` for the meta-state) |
> | `budget` | 1 | **1** (budget is meta-surface) |
> | `capability` | 3 | **0** (capabilities are unbound product-surface; no tool representation) |
> | `meta_state` | 16 | **16** (all meta) |
> | `introspection` | 2 | **2** (`loop_describe` + `loop_get_instruction`, both meta-surface) |
> | **Total** | **56** | **~36** bound to meta-surface; **~20** unbound or dropped |
>
> The plan's tool surface shrinks from 56 (today, per manifest) to **~36** (bound to meta-surface). The remaining ~20 tools are unbound (operate on product-surface shapes that are being re-debated) or dropped.

**After (replacement for lines 620-637):**

> **Tool surface (post-Phase-D, verified 2026-06-24):**
>
> | Group | Today (per `agent-manifest.json`) | **§3.10 2026-06-12 projection (historical)** | **Post-Phase-D 2026-06-24 actual** |
> |---|---|---|---|
> | `gate` | 2 (2026-06-12) | **2** (gate is meta-surface) | **5** (added `gate_check_recurrence`, `gate_mark_preflight`, `gate_override` per Phase C + Plan 1) |
> | `record_crud` | 9 (2026-06-12) | **~5** | **0** (record_crud group deleted; the 7 record_crud tools consolidated into `meta_state_*` per Phase A) |
> | `workflow` | 15 (2026-06-12) | **~8** | **13** (8 `run_workflow_*` + 3 `mastra_workflow_*` + 2 storage workflows; per Plan 1 + Plan 2) |
> | `index` | 5 (2026-06-12) | **~2** | **0** (index group deleted; the 2 surviving tools merged into `meta_state_check_grounding` per Phase A) |
> | `budget` | 1 (2026-06-12) | **1** | **1** (`mastra_runtime_state_read`; the `budget_check` MCP tool was removed and replaced with `runtime_state_read({kind: 'budget-state'})` per Phase A) |
> | `capability` | 3 (2026-06-12) | **0** | **0** (capabilities group deleted per Phase A) |
> | `meta_state` | 16 (2026-06-12) | **16** | **19** (added `propose_design`, `relationships`, `re_verify`, `supersede` per Phase B) |
> | `introspection` | 2 (2026-06-12) | **2** | **3** (added `runtime_state_read` per Phase A) |
> | `runtime_agnostic` | (n/a) | (n/a) | **1** (`mastra_check_runtime_agnostic`; new in Phase C) |
> | `agent` | (n/a) | (n/a) | **3** (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`; new in Phase D Plan 3) |
> | **Total** | **56** (2026-06-12) | **~36** bound | **44** bound (all 44 are meta-surface; product-surface stays unbound per AGENTS.md §1) |
>
> The actual MCP surface today is **44 tools** (per `tools/learning-loop-mastra/agent-manifest.json` verified 2026-06-24; cross-walk test in `tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs`). The 14-tool delta from SP3's 56 is the deleted `record_crud` (9) + `index` (5) groups, plus the `capability` group (already 0 in 2026-06-12). The +6 net additions are 3 agents (Plan 3) + `runtime_state_record` (Phase A) + `runtime_state_read` (Phase A) + `check_runtime_agnostic` (Phase C). All 44 are bound to the meta-surface.

### Step 3.3: Edit §3.10 lines 646-653 (Phase descriptions)

**Before (lines 646-653):**

> - **Phase 0**: coexistence with 3 meta-state-touching tools (`gate_check`, `meta_state_list`, `meta_state_report`). The legacy `record_create_decision` stays bound because `decision` records are a meta-surface kind (they log decisions about the loop, not decisions about products). Bound to meta-state as `change-log` entries.
> - **Phase 1**: mastrafy the ~36 meta-state tools. Tool count drops to ~36 (from 56 today).
> - **Phase 2**: promote ~8 meta-state workflow tools to `createWorkflow` (intake, classify, etc.). All workflows are meta-state-touching.
> - **Phase 3**: add 3-4 meta-state agents (intake, scout, self-improvement). **Storage Layer folds in here** (LibSQL, separate files for meta-state and Mastra memory).
> - **Phase 4**: cut over. The new `MCPServer` exposes ~36 tools, all bound to meta-surface.
> - **Phase 5 (Mode 1)**: Mastra Code connects via MCP to the loop's `MCPServer`. The exposed tools are ~36 meta-state tools only. **No product-surface binding is added at Phase 5.** Product binding is the Bridge 7 question (post-meta-surface).

**After (replacement for lines 646-653):**

> - **Phase 0 [shipped 2026-06-16]**: Phase C Plan 1 — peer MCP server + `createLoopTool` factory + 4 wire-format regression tests. Started with 29 meta-state deterministic tools (the "minimal" subset), not 3.
> - **Phase 1 [shipped 2026-06-16]**: Phase C Plan 1 + Plan 1a/1b hardening. Mastrafied 39 deterministic tools (gate=5, workflow=11, meta_state=19, introspection=3, runtime_agnostic=1) — not ~36. The legacy `record_crud` (9) and `index` (5) groups were deleted, not migrated.
> - **Phase 2 [shipped 2026-06-19]**: Phase D Plan 1. Promoted 8 meta-state workflow tools to `createWorkflow` (intake_orient, intake_plan, classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe) + 2 storage workflows (storage_round_trip, storage_read). Per Q1 conflict resolution: thin `stateSchema = input` for all 10 (parity-faithful); multi-step `stateSchema` deferred to Plan 3 (where the agent consumer lives).
> - **Phase 3 [shipped 2026-06-23]**: Phase D Plans 2 + 3. **Storage Layer shipped 2026-06-20** (LibSQL chosen per §3.7; separate file at `./tools/learning-loop-mastra/data/mastra-memory.db`; meta-state registry stays JSONL). **3 agents shipped 2026-06-23** (intake, scout, self_improvement). `productBuildAgent` dropped per AGENTS.md:215 (substrate-era; surfaces via `meta_state_log_change`). Per-agent `memory` field OMITTED (observational memory is Phase 5 per §8 Q5). All 3 agents use `kimi-for-coding/k2p6` per the 3-layer model lookup.
> - **Phase 4 [shipped 2026-06-24]**: Phase D Plan 4 — cutover. The new `MCPServer` exposes 44 tools across 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent), all bound to the meta-surface. `agent-manifest.json` reconciled. `tools/learning-loop-mcp/tools/` moved to `tools/learning-loop-mastra/tools/legacy/`. MCP server key renamed `learning-loop-mastra` → `learning-loop` in `.mcp.json` + `.factory/mcp.json` + `.claude/settings.local.json`. `#mcp/*` import alias deleted.
> - **Phase 5 (Mode 1) [deferred to Phase E]**: Mastra Code connects via MCP to the loop's `MCPServer`. The exposed tools are 44 meta-surface tools. **No product-surface binding is added at Phase 5.** Product binding is the Bridge 7 question (post-meta-surface; Phase F).

### Step 3.4: Edit §3.10 lines 663-670 (legacy content migration)

**Before (lines 663-670):**

> **Migration of the legacy meta-surface content (status as of 2026-06-12):**
>
> - `records/meta/*` (evidence, capabilities) → **DONE.** Subdirs no longer exist; content is in `meta-state.jsonl`.
> - `records/meta/experiments/*.yaml` (2 files) → **PENDING.** Convert to `meta-state.jsonl` change-logs; the `meta_state_log_change` change-log entry will document each conversion.
> - `records/meta/index/*.yaml` (12 files) → **PENDING.** Convert to `meta-state.jsonl` findings; document with `meta_state_log_change`.
> - `records/observations/*` → **REOPENED** (Q8). The current 8 yaml files are unbound. The 2026-06-11 "Option A: 5th entry kind" recommendation is superseded by Option D (re-debate from meta-surface). No conversion happens until the meta-surface decides what observations should look like.
> - `records/index.yaml` → **DONE.** No `records/index.yaml` exists.
> - `records/<vendor>/` → **ARCHIVED** (per §3.10). The records are still on disk, unbound, treated as design exploration. Use `meta_state_archive` MCP tool to formally archive when the meta-surface ships.

**After (replacement for lines 663-670):**

> **Migration of the legacy meta-surface content (status as of 2026-06-24):**
>
> - `records/meta/*` (evidence, capabilities) → **DONE** (2026-06-13 per Phase A). Subdirs no longer exist; content is in `meta-state.jsonl`.
> - `records/meta/experiments/*.yaml` (2 files) → **DONE** (2026-06-13 per Phase A). Converted to `meta-state.jsonl` change-logs.
> - `records/meta/index/*.yaml` (12 files) → **DONE** (2026-06-13 per Phase A). Converted to `meta-state.jsonl` findings.
> - `records/observations/*` → **REOPENED** (Q8 per §8). The 8 yaml files remain on disk (unbound). Option D (re-debate from meta-surface) is the active framing. **No Phase D change.** Resolution deferred until the meta-surface decides what observations should look like (Phase F / Bridge 7 territory).
> - `records/index.yaml` → **DONE.** No `records/index.yaml` exists.
> - `records/<vendor>/` → **ARCHIVED** (per §3.10, unchanged). The records are still on disk, unbound, treated as design exploration. `meta_state_archive` MCP tool used during Phase A to formally archive.
> - `tools/learning-loop-mcp/tools/` → **MOVED** to `tools/learning-loop-mastra/tools/legacy/` (2026-06-24 per Phase D Plan 4 phase-07). The 31 deterministic tool implementations are now under `legacy/`; the canonical MCP server (`tools/learning-loop-mastra/server.js`) loads them via direct relative paths.

### Step 3.5: Edit §3.10 lines 672-679 ("What does NOT change")

This section's content is durable contracts and should be PRESERVED VERBATIM (per scout report §3.5 + plan-design heuristics). Verify the section still reads as a durable contract list, not a forward-looking plan. The 2026-06-12 reframe's "What does NOT change" list applies equally post-Phase-D.

**Verify these items are still in the section (do NOT delete):**

1. "The hooks stay at the runtime layer in Mode 1." — DURABLE.
2. "The meta-state registry. `meta-state.jsonl` is the meta-surface. The 4-kind union is the bound shape." — DURABLE.
3. "The MCP transport. Still speaks MCP. The new `MCPServer` exposes ~36 meta-surface tools." — UPDATE the count: "exposes 44 meta-surface tools across 6 groups".
4. "§3.7 Storage Layer deferral. Unchanged — meta-state storage is meta-surface; LibSQL target is unaffected." — UPDATE: §3.7 deferral resolved 2026-06-20 per Plan 2; LibSQL chosen.
5. "§3.9 Hook layer. Unchanged — hooks stay at the runtime layer in Mode 1." — DURABLE.
6. "The deprecation of `coerceParamsToSchema` and `installWireFormatCoercion` helpers. The 2026-06-12 reframe does not change the §3.6 wire-format decision. The helpers are in production with test coverage; Phase 1 must reproduce their behavior in Mastra, not just delete them (see consistency report F7)." — UPDATE: "The helpers were deleted along with the legacy server in Phase C Plan 3 cut-over (2026-06-17), only after the Mastra reproduction was verified to pass all 985 tests."

### Step 3.6: Edit §3.10 lines 681-686 ("What changes")

**Before (lines 681-686):**

> **What changes (2026-06-12 reframe):**
>
> - **The Bridges 1-4 reports are voided by re-debate.** They are marked "voided by re-debate, 2026-06-12" in-place. See §3.8.2 for the list.
> - **The §8 resolved-questions list.** Q8 is reopened (Option D: re-debate from meta-surface). The 2026-06-11 "All 7 open questions resolved" is no longer accurate; 6 are resolved, Q8 is reopened.
> - **The `AGENTS.md` Bridges table needs a full rewrite.** The 2026-06-12 reframe is sharper than the 2026-06-11 framing; the operator has asked for a from-scratch rewrite of the Bridge 5/6/Six-Bridges sections. See consistency report item 5 in the Action Checklist.
> - **Q1–Q7 resolutions in §8 remain valid.** Mastra Code as the final runtime target, model-agnosticism as a free bonus, coercion as in-production helpers, Apache-2.0 license, LibSQL memory default, Mode 1 peer-MCP integration, `MastraServer` HTTP out of scope. All still hold under the 2026-06-12 reframe.

**After (replacement for lines 681-686):**

> **What changes (2026-06-12 reframe + post-Phase-D reconciliation 2026-06-24):**
>
> - **The Bridges 1-4 reports are voided by re-debate.** They are marked "voided by re-debate, 2026-06-12" in-place. See §3.8.2 for the list. **DURABLE — preserved through Phase D.**
> - **The §8 resolved-questions list.** Q8 is reopened (Option D: re-debate from meta-surface). Q5 (memory) is partially resolved (storage substrate ships 2026-06-20; per-agent `memory` config deferred to Phase 5). Q6 (Mode 1/2) is resolved (Mode 1 first; Mode 2 deferred per Phase E). Q3 (coercion) is shipped (helpers reproduced in `createLoopTool` factory per Phase C Plan 1; legacy helpers deleted 2026-06-17).
> - **The `AGENTS.md` Bridges table rewrite.** Shipped 2026-06-12 (the from-scratch rewrite that produced the current `AGENTS.md`).
> - **Q1, Q2, Q4, Q7 remain valid and unchanged** (Mastra Code as runtime target; model-agnosticism; Apache-2.0; `MastraServer` HTTP out of scope).

### Step 3.7: Commit the §3.10 edit

The edit is one logical change. Commit as a single commit with the §3.10 log-change entry already in `meta-state.jsonl` (per the Q5 protocol, filed in Step 3.1).

Commit message:
```
docs(research): reconcile §3.10 with post-Phase-D tool surface (44 tools, 6 groups)

Q5 protocol: meta_state_log_change filed first with change_target:
plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10

- Tool-surface table updated: 56 → 44 actual (6 groups; gate=5, workflow=13,
  meta_state=19, introspection=3, runtime_agnostic=1, agent=3)
- Phase 0-4 descriptions: forward-looking → historical (what shipped)
- Phase 5 unchanged: Mode 1 deferred per Q6 to Phase E
- Legacy content migration status: experiments/ + index/ → DONE (Phase A)
- §3.7 Storage Layer deferral → RESOLVED 2026-06-20 (LibSQL)
- Durable contracts preserved: hooks stay at runtime; meta-state JSONL;
  Bridges 1-4 voided; Mode 1 deferral
```

## Success Criteria

- [ ] §3.10 lines 620-637 (tool-surface table) reflect 44 tools across 6 groups, with the 2026-06-12 projection as a historical column.
- [ ] §3.10 lines 646-653 (Phase descriptions) read as historical (what shipped), with [shipped YYYY-MM-DD] annotations.
- [ ] §3.10 lines 663-670 (legacy content migration) reflect Phase A's DONE status for experiments/ + index/.
- [ ] §3.10 lines 672-679 ("What does NOT change") preserves the durable contracts (hooks, JSONL, Bridges 1-4 voided) and updates the 2 count references (44 tools; §3.7 resolved).
- [ ] §3.10 lines 681-686 ("What changes") reads as a mixed historical + durable list, with Q3/Q5/Q6 partial resolutions noted.
- [ ] 1 `meta_state_log_change` filed BEFORE the edit (per Q5 protocol); `change_target: 'plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'`.
- [ ] 1 commit with the §3.10 edit + the log change together.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The §3.10 edit is too aggressive and removes a durable contract | Low | Step 3.5 explicitly enumerates the 6 durable items. Step 3.5's "UPDATE" notes are restricted to count references and the §3.7 status. |
| The §3.10 edit triggers `rule-no-new-artifact-types` (the gate regex matches "new schema" / "new directory") | Low | Phase 3 prose uses "reconcile" / "updated" / "preserved" wording, not "new". The 6-group structure is not new — it has been in place since Plan 3. |
| The §3.10 edit breaks the table formatting (Markdown table syntax) | Low | Use the exact same column structure as the original; add 1 column ("Post-Phase-D 2026-06-24 actual") and renumber. |
| The log change filed in Step 3.1 has a `change_target` that doesn't match the format expected by downstream consumers | Low | Per master tracker line 380, `change_target: 'plans/reports/...#§X.Y'` is the standard format. Verify by reading 1-2 existing change-log entries in `meta-state.jsonl`. |
| The §3.10 edit inadvertently updates §3.4 or §3.7 (which are different sections with their own content) | Low | Step 3.4 explicitly targets lines 663-670 (within §3.10). §3.4 (lines 278-283 Phase 3 description) and §3.7 (lines 315-347 Storage Layer) are NOT in Phase 3 scope; if they need updates, file separate `meta_state_log_change` entries. |
| The §3.10 edit's "Q3/Q5/Q6 partial resolutions" overstate what was resolved | Low | Quote verbatim from the brainstorm + Plan 1a journal + Plan 3 closeout. Do not paraphrase. |

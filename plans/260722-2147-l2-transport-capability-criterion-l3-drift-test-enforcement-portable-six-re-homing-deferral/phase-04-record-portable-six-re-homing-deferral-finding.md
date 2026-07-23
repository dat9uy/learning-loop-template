---
phase: 4
title: "Record portable-six re-homing deferral finding"
status: completed
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 4: Record portable-six re-homing deferral finding

## Post-review correction (2026-07-23)

The finding recorded by this phase (`meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but`) remains accurate — U-Q2 IS an open prerequisite. The post-merge review confirmed U-Q2 is **not fully resolved** and surfaced the underlying defect: `workflow_generate_prompt`'s `BLUEPRINTS` paths were stale (pointed at the folded `learning-loop-mcp` subtree), so the tool returned `Blueprint file not found` for every call. That defect was fixed and recorded as a **separate finding** (`meta-260723T1126Z-workflow-generate-prompt-returned-error-true-message-bluepri`, category `loop-anti-pattern`, subtype `stale-blueprint-path-after-package-fold`), which also reclassifies `workflow_generate_prompt` to `MCP_RESIDUE` `deferred-rehoming` until cross-root blueprint resolution is handled. The portable-six finding's scope (6 `run_workflow_*` tools) is unchanged; `workflow_generate_prompt` is a manifest handler, not one of the six, so it gets its own finding rather than expanding this one. See plan.md § "Post-review correction" + change-log `meta-260723T1126Z-docs-runtime-contract-md-core-cli-tools-js-tests-cli-write-t`.

## Overview

Record the portable-six re-homing as a **deferred meta-state finding** so the decision + its prerequisites are durable and citable in the registry, instead of living only in the audit report. This is the user's explicit ask for recommendation 4 ("Defer the portable-six re-homing, write finding about that"). **No re-homing code.** Captures U-Q1 (unwrap contract), U-Q2 (`resolveRoot` wiring), P-Q2 (ordering-enforcement prerequisite), and the `convertWorkflowsToTools` opt-out gap (red-team Sec-F9) as the finding's prerequisite list.

## Requirements

- Functional: one `meta_state_report` finding with a **schema-valid** payload (red-team FMA-F2): `category: "mcp-tool-missing"`, `severity: "warning"` (NOT `info` — not in the enum), `subtype: "portable-six-rehoming-deferred"`, deferral semantics in `description`. Records the 6 CLI-capable candidate tools; the deferral rationale; U-Q1 + U-Q2 + P-Q2 + the opt-out-gap prerequisite; the "separate plan before any code" precondition.
- Non-functional: `evidence_code_ref` points at the factory + a workflow file; `source_refs` cite the audit + the L2 change-log id (in `change-log.jsonl`); `mechanism_check: true` default. No code commit.

## Architecture

The finding is a record write via the loop CLI (`bin/loop.mjs meta_state_report`), runtime pin `.claude`. **Schema (red-team FMA-F2 correction):** the `meta_state_report` handler reuses `metaStateFindingEntrySchema` (`core/meta-state.js:312-318`): `category` ∈ {`gate-logic-bug`, `record-repair-gap`, `schema-drift`, `mcp-tool-missing`, `budget-check`, `loop-anti-pattern`}; `severity` ∈ {`warning`, `escalate`} (NO `info`); `subtype` is a free-form string. The cited precedent `meta-260721T0809Z` actually uses `category: "mcp-tool-missing"`, `severity: "warning"`, `subtype: "transport-diversification-gated"` — NOT `deferred-decision`/`info`. Use the same shape: `mcp-tool-missing` (closest fit — "a CLI-capable tool currently missing from the CLI surface, re-homing deferred"), `warning`, subtype `portable-six-rehoming-deferred`. (O-Q2 resolved: it is a `finding`, not a `loop-design`; `loop-design` would need `meta_state_propose_design`/`meta_state_ship_loop_design`, different machinery.)

The finding does **not** supersede or reopen any existing record — it is a new, self-contained deferral. It cross-references (via `source_refs`) the audit report and the L2 criterion section (Phase 2), not other findings.

## Related Code Files

- Create: none.
- Modify: none (record write, not a file edit).
- Delete: none.
- Read (citation): `tools/learning-loop-mastra/mastra/workflows/workflow-classify-prompt.js` (representative factory consumer), `tools/learning-loop-mastra/core/create-loop-workflow.js` (the unwrap target — `attachParityJSONSchema` / envelope strip), `tools/learning-loop-mastra/tools/handlers/workflow-generate-prompt-tool.js` (`resolveRoot` blueprint path — U-Q2), `tools/learning-loop-mastra/mastra/server.js:135,187` (the opt-out gap — Sec-F9), `docs/runtime-contract.md` (Phase 2 section), `plans/reports/ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md` (§5 rec 4, §6 U-Q1/U-Q2, P-Q2).

## Implementation Steps

1. Read `create-loop-workflow.js` to confirm exactly which normalization the factory performs (`attachParityJSONSchema`, envelope strip) so the finding's unwrap contract (U-Q1) names the real functions to preserve/move.
2. Read `workflow-generate-prompt-tool.js`'s `resolveRoot` usage to confirm the U-Q2 wiring note (blueprints under `learning-loop-mcp` subtree).
3. Construct the finding payload (schema-valid — red-team FMA-F2):
   - `category`: `"mcp-tool-missing"`.
   - `severity`: `"warning"`.
   - `subtype`: `"portable-six-rehoming-deferred"`.
   - `affected_system`: `"mcp-tools"` (confirmed in `AFFECTED_SYSTEM_ENUM` at `core/meta-state.js:213-229`; `cli-transport` is NOT in the enum — `mcp-tools` is the closest fit and matches the `meta-260721T0809Z` precedent).
   - `description` (min 20 chars): the 6 candidate tools (`run_workflow_{classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe}`); deferral reason (the `createLoopWorkflow` factory's schema normalization is load-bearing for MCP-path callers; re-homing must preserve it via a shared pre-handler or per-tool, not duplicate — U-Q1); `resolveRoot`/blueprint-path wiring under `learning-loop-mcp` (U-Q2); **P-Q2** — multi-step re-homing to agent execution requires gate-observed (not agent-asserted) step-success to keep ordering enforceable; **opt-out gap (Sec-F9)** — `convertWorkflowsToTools` (`server.js:187`) has no `CLI_TOOLS` opt-out branch, so re-homing a `run_workflow_*` to CLI requires a parallel opt-out there or the tool stays dual-surface; precondition = a separate evidence-driven plan names the unwrap contract before code.
   - `evidence_code_ref`: `tools/learning-loop-mastra/core/create-loop-workflow.js`.
   - `source_refs`: `local:meta-state:meta-260722T2125Z-docs-loop-engine-md` (the L2-basis change-log, in `change-log.jsonl` — red-team AD-F3) + `local:plans/reports/ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md` (escape hatch).
   - `mechanism_check`: true (default).
4. Write via `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_report '<json>'`. Capture the returned id.
5. Verify the finding landed: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{ "id": ["<returned-id>"] }'`.
6. (Optional) `meta_state_relationship_validate` against the description to confirm no stale cross-references.
7. Feed the finding id back into Phase 3's `deferred-rehoming` tag (the drift-test `MCP_RESIDUE` entries for the 6 portable-six cite this id).

## Success Criteria

- [x] One finding recorded with **valid schema** (`category: mcp-tool-missing`, `severity: warning`, `subtype: portable-six-rehoming-deferred`) — the CLI exits 0, not 2.
- [x] Description names the 6 candidates + deferral rationale + U-Q1 unwrap contract + U-Q2 wiring note + P-Q2 ordering-enforcement prerequisite + Sec-F9 opt-out-gap prerequisite + separate-plan precondition.
- [x] `evidence_code_ref` points at `create-loop-workflow.js`; `source_refs` cite the `change-log.jsonl` change-log id + audit report.
- [x] Finding verified via `meta_state_list`; id fed back to Phase 3's `deferred-rehoming` tag; no re-homing code committed.

## Risk Assessment

- **Schema rejection (red-team FMA-F2 — now fixed).** The original `deferred-decision`/`info` payload would have been zod-rejected (exit 2) and the finding would never land. Mitigation: use `mcp-tool-missing`/`warning`/subtype (matches the `meta-260721T0809Z` precedent); step 5 verifies exit 0.
- **`affected_system` enum miss.** `cli-transport` is NOT in `AFFECTED_SYSTEM_ENUM` (`core/meta-state.js:213-229`); use `mcp-tools` (confirmed, matches the `meta-260721T0809Z` precedent). Mitigation: step 3 uses the confirmed value.
- **Stale `source_refs`.** Citing a report path that later moves. Mitigation: the `change-log.jsonl` id is the durable primary ref; the report path is the escape-hatch secondary (per the source-refs rule).
- **Premature re-homing.** The finding must not read as a greenlight. Mitigation: the description states the "separate plan names the unwrap" precondition + P-Q2 + the opt-out gap explicitly.
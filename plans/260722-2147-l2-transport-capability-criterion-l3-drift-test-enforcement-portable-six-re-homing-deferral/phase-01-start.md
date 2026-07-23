---
phase: 1
title: "Scope, contracts, precondition confirmation"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Scope, contracts, precondition confirmation

## Overview

Confirm the preconditions the plan rests on and scout the exact insertion points / naming derivations Phases 2–5 rely on, so the later phases are mechanical edits rather than investigations. No code or doc changes here — read-only verification + a scout note.

## Requirements

- Functional: verify W T2 write-path gate accrued (`.claude` routes writes via CLI); verify the L1 naming clarification is on disk; confirm the 11-tool enumeration and the `run_workflow_*` name derivation; locate the L2 insertion point and the drift-test manifest read.
- Non-functional: all checks read-only; no edits to bound artifacts or tests.

## Architecture

Phase 1 produces a short scout note (appended to this file's Implementation Steps output, not a new artifact) that Phases 2–5 cite. It cross-checks three sources: the session hook (runtime wiring), the on-disk L1 doc, and the server.js / drift-test registration paths.

## Related Code Files

- Create: none.
- Modify: none (this phase is read-only).
- Delete: none.
- Read (scout): `docs/runtime-contract.md`, `docs/loop-engine.md` (§ Workflow: definition vs execution), `tools/learning-loop-mastra/core/cli-tools.js`, `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js`, `tools/learning-loop-mastra/mastra/server.js` (lines 39, 128), `tools/learning-loop-mastra/mastra/workflows-manifest.json`, `tools/learning-loop-mastra/tools/manifest.json`, `tools/learning-loop-mastra/core/workflow-registry.js`.

## Implementation Steps

1. Confirm W T2 gate (durable evidence, not session output): `plans/260722-1343-.../plan.md` status == `completed`; `.mcp.json:8` sets `LOOP_RECORDS_VIA_CLI:"1"` for `.claude`; `__tests__/cli-optout-wiring.test.js:26-28` locks it (asserts `.claude` has the flag, `.factory`/`.mastracode` do not). The session banner ("Writes also ride the CLI") is secondary confirmation only.
2. Confirm L1 baseline on disk: `docs/loop-engine.md` contains "## Workflow: definition vs execution" and the 3-homes list; change-log `meta-260722T2125Z-docs-loop-engine-md` exists in **`change-log.jsonl`** (repo root — the Tier-1 split puts change-logs in `change-log.jsonl`, NOT `meta-state.jsonl`).
3. Enumerate the 11 workflow tools: 8 from `workflows-manifest.json` (exports `workflowClassifyPrompt` etc.) + 3 helpers from `tools/manifest.json` lines 33–35. Record each handler's `name:` field (helpers) and each workflow's `wf.id` (the 8).
4. Confirm the `run_workflow_*` MCP-name derivation: `server.js:135` does `workflows[wf.id] = wf`; Mastra surfaces a workflow as `run_<wf.id>` via `convertWorkflowsToTools` at `server.js:187` (`const workflowToolName = `run_${workflowKey}`;` where `workflowKey === wf.id`). Record the exact `wf.id` for each of the 8 so Phase 3's test imports them and reads `wf.id` (not string-derivation). (Red-team correction: the assignment is `:135`, the name derivation is `:187` — not `:128`, which is just the loop header.)
5. Locate the L2 insertion point by **content, not line number** (line numbers drift): `docs/runtime-contract.md` § "Transport mapping" → § "Three concerns previously conflated" → § "Current transports". The new "Transport capability (per function)" section slots in **after the last bullet of "Three concerns previously conflated" and before "## Current transports"** — keeping per-function capability adjacent to the per-runtime transport list. (Red-team correction: "Three concerns" is at file line 31, not 39 — do not anchor on a line number.)
6. Confirm the drift-test manifest read: `readManifestToolNames` (test lines 54–70) reads only `tools/manifest.json`. Record that `workflows-manifest.json` is not read — the blind spot Phase 3 closes.
7. Record the `WORKFLOW_REGISTRY.recommended_tools` values (`index_extract`, `index_validate`, `capability_generate`) and grep **broadly** — `plans/`, `docs/`, `skills/`, `tools/handlers/references/`, `tools/` — for those names AND for deletion records. Red-team found `capability_generate` + `index_extract` were **deleted** in `plans/260612-1700-meta-surface-re-debate/plan.md:31` ("13 product-surface MCP tools deleted"); stale refs remain in `skills/coordination-gate/SKILL.md` + `tools/handlers/references/tool-selection-guide.md`. `index_validate` was NOT in that deleted list — confirm per-tool. This is Phase 5's evidence (dead vs pending; default dead given the deletion).

## Success Criteria

- [ ] W T2 gate evidenced as satisfied; L1 baseline confirmed on disk.
- [ ] 11-tool enumeration recorded with exact `name:` / `wf.id` values.
- [ ] `run_workflow_*` name derivation confirmed (`run_<wf.id>`); L2 insertion anchor chosen; drift-test blind spot confirmed.
- [ ] `WORKFLOW_REGISTRY.recommended_tools` grep result recorded for Phase 5.

## Risk Assessment

- **Stale scout.** If the scout runs early and edits land between scout and cook, the anchors drift. Mitigation: scout is read-only and fast; re-confirm anchors at the start of each phase. Low risk.
---
title: "Re-home the portable-six workflow tools from MCP to CLI"
description: "Unwrap the 6 CLI-capable run_workflow_* tools (classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe) from the createLoopWorkflow Mastra wrapper into plain handler modules registered via tools/manifest.json, so they ride bin/loop.mjs under LOOP_RECORDS_VIA_CLI=1 and leave the MCP_RESIDUE deferred-rehoming set. Resolves the 4 prerequisites recorded in finding meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but: (U-Q1) unwrap contract — preserve createLoopWorkflow's schema normalization (attachParityJSONSchema + stripMcpContentEnvelope) via a shared helper baked into each unwrapped handler's schema; (U-Q2) resolveRoot — scoped out, the portable six are pure in-memory transforms with no file reads (workflow_generate_prompt's cross-root U-Q2 is a separate finding); (P-Q2) ordering — non-blocker, the six are single-step deterministic (the multi-step gate-observed contract is documented for any future re-homing); (Sec-F9) server.js opt-out — dissolved by the unwrap (the tools leave workflows-manifest.json, so convertWorkflowsToTools never sees them; the existing server.js:71 RECORDS_VIA_CLI opt-out drops them from MCP). The unwrap re-homes the six to the same plain-handler shape the 3 mastra_workflow_* helpers already use; the run_* MCP name is a mechanical artifact of the workflow registration path and reverts to mastra_workflow_* on MCP / workflow_* on CLI, with a bounded caller-update phase. Follow-on to the completed deferral plan 260722-2147 and the audit ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md."
status: pending
priority: P2
effort: "2-3d"
tags: [cli-transport, workflow-tools, re-homing, unwrap, drift-test, runtime-contract, tdd, meta-state]
created: 2026-07-25
blockedBy: []
blocks: []
analysis:
  - "plans/reports/ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md"
  - "plans/260722-2147-l2-transport-capability-criterion-l3-drift-test-enforcement-portable-six-re-homing-deferral (completed — the deferral that recorded this finding)"
related:
  - "tools/learning-loop-mastra/mastra/create-loop-workflow.js (factory being unwound for the portable six)"
  - "tools/learning-loop-mastra/mastra/create-loop-tool.js (manifest-loop factory the unwrapped handlers will ride)"
  - "tools/learning-loop-mastra/bin/loop.mjs (CLI dispatcher)"
  - "tools/learning-loop-mastra/core/cli-tools.js (CLI_TOOLS sets)"
  - "tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js (MCP_RESIDUE / deferred-rehoming tags)"
finding: "meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but"
---

# Re-home the portable-six workflow tools from MCP to CLI

## Overview

The completed deferral plan `260722-2147` recorded these 6 `run_workflow_*` tools as `MCP_RESIDUE` (`deferred-rehoming`) — CLI-capable in principle but blocked on 4 named prerequisites. This plan delivers the unwrap: each tool's single-step handler moves out of the `createLoopWorkflow` Mastra wrapper into a plain handler module registered via `tools/manifest.json`, so `bin/loop.mjs` dispatches them under `LOOP_RECORDS_VIA_CLI=1` and the MCP server drops them via the existing `server.js:71` opt-out. No `convertWorkflowsToTools` patch is needed (Sec-F9 dissolves when the tools leave `workflows-manifest.json`). The 2 storage workflows (`run_workflow_storage_*`) stay Mastra (`server-state`); `workflow_generate_prompt` stays deferred (its own U-Q2 cross-root finding).

The unwrap extends the plain-handler registration pattern the 2 CLI-ported `mastra_workflow_*` helpers (`notify_artifact`, `trigger`) already use — plain handlers in `tools/manifest.json` — to the 6 portable workflows, removing the workflow/handler inconsistency the audit flagged (`wrapWorkflowInputSchema` is NEW shared machinery baking the factory's envelope strip into each handler schema; the 3rd helper, `workflow_generate_prompt`, is the deferred cross-root case). The `run_*` MCP name was a mechanical artifact of the workflow registration path (`convertWorkflowsToTools` adds `run_`); the unwrap reverts it to `mastra_workflow_*` on MCP / `workflow_*` on CLI, with a bounded, in-repo caller-update phase (11 sites — see Phase 1 step 5).

## Preconditions (confirmed — durable evidence)

1. **Deferral plan completed.** `plans/260722-2147-...` is `status: completed`; the finding `meta-260723T0813Z-...` is `open` with `subtype: portable-six-rehoming-deferred`, naming U-Q1 + U-Q2 + P-Q2 + Sec-F9 as the re-homing prerequisites. This plan is the evidence-driven unwrap the deferral deferred.
2. **W T2 write-path gate — satisfied (durable).** `.mcp.json` sets `LOOP_RECORDS_VIA_CLI:"1"` for `.claude`; `__tests__/cli-optout-wiring.test.js` locks it. The `server.js:71` opt-out (`RECORDS_VIA_CLI && CLI_TOOLS.has(legacy.name)`) will drop the unwrapped `mastra_workflow_*` from `.claude`'s MCP automatically once they join `CLI_TOOLS`.
3. **Drift test already covers the workflow surface.** `cli-write-tool-set-drift.test.js` enumerates `workflows-manifest.json` (via `run_<wf.id>`) AND `tools/manifest.json`; the 6 portable are currently tagged `deferred-rehoming`. Reclassifying them into `CLI_TOOLS` is a test edit, not a new guard.
4. **No cross-plan blockers.** The 260722-1343 / 260722-1623 / 260722-2147 cluster is all `completed`; no unfinished plan overlaps the target files (`cli-tools.js`, `workflows-manifest.json`, `server.js`, drift test, the 6 workflow files).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | (U-Q1) Unwrap contract: a shared helper reproduces `createLoopWorkflow`'s schema normalization (`attachParityJSONSchema` via `createLoopTool` + `stripMcpContentEnvelope` baked into each handler's schema) so MCP-path parity + envelope stripping are preserved without per-tool duplication | P1 |
| 2 | 6 plain handler modules (`workflow_<x>` shape) registered in `tools/manifest.json` (`pathFields: []`); the 6 `run_workflow_*` removed from `workflows-manifest.json` and the workflow files deleted (logic moves into the handler modules — no dual-surface) | P1 |
| 3 | 6 names added to `CLI_WRITE_TOOLS` in `core/cli-tools.js`; `server.js:71` opt-out drops `mastra_workflow_<x>` from `.claude` MCP; Sec-F9 dissolved (no `convertWorkflowsToTools` branch added) | P1 |
| 4 | Drift test reclassifies the 6 `MCP_RESIDUE` (`deferred-rehoming`) → `CLI_TOOLS`; the workflow blind-spot assertion still covers the 2 surviving storage workflows; reason-tag discipline intact | P1 |
| 5 | (U-Q2) Scoped out: the portable six use no `resolveRoot`/file reads (probe-confirmed); `workflow_generate_prompt`'s cross-root U-Q2 is a separate finding, not scope-crept | P2 |
| 6 | (P-Q2) Documented non-blocker: the six are single-step deterministic (probe-confirmed); the multi-step gate-observed step-success contract is documented in `docs/runtime-contract.md` for any future re-homing, not implemented | P2 |
| 7 | Caller update across the 11-site set (Phase 1 step 5): `agent-manifest.json` workflow group, `interface/RUNTIME_ONBOARDING.md` (example + Total), `mcp-tools-list-parity.test.js`, `server-runid.test.js` (relocate to a surviving workflow), `tool-deletion-coverage.test.js:118`, `mastra-code-smoke.test.cjs:87` renamed `run_workflow_*` → `mastra_workflow_*`; Phase 3 retired the obsolete workflow-path tests (`workflow-direct-parity.test.js`, `workflow-parity.test.cjs` portable cases) + updated count-assertion files (`manifest-constants.cjs`, `manifest-arithmetic.test.cjs`, `cli-mcp-subset-registration.test.js`, `tool-deletion-coverage.test.js:50`, `workflow-parity.test.cjs` counts) atomic with the registration switch | P1 |
| 8 | Finding `meta-260723T0813Z-...` resolved with evidence (`pr_ref`, `change_log_id`, `file_index_refreshed_path`); change-log entry logged; `docs/runtime-contract.md` transport-capability note updated for the reclassification | P2 |

## Phases

| # | Phase | Status | Deps |
|---|-------|--------|------|
| 1 | [Scope, design-fork decision, empirical probes](./phase-01-start.md) | Pending | — |
| 2 | [Unwrap contract — shared helper + 6 handler modules (TDD)](./phase-02-unwrap-contract-shared-helper-and-handler-modules.md) | Pending | 1 |
| 3 | [CLI registration + MCP opt-out + drift-test reclassification](./phase-03-cli-registration-mcp-opt-out-drift-test.md) | Pending | 2 |
| 4 | [Caller update — run_* → mastra_workflow_* rename](./phase-04-caller-update-rename-run-to-mastra.md) | Pending | 3 |
| 5 | [Gates green + resolve the finding](./phase-05-gates-green-resolve-finding.md) | Pending | 4 |

Phase ordering rationale: Phase 1 proves the 4 prerequisites with probe tests and decides the central design fork (Option A unwrap vs Option B' workflow-CLI) before any production code. Phase 2 builds the unwrapped handlers with a parity test (handler == workflow oracle) as the safety net. Phase 3 switches registration (workflow → manifest) and reclassifies the drift test; it can only land after 2. Phase 4 updates the bounded caller set once the new MCP/CLI names are final. Phase 5 closes the loop on the finding once the surface is stable.

## Design fork (the central decision — resolved in Phase 1, confirmed in validation)

The finding frames Sec-F9 as "either a parallel `convertWorkflowsToTools` opt-out OR the tool stays dual-surface" — both assume the tools STAY in `workflows-manifest.json`. The audit's recommendation is a third path: **unwrap** (leave the workflow loop). Two options survive scouting:

- **Option A — full unwrap (recommended).** Move each tool's handler out of `createLoopWorkflow` into a plain `tools/handlers/workflow-<x>-tool.js` module; register via `tools/manifest.json`; delete the workflow file + its `workflows-manifest.json` entry. MCP name reverts `run_workflow_<x>` → `mastra_workflow_<x>` (non-opted-out runtimes); CLI dispatches `workflow_<x>` (bare). Sec-F9 dissolves (the tools never reach `convertWorkflowsToTools`); the existing `server.js:71` opt-out drops them for `.claude`. Consistent with the 3 `mastra_workflow_*` helpers; single code path; DRY. Cost: a bounded `run_*` → `mastra_*` rename across 4 in-repo caller sites.
- **Option B' — CLI dispatches workflow objects (alternative).** Keep the 6 in `workflows-manifest.json` (MCP `run_*` preserved); add the Sec-F9 parallel opt-out in `convertWorkflowsToTools`; extend `bin/loop.mjs` to execute `wf.createRun().start({inputData})` for `run_*` names. No rename. Cost: the CLI now runs the Mastra workflow runtime in a one-shot process (empirical risk — does `createRun`/`start` work without `initStorage()`/`RequestContext`?); the workflow/handler inconsistency with the 3 helpers persists; a new `convertWorkflowsToTools` branch must be maintained.

**Recommended: Option A.** It matches the audit's explicit recommendation, keeps the CLI on the plain-handler dispatch path it already proves, and dissolves Sec-F9. The rename is bounded (Phase 4 enumerates every site — see the Red Team Review for the full caller set). Option B' is documented as the fallback if the Phase-1 probe proves `createRun`/`start` is trivially CLI-portable AND the operator judges the rename cost disqualifying.

**Framing correction (red-team):** Option A *extends the plain-handler registration pattern the 2 CLI-ported `mastra_workflow_*` helpers use* (`notify_artifact`, `trigger`) — NOT "restores the shape of the 3 helpers." `workflow_generate_prompt` is the deferred cross-root case (U-Q2, not CLI-ported), and NONE of the 3 use `wrapWorkflowInputSchema` (it is NEW shared machinery baking the factory's envelope strip into each handler schema). The precedent argument is "2 helpers already ride this registration path"; the new part is the shared helper.

## Success Criteria

- [ ] (U-Q1) A shared `wrapWorkflowInputSchema` helper (or equivalent) applies `z.preprocess(stripMcpContentEnvelope, normalizeInputSchema(schema))`; all 6 unwrapped handlers use it (no per-tool duplication); a parity test asserts each handler's `z.toJSONSchema` matches the prior workflow's parity view and that envelope-wrapped input is stripped.
- [ ] The 6 `run_workflow_*` dispatch via `bin/loop.mjs workflow_<x> '<json>'` for `.claude`; their outputs match the prior workflow outputs byte-for-byte (golden-master parity test).
- [ ] The 6 are absent from `.claude`'s MCP surface under `LOOP_RECORDS_VIA_CLI=1` (verified by a CLI/MCP subset test); no new `convertWorkflowsToTools` opt-out branch was added (Sec-F9 dissolved by removal from `workflows-manifest.json`).
- [ ] `cli-write-tool-set-drift.test.js` has the 6 in `CLI_TOOLS` (via `CLI_WRITE_TOOLS`), NOT in `MCP_RESIDUE`; the workflow blind-spot assertion still covers the 2 `run_workflow_storage_*`; every `MCP_RESIDUE` entry still declares a known reason tag.
- [ ] (U-Q2) A probe asserts none of the 6 workflow files import `resolveRoot`/`readFileSync`/`findProjectRoot` (confirming U-Q2 is out of scope for the six); `workflow_generate_prompt` is untouched (its U-Q2 finding stays open).
- [ ] (P-Q2) A probe asserts each of the 6 is single-step; `docs/runtime-contract.md` gains a one-paragraph note that multi-step deterministic workflows re-homed to the agent home require gate-observed (not agent-asserted) step-success — the contract for any future re-homing.
- [ ] The 11-site caller set (Phase 1 step 5) updated: `agent-manifest.json`, `interface/RUNTIME_ONBOARDING.md` (example + Total), `mcp-tools-list-parity.test.js` (phantom `MIGRATED_TOOL_NAMES` dropped + specific per-tool test), `server-runid.test.js` (concrete runId assertion on `run_workflow_storage_round_trip`), `tool-deletion-coverage.test.js:118`, `mastra-code-smoke.test.cjs:87` reference `mastra_workflow_<x>`; the obsolete workflow-path tests retired; the count-assertion files (`manifest-constants.cjs`, `manifest-arithmetic.test.cjs`, `cli-mcp-subset-registration.test.js`, `tool-deletion-coverage.test.js:50`, `workflow-parity.test.cjs` counts) updated atomic with the Phase 3 registration switch.
- [ ] `pnpm test` green across all namespaces; `check_runtime_agnostic` clean on touched paths; fallow gate triaged (if non-zero, `pnpm fallow:brief`, ignore baseline-inherited lines).
- [ ] Finding `meta-260723T0813Z-...` resolved via `meta_state_resolve` with `{pr_ref, change_log_id, file_index_refreshed_path}`; a change-log entry (`meta_state_log_change`) records the re-homing; `meta_state_refresh_file_index` run on the refactored paths.

## Risk Assessment

- **MCP surface name change for non-opted-out runtimes (`.factory`/`.mastracode`).** Option A renames `run_workflow_<x>` → `mastra_workflow_<x>` on MCP for runtimes that do NOT set `LOOP_RECORDS_VIA_CLI=1`. Mitigation: Phase 4 enumerates every caller across ALL reference forms (MCP names `run_workflow_<x>`, workflow file paths `workflows/workflow-<x>.js`, camelCase exports, and hardcoded count constants — the red-team showed a `run_workflow_<x>`-only grep misses 5 test files); `.factory`/`.mastracode` are not active call sites of the portable six (the Mastra internal agents do not statically reference them — confirmed by grep over `mastra/agents/`). **The `agent-manifest.json` `groups.*.tools` arrays are NOT pure introspection metadata** (red-team correction): they are a test contract (`tool-deletion-coverage.test.js:118`, `manifest-arithmetic.test.cjs:66`) and a `check_runtime_agnostic` input (`runtime-agnostic-checklist.js` `manifest-registered` check builds `registered` from `groups.*.tools`); the rename must update them, and the no-stale-refs guard must cover count constants, not just the 6 names. **Rollback = `git revert` of the Phase 2+3+4 commits** (restores the 6 deleted `mastra/workflows/workflow-<x>.js` files, removes the 6 new `tools/handlers/workflow-<x>-tool.js` files, drops the 6 from `tools/manifest.json` + `CLI_WRITE_TOOLS`, restores the 6 to `workflows-manifest.json` + `MCP_RESIDUE`), NOT a flag flip (`LOOP_RECORDS_VIA_CLI=0` re-opens the W split-brain closed in 260722-1343) and NOT a manual config relocation (manual partial rollback leaves a broken intermediate state — deleted workflow files referenced by a restored `workflows-manifest.json`).
- **Envelope-strip regression (U-Q1).** `createLoopWorkflow` applies `z.preprocess(stripMcpContentEnvelope, ...)` to every workflow at the factory (line 78); `createLoopTool` does NOT. If the unwrapped handler's schema omits the strip, MCP-path callers that wrap args in the content envelope would receive the envelope un-stripped. Mitigation: the shared `wrapWorkflowInputSchema` helper bakes the strip into every handler's schema; the parity test asserts envelope-wrapped input is stripped on both MCP and CLI paths. `stripMcpContentEnvelope` is a no-op on plain JSON (the CLI input form), so the helper is safe for both transports.
- **`server-runid.test.js` loses its subject.** The test calls `run_workflow_classify_prompt` to verify workflow runId behavior; after unwrap it is no longer a workflow. Mitigation: Phase 4 moves the runId assertion to a surviving workflow (`run_workflow_storage_round_trip` — stays Mastra). Do not delete the runId coverage.
- **`CLI_WRITE_TOOLS` widening.** Adding the 6 to `CLI_WRITE_TOOLS` widens the `LOOP_RECORDS_VIA_CLI=1` opt-out (already active for `.claude`) but NOT the reads-only opt-out (avoids the `LOOP_READS_VIA_CLI=1` widening the deferral plan flagged). The 6 are stateless pure transforms (pathFields: [], no side-effects) grouped with the `workflow_*` helpers; a comment in `cli-tools.js` notes they are not record-surface writes.
- **Drift-test workflow assertion shrinks.** After removing the 6 from `workflows-manifest.json`, `readWorkflowToolNames()` yields only the 2 storage workflows. The 6 are covered by `readManifestToolNames()` instead. Mitigation: Phase 3 keeps both assertions; the "at least one workflow" guard stays (2 storage workflows satisfy it).
- **Option B' fallback unproven.** If the operator picks B' in validation, Phase 1 must prove `wf.createRun().start({inputData})` runs in a one-shot CLI without `initStorage()`/`RequestContext`. The probe is in Phase 1 specifically so the fork decision is evidence-driven, not assumed.

## Open Questions

- **O-Q1 (design fork — confirmed in validation):** Option A (unwrap + rename, recommended) vs Option B' (CLI dispatches workflow objects, no rename)? Propagated to Phase 1 (probe scope) + Phase 2/3/4 (the chosen path's steps). Recommend A.
- **O-Q2 (CLI set placement):** `CLI_WRITE_TOOLS` (workflow-helper precedent, no reads-only widening) vs a new `CLI_STATELESS_TOOLS` set? Recommend `CLI_WRITE_TOOLS` with a clarifying comment (YAGNI on a new set). Propagated to Phase 3.
- **O-Q3 (logic location):** Move each workflow's pure function into the handler module (delete the workflow file) vs keep a shared logic module both import? Recommend: move into the handler module (Option A = no dual-surface, so no shared module needed — the workflow file is deleted). Propagated to Phase 2.
- **O-Q4 (workflow-path test disposition — red-team):** Retire the obsolete workflow-path cases (`workflow-direct-parity.test.js`'s 13 cases + `workflow-parity.test.cjs`'s 6 portable `callTool` cases — both test the 6 AS workflows, superseded by `workflow-unwrap-parity.test.js`) vs MIGRATE them to assert the manifest-handler path? Recommend RETIRE (the 6 are no longer workflows; the unwrap-parity test covers behavior; migrating re-tests the same handlers via a different entry point for no new coverage). Propagated to Phase 3 step 7. Confirm in validation.
- **O-Q5 (`MIGRATED_TOOL_NAMES` phantom — red-team):** `mcp-tools-list-parity.test.js:20-41` declares `MIGRATED_TOOL_NAMES` but no assertion references it. Wire it to an actual assertion (`for (const name of MIGRATED_TOOL_NAMES) assert byName.has(name)`) OR drop the list and add a specific `mastra_workflow_self_improvement` per-tool parity test (the real guarantee). Recommend DROP + specific test (phantom lists invite false confidence). Propagated to Phase 4 step 4.

## Red Team Review

### Session — 2026-07-25
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 reviewers, 5 phases).
**Findings:** 3 reviewers → all `DONE_WITH_CONCERNS`. Raw findings deduped across reviewers; every Critical/High independently verified against the codebase with `file:line` (re-verified in the controller session).
**Headline:** the unwrap DESIGN (Option A, `wrapWorkflowInputSchema`, drift-test reclassification, Sec-F9-dissolves-by-removal) is sound and all 4 preconditions HOLD (U-Q2 no-file-reads ✓, P-Q2 single-step ✓, Sec-F9 single-registration-path ✓, W-T2 durable ✓, no cross-plan blockers ✓). The load-bearing defect is the **caller enumeration**: a `run_workflow_<x>`-only grep misses 5 test files / 1 shared constant that break `pnpm test` at Phase 3/4. Plus the U-Q1 dual-strip gap and the Phase 2/3 oracle-fixture inconsistency.

| # | Finding | Sev | Disposition | Applied To |
|---|---------|-----|-------------|------------|
| 1 | Caller enumeration misses `__tests__/workflow-parity.test.cjs` (7 `callTool("run_workflow_<x>")` + count assertions `mastra===37`, `run_workflow===8`, `total===48` at lines 130-132); breaks at Phase 3 | Critical | Accept | Phase 1 step 5, Phase 4 |
| 2 | Caller enumeration misses `__tests__/workflow-direct-parity.test.js` (13 cases `import("../mastra/workflows/workflow-<x>.js")` + `createRun().start()`); Phase 3 step 7 deletes those files → all 13 break at import | Critical | Accept | Phase 1 step 5, Phase 3 (Modify list + ordering) |
| 3 | `__tests__/legacy-mcp/tool-deletion-coverage.test.js:50` hardcodes `manifest.length===36` (→42); `:118` asserts `run_${tool}` membership (→`mastra_workflow_${tool}`); file unlisted | Critical | Accept | Phase 3 step 8, Phase 4 |
| 4 | `__tests__/manifest-arithmetic.test.cjs:49` hardcodes `workflows.length===8` (→2); uses shared `TOOLS_MANIFEST_ENTRIES`; file unlisted | Critical | Accept | Phase 3 step 8 |
| 5 | `__tests__/helpers/manifest-constants.cjs` shared `TOOLS_MANIFEST_ENTRIES: 36` (→42) consumed by 4 tests (manifest-arithmetic, cold-session-enumerate-mastra, cold-session-discoverability, mastra-code-smoke); the centralized edit point, unlisted | Critical | Accept | Phase 3 step 8 |
| 6 | `__tests__/cli-mcp-subset-registration.test.js:77,133,136` hardcode `37` + `37 - CLI_TOOLS.size` (→43 / `43 - CLI_TOOLS.size`); Phase 3 step 8 mentions it only vaguely | Medium | Accept | Phase 3 step 8 (enumerate the 3 constants) |
| 7 | Phase 2/3 oracle-fixture inconsistency: Phase 3 step 7 references "oracle fixtures (captured Phase 2 step 1)" but Phase 2 has NO fixture-capture step — it imports the live workflow object; deleting the files in Phase 3 breaks the parity test's oracle import | High | Accept | Phase 2 (add concrete fixture-capture step) |
| 8 | U-Q1 dual-strip: `workflow-self-improvement.js:45` uses a per-field `z.preprocess(stripEnvelope, z.array(z.string()))` on `proposed_changes` — the SDK `{item:[...]}` form, DISTINCT from `stripMcpContentEnvelope`; `buildParitySchema` unwraps preprocess so schema parity is blind to a dropped `stripEnvelope`; Phase 1 probe 3 captures only classify_prompt + only the `{content:[]}` form | High | Accept | Phase 1 probe 3 (all 6 + `{item:[]}` form), Phase 2 (dual-strip parity case + "preserve per-field stripEnvelope" instruction) |
| 9 | Phase 1 probe 1 asserts `.steps.length===1` on the committed workflow object; no existing test reads `.steps` (canonical test uses `createRun().start()`) — the property may not exist on the committed object → false negative | Medium | Accept | Phase 1 probe 1 (source-inspection or result-shape, not `.steps.length`) |
| 10 | "Restores the shape the 3 helpers already have" is inaccurate: only 2 of 3 helpers are CLI-ported (`generate_prompt` is deferred); none use `wrapWorkflowInputSchema` (it is NEW) | Medium | Accept | plan.md Design fork (framing correction — applied) |
| 11 | "`agent-manifest.json` workflow group is introspection metadata" is inaccurate: `groups.*.tools` is a test contract + a `check_runtime_agnostic` input | Critical | Accept | plan.md Risk Assessment (framing correction — applied), Phase 4 |
| 12 | Phase 3 cutover steps 2-7 not mandated atomic; during steps 2-4 the 6 are in BOTH `tools/manifest.json` (`mastra_workflow_<x>`) AND `workflows-manifest.json` (`run_workflow_<x>`) — dual surface, no collision warning (duplicate check is on `run_*` only) | Medium | Accept | Phase 3 (atomic-commit directive + Risk note) |
| 13 | Rollback described as "move the 6 back into `workflows-manifest.json` + `MCP_RESIDUE`" omits restoring the 6 deleted workflow files + removing the 6 new handler files — implies config-only | Medium | Accept | plan.md Risk Assessment (rollback correction — applied) |
| 14 | Phase 4 step 5 moves `server-runid.test.js` to `run_workflow_storage_round_trip` but under-specifies the replacement assertion ("assert storage-specific runId contract" without stating it) — risks trivially-true assertion, losing the "responsive across multiple createRun calls" coverage | Medium | Accept | Phase 4 step 5 (concrete assertion) |
| 15 | `mcp-tools-list-parity.test.js` `MIGRATED_TOOL_NAMES` (lines 20-41) is a phantom list — declared but never referenced in any assertion; Phase 4 step 4 treats keeping `mastra_workflow_self_improvement` in it as load-bearing; it guards nothing | Low | Accept | Phase 4 step 4 (wire to an assertion OR drop + add a specific per-tool test) |
| 16 | `__tests__/legacy-mcp/mastra-code-smoke.test.cjs:87` comment + `expectedPrefixes` name `run_workflow_classify_prompt` as the workflow-runner example; after unwrap only the 2 storage tools match `run_workflow_`; test still passes (skips unless `status==="live"`), no-stale-refs guard flags the comment | Low | Accept | Phase 4 step 6 (comment/example update) |
| 17 | `outputSchema` loss: each workflow step declares an `outputSchema`; `createLoopTool` takes no `outputSchema`; the unwrapped handler shape carries none → Mastra step-output validation silently dropped (no current behavior impact — handlers are pure — but defense-in-depth lost) | Low | Accept | Phase 2 Risk + parity-test return-shape assertion |
| 18 | Phase 2 parity test covers only INPUT envelope strip, not OUTPUT; `adaptLegacyHandler` strips OUTPUT on both MCP+CLI paths today, but a future swap would regress invisibly | Low | Accept | Phase 2 parity test (add OUTPUT-envelope case) |
| 19 | `interface/RUNTIME_ONBOARDING.md:126` "Total: 44 tools exposed via MCP" drifts after the unwrap (`.claude` exposes fewer; full-surface count shifts) | Low | Accept | Phase 4 step 3 (recompute the Total) |
| 20 | Phase 5 "expect clean" on `check_runtime_agnostic` is an assumption: `deriveToolName` (`runtime-agnostic-checklist.js:110-112`) returns the UNPREFIXED name while `registered` holds PREFIXED agent-manifest names — the `manifest-registered` check may already be loose for the existing helpers; needs an empirical baseline | Medium | Accept | Phase 5 step 2 (baseline on existing helper first) |

### Verified non-findings (cleared, not defects)
- **R2 gate / `pathFields:[]`:** `temp_dir` in `runtime_probe` is a string label interpolated into command text, NOT a write path (no `fs` call); `pathFields:[]` correct for all 6; `withR2Gate` is envelope-agnostic (strip lives in schema `.parse()`).
- **Mastra internal agents:** no static reference to the 6 names in `mastra/agents/`; `loadAgentsManifest` validates only the `agents` object, not `groups`.
- **`server-runid.test.js` isolation:** uses `mkdtempSync` + `connectMcpServer(SERVER_ENTRY, tempRoot)` with `GATE_ROOT: tempRoot` — storage writes go to the temp root, not real storage.
- **Envelope `text` JSON.parse injection:** `envelope-stripper.js:80-84` is fail-closed (`catch → v`) + zod validates the parsed shape; identical to the current `createLoop-workflow.js:78` path; no new risk.
- **Option B' probe (Phase 1 probe 4):** sound — `initStorage` is idempotent and only called at `server.js:262` (module load), so the probe's feasible/infeasible signal is a true negative/positive in a clean child process.
- **All 4 preconditions HOLD:** U-Q2 (no file reads in any of the 6 — verified), P-Q2 (all 6 `steps:` arrays have exactly 1 entry — verified), Sec-F9 (workflows registered ONLY from `workflows-manifest.json` — verified), W-T2 (`.mcp.json:8` + `cli-optout-wiring.test.js` lock `LOOP_RECORDS_VIA_CLI=1` for `.claude` — verified, durable), no cross-plan blockers (no `pending`/`in-progress` plan overlaps target files — verified).

### Whole-Plan Consistency Sweep
Applied after red-team edits. Re-read `plan.md` + all 5 phase files. Decision delta propagated: (a) caller enumeration broadened from 4 sites to 11 (plan.md Risk + phase-01 step 5 + phase-03/phase-04 Modify lists); (b) U-Q1 contract notes the dual-strip (plan.md Goal 1 + phase-01 probe 3 + phase-02 parity test); (c) oracle-fixture capture made a concrete Phase 2 step (phase-02 + phase-03 ordering); (d) "restores the shape" + "introspection metadata" + rollback framings corrected (plan.md); (e) Phase 3 cutover atomicity + Phase 5 `check_runtime_agnostic` baseline added. No unresolved contradictions remain post-fix.

## Validation Log

### Session 1 — 2026-07-25
**Verification Pass:** Skipped (guard) — `## Red Team Review` present with verification evidence; zero `[UNVERIFIED]` tags remain in plan files.
**Questions asked:** 5 (the 5 Open Questions O-Q1..O-Q5). All 5 confirmed the plan's recommendations.

| # | Decision | Answer |
|---|----------|--------|
| O-Q1 | Design fork | **Option A — full unwrap** (B' fallback retained only if Phase-1 probe 4 is trivially positive AND operator overrides; otherwise A is final) |
| O-Q2 | CLI set placement | **CLI_WRITE_TOOLS** with the stateless-pure-transform comment; no new `CLI_STATELESS_TOOLS` set |
| O-Q3 | Logic location | **Move into the handler module**; workflow files deleted in Phase 3 (no shared module) |
| O-Q4 | Workflow-path test disposition | **Retire** the obsolete cases (13 workflow-direct-parity + 6 portable workflow-parity callTool); no migration step needed in Phase 4 |
| O-Q5 | `MIGRATED_TOOL_NAMES` phantom | **Drop list + specific `mastra_workflow_self_improvement` per-tool parity test** (Phase 4 step 4 as written) |

**Propagation:** All 5 answers match the recommendations already baked into the phase files, so no phase content changed. Closed items: Phase 1 step 6 design-fork decision is now operator-confirmed as Option A (probe 4 still runs as the evidence record, but B' adoption now requires an explicit operator override, not just a positive probe); Phase 3 step 7 "(Validation may instead choose to MIGRATE…)" branch is closed — retire-only; Phase 4 step 4 O-Q5 resolved as written. Markers added to those phases.

### Whole-Plan Consistency Sweep (post-validation)
Re-read `plan.md` + all 5 phase files after the interview. Checks: no renamed APIs/fields introduced (all answers = existing plan text); O-Q1 confirmed → the Option B' prose in plan.md `## Design fork` and Phase 1 probe 4 is intentionally retained as the documented fallback + evidence record, not a contradiction; O-Q4 retire-only → Phase 4 step 1's conditional "If validation picks O-Q4 = MIGRATE" clause is now dead-branch documentation (kept for provenance, marked); O-Q2/O-Q3/O-Q5 already the phase text. Count constants (36→42, 8→2, 37→43, 48 stays) consistent across plan.md Success Criteria, Phase 1 step 5, Phase 3 steps 7/9, Phase 4 step 3. **Zero unresolved contradictions.** Plan is eligible for implementation.

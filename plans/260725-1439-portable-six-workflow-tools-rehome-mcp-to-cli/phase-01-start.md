---
phase: 1
title: "Scope, design-fork decision, empirical probes"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Scope, design-fork decision, empirical probes

## Overview

Prove the 4 re-homing prerequisites (U-Q1 unwrap contract, U-Q2 resolveRoot, P-Q2 ordering, Sec-F9 opt-out) with TDD probe tests BEFORE any production unwrap, and settle the Option A vs Option B' design fork on evidence. Phase 1 is read-only investigation plus RED probe tests; it produces the empirical facts Phases 2–4 depend on.

## Requirements

- Functional: prove (a) the 6 workflows are single-step deterministic (P-Q2 non-blocker); (b) none import `resolveRoot`/`readFileSync`/`findProjectRoot` (U-Q2 scoped out); (c) the only transport-critical transform in `createLoopWorkflow` is `z.preprocess(stripMcpContentEnvelope, normalizeInputSchema(...))` + `attachParityJSONSchema` (U-Q1 unwrap contract); (d) `wf.createRun().start({inputData})` does/does-not run in a one-shot CLI without `initStorage()`/`RequestContext` (Option B' feasibility).
- Non-functional: every claim is backed by a probe test or a `file:line` citation; the design fork is decided by the probe results, not assumption.

## Architecture

No production changes. Phase 1 writes probe tests under `tools/learning-loop-mastra/__tests__/` (RED — they assert the current state and the future unwrapped behavior; the future-behavior ones go GREEN in Phase 2). The Option A path is preferred; Option B' is the fallback if its probe proves trivial and the operator prefers no-rename.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/portable-six-probes.test.js` (TDD probe — see steps)
- Read: `tools/learning-loop-mastra/mastra/create-loop-workflow.js`, `mastra/create-loop-tool.js`, `mastra/workflows/workflow-*.js` (the 6), `mastra/server.js:71,128-136,168-256`
- Delete: (none in Phase 1)

## Implementation Steps

1. **TDD probe 1 — P-Q2 (single-step, deterministic).** Assert single-step by **source inspection**, NOT `.steps.length` on the committed workflow object (no existing test reads `.steps` — the canonical `workflow-direct-parity.test.js` uses `createRun().start()`; the property may not exist on the committed object → false negative). For each of the 6 workflow files, grep the `steps:` array literal and assert it has exactly one element; additionally call `wf.createRun({}).start({inputData: <minimal valid>})` and assert the result shape matches the single step's declared `outputSchema` (proving exactly one step executed). Assert no `generateText`/`streamText`/`fetch`/`readFileSync`/`initStorage` import in any of the 6 modules (the step's `handler` is pure). Expect GREEN today.
2. **TDD probe 2 — U-Q2 (no file reads).** For each of the 6 workflow modules, `grep` the source for `resolveRoot|readFileSync|findProjectRoot|import.*fs|appendFile|writeFileSync`. Assert zero hits. This scopes U-Q2 OUT for the six (the cross-root concern is `workflow_generate_prompt`'s alone). Expect GREEN today.
3. **TDD probe 3 — U-Q1 (unwrap contract oracle) — ALL 6, BOTH envelope forms.** For EACH of the 6 (not just `classify_prompt`), capture the current workflow's model-visible JSON Schema (`z.toJSONSchema(wf.inputSchema, {target:"draft-7", io:"input"})`) as the schema oracle. Then capture behavior oracles across BOTH envelope forms: (a) the MCP content envelope `{content:[{type:"text", text:JSON.stringify(<args>)}]}` (stripped by the factory's top-level `stripMcpContentEnvelope` at `create-loop-workflow.js:78`); AND (b) the SDK `{item:[...]}` envelope for array fields — specifically `workflow_self_improvement`'s `proposed_changes: z.preprocess(stripEnvelope, z.array(z.string()))` (a PER-FIELD strip DISTINCT from `stripMcpContentEnvelope`; `buildParitySchema` unwraps preprocess so schema parity is blind to a dropped `stripEnvelope`). Send `proposed_changes` as `{item:["add zod schema"]}` and confirm it is stripped to a plain array. Record all oracles to `__tests__/fixtures/workflow-oracles/<x>.json` (schema JSON + behavior snapshots) — Phase 2's parity test reads these fixtures, so Phase 3 can delete the workflow files without breaking the oracle. Expect GREEN today.
4. **TDD probe 4 — Option B' feasibility (the fork evidence).** Write a test that, in a clean child process with `LOOP_RECORDS_VIA_CLI=1` and NO `initStorage()` / `RequestContext`, imports `workflow_classify_prompt` and calls `wf.createRun({}).start({inputData:{prompt:"test"}})`. Assert it either returns the classify result (B' feasible) or throws (B' infeasible — needs `initStorage`/`RequestContext`). This is the decisive probe for the design fork. Capture the exact error if it throws. (Verified sound: `initStorage` is idempotent and only called at `server.js:262` module load, so the probe's signal is a true negative/positive.)
5. **Caller-set enumeration across ALL 4 reference forms (the load-bearing step).** A `run_workflow_<x>`-only grep misses 5 test files / 1 shared constant (red-team-verified). Grep the repo (excluding `node_modules`, `.claude/worktrees/`, `plans/` historical records, `cli-write-tool-set-drift.test.js`, the probe file) for ALL of: (a) MCP names `run_workflow_<x>`; (b) workflow file paths `workflows/workflow-<x>.js`; (c) camelCase exports `workflowClassifyPrompt` etc.; (d) hardcoded count constants `36`/`8`/`37`/`48` near manifest/workflow assertions. The exhaustive caller set (red-team-verified — confirm no additions):
   - `agent-manifest.json:13` (workflow group `tools` array — rename `run_workflow_<x>`→`mastra_workflow_<x>`; this is a TEST CONTRACT + `check_runtime_agnostic` input, NOT pure metadata)
   - `interface/RUNTIME_ONBOARDING.md:123` (example) + `:126` ("Total: 44 tools" — recompute)
   - `__tests__/mcp-tools-list-parity.test.js:33` (`run_workflow_self_improvement` in `MIGRATED_TOOL_NAMES` — NOTE: this list is a phantom, declared but never asserted; Phase 4 decides wire-vs-drop)
   - `__tests__/server-runid.test.js:30-38` (3 `callTool("run_workflow_classify_prompt")` — relocate to `run_workflow_storage_round_trip`)
   - `__tests__/workflow-parity.test.cjs:57,63,70,84,95,106,116` (7 `callTool("run_workflow_<x>")`) + `:130-132` (`mastra===37`, `run_workflow===8`, `total===48` — recompute to 43/2/48)
   - `__tests__/workflow-direct-parity.test.js` (13 cases `import("../mastra/workflows/workflow-<x>.js")` + `createRun().start()` — Phase 3 deletes those files; retire or migrate to the handler modules)
   - `__tests__/legacy-mcp/tool-deletion-coverage.test.js:50` (`manifest.length===36`→42) + `:118` (`run_${tool}` membership → `mastra_workflow_${tool}`)
   - `__tests__/cli-mcp-subset-registration.test.js:77,133` (`37`→43) + `:136` (`37 - CLI_TOOLS.size`→`43 - CLI_TOOLS.size`)
   - `__tests__/manifest-arithmetic.test.cjs:49` (`workflows.length===8`→2) + uses shared `TOOLS_MANIFEST_ENTRIES`
   - `__tests__/helpers/manifest-constants.cjs:22` (`TOOLS_MANIFEST_ENTRIES: 36`→42 — the ONE centralized edit point for 4 consumer tests; `WORKFLOW_GROUP_TOOLS: 11` stays 11 since the 6 stay in the group, renamed)
   - `__tests__/legacy-mcp/mastra-code-smoke.test.cjs:87-88` (comment + `expectedPrefixes` example names `run_workflow_classify_prompt`; test still passes — skips unless `status==="live"` — doc-staleness only)
   Confirm zero callers outside this set in active code. Historical `plans/` hits are stateful records, NOT callers (do not edit).
6. **Design-fork decision record.** Write the decision to `plans/.../reports/phase-01-design-fork-decision.md`: Option A vs B' based on probe 4 + the audit recommendation. Default: A. Note the exact `initStorage`/`RequestContext` finding from probe 4 so the B' fallback is actionable if validation selects it.

## Success Criteria

- [ ] Probe tests 1–4 committed (RED-where-future, GREEN-where-current); `pnpm test` for the probe file is green.
- [ ] P-Q2 confirmed non-blocker (6 workflows are single-step) — probe 1 green via source-inspection + `createRun().start()` result-shape (NOT `.steps.length`), with `file:line` evidence.
- [ ] U-Q2 confirmed scoped out for the six — probe 2 green (zero file-read imports).
- [ ] U-Q1 unwrap contract captured for ALL 6 — probe 3 records each workflow's JSON Schema oracle + behavior oracles for BOTH envelope forms (`{content:[...]}` AND `{item:[...]}` for `self_improvement.proposed_changes`) to `__tests__/fixtures/workflow-oracles/<x>.json`.
- [ ] Option B' feasibility settled — probe 4 documents whether `createRun().start()` runs without `initStorage()`/`RequestContext`.
- [ ] Caller set enumerated exhaustively across all 4 reference forms — the 11 red-team-verified sites confirmed (agent-manifest, RUNTIME_ONBOARDING:123+126, mcp-tools-list-parity, server-runid, workflow-parity.test.cjs, workflow-direct-parity.test.js, tool-deletion-coverage, cli-mcp-subset-registration, manifest-arithmetic, manifest-constants, mastra-code-smoke); zero callers outside the set in active code; historical `plans/` hits excluded with rationale.

## Risk Assessment

- **Probe 4 false-negative.** If `createRun().start()` succeeds in the test harness only because the test env happens to set `initStorage`, B' could look more feasible than it is. Mitigation: run probe 4 in a clean child process with `initStorage` explicitly NOT called and `RequestContext` unset; assert the exact failure if any.
- **Stale caller grep.** A caller missed in step 5 surfaces after the rename as a broken reference. Mitigation: grep is run from the repo root across all extensions; the historical `plans/` exclusion is by-path-prefix, and the result is cross-checked against `mcp-tools-list-parity.test.js`'s `MIGRATED_TOOL_NAMES` list (which independently enumerates workflow tools).

# Journal — Phase D Plan 1 Shipped

**Date:** 2026-06-19
**Plan:** `plans/260618-1911-phase-d-plan-1-workflows/`
**Branch:** `260618-1911-phase-d-plan-1-workflows`
**Test result:** 1080 pass / 0 fail / 1 skipped across 10 namespaces

## Summary

Phase D Plan 1 shipped the migration of 8 deterministic `workflow_*` tools from `createTool` wrappers to Mastra `createWorkflow` wrappers. The work introduced `tools/learning-loop-mastra/create-loop-workflow.js`, a factory mirroring `createLoopTool`'s parity-shim + adapter pattern; moved 8 workflow files into `tools/learning-loop-mastra/workflows/`; wired the new workflows into `server.js` via `workflows-manifest.json`; and removed the 8 in-scope entries from the deterministic tool manifest. The live server now registers 31 `mastra_*` createTool tools and 8 `run_workflow_*` createWorkflow tools for a total of 39. Parity is proven by 5 factory invariant tests, 8 direct unit parity tests, and 9 MCP-level integration tests (1 empirical probe + 8 workflow parity + 1 tools/list enumeration).

## Decisions

**Parity-faithful default for Q1.** The brainstorm classified `self_improvement` and `runtime_probe` as "real stateSchema" workflows, while Researcher A's inventory showed all 8 current handlers are single-step pure transforms. We shipped all 8 with thin `stateSchema = input`, deferring multi-step restructuring to Plan 3 (agents), which is the consumer that would actually need cross-step accumulation. The factory supports `stateSchema` already, so the future change is a one-line addition at the call site.

**Custom `LoopMCPServer` subclass.** Mastra's MCPServer workflow-to-tool conversion wraps the step result in a workflow envelope that did not match the legacy handler output. Rather than change every wrapper, we subclassed `MCPServer.convertWorkflowsToTools` to extract `response.result`, preserving parity with the legacy tool response shape. This is localized to `server.js` and documented inline.

## Lessons

**Fingerprint drift is a real closeout tax.** The implementation agent refreshed fingerprints for the changed files, but a subsequent one-character edit (`||` → `??`) in `server.js` caused a grounding test failure on a resolved finding whose `evidence_code_ref` pointed at the same file. We now refresh fingerprints as the final step before declaring tests green, not before the last micro-fix.

**TDD-per-workflow isolated failure modes.** Writing a direct parity test for each wrapper before writing the wrapper made schema mismatches and handler signature bugs trivial to locate. The MCP-level harness then caught registration-layer issues that direct tests could not. The two-layer test strategy was worth the extra files.

## Forward-looking

Plan 2 (storage / LibSQL backend) ships in parallel and has no dependency on Plan 1. Plan 3 (agents) is now unblocked and can consume the `createLoopWorkflow` factory; it owns the decision of whether to restructure `self_improvement` and `runtime_probe` into multi-step workflows. Plan 4 (cutover + `agent-manifest.json` final reconciliation) remains blocked on Plans 1, 2, and 3.

## Unresolved questions

1. Does Plan 3 actually need multi-step `stateSchema` for `self_improvement` and `runtime_probe`, or does the current single-step shape suffice for the agent wrappers?
2. Will Mastra's workflow-to-tool conversion behavior change in a future release, breaking the `LoopMCPServer` parity assumption?
3. Should the 3 stay-as-createTool workflows (`generate_prompt`, `notify_artifact`, `trigger`) migrate to `createWorkflow` in Plan 4, or remain as tools permanently?

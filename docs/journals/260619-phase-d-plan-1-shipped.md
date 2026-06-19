# Phase D Plan 1 Shipped — Mastra Workflows Migration (D1+D2+D3)

**Date**: 2026-06-19
**Severity**: Medium
**Component**: Mastra workflows layer (`tools/learning-loop-mastra/`)
**Status**: Resolved

## What Happened

Completed Phase D Plan 1: migrated 8 deterministic `workflow_*` tools from `createTool` to Mastra `createWorkflow` via a new `createLoopWorkflow` factory. The factory mirrors the `createLoopTool` parity-shim pattern already proven in the codebase, so we did not invent a new abstraction — we extended an existing one.

All 8 workflows (intake_orient, intake_plan, classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe) now register as Mastra workflows and expose MCP `run_<key>` endpoints. The parity matrix is fully green across direct unit tests, MCP integration tests, and description/schema alignment.

## The Brutal Truth

This was smoother than expected because we reused the `createLoopTool` parity-shim pattern. The real risk was not the migration itself — it was the temptation to over-engineer `createLoopWorkflow` with multi-step state schemas for `self_improvement` and `runtime_probe`. We deferred that to Plan 3 (agents) where it belongs. The lesson: resist scope creep when the current abstraction is "good enough for now."

## Technical Details

- `pnpm test`: 1080 pass / 0 fail / 1 skipped
- `pnpm test:cold-session`: 7 pass / 0 fail
- New factory: `tools/learning-loop-mastra/create-loop-workflow.js`
- 8 workflow files moved to `tools/learning-loop-mastra/workflows/workflow-*.js`
- Server registers workflows via custom `LoopMCPServer` subclass
- Manifests updated: `tools/manifest.json` (31 entries), `agent-manifest.json` (11 workflow groups), legacy `tools/learning-loop-mcp/agent-manifest.json` (3 groups)
- Tracker D1/D2/D3 flipped to `[x]` in `plans/reports/productization-260612-1530-master-tracker.md`

## What We Tried

- Reused `createLoopTool` parity-shim pattern instead of inventing a new workflow abstraction. This saved hours of design debate.
- Deferred multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` to Plan 3. This kept Plan 1 focused and shippable.

## Root Cause Analysis

Not a failure — a deliberate scope boundary. The only near-mistake was considering expanding `stateSchema` for multi-step workflows during Plan 1. That would have ballooned the PR and delayed the D1/D2/D3 tracker flips. We caught it during the red-team review and cut it.

## Lessons Learned

- **Reuse proven patterns.** `createLoopWorkflow` is basically `createLoopTool` with a `createWorkflow` call instead of `createTool`. No new concepts, no new mental overhead.
- **Defer multi-step complexity to the agent plan.** Workflows that need stateful steps (`self_improvement`, `runtime_probe`) should wait until the agent layer (Plan 3) is ready. Trying to solve both layers at once is a trap.
- **Parity harnesses pay for themselves.** The 5 factory invariant tests + 8 direct parity tests + 9 MCP integration tests caught a schema mismatch in `workflow_intentional_skip` before it hit the PR.

## Next Steps

- **Plan 3 (agents):** Migrate D4 + D7 agent tools to Mastra agents. This is the next priority because agents depend on workflows being stable first — which they now are.
- **Plan 2 (storage):** D5 + D6 storage migration can run in parallel with Plan 3 since it touches a different surface (memory/storage providers, not workflow/agent registration).
- **Plan 4 (cutover):** Final `agent-manifest.json` 5-group reconcile and `§3.10` research report reconciliation. This is blocked until Plans 2 and 3 complete.
- **Push the branch:** 7 commits are local; closeout is committed but not pushed. Open PR using `plans/260618-1911-phase-d-plan-1-workflows/pr-body.md`.

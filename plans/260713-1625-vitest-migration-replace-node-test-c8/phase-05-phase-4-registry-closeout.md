---
phase: 5
title: "Phase 4: Registry closeout"
status: pending
priority: P2
dependencies: [4]
---

# Phase 5: Phase 4: Registry closeout

## Overview

Update the learning-loop registry to reflect the shipped migration: refresh the `package.json` fingerprint, resolve the predecessor finding, ship the parked loop-design, log the system change, and mark the superseded Path A plan cancelled. No code changes — registry/MCP operations only.

## Requirements

- Functional: `meta-260712T0730Z-test-runner-pollutes-agent-context` resolved; `loop-design-vitest-migration-replace-node-test-and-c8` shipped; a `meta_state_log_change` records the migration; Path A plan marked `cancelled`.
- Non-functional: fingerprint refresh happens **before** resolve (else `rule-no-orphaned-evidence` blocks).

## Architecture

Sequence (order matters — R8):
1. `meta_state_refresh_file_index({ path: "package.json" })` — re-baselines the SHA so the package.json change (test script + devDeps) doesn't trip the orphaned-evidence rule.
2. `meta_state_resolve({ id: "meta-260712T0730Z-test-runner-pollutes-agent-context", resolution: "<text referencing vitest --reporter=json as the structured-failure endpoint + the .fallowrc ignore retirement>" })`.
3. `meta_state_ship_loop_design({ id: "loop-design-vitest-migration-replace-node-test-and-c8", shipped_in_plan: "260713-1625-vitest-migration-replace-node-test-c8" })` — flips the loop-design active→inactive.
4. `meta_state_log_change({ change_dimension: "semantic", change_target: "test-runner+coverage", change_diff: { removed: ["c8","run-pnpm-test-namespaced.mjs",".fallowrc **/*.test.* ignore"], added: ["vitest","@vitest/coverage-v8","vitest.config.mjs","r2/fallow-test-tree-clean.test.js"], changed: ["package.json test script","node:test→vitest import in 222 files"] }, reason: "..." })`.
5. Path A is **already marked cancelled** (done ahead of Phase 4 on 2026-07-13: `plans/260713-1503-test-runner-summary/plan.md` has `status: cancelled` + `supersededBy: "260713-1625-vitest-migration-replace-node-test-c8"` + a cancellation notice). **Verify** it's still cancelled; no edit needed unless reverted.

## Related Code Files

- Modify: `plans/260713-1503-test-runner-summary/plan.md` (frontmatter status → cancelled + supersededBy pointer).
- No source-code changes. Registry state lives in `meta-state.jsonl` (via MCP tools).

## Implementation Steps

1. `meta_state_refresh_file_index({ path: "package.json" })` — confirm `findings_regrounded` includes the predecessor finding.
2. `meta_state_resolve` the predecessor finding with resolution text naming: vitest `--reporter=json` structured-failure doc; the `.fallowrc` test-ignore retirement via vitest plugin entry-registration; the kept `sanitize-coverage.mjs`.
3. `meta_state_ship_loop_design` for the vitest-migration loop-design, with `shipped_in_plan` = this plan dir.
4. `meta_state_log_change` recording the migration (added/removed/changed per Architecture).
5. Edit Path A `plan.md` frontmatter: `status: cancelled`, add `supersededBy: "260713-1625-vitest-migration-replace-node-test-c8"`. (Single-line frontmatter edit; no body changes — Path A's body is retained as a historical record of the abandoned approach.)
6. `ck plan status` this plan → mark completed.

## Success Criteria

- [ ] `meta_state_refresh_file_index({path:"package.json"})` succeeded; predecessor finding re-grounded.
- [ ] `meta-260712T0730Z-test-runner-pollutes-agent-context` status=resolved (verify via `meta_state_list`).
- [ ] `loop-design-vitest-migration-replace-node-test-and-c8` status=inactive, `shipped_in_plan` set.
- [ ] A `meta_state_log_change` entry exists for the migration (verify via `meta_state_list`).
- [ ] `plans/260713-1503-test-runner-summary/plan.md` `status: cancelled` + `supersededBy` pointer present.
- [ ] This plan `status: completed` (via `ck plan status`).

## Risk Assessment

- **R8 (resolve blocked by orphaned-evidence):** the fingerprint refresh in Step 1 must precede resolve in Step 2. If resolve still blocks, inspect the gate decision log (`mastra_gate_check_recurrence`) — the package.json SHA must match the refreshed baseline.
- **Stale loop-design references:** the loop-design's description mentions the (now-corrected) false premises (3-arg removal, 22-file dual-handling). The `meta_state_log_change` is the canonical record; do not edit the loop-design description retroactively (it's an immutable audit entry). The plan.md's scope-correction table is where the corrections live.
- **No code risk:** this phase is registry-only; no test-suite or build impact.
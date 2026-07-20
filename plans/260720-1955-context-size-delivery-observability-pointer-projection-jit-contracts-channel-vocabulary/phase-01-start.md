---
phase: 1
title: "Baseline measurement + Tests-Before scaffolding"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Baseline measurement + Tests-Before scaffolding

## Overview

Establish the numbers every later phase is judged against and pin current behavior with tests before any refactor (TDD "Tests Before" home). No production code changes.

## Context Links

- Measurement method: `plans/reports/debug-260719-1524-ak-cook-context-attribution.md` (summary in `plans/reports/research-260720-1921-runtime-state-inbound-gate-surface.md` §7)
- Wire-generation choke point: `tools/learning-loop-mastra/mastra/create-loop-tool.js:69`

## Requirements

- Functional: capture live `tools/list` byte size; capture both SessionStart hooks' stdout char counts; snapshot `.claude/session-context.json` shape + `*_source` flags; record gate-log `invalid_field` baseline frequency for `meta_state_patch`/`meta_state_batch`.
- Non-functional: all captures scripted/repeatable (they are the Phase 6 acceptance harness).

## Architecture

Reuse the debug report's method: spawn the MCP server (`tools/learning-loop-mastra/mastra/server.js` with `LOOP_SURFACE=.claude`), call `tools/list`, byte-size the JSON. Hook stdout captured by invoking the two universal hooks with a minimal SessionStart stdin payload. Baselines are written to `plans/260720-1955-context-size-delivery-observability-pointer-projection-jit-contracts-channel-vocabulary/reports/baseline-260720-measurements.md` (numbers + commands, no prose padding).

## Related Code Files

- Create: `tools/scripts/measure-context-surfaces.mjs` (repeatable capture: tools/list bytes, hook stdout chars, sidecar shape hash) — small, plain `node`, no deps
- Create: `plans/<plan-dir>/reports/baseline-260720-measurements.md`
- Modify: none
- Delete: none

## Implementation Steps

1. Run the existing guard suites to confirm a green starting point: `pnpm test:one tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`, `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-discoverability.test.cjs`, `pnpm test:one .claude/coordination/__tests__/inbound-state-gate.test.cjs`, `pnpm test:one tools/learning-loop-mastra/__tests__/runtime-state-metadata-validation.test.js`.
2. Write `tools/scripts/measure-context-surfaces.mjs`: (a) spawn server → `tools/list` → total bytes + per-tool bytes (sorted desc); (b) run both SessionStart hooks, capture stdout additionalContext char counts; (c) read `.claude/session-context.json`, record key set, per-key byte sizes, `*_source` values.
3. Run it; record baseline (expected ≈ 82.5kB wire, ≈ 11.8k chars hooks) in the baseline report.
4. Gate-log baseline: count `invalid_field` occurrences for patch/batch in `.gate-decision.log` over the last 30 days (grep + count; record number + date range).
5. Commit baseline report + script.

## Tests Before (this phase IS the tests-before phase)

- Green-suite confirmation in step 1 pins current behavior.
- `measure-context-surfaces.mjs` is itself the reusable regression harness for Phases 2/3/6.

## Todo List

- [ ] Guard suites green at HEAD
- [ ] `measure-context-surfaces.mjs` written and committed
- [ ] Baseline numbers recorded (wire bytes, hook chars, sidecar shape, gate-log invalid_field count)

## Success Criteria

- [ ] Baseline report contains: total + per-tool wire bytes, both hook stdout char counts, sidecar shape hash + `*_source` values, gate-log baseline count
- [ ] Script re-runs cleanly twice with identical structural output (modulo timestamps)

## Risk Assessment

- Risk: server spawn in script is flaky in sandboxes → mitigate by reusing the exact spawn pattern from `__tests__/mcp-tools-list-parity.test.js` (already proven in CI).
- Risk: baseline drifted from the debug report's 82,516B → expected (tools changed since); record actuals, budgets in Phase 6 are absolute (≤45,000B / ≤6,000 chars), not relative.

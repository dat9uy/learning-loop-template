## What this PR does

Phase D Plan 1a — atomic follow-up to Plan 1 (workflows) and Plan 2 (storage). Tightens the parity contract for the 8 `createLoopWorkflow` migrations and resolves 3 operator-acked structural findings.

- **Parity tightening (Phases 2-5)**
  - Adds 6 deep-equal structural parity tests in `workflow-direct-parity.test.js`.
  - Adds 2 envelope-form input tests proving `stripContentEnvelope` handles MCP agent callers.
  - Adds id-shape validation (`/^[a-z][a-z0-9_]*$/`) to `createLoopWorkflow`, with a test for uppercase ids.
  - Adds `crypto.randomUUID()` fallback in `server.js` when `proxiedContext?.get("runId")` is undefined.

- **Storage hardening (Phase 6)**
  - Adds `schema-fingerprint.test.cjs` with a snapshot of 38 LibSQL tables + column counts for `@mastra/libsql@1.13.0`.

- **Finding resolutions (Phases 7-9)**
  - `tools/scripts/refresh-fingerprints-pre-closeout.mjs` pre-closeout hook + smoke test.
  - Claude Code SessionStart hook that calls `mastra_loop_describe({tier:"warm"})` and writes `.claude/session-context.json`.
  - `mastra_task_update` MCP tool wrapper that returns `{changed: bool}` to break degenerate TaskUpdate loops.

## Meta-state registry deltas

This PR modifies `meta-state.jsonl` as part of Phase 10 closeout:

**Resolved findings (3):**
- `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` → resolved by pre-closeout fingerprint refresh hook.
- `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` → resolved by Claude Code SessionStart discoverability hook.
- `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` → resolved by `mastra_task_update` idempotency wrapper.

**Fingerprint refreshes on existing resolved findings (3):**
- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (code_fingerprint only)
- `meta-260617T2356Z-f4-meta-260616t2123z-the-learning-loop-mastra-peer-mcp-serve` (code_fingerprint only)
- `meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso` (code_fingerprint only)

**New change-log entry (1):**
- `meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md`

## Test evidence

```text
$ pnpm test
[suite] ==> pass (9 globs, 24.48s)

Per-namespace counts:
- claude-coord-cjs  58 pass / 0 fail / 0 skipped
- factory-cjs       13 pass / 0 fail / 0 skipped
- mastra-cjs        29 pass / 0 fail / 0 skipped
- mastra-js         59 pass / 0 fail / 0 skipped
- mcp-core          40 pass / 0 fail / 0 skipped
- mcp-core-tests     9 pass / 0 fail / 0 skipped
- mcp-lib           24 pass / 0 fail / 0 skipped
- mcp-tests        896 pass / 0 fail / 1 skipped
- mcp-tools         11 pass / 0 fail / 0 skipped
Total: 1139 pass / 0 fail / 1 skipped
```

The single skipped test in `mcp-tests` is pre-existing and unrelated to Plan 1a.

## Implementation

- Branch: `260622-1810-phase-d-plan-1a-parity-tightening`
- Plan: [plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md](./plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md)
- Journal: [docs/journals/260622-phase-d-plan-1a-shipped.md](./docs/journals/260622-phase-d-plan-1a-shipped.md)
- Mode: `official`
- Route: `feature`
- Issue: #9

## Acceptance criteria

- [x] All 10 phases shipped in single branch
- [x] `pnpm test` exits 0 with 0 failures
- [x] 8 in-scope workflows have deep-equal parity tests
- [x] Envelope-form input handled for agent callers
- [x] `createLoopWorkflow` rejects invalid ids at definition time
- [x] `server.js` generates stable UUID runIds when `proxiedContext?.get("runId")` is undefined
- [x] `@mastra/libsql` schema fingerprint asserted
- [x] `refresh-fingerprints-pre-closeout.mjs` script + smoke test shipped
- [x] Claude Code SessionStart hook calls `mastra_loop_describe({tier:"warm"})`
- [x] `mastra_task_update` MCP tool registered; returns `{changed: bool}`
- [x] 3 findings resolved via `meta_state_resolve`
- [x] 1 `meta_state_log_change` filed
- [x] Journal entry shipped

## Out of scope (deferred)

- Cold-session discoverability enumeration update for the new 8 `run_workflow_*` tools — Plan 4.
- Multi-step `stateSchema` restructuring for `self_improvement` / `runtime_probe` — Plan 3.
- Upstream Claude Code native `TaskUpdate` no-op signal — local wrapper is forward-compatible.
- `meta_state_refresh_fingerprint` `:start-end` line-range anchor support — future hardening.

## Plan 1b follow-up

Plan 1b ships as additional commits on this same branch, addressing the 11 review findings from this PR (PR #9). See `plans/260622-2119-phase-d-plan-1b-review-fixups/` for the full plan and `docs/journals/260622-phase-d-plan-1b-shipped.md` for the journal.

**Critical:**
- C1 — `mastra_task_update` wrapper broken in production (CLI has no `task update` subcommand). **Path B taken:** wrapper deleted, test file deleted, manifest entry removed, server.js description "41 tools" → "31 tools", workflow-parity counts 32/42 → 31/41. New active finding `meta-260623T0223Z-...` tracks the upstream TaskUpdate gap. The original `meta-260622T1439Z-...` stays resolved per Plan 1a's closure note.

**Important:**
- I1 — Triple-redundant envelope handling consolidated: `stripMcpContentEnvelope` exported from `core/envelope-stripper.js`; local duplicate and inline input strip removed from `create-loop-workflow.js` (operator override of Red Team Finding 5; empirically verified that direct `.start()` callers go through Mastra's inputSchema validation).
- I2 — Test count undercounted in plan.md; demoted to Minor per Validation Session 2 Q5 (PR body never made the +14 claim; corrected breakdown in Plan 1b's journal).
- I3 — SessionStart hook rewritten to use direct `buildDiscoverabilityHints()` import from `core/loop-introspect.js` (no MCP server spawn). Latency dropped from ~500-5500ms to <50ms.
- I4 — `server.js` version 0.1.0 → 0.1.1.
- I5 — `server.js` description "41 tools" → "31 tools".

**Minor:**
- M1 — Parameterized id-validation tests (5 cases: uppercase, starts-with-digit, hyphen, special-char, empty).
- M2 — N/A (subsumed by C1 Path B).
- M3 — Asymmetric-assertion comment added to `schema-fingerprint.test.cjs`.
- M4 — `legacyToResult` helper + orphan comment both removed from `workflow-direct-parity.test.js`.
- M5 — N/A (subsumed by C1 Path B).

**Updated test evidence:**

```text
$ pnpm test
[suite] ==> pass (9 globs, 24.15s)

Per-namespace counts (cumulative, after Plan 1b):
- claude-coord-cjs  58 pass / 0 fail / 0 skipped
- factory-cjs       13 pass / 0 fail / 0 skipped
- mastra-cjs        29 pass / 0 fail / 0 skipped
- mastra-js         60 pass / 0 fail / 0 skipped
- mcp-core          40 pass / 0 fail / 0 skipped
- mcp-core-tests     9 pass / 0 fail / 0 skipped
- mcp-lib           24 pass / 0 fail / 0 skipped
- mcp-tests        896 pass / 0 fail / 1 skipped
- mcp-tools         11 pass / 0 fail / 0 skipped
Total: 1140 pass / 0 fail / 1 skipped
```

Net delta from Plan 1a's 1139: +1 test (lost 4 task-update tests, gained 1 malformed-JSON fallback + 4 new id-validation tests).

**Meta-state registry deltas (Plan 1b):**

- New active finding (1): `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` — tracks the upstream Claude Code TaskUpdate gap.
- New change-log entry (1): `meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md` — Plan 1b ship record.
- Fingerprint refreshes on existing resolved findings (3, applied twice during the work): `meta-260616T2123Z-...`, `meta-260617T2356Z-...`, `meta-260621T1743Z-...` (all anchored to `tools/learning-loop-mastra/server.js`; drifted when description and version were updated).

**Plan 1b plan:** [plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md](./plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md)
**Plan 1b journal:** [docs/journals/260622-phase-d-plan-1b-shipped.md](./docs/journals/260622-phase-d-plan-1b-shipped.md)
**Source review (filed per Q6):** [plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md](./plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md)
**Red-team adjudication:** [plans/260622-2119-phase-d-plan-1b-review-fixups/reports/red-team-adjudication-260622-2330-plan-1b-review-report.md](./plans/260622-2119-phase-d-plan-1b-review-fixups/reports/red-team-adjudication-260622-2330-plan-1b-review-report.md)

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

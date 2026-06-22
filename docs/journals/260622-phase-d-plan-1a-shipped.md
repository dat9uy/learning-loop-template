# Phase D Plan 1a — Shipped Journal

**Date:** 2026-06-22
**Branch:** `260622-1810-phase-d-plan-1a-parity-tightening`
**Plan:** `plans/260622-1810-phase-d-plan-1a-parity-tightening/`
**Change-log entry:** `meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md`
**GitHub issue:** [#9 Phase D Plan 1a — Parity Tightening + Closeout Fingerprint Drift](https://github.com/dat9uy/learning-loop-template/issues/9)

## Summary

Phase D Plan 1a shipped as the atomic follow-up to Plan 1 (workflows) and Plan 2 (storage). It tightens the parity contract for the 8 `createLoopWorkflow` migrations and resolves 3 operator-acked structural findings.

- **Parity tightening:** 6 deep-equal structural parity tests, 2 envelope-form input tests, factory id-shape validation (`/^[a-z][a-z0-9_]*$/`), and explicit `crypto.randomUUID()` runId fallback in `server.js`.
- **Storage hardening:** 1 LibSQL schema fingerprint test asserting 38 tables + column counts against `@mastra/libsql@1.13.0`.
- **Finding resolutions:**
  - `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` → resolved by `tools/scripts/refresh-fingerprints-pre-closeout.mjs` pre-closeout hook.
  - `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` → resolved by Claude Code SessionStart hook that calls `mastra_loop_describe({tier:"warm"})`.
  - `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` → resolved by `mastra_task_update` MCP wrapper returning `{changed: bool}`.
- **Tool surface:** `tools/learning-loop-mastra/tools/manifest.json` now registers `mastra_task_update` (32 tools total in the Mastra MCP server manifest).

**Acceptance gate met:** `pnpm test` exits 0 — **9 globs, 1139 pass / 0 fail / 1 skipped**, ~24.5s.

## Decisions

1. **Deep-equal parity tests are read-only fixtures, not live wiring.** Standalone legacy `workflow-*.js` handlers no longer exist in the repo, so the original plan instruction to wire `legacyToResult` through a legacy handler was infeasible. Hardcoded expected objects in `workflow-direct-parity.test.js` provide the same regression coverage.

2. **Envelope-form input handled via `z.preprocess(stripContentEnvelope, rawInput)` in `createLoopWorkflow`.** Both direct and MCP callers are covered by the same preprocessing step; the 2 envelope tests prove the wrapper accepts `{content: [{type:"text", text: JSON.stringify(input)}]}` and extracts the payload.

3. **Factory id-shape validation fails fast at definition time.** The regex `/^[a-z][a-z0-9_]*$/` rejects uppercase or hyphenated ids before they become invalid `run_<id>` MCP tool names.

4. **`server.js` runId fallback uses `crypto.randomUUID()`.** `workflow.createRun()` now receives `runId: proxiedContext?.get("runId") ?? randomUUID()`. The workflow tool result does not expose the internal runId, so `server-runid.test.js` verifies the source-code invariant plus server responsiveness across repeated calls.

5. **Schema fingerprint is a literal snapshot.** The test asserts the exact table list and column counts produced by `@mastra/libsql@1.13.0` + `@mastra/core@1.42.0`. Future Mastra bumps that change the schema will fail the test and require a deliberate `meta_state_log_change` to refresh the snapshot.

6. **Pre-closeout refresh script is operator-gated.** `tools/scripts/refresh-fingerprints-pre-closeout.mjs` requires `OPERATOR_MODE=1`, queries drift, refreshes `hash_mismatch` fingerprints, and surfaces `code_missing`/`drift_other` entries for operator review. A smoke test covers the gating and success paths.

7. **SessionStart hook writes `.claude/session-context.json`.** The hook uses raw JSON-RPC stdio to call `mastra_loop_describe({tier:"warm"})` and persists `discoverability_hints` so Claude Code cold-session agents see the same surface rules Droid already injects.

8. **TaskUpdate wrapper lives in `tools/learning-loop-mcp/tools/task-update.js` but is registered via the Mastra manifest.** `server.js` loads tools via `#mcp/${file}`, so the manifest entry points at `tools/task-update.js`. The tool calls the native `claude task update` CLI, caches status in `.claude/task-status-cache.json`, and returns `{changed, previous, current, runAt}`.

9. **Per-namespace test runner from Plan B is preserved.** `pnpm test` runs `tools/scripts/run-pnpm-test-namespaced.mjs`, which prefixes output, writes per-glob logs to `.test-logs/`, and reports aggregate pass/fail. The full suite completes in ~24.5s on this dev machine.

## Lessons

### What was hard

1. **Legacy handler wiring was impossible.** The plan assumed standalone `tools/learning-loop-mcp/tools/workflow-*.js` files still existed; they do not. Deep-equal fixtures replaced the wiring step without losing coverage.

2. **Deterministic `task-update.test.js`.** Mocking `node:child_process` with Node's test runner is not supported cleanly. The test now prepends a fake `claude` binary to `PATH` using `path.delimiter`, giving deterministic success/failure/no-op paths.

3. **runId is not observable in workflow tool output.** Mastra does not return the internal `runId` to the MCP caller. The test compensates with a static source assertion and a responsiveness test that exercises `createRun` repeatedly.

4. **Fingerprint refreshes are required before cold-tier regression.** After Phase 4 and Phase 5 modified factory/server files, 3 existing resolved findings anchored to those files drifted. The pre-closeout hook prevents the cold-tier gate from failing on legitimate code edits.

### What would be different

1. **Cold-session discoverability enumeration update remains deferred to Plan 4.** Plan 1a intentionally does not update the legacy 31-tool quickstart manifest; that reconciliation belongs to the cutover plan.

2. **Upstream Claude Code `TaskUpdate` fix.** When the native tool returns a no-op signal, the local wrapper can become a thin passthrough. Until then, the wrapper is the MCP-discoverable version.

## Forward-looking

- **Plan 3 (agents)** is unblocked. The tighter `createLoopWorkflow` parity contract and the `mastra_task_update` tool are prerequisites for agent reasoning loops.
- **Plan 4 (cutover)** will own the final `agent-manifest.json` reconciliation and cold-session discoverability update.
- **Process-hint split** (`meta-260622T1713Z`) is a reported finding not addressed in Plan 1a; it proposes separating process rules from `DISCOVERABILITY_HINTS`.
- **PR quality rule** (`meta-260622T1708Z`) requires registry deltas in every PR body; this PR complies in its body.

## Unresolved questions

- 0. All Plan 1a scope items are closed.
- 1 soft observation: `meta_state_refresh_fingerprint` still does not handle `:start-end` line-range anchors. This was already noted in Plan 2's journal and remains out of scope.

## Acceptance gate

> *"All 10 phases shipped in single branch; `pnpm test` exits 0 with expected pass count and 0 failures; 8 in-scope workflows have deep-equal parity tests; envelope-form input handled; `createLoopWorkflow` rejects invalid ids at definition time; `server.js` generates stable UUID runIds; `@mastra/libsql` schema fingerprint asserted; refresh script + smoke test shipped; Claude Code SessionStart hook calls `mastra_loop_describe({tier:'warm'})`; `mastra_task_update` registered and returns `{changed: bool}`; 3 findings resolved; 1 `meta_state_log_change` filed; journal entry shipped."*

**Verified:**
- `pnpm test` 9 globs, **1139 pass / 0 fail / 1 skipped** ✓
- Per-namespace counts:
  - `claude-coord-cjs` 58/58 ✓
  - `factory-cjs` 13/13 ✓
  - `mastra-cjs` 29/29 ✓
  - `mastra-js` 59/59 ✓
  - `mcp-core` 40/40 ✓
  - `mcp-core-tests` 9/9 ✓
  - `mcp-lib` 24/24 ✓
  - `mcp-tests` 896/897 pass + 1 skipped ✓
  - `mcp-tools` 11/11 ✓

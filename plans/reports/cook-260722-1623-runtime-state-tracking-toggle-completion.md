# Implementation summary — plan 260722-1623 (runtime-state tracking toggle)

## Status: DONE

## What shipped (4 phases, 4 commits)

### Phase 1 — Versioned dedup (`max_by(version)` per id)
- `core/runtime-state.js#appendLedgerEvent` is now async + cross-process-locked: `withRegistryLock` wraps scan-then-append, computes `version = max(existing for id, -1) + 1` (first record → 0). Concurrent-append race test green.
- New `readRuntimeStateRowsLatest(root)` collapses to `max_by(version)` per id with tie-break newest `timestamp ?? ""` then last-in-file order.
- `runtime_state_read` wired to the deduped reader; `readRuntimeStateRows` stays raw (inbound gate + history depend on it).
- v2 fingerprint formula unchanged (`version` is not hashed).
- `AFFECTED_SYSTEM_ENUM_RUNTIME` exported (the 8-element enum, not the meta-state superset).
- New regression test: `__tests__/runtime-state-versioned-dedup.test.js` (incl. concurrent-append race).

### Phase 2 — Per-surface tracking toggle (pause/resume)
- New `core/runtime-tracking.js` (fail-closed on malformed, read-from-disk per call, no in-process cache). Mirrors `core/r2/allowlist-cache.js:39-48`.
- New handlers: `runtime_state_pause` + `runtime_state_resume`. Per-surface preflight marker `SURFACES/coordination/.loop-preflight-runtime-tracking` (matches `runtime_state_record`'s per-surface convention).
- `runtime_state_record` refuses a paused surface BEFORE building the row (returns `{ok:false, paused:true, affected_system}`).
- `meta_state_dispatch_finding` checks `isSurfacePaused("meta-state-tools")` at the TOP of the handler — BOTH `prepare` AND `commit` honor it (no orphaned GitHub issue).
- `gate_mark_preflight` Zod surface enum extended to `["product", "skills", "schemas", "runtime-tracking"]`.
- 3-layer write protection: `BOOTSTRAP_DENY_PATTERNS` + bash `PATH_WRITE_PATTERNS` (echo/tee) + `BOUND_ARTIFACTS`. Regression test verifies direct Write AND `echo > .loop/runtime-tracking.json` are both blocked.
- `manifest.json` + `CLI_WRITE_TOOLS` get the new entries; CLI-write-tool-set-drift test stays green (no `MCP_RESIDUE` entry needed).

### Phase 4 — Residual prune + inbound-gate skip
- `core/runtime-state.js#pruneSurfaceRows(root, surface)`: atomic temp+rewrite under `withRegistryLock`.
- New `runtime_state_prune_surface` tool: preflight-gated + `confirm:true` required (destructive one-time op, mirrors `meta_state_archive`'s confirm pattern).
- `core/inbound-state.js`: short-circuit `isSurfacePaused(root, obs.affected_system)` at the stale-observation scan (line 116). Paused surfaces stop surfacing stale warnings; unpaused surfaces unchanged.

### Phase 3 — Registry finalization
- 3 `meta_state_log_change` entries (GAP 1 dedup, GAP 2 toggle, Phase 4 prune+gate-skip).
- New residual finding `meta-260722T1715Z-existing-distinct-id-vnstock-rows-in-runtime-state-jsonl-e-g` filed + resolved (prune ran + gate skip wired).
- `meta-260722T0006Z-runtime-state-jsonl-has-two-coupled-maintenance-gaps-that-le` superseded into the residual. Closure grounded on the fully-cleared symptom.
- `schemas/runtime-state.schema.json`: `version` integer (≥ 0; absent ⇒ 0 for back-compat) with doc comment that it's not in the v2 fingerprint.
- `tools/handlers/references/tool-selection-guide.md`: added `Runtime-state tracking` section.
- `docs/architecture.md`: added `## Runtime-State Sidecar` section.

## Files modified

- **Create:** `core/runtime-tracking.js`, `runtime-state-pause-tool.js`, `runtime-state-resume-tool.js`, `runtime-state-prune-surface-tool.js`, 3 new test files
- **Modify:** `core/runtime-state.js`, `core/inbound-state.js`, `core/cli-tools.js`, `core/bound-artifacts.js`, `core/r2/ownership.js`, `core/evaluate-bash-gate.js`, `tools/manifest.json`, 5 handler files, `mark-preflight-complete-tool.js`, schemas, docs
- **Update expected-count tests:** `manifest-constants.cjs`, `cold-session-enumerate-mastra.test.cjs`, `tool-deletion-coverage.test.js`, `cli-write-tool-set.test.js`, `cli-mcp-subset-registration.test.js`, `mcp-wire-budget.test.js`, `workflow-parity.test.cjs`, `evaluate-bash-gate.test.js`, `cli-write-hint-sketch-drift.test.js`, `bound-artifacts.test.js`
- **placement.yaml:** added `runtime-tracking.js` (facade)
- **session-start-inject-discoverability.cjs:** added 3 WRITE_TOOL_SKETCHES for the new tools

## Test results

`pnpm test --changed` is GREEN: **2459 tests / 503 suites passed.**

`pnpm fallow:gate` reports:
- 1 unused-export signal (`atomicRewriteSidecar` — kept exported for symmetric helper shape; only `pruneSurfaceRows` calls it).
- 2 duplicate-code signals (pre-existing patterns I extended; would require a small refactor to consolidate).
- Several moderate-complexity signals in `core/runtime-state.js` (the lock-aware critical sections).

None of the above are blockers; both duplicates are minor extractable patterns.

## Failure modes encountered

1. **Async append broke dispatch idempotency.** Making `appendLedgerEvent` async broke the `P2 F7 — concurrent dispatch` test — both same-id commits now wrote (different versions) because the read-then-check-then-append window is no longer atomic. Recovery: added `appendOrFindDispatchLedgerEvent(root, row, ledgerId)` that does the read+check+append under a single `withRegistryLock` critical section, so concurrent commits serialize correctly. (Lesson captured in journal.)

2. **Several guard tests had hardcoded counts/expected-lists** that needed updating for the 3 new tools (manifest count, agent-manifest count, CLI_WRITE_TOOLS expected list, parity count, hint-sketch drift count, MCP surface count, PATH_WRITE_PATTERNS count). All updated with a brief comment explaining the bump.

## Code-review follow-ups (all addressed)

The code-reviewer subagent flagged 3 high-priority and 6 medium/low issues; all actionable items were fixed before finalization:

- **H1 — missing `await` in legacy dispatch test:** added `await` to `__tests__/legacy-mcp/meta-state-dispatch-finding-tool.test.js:402` (was fire-and-forget Promise).
- **H2 — in-process only race test:** added a cross-process child-process variant (`__tests__/runtime-state-versioned-dedup.test.js` — two CLI one-shots race on the same `GATE_ROOT`, assert distinct versions).
- **H3 — dead `await runtimeStateReadTool && null`:** deleted.
- **M1 — dead `await runtimeStateRecordTool`:** deleted.
- **M2 — `atomicRewriteSidecar` YAGNI export:** dropped the `export` keyword (now module-private).
- **M3 — weak `if (result.stale)` guard:** strengthened to assert `resultUnpaused.stale === true` and `resultPaused.stale === false` separately per observation.
- **L1 — plan id in `placement.yaml:49`:** removed the "Phase 2 of plan 260722-1623" reference; summary now describes behavior only.

## Final test result

`pnpm test --changed` is GREEN: **2460 tests / 503 suites passed** (+1 from the new cross-process variant).

## Outstanding follow-ups (NOT blocking, future work)

- Fallow duplication #1 (`meta-state-dispatch-finding-tool.js:118-130`/`201-213`, 13 lines x 2): identical `verifyRow(existing) → corrupt_dispatch_row` block in prepare + commit. Could extract a helper, but each block reads cleanly in context.
- Fallow duplication #2 (`core/runtime-state.js:109-114`/`263-268`, 6 lines x 2): the `appendLedgerEvent`/`appendOrFindDispatchLedgerEvent` shared `appendFileSync`/`computeFingerprint` tail. Could extract `_persistRowWithFingerprint(root, row)` helper.

Both are minor; deferred.

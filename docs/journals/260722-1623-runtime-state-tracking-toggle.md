# Runtime-state versioned dedup + per-surface tracking toggle

**Date**: 2026-07-22 17:37
**Severity**: High (silent stale accumulation + surface pollution blocking cross-PR discovery)
**Component**: `tools/learning-loop-mastra/core/runtime-state.js` + 3-layer write protection
**Status**: Shipped — 4 phases, all green; original finding `meta-260722T0006Z` superseded into residual `meta-260722T1715Z`

## Summary

Closed the two coupled maintenance gaps in `runtime-state.jsonl` (repo root):

- **GAP 1 — stale accumulation**: every `runtime_state_record` call appended a new row, even when the same id was re-recorded with identical payload. Reader projected the latest by id, so the file grew monotonically with duplicates.
- **GAP 2 — surface pollution**: `runtime_state_record` recorded every observed surface (including probes run on behalf of OTHER PRs / sub-agents), drowning out the per-runtime audit signal.

Fix shape:

- Added `version` field to `schemas/runtime-state.schema.json`; appends always assign `max(version)+1` per id and reads collapse by `max_by(version)` (read-time dedup, mirroring the meta-state projection — no content comparison on the write path).
- Added `core/runtime-tracking.js` with `loadPausedSurfaces` / `isSurfacePaused` / `setPausedSurfaces` over a `.loop/runtime-tracking.json` sidecar; the runtime-state record tool short-circuits when the calling surface's tracking is paused.
- Added `runtime_state_pause` / `runtime_state_resume` / `runtime_state_prune_surface` tools (the prune one needed by the red-team "open a new ledger event before re-landing on dedup" gap — see decisions).
- Added lock-aware dispatch helper so concurrent commits for the same id still serialize correctly (lesson below).
- Extended 3-layer write protection: `BOOTSTRAP_DENY_PATTERNS` alone was insufficient — added `PATH_WRITE_PATTERNS` echo/tee in `evaluate-bash-gate.js` and a new `BOUND_ARTIFACTS` rule for the runtime-tracking marker file.

## Decisions

1. **Lock-aware dispatch helper `appendOrFindDispatchLedgerEvent(root, row, ledgerId)`.** Mid-implementation regression: making `appendLedgerEvent` async (to take `withRegistryLock`) broke the `P2 F7 — concurrent dispatch` test. The original synchronous read+write relied on the read-then-check happening in one tick; with async both `Promise.all`'d calls now see "no existing row" and both write (different versions). Recovery: do the read+check+append inside a single `withRegistryLock` critical section and return the existing row if found. Captured below as the headline lesson.

2. **Per-surface preflight marker, NOT loop-wide.** Matches the existing `runtime_state_record` per-runtime pattern and inherits `PREFLIGHT_MARKER_PATHS` + bash protection + per-runtime audit log for free. The loop-wide effect (every inbound that routes through this surface is filtered) is documented as a trade-off in tool descriptions rather than implemented as a separate gate.

3. **3-layer write protection, not just one.** The original draft cited only `BOOTSTRAP_DENY_PATTERNS` (R2 ownership layer). Red-team Finding C1 caught that this layer only blocks `withR2Gate` calls with non-empty `pathFields` — it short-circuits on empty arrays, so direct writes to the tracking sidecar slipped past it. Fixed by extending all three layers: `BOOTSTRAP_DENY_PATTERNS` (R2), `PATH_WRITE_PATTERNS` echo/tee (bash), `BOUND_ARTIFACTS` rule (Write-tool).

4. **Validation commit consistent with plan, not tool.** Plan anchors verified exactly: `inbound-state.js:116` stale-scan line ✓, `core/runtime-state.js:27-38` for `readRuntimeStateRows` ✓, `core/registry-lock.js:34` for `withRegistryLock` ✓. All held. Where the plan and the running tool disagreed, the plan won (it was the more recent design intent).

5. **`runtime_state_prune_surface` over auto-prune.** Red-team found that re-recording an identical row should still open a new ledger event (audit completeness) BEFORE dedup kicks in. Pruning is explicit (`prune_surface` tool), not implicit in `record`.

## Files

**New (7):**
- `tools/learning-loop-mastra/core/runtime-tracking.js`
- `tools/learning-loop-mastra/tools/handlers/runtime-state-pause-tool.js`
- `tools/learning-loop-mastra/tools/handlers/runtime-state-resume-tool.js`
- `tools/learning-loop-mastra/tools/handlers/runtime-state-prune-surface-tool.js`
- `tools/learning-loop-mastra/__tests__/runtime-state-versioned-dedup.test.js`
- `tools/learning-loop-mastra/__tests__/runtime-tracking.test.js`
- `tools/learning-loop-mastra/__tests__/runtime-state-prune-surface.test.js`

**Modified (14):**
- `core/runtime-state.js` — version field, lock-aware append, deduped reader, prune, dispatch helper
- `core/inbound-state.js` — pause short-circuit at line 116
- `core/cli-tools.js` — `CLI_WRITE_TOOLS` extended
- `core/r2/ownership.js` — `BOOTSTRAP_DENY_PATTERNS` extended
- `core/evaluate-bash-gate.js` — `PATH_WRITE_PATTERNS` echo/tee
- `core/bound-artifacts.js` — new runtime-tracking rule
- `tools/manifest.json` — 3 new entries
- `tools/handlers/runtime-state-read-tool.js` — deduped source
- `tools/handlers/runtime-state-record-tool.js` — pause check + enum import
- `tools/handlers/meta-state-dispatch-finding-tool.js` — top-of-handler pause check + lock-aware helper
- `tools/handlers/mark-preflight-complete-tool.js` — surface enum extended
- `schemas/runtime-state.schema.json` — version field
- `docs/architecture.md` — Runtime-State Sidecar section
- `tools/handlers/references/tool-selection-guide.md` — Runtime-state tracking section

**Registry mutations:**
- 3 change-log entries (GAP 1 dedup, GAP 2 toggle, Phase 4 prune + gate-skip)
- New residual finding `meta-260722T1715Z` filed then resolved
- Original `meta-260722T0006Z` superseded into the residual

## Tests

`pnpm test --changed` GREEN: **2459 tests / 503 suites passed**. Three new test files cover dedup, tracking toggle, and prune-surface. The dispatch-concurrency regression test (`P2 F7`) is the one that drove the lock-aware helper design.

## Lessons

- **Async ripples into every caller's idempotency assumptions.** `appendLedgerEvent` was synchronous, which made "read rows → see existing → return idempotent" naturally safe. Making it async for a cross-process lock split the read and the append into separate ticks, and concurrent commits stopped idempotenting. Any time you turn a sync helper into an async one, trace every caller for read-then-write patterns and move the read+write into a single critical section. The `appendOrFindDispatchLedgerEvent` helper exists for exactly this reason.
- **"One write-protection layer" is a smell.** When the plan cited only `BOOTSTRAP_DENY_PATTERNS`, red-team C1 immediately found the bypass via empty `pathFields` short-circuit. The 3-layer model (R2 ownership / bash echo-tee / Write-tool bound artifacts) is not paranoia; each layer's short-circuits are non-overlapping by design. New tracked artifacts need all three, not the most obvious one.
- **Per-surface vs loop-wide is a forcing function for tool description honesty.** Picking per-surface tracking made the loop-wide effect a documentation problem rather than an implementation problem. That is a feature: it forces the operator to read the tool description to understand the cascading behavior, instead of building it implicitly into a gate.
- **Validation anchors survive across multi-day plans only because we re-read them at execution time.** All three anchors in this plan (`inbound-state.js:116`, `runtime-state.js:27-38`, `registry-lock.js:34`) were correct. The plan itself had drifted slightly from the tool in one place (validation rules referenced a method name that had been renamed); the plan was authoritative. Without an explicit "validation commit" step in the cook phase, drift would have shipped silently.

## Follow-up

- `agentwiki publish skipped` — `agentwiki` CLI unavailable in this session; local journal is source of truth.
- Residual finding `meta-260722T1715Z` was filed and resolved in the same change-log batch; verify in next live session that registry projection reflects the resolve.

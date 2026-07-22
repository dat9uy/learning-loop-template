---
phase: 2
title: "GAP 2 — Per-surface tracking toggle (pause/resume)"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 2: GAP 2 — Per-surface tracking toggle (pause/resume)

## Overview

Give the operator a per-surface tracking toggle so non-actionable surfaces (e.g. vendored
`vnstock`) stop appending rows to `runtime-state.jsonl`. Two **legacy-manifest handler tools**
`runtime_state_pause` / `runtime_state_resume` manage an operator-controlled sidecar
`.loop/runtime-tracking.json`; both writers consult it before appending. Implemented as legacy
manifest handlers (NOT `mastra/server.js`-native) so the CLI (`bin/loop.mjs`, which dispatches
via `tools/manifest.json`) reaches them — this runtime is CLI-routed and MCP write tools are
not registered, so CLI portability is required for the operator to actually use the toggle.
The operator-preflight guard lives in the handler (consistent with `runtime_state_record`'s
`hasPreflightMarker`), enforced identically in both transports ("same code path as the MCP
server"). Atomic write + cache pattern mirror `update_r2_allowlist` / `core/r2/allowlist-cache.js`.

## Requirements

- Functional: `runtime_state_pause({surface})` adds `surface` to `paused_surfaces`;
  `runtime_state_resume({surface})` removes it. Both require the operator preflight marker
  `.loop/.runtime-tracking-preflight` (else `preflight_required`). Atomic temp+rename write;
  in-process cache invalidated on write.
- Functional: `runtime_state_record` for a paused `affected_system` returns
  `{ok:false, paused:true, affected_system}` and writes NO row. `meta_state_dispatch_finding`
  for a paused `meta-state-tools` returns a `paused` reason (no ledger row, no finding patch).
- Non-functional: the sidecar is operator-controlled — direct runtime writes to
  `.loop/runtime-tracking.json` are blocked (mirror `.loop/r2-allowlist.json` protection).
  The helper is runtime-agnostic (cross-surface; reads the single `.loop/` sidecar, not a
  per-surface file). `isSurfacePaused` defaults to false when the sidecar is absent.

## Architecture

- New `core/runtime-tracking.js` (mirror `core/r2/allowlist-cache.js`):
  - `RUNTIME_TRACKING_PATH = ".loop/runtime-tracking.json"`.
  - `loadPausedSurfaces(root)` → `string[]` (cached; cache invalidated on write). Absent/malformed
    file → `[]` (tolerant read; log a warning on malformed, do not throw).
  - `isSurfacePaused(root, surface)` → boolean.
  - `setPausedSurfaces(root, arr)` → atomic write (temp + rename) of the full sidecar
    `{schema:"runtime-tracking/v1", version:1, paused_surfaces:[...sorted, deduped]}`;
    invalidate cache. Called only by the pause/resume handlers (operator-preflight-gated).
  - Shape validation (mirror `core/r2/allowlist-shape.js`) — a small `validateRuntimeTrackingShape`.
- New legacy-manifest handler tools (NOT `mastra/server.js`-native), so the CLI reaches them:
  - `tools/handlers/runtime-state-pause-tool.js` — `runtime_state_pause({surface})`:
    require operator marker `existsSync(join(root,".loop",".runtime-tracking-preflight"))`
    (else `preflight_required`, mirroring `runtime_state_record`'s `hasPreflightMarker` pattern);
    validate `surface` against the `affected_system` enum; load → add → `setPausedSurfaces`;
    return `{ok:true, paused_surfaces:[...]}`.
  - `tools/handlers/runtime-state-resume-tool.js` — `runtime_state_resume({surface})`: same
    guard; load → remove → write; return `{ok:true, paused_surfaces:[...]}`.
  - Register both in `tools/manifest.json` with `pathFields: []` (R2 passthrough — the sidecar
    path is resolved internally from non-path args, like `runtime_state_record`).
  - Add both names to `CLI_WRITE_TOOLS` in `core/cli-tools.js`. This satisfies the drift test
    `__tests__/cli-write-tool-set-drift.test.js` (which fails on any unclassified manifest entry)
    WITHOUT adding them to `MCP_RESIDUE` — pause/resume are record-surface mutations the operator
    uses routinely, unlike the low-frequency `update_r2_allowlist` infra edit that stays MCP-only.
  - The CLI then dispatches them via the existing manifest path (`resolveToolByBareName` +
    `adaptLegacyHandler` + `withR2Gate`), reusing the same code path as the MCP server.
- `tools/handlers/runtime-state-record-tool.js`: after the preflight check, before building the
  row, add `if (isSurfacePaused(root, affected_system)) return {ok:false, paused:true, affected_system}`.
- `tools/handlers/meta-state-dispatch-finding-tool.js`: before the ledger append, if
  `isSurfacePaused(root, "meta-state-tools")` → `return finish(root, now, {dispatched:false, reason:"surface_paused", affected_system:"meta-state-tools", id, stage:"commit"})`.
- Write protection: verify how `.loop/r2-allowlist.json` is blocked from direct runtime writes
  (`core/r2/ownership.js` operator-owned set + `core/bound-artifacts.js`) and add
  `.loop/runtime-tracking.json` to the same protection so runtimes cannot bypass pause.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/runtime-tracking.js`
- Create: `tools/learning-loop-mastra/tools/handlers/runtime-state-pause-tool.js`
- Create: `tools/learning-loop-mastra/tools/handlers/runtime-state-resume-tool.js`
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (two entries, `pathFields: []`)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add to `CLI_WRITE_TOOLS`)
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js`
- Modify: `tools/learning-loop-mastra/core/r2/ownership.js` + `core/bound-artifacts.js` (block
  direct writes to `.loop/runtime-tracking.json`) — verify and mirror r2-allowlist protection.
- Create: `tools/learning-loop-mastra/__tests__/runtime-tracking.test.js`
- Modify: existing `tools/handlers/runtime-state-record-tool.test.js` +
  `tools/handlers/meta-state-dispatch-finding-tool.test.js` (paused-surface cases).
- Modify: `__tests__/cli-write-tool-set-drift.test.js` only if a reason to list in `MCP_RESIDUE`
  arises (not expected — pause/resume go in `CLI_WRITE_TOOLS`).
- Read-only context: `mastra/server.js:88-119` (`update_r2_allowlist` atomic-write template),
  `core/r2/allowlist-cache.js` + `core/r2/allowlist-shape.js` (cache + shape templates),
  `tools/handlers/runtime-state-record-tool.js:12-16` (in-handler preflight-marker pattern),
  `bin/loop.mjs:58-67` (CLI manifest dispatch).

## Implementation Steps (TDD — tests first)

1. **Write failing tests** `__tests__/runtime-tracking.test.js`:
   - `isSurfacePaused` → false when sidecar absent.
   - `setPausedSurfaces(root, ["vnstock"])` writes `.loop/runtime-tracking.json` with
     `schema:"runtime-tracking/v1"`, `version:1`, `paused_surfaces:["vnstock"]`; atomic (temp
     file not left behind); `isSurfacePaused(root,"vnstock")` → true, `("meta-state-tools")` → false.
   - Resume removes; dedup/sort on write.
   - Malformed sidecar → `loadPausedSurfaces` returns `[]` (no throw), logged.
2. **Write failing test** extending `runtime-state-record-tool.test.js`: with `.loop/runtime-tracking-preflight`-style setup + `setPausedSurfaces(root,["vnstock"])`, call
   `runtime_state_record` for `vnstock` → `{ok:false, paused:true}`, and
   `readRuntimeStateRows(root)` has no row for that id. Unpaused surface still writes.
3. **Write failing test** extending the dispatch tool test: with `meta-state-tools` paused +
   `LOOP_SESSION_MODE=live`, dispatch returns `reason:"surface_paused"` and appends no ledger
   row.
4. Run `pnpm test:one` on the new + extended tests → red.
5. **Implement** `core/runtime-tracking.js` (load/isPaused/set + cache + shape validation).
6. **Create** `runtime-state-pause-tool.js` + `runtime-state-resume-tool.js` (legacy handlers,
   in-handler preflight marker guard); register both in `tools/manifest.json` (`pathFields: []`);
   add both to `CLI_WRITE_TOOLS` in `core/cli-tools.js`.
7. **Wire** the two writers to consult `isSurfacePaused`.
8. **Block** direct writes to `.loop/runtime-tracking.json` (mirror r2-allowlist protection).
9. **CLI parity test:** invoke `node bin/loop.mjs runtime_state_pause '{"surface":"vnstock"}'`
   (with marker + `LOOP_SURFACE`) → sidecar written; `runtime_state_resume` → removed. Confirm
   the drift test `__tests__/cli-write-tool-set-drift.test.js` stays green (no `MCP_RESIDUE` entry
   needed for pause/resume).
10. Run the new + extended tests + existing runtime-state / dispatch / r2-ownership / cli-write-tool-set-drift tests → green.

## Success Criteria

- [ ] `runtime_state_pause`/`resume` enforce the operator preflight marker; atomic write;
      cache invalidated.
- [ ] Both tools reachable via the CLI (`bin/loop.mjs <tool> '<json>'`) AND MCP — same handler,
      same preflight guard. Listed in `CLI_WRITE_TOOLS`; drift test green.
- [ ] Paused surface: `runtime_state_record` writes no row and returns `paused:true`;
      `meta_state_dispatch_finding` returns `surface_paused` and writes no ledger row.
- [ ] Direct runtime write to `.loop/runtime-tracking.json` is blocked by the write gate.
- [ ] Malformed sidecar tolerated (no throw); absent sidecar → nothing paused.
- [ ] Existing record / dispatch / r2-ownership / cli-write-tool-set-drift tests green.

## Risk Assessment

- **Pausing `meta-state-tools` halts dispatch ledger events.** Operator's explicit choice;
  documented in the tool description + tool-selection-guide. Not a default; the surface is
  opt-in via an explicit `runtime_state_pause` call.
- **Write-protection gap.** If `.loop/runtime-tracking.json` is not added to the operator-owned /
  bound-artifacts set, a runtime could Write it directly and bypass pause. Mitigation: mirror
  the r2-allowlist protection exactly; add a regression test that a direct write is blocked.
- **Cache staleness across surfaces.** The cache is process-local; a pause in one runtime's
  MCP server is not seen by another until cache invalidation. Acceptable for this template
  (single operator session); document. Matches `update_r2_allowlist` cache behavior.
- **Rollback.** Revert the writer checks + remove the two server.js tool blocks + the helper +
  the protection entries. The sidecar, if present, is inert (no consumer) after rollback.
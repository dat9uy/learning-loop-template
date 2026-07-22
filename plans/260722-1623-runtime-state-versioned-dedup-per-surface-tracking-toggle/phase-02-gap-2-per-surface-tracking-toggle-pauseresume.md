---
phase: 2
title: "GAP 2 — Per-surface tracking toggle (pause/resume)"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 2: GAP 2 — Per-surface tracking toggle (pause/resume)

## Overview

Give the operator a per-surface tracking toggle so non-actionable surfaces (e.g. vendored
`vnstock`) stop appending rows to `runtime-state.jsonl`. Two **legacy-manifest handler tools**
`runtime_state_pause` / `runtime_state_resume` manage an operator-controlled sidecar
`.loop/runtime-tracking.json`; both writers consult it before appending. Registered in
`tools/manifest.json` AND added to `CLI_WRITE_TOOLS` (`core/cli-tools.js`); in runtimes with
`LOOP_RECORDS_VIA_CLI=1` (this `.claude` runtime, per `.mcp.json:8`), `CLI_TOOLS` membership
drops them from the MCP surface so they are CLI-only here, while `.factory`/`.mastracode`
(only `LOOP_SURFACE` set) expose them on MCP — so the same handler + manifest entry serves
both transports. The operator-preflight marker lives at
`SURFACES/coordination/.loop-preflight-runtime-tracking` (the per-surface convention
`runtime_state_record` uses at `runtime-state-record-tool.js:12-15`, NOT a root-level
`.loop/.runtime-tracking-preflight`), so it inherits `PREFLIGHT_MARKER_PATHS` write-gate
protection (`core/evaluate-write-gate.js:66`), the bash preflight regexes
(`core/evaluate-bash-gate.js:34-35`), per-surface isolation, and the `gate_mark_preflight`
TTL + audit log (extend its `surface` enum to include `runtime-tracking`). Atomic temp+rename
write mirrors `update_r2_allowlist` / `core/r2/allowlist-cache.js`; the sidecar is read directly
from disk per call (NO in-process cache — the `.claude` CLI one-shot path would never benefit
from one, and the `allowlist-cache.js` cache exists for a long-running MCP server's
high-frequency R2 gate, not this low-frequency read).

## Requirements

- Functional: `runtime_state_pause({surface})` adds `surface` to `paused_surfaces`;
  `runtime_state_resume({surface})` removes it. Both require the operator preflight marker
  `SURFACES/coordination/.loop-preflight-runtime-tracking` (created via
  `gate_mark_preflight({surface:"runtime-tracking"})`, else `preflight_required`). Atomic
  temp+rename write; no in-process cache (read from disk per call).
- Functional: `runtime_state_record` for a paused `affected_system` returns
  `{ok:false, paused:true, affected_system}` and writes NO row. `meta_state_dispatch_finding`
  for a paused `meta-state-tools` returns a `paused` reason at BOTH the `prepare` and `commit`
  stages (no issue drafted, no ledger row, no finding patch) — checking only `commit` would let
  an agent `gh issue create` from `prepare` then hit `surface_paused` at `commit`, orphaning a
  GitHub issue with no ledger row.
- Functional: `surface` is validated against the runtime-state `affected_system` enum EXPORTED
  from `core/runtime-state.js` (single source; imported by record + read + pause + resume). Do
  NOT use `core/meta-state.js`'s `AFFECTED_SYSTEM_ENUM` — it is a different superset
  (`vnstock_vendor`, `meta`, `gate-logic`…) that would let `pause("vnstock_vendor")` succeed
  while no writer ever emits that surface.
- Non-functional: the sidecar is operator-controlled — direct runtime writes to
  `.loop/runtime-tracking.json` are blocked at THREE layers (the `.loop/r2-allowlist.json`
  precedent is itself only `BOOTSTRAP_DENY_PATTERNS` in `core/r2/ownership.js:36-45`, NOT
  `bound-artifacts.js`, and that layer only blocks R2-ownership `own`-glob claims via
  `withR2Gate` which short-circuits on `pathFields:[]` — so it alone does NOT stop a direct
  Write/bash write): (1) `BOOTSTRAP_DENY_PATTERNS` in `core/r2/ownership.js` (mirror the real
  precedent), (2) bash-gate `PATH_WRITE_PATTERNS` in `core/evaluate-bash-gate.js` (echo/tee
  forms — the layer the original plan omitted entirely), (3) `BOUND_ARTIFACTS` in
  `core/bound-artifacts.js` for Write-tool defense-in-depth. The helper is runtime-agnostic
  (cross-surface; reads the single `.loop/` sidecar, not a per-surface file). `isSurfacePaused`
  defaults to false when the sidecar is absent; a MALFORMED sidecar is fail-closed (throws /
  refuses writes until repaired, mirroring `allowlist-cache.js:39-48` — NOT the fail-open
  "tolerant → []" originally proposed, which would silently unpause a corrupted toggle).

## Architecture

- New `core/runtime-tracking.js` (mirror `core/r2/allowlist-cache.js` for the atomic-write +
  shape-validation shape, NOT for fail-open error handling):
  - `RUNTIME_TRACKING_PATH = ".loop/runtime-tracking.json"`.
  - `loadPausedSurfaces(root)` → `string[]` (read from disk each call; NO in-process cache).
    Absent file → `[]` (nothing paused). Malformed file → fail-closed: throw a typed error
    (mirror `allowlist-cache.js:39-48` `r2_allowlist_invalid_json` / `r2_allowlist_invalid_schema`)
    so the writers REFUSE to append until the operator repairs it — NOT the fail-open
    "tolerant → []" originally proposed (which would silently unpause on corruption).
  - `isSurfacePaused(root, surface)` → boolean (calls `loadPausedSurfaces`).
  - `setPausedSurfaces(root, arr)` → atomic write (temp + rename) of the full sidecar
    `{schema:"runtime-tracking/v1", version:1, paused_surfaces:[...sorted, deduped]}`.
    Called only by the pause/resume handlers (operator-preflight-gated).
  - Shape validation (mirror `core/r2/allowlist-shape.js`) — a small `validateRuntimeTrackingShape`.
- Export the runtime-state `affected_system` enum from `core/runtime-state.js`
  (`AFFECTED_SYSTEM_ENUM_RUNTIME`, the 8 values currently inline at
  `runtime-state-record-tool.js:48` / `runtime-state-read-tool.js:20` /
  `schemas/runtime-state.schema.json:11`), and import it in record + read + pause + resume so the
  toggle and the writer it gates stay in sync. Do NOT export/import `core/meta-state.js`'s
  `AFFECTED_SYSTEM_ENUM` — different superset.
- New legacy-manifest handler tools (registered in `tools/manifest.json` + added to
  `CLI_WRITE_TOOLS`; CLI-only where `LOOP_RECORDS_VIA_CLI=1`, dual-transport otherwise):
  - `tools/handlers/runtime-state-pause-tool.js` — `runtime_state_pause({surface})`:
    require operator marker via the SAME per-surface convention as `runtime_state_record`
    (`runtime-state-record-tool.js:12-15`): `SURFACES.some(s => existsSync(join(root, s,
    "coordination", ".loop-preflight-runtime-tracking")))` (else `preflight_required`). The marker
    is created through `gate_mark_preflight({surface:"runtime-tracking"})` — extend that tool's
    `surface` enum — so it gets `PREFLIGHT_MARKER_PATHS` write-gate protection
    (`evaluate-write-gate.js:66`), the bash preflight regexes (`evaluate-bash-gate.js:34-35`),
    per-surface isolation, and the 30-min TTL + audit log. Validate `surface` against the
    exported runtime-state enum; load → add → `setPausedSurfaces`; return
    `{ok:true, paused_surfaces:[...]}`.
  - `tools/handlers/runtime-state-resume-tool.js` — `runtime_state_resume({surface})`: same
    guard; load → remove → write; return `{ok:true, paused_surfaces:[...]}`.
  - Register both in `tools/manifest.json` with `pathFields: []` (R2 passthrough — the sidecar
    path is resolved internally from non-path args, like `runtime_state_record`).
  - Add both names to `CLI_WRITE_TOOLS` in `core/cli-tools.js`. This satisfies the drift test
    `__tests__/cli-write-tool-set-drift.test.js` (which fails on any unclassified manifest entry)
    WITHOUT adding them to `MCP_RESIDUE` — pause/resume are record-surface mutations the operator
    uses routinely, unlike the low-frequency `update_r2_allowlist` infra edit that stays MCP-only.
- `tools/handlers/runtime-state-record-tool.js`: after the preflight check, before building the
  row, add `if (isSurfacePaused(root, affected_system)) return {ok:false, paused:true, affected_system}`.
- `tools/handlers/meta-state-dispatch-finding-tool.js`: add the pause check at the TOP of the
  handler (before stage dispatch), so BOTH `handlePrepareStage` and `handleCommitStage` honor it:
  `if (isSurfacePaused(root, "meta-state-tools")) return finish(root, now, {dispatched:false,
  reason:"surface_paused", affected_system:"meta-state-tools", id, stage})`. Checking only
  `commit` (the original plan) lets an agent draft + `gh issue create` from `prepare`, then hit
  `surface_paused` at `commit` — orphaning a GitHub issue with no ledger row.
- Write protection — add `.loop/runtime-tracking.json` + `**/.loop/runtime-tracking.json` at
  THREE layers (the `.loop/r2-allowlist.json` precedent is itself ONLY `BOOTSTRAP_DENY_PATTERNS`
  in `core/r2/ownership.js:36-45` — NOT `core/bound-artifacts.js` — and that layer only blocks
  R2-ownership `own`-glob claims via `withR2Gate`, which short-circuits to passthrough on
  `pathFields:[]` (`mastra/with-r2-gate.js:42-45`) and so does NOT stop a direct Write/bash
  write; faithfully mirroring only that precedent would leave the sidecar writable by a runtime):
  (1) `BOOTSTRAP_DENY_PATTERNS` in `core/r2/ownership.js` (the real r2-allowlist precedent);
  (2) bash-gate `PATH_WRITE_PATTERNS` in `core/evaluate-bash-gate.js` (echo `>`/`>>` + `tee`
  forms — the layer the original plan omitted entirely);
  (3) `BOUND_ARTIFACTS` in `core/bound-artifacts.js` (Write-tool defense-in-depth). Add a
  regression test that a direct Write and a `echo > .loop/runtime-tracking.json` are both blocked.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/runtime-tracking.js`
- Create: `tools/learning-loop-mastra/tools/handlers/runtime-state-pause-tool.js`
- Create: `tools/learning-loop-mastra/tools/handlers/runtime-state-resume-tool.js`
- Modify: `tools/learning-loop-mastra/core/runtime-state.js` (export `AFFECTED_SYSTEM_ENUM_RUNTIME`)
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js` (import enum + pause check)
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js` (import shared enum)
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (two entries, `pathFields: []`)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add to `CLI_WRITE_TOOLS`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js` (top-of-handler pause check)
- Modify: `tools/learning-loop-mastra/core/r2/ownership.js` (add `.loop/runtime-tracking.json` + `**/.loop/runtime-tracking.json` to `BOOTSTRAP_DENY_PATTERNS`; update `BOOTSTRAP_HINT`)
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (add `PATH_WRITE_PATTERNS` echo/tee entries for `.loop/runtime-tracking.json`)
- Modify: `tools/learning-loop-mastra/core/bound-artifacts.js` (add `.loop/runtime-tracking.json` to `BOUND_ARTIFACTS` — Write-tool defense-in-depth)
- Modify: `gate_mark_preflight` handler + its `surface` enum (add `runtime-tracking` → marker `.loop-preflight-runtime-tracking` under `SURFACES/coordination/`)
- Create: `tools/learning-loop-mastra/__tests__/runtime-tracking.test.js`
- Modify: existing `tools/handlers/runtime-state-record-tool.test.js` +
  `tools/handlers/meta-state-dispatch-finding-tool.test.js` (paused-surface cases at prepare + commit).
- Modify: `__tests__/cli-write-tool-set-drift.test.js` only if a reason to list in `MCP_RESIDUE`
  arises (not expected — pause/resume go in `CLI_WRITE_TOOLS`).
- Read-only context: `mastra/server.js:44-66` (manifest→MCP registration + `LOOP_RECORDS_VIA_CLI`
  drop), `mastra/server.js:88-119` (`update_r2_allowlist` atomic-write template),
  `core/r2/allowlist-cache.js:39-48` (fail-closed error template — mirror, don't invert),
  `core/r2/allowlist-shape.js` (shape-validation template),
  `tools/handlers/runtime-state-record-tool.js:12-16` (per-surface preflight-marker pattern),
  `core/evaluate-write-gate.js:66` (`PREFLIGHT_MARKER_PATHS`),
  `core/evaluate-bash-gate.js:34-35,43-51` (bash preflight + `PATH_WRITE_PATTERNS`),
  `mastra/with-r2-gate.js:42-45` (`pathFields:[]` passthrough),
  `bin/loop.mjs:58-67` (CLI manifest dispatch), `.mcp.json:8` (`LOOP_RECORDS_VIA_CLI=1`).

## Implementation Steps (TDD — tests first)

1. **Write failing tests** `__tests__/runtime-tracking.test.js`:
   - `isSurfacePaused` → false when sidecar absent.
   - `setPausedSurfaces(root, ["vnstock"])` writes `.loop/runtime-tracking.json` with
     `schema:"runtime-tracking/v1"`, `version:1`, `paused_surfaces:["vnstock"]`; atomic (temp
     file not left behind); `isSurfacePaused(root,"vnstock")` → true, `("meta-state-tools")` → false.
   - Resume removes; dedup/sort on write.
   - Malformed sidecar → `loadPausedSurfaces` THROWS (fail-closed, mirror `allowlist-cache.js:39-48`),
     not returns `[]`.
2. **Write failing test** extending `runtime-state-record-tool.test.js`: with the
   `gate_mark_preflight({surface:"runtime-tracking"})` marker + `setPausedSurfaces(root,["vnstock"])`,
   call `runtime_state_record` for `vnstock` → `{ok:false, paused:true}`, and
   `readRuntimeStateRows(root)` has no row for that id. Unpaused surface still writes. A malformed
   sidecar makes the record tool refuse (fail-closed), not silently unpause.
3. **Write failing test** extending the dispatch tool test: with `meta-state-tools` paused +
   `LOOP_SESSION_MODE=live`, BOTH `prepare` and `commit` return `reason:"surface_paused"` and
   append no ledger row (and `prepare` drafts no issue body).
4. Run `pnpm test:one` on the new + extended tests → red.
5. **Implement** `core/runtime-tracking.js` (load/isPaused/set, read-from-disk per call — NO
   cache, fail-closed malformed mirroring `allowlist-cache.js:39-48`, + shape validation).
   Export `AFFECTED_SYSTEM_ENUM_RUNTIME` from `core/runtime-state.js`; import in record + read.
6. **Create** `runtime-state-pause-tool.js` + `runtime-state-resume-tool.js` (legacy handlers,
   per-surface preflight marker `SURFACES/coordination/.loop-preflight-runtime-tracking`, created
   via `gate_mark_preflight({surface:"runtime-tracking"})` — extend that tool's `surface` enum);
   validate `surface` against the exported runtime-state enum; register both in
   `tools/manifest.json` (`pathFields: []`); add both to `CLI_WRITE_TOOLS` in `core/cli-tools.js`.
7. **Wire** the two writers: record tool checks `isSurfacePaused` before building the row;
   dispatch tool checks at the TOP of the handler (before stage dispatch) so `prepare` AND
   `commit` honor it.
8. **Block** direct writes to `.loop/runtime-tracking.json` at THREE layers:
   `BOOTSTRAP_DENY_PATTERNS` (`core/r2/ownership.js`), bash `PATH_WRITE_PATTERNS`
   (`core/evaluate-bash-gate.js`, echo/tee), and `BOUND_ARTIFACTS` (`core/bound-artifacts.js`).
   Add a regression test that a direct Write AND `echo > .loop/runtime-tracking.json` are blocked.
9. **CLI parity test:** `gate_mark_preflight({surface:"runtime-tracking"})` then invoke
   `node bin/loop.mjs runtime_state_pause '{"surface":"vnstock"}'` (with `LOOP_SURFACE`) →
   sidecar written; `runtime_state_resume` → removed. Confirm the drift test
   `__tests__/cli-write-tool-set-drift.test.js` stays green (no `MCP_RESIDUE` entry needed).
10. Run the new + extended tests + existing runtime-state / dispatch / r2-ownership /
   evaluate-bash-gate / bound-artifacts / cli-write-tool-set-drift tests → green.

## Success Criteria

- [ ] `runtime_state_pause`/`resume` enforce the per-surface operator preflight marker
      (`SURFACES/coordination/.loop-preflight-runtime-tracking` via `gate_mark_preflight`);
      atomic write; read-from-disk per call (no cache).
- [ ] Both tools reachable via the CLI (`bin/loop.mjs <tool> '<json>'`); CLI-only where
      `LOOP_RECORDS_VIA_CLI=1`, dual-transport otherwise — same handler, same preflight guard.
      Listed in `CLI_WRITE_TOOLS`; drift test green.
- [ ] `surface` validated against the runtime-state enum exported from `core/runtime-state.js`
      (not meta-state's superset).
- [ ] Paused surface: `runtime_state_record` writes no row and returns `paused:true`;
      `meta_state_dispatch_finding` returns `surface_paused` at BOTH `prepare` and `commit`
      (no issue drafted, no ledger row).
- [ ] Direct runtime write to `.loop/runtime-tracking.json` is blocked at all three layers
      (BOOTSTRAP_DENY_PATTERNS, bash PATH_WRITE_PATTERNS, BOUND_ARTIFACTS); regression test green.
- [ ] Malformed sidecar is fail-closed (writers refuse); absent sidecar → nothing paused.
- [ ] Existing record / dispatch / r2-ownership / evaluate-bash-gate / bound-artifacts /
      cli-write-tool-set-drift tests green.

## Risk Assessment

- **Pausing `meta-state-tools` halts dispatch ledger events.** Operator's explicit choice;
  documented in the tool description + tool-selection-guide. Not a default; the surface is
  opt-in via an explicit `runtime_state_pause` call. The pause check at the top of the dispatch
  handler means `prepare` also refuses (no orphaned GitHub issue).
- **Write-protection (mitigated).** The `.loop/r2-allowlist.json` precedent is itself only
  `BOOTSTRAP_DENY_PATTERNS` (not `bound-artifacts.js`), and that only blocks R2-ownership claims
  via `withR2Gate` (passthrough on `pathFields:[]`). To actually stop a direct runtime Write/bash
  write, the sidecar is added to all three layers (BOOTSTRAP_DENY_PATTERNS + bash
  PATH_WRITE_PATTERNS + BOUND_ARTIFACTS) with a regression test. The preflight marker lives under
  `SURFACES/coordination/.loop-preflight-runtime-tracking` so it inherits `PREFLIGHT_MARKER_PATHS`
  + bash preflight protection (a root-level `.loop/.runtime-tracking-preflight` would be writable
  by any runtime — the original plan's path).
- **Marker scope trade-off.** The per-surface marker authorizes pause from one runtime, but the
  `.loop/runtime-tracking.json` sidecar is shared, so the pause EFFECTS are loop-wide (all
  runtimes' writers read the same sidecar). Documented as a loop-wide toggle authorized
  per-surface — matches `runtime_state_record`'s per-surface marker convention.
- **No in-process cache (by design).** The `.claude` CLI one-shot path would never hit a warm
  cache; reading the tiny sidecar from disk per call is simpler and removes the cross-surface
  cache-staleness class entirely.
- **Rollback.** Revert the writer checks + manifest entries + `CLI_WRITE_TOOLS` additions + the
  helper + the three protection entries + the `gate_mark_preflight` enum extension. The sidecar,
  if present, is inert (no consumer) after rollback.
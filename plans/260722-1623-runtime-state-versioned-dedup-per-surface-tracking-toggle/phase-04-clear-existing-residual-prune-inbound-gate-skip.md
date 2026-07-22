---
phase: 4
title: "Clear existing residual — prune + inbound-gate skip"
status: pending
priority: P2
effort: "0.5d"
dependencies: [2]
---

# Phase 4: Clear existing residual — prune + inbound-gate skip

## Overview

Clear the finding's PRIMARY symptom so it is grounded when Phase 3 closes it: the 20 existing
`vnstock` rows in `runtime-state.jsonl` have DISTINCT ids (GAP 1 same-id collapse does not touch
them) and `core/inbound-state.js:116-132` keeps surfacing them as stale observations. This phase
adds (a) a one-time, operator-preflight-gated `runtime_state_prune_surface` tool that rewrites the
sidecar minus a paused surface's rows, and (b) a one-line `isSurfacePaused` short-circuit in the
inbound gate's stale-observation scan so paused surfaces stop triggering warnings. Brought into
this plan by validation decision (was a deferred follow-up; now unblocked since 260720-1112 merged).

## Requirements

- Functional: `runtime_state_prune_surface({surface, confirm})` rewrites `runtime-state.jsonl`
  atomically (temp + rename) removing every row with `affected_system === surface`; returns
  `{ok, pruned, remaining}`. Requires the operator preflight marker (same per-surface
  `SURFACES/coordination/.loop-preflight-runtime-tracking` guard as pause/resume) AND `confirm:true`
  (destructive one-time op — mirror `meta_state_archive`'s confirm pattern). No-op (returns
  `pruned:0`) if no rows match.
- Functional: the inbound gate's stale-observation scan (`core/inbound-state.js:116`,
  `const matching = sidecar.filter((r) => r.affected_system === obs.affected_system)`) gains a
  preceding `isSurfacePaused(root, obs.affected_system)` short-circuit: a paused surface's
  observations are skipped (no stale warning surfaced), mirroring the writer-side pause so the
  gate and the writers agree.
- Non-functional: the prune is a one-time admin op, NOT a routine mutation — it deliberately
  violates the append-only invariant under explicit `confirm` + preflight. It is CLI-portable
  (legacy-manifest handler in `CLI_WRITE_TOOLS`, `pathFields: []`), like pause/resume. The
  rewrite goes through `core/runtime-state.js` (the sanctioned in-process writer, same as
  `appendLedgerEvent`) so it is not a "direct runtime write" the gate would block.

## Architecture

- `core/runtime-state.js`: new `pruneSurfaceRows(root, surface)` → read raw rows, filter out
  `affected_system === surface`, atomic temp+rename rewrite of the sidecar, return
  `{pruned, remaining}`. Runs under `withRegistryLock(root, …)` (same cross-process lock as the
  Phase 1 append) so a prune cannot interleave with an append. History is NOT preserved for the
  pruned rows (this is the point — the operator is deleting noise); the rewrite is total.
- New `tools/handlers/runtime-state-prune-surface-tool.js` (legacy-manifest handler): require the
  per-surface preflight marker (same `hasPreflightMarker`-style check as pause/resume, marker
  `SURFACES/coordination/.loop-preflight-runtime-tracking`); require `confirm:true`; validate
  `surface` against the runtime-state enum exported in Phase 2; call `pruneSurfaceRows`; return
  `{ok:true, prused, remaining, surface}`. Register in `tools/manifest.json` (`pathFields: []`);
  add to `CLI_WRITE_TOOLS` in `core/cli-tools.js`.
- `core/inbound-state.js`: at the stale-observation scan, before `sidecar.filter(...)`, add
  `if (isSurfacePaused(root, obs.affected_system)) continue;` (skip this observation — no stale
  warning). Import `isSurfacePaused` from `core/runtime-tracking.js` (Phase 2's helper). This is
  the one file this plan previously excluded for orthogonality with 260720-1112 — that plan is
  merged, so the exclusion no longer applies.
- No write-protection change: the prune rewrites `runtime-state.jsonl` via `core/runtime-state.js`
  (in-process, sanctioned) — it does NOT need a new gate entry. Direct runtime writes to
  `runtime-state.jsonl` stay blocked (`BOOTSTRAP_DENY_PATTERNS` already lists it).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/runtime-state.js` (add `pruneSurfaceRows` under `withRegistryLock`)
- Create: `tools/learning-loop-mastra/tools/handlers/runtime-state-prune-surface-tool.js`
- Modify: `tools/learning-loop-mastra/core/inbound-state.js` (paused-surface skip at the stale scan)
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (one entry, `pathFields: []`)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add `runtime_state_prune_surface` to `CLI_WRITE_TOOLS`)
- Create: `tools/learning-loop-mastra/__tests__/runtime-state-prune-surface.test.js`
- Modify: existing inbound-state test (paused-surface-skip case)
- Read-only context: `core/runtime-tracking.js` (Phase 2 `isSurfacePaused`), `tools/handlers/runtime-state-record-tool.js:12-15` (preflight-marker pattern), `core/registry-lock.js` (`withRegistryLock`), `tools/learning-loop-mastra/core/meta-state.js` archive handler (`confirm` arg pattern).

## Implementation Steps (TDD — tests first)

1. **Write failing test** `__tests__/runtime-state-prune-surface.test.js`:
   - Seed a temp root's `runtime-state.jsonl` with 3 `vnstock` rows + 2 `meta-state-tools` rows.
   - With preflight marker + `confirm:true`, `runtime_state_prune_surface({surface:"vnstock",confirm:true})`
     → `{ok:true, pruned:3, remaining:2}`; `readRuntimeStateRows(root)` has only the 2
     `meta-state-tools` rows; no temp file left behind (atomic).
   - Without `confirm:true` → `{ok:false, reason:"confirm_required"}` (no rewrite).
   - Without preflight marker → `{preflight_required}` (no rewrite).
   - No matching rows → `{ok:true, pruned:0, remaining:N}` (idempotent).
2. **Write failing test** extending the inbound-state test: with `setPausedSurfaces(root,["vnstock"])`
   + a stale vnstock observation, the scan SKIPS it (no stale warning surfaced); an unpaused
   surface's stale observation still surfaces.
3. Run `pnpm test:one` on the new + extended tests → red.
4. **Implement** `pruneSurfaceRows(root, surface)` in `core/runtime-state.js` (under `withRegistryLock`,
   atomic rewrite).
5. **Create** `runtime-state-prune-surface-tool.js` (preflight + `confirm` guards); register in
   `tools/manifest.json`; add to `CLI_WRITE_TOOLS`.
6. **Wire** the inbound-gate skip in `core/inbound-state.js` (import `isSurfacePaused`, short-circuit
   at the stale scan).
7. **CLI parity test:** `gate_mark_preflight({surface:"runtime-tracking"})` then
   `node bin/loop.mjs runtime_state_prune_surface '{"surface":"vnstock","confirm":true}'` → pruned.
   Confirm `__tests__/cli-write-tool-set-drift.test.js` stays green.
8. Run the new + extended tests + existing runtime-state / inbound-state / cli-write-tool-set-drift tests → green.

## Success Criteria

- [ ] `runtime_state_prune_surface({surface,confirm:true})` (preflight-gated) atomically removes
      the surface's rows; `pruned`/`remaining` correct; no temp file left; idempotent on no match.
- [ ] Without `confirm:true` → `confirm_required`; without preflight marker → `preflight_required`.
- [ ] Reachable via `bin/loop.mjs`; in `CLI_WRITE_TOOLS`; drift test green.
- [ ] Inbound gate skips stale observations for paused surfaces; unpaused surfaces unchanged.
- [ ] `pruneSurfaceRows` runs under `withRegistryLock` (no interleave with append).
- [ ] Existing runtime-state / inbound-state / cli-write-tool-set-drift tests green.

## Risk Assessment

- **Destructive one-time rewrite of `runtime-state.jsonl`.** The prune deletes history (by design
  — it removes noise). Mitigation: `confirm:true` required + per-surface preflight marker + the
  tool returns `pruned`/`remaining` counts so the operator sees the blast radius before/after.
  The rewrite is atomic (temp+rename) so a crash mid-prune leaves the original intact.
- **Prune vs append race.** A concurrent `appendLedgerEvent` for the pruned surface could land
  during the rewrite. Mitigation: `pruneSurfaceRows` runs under `withRegistryLock` (same
  cross-process lock as Phase 1's append), serializing prune vs append.
- **Inbound-gate skip hides a real stall.** If an operator pauses a surface they still care about,
  the skip silences its staleness warnings. Mitigation: the skip is gated on the explicit
  `isSurfacePaused` toggle (operator's choice); unpausing restores the warnings. Documented in the
  tool-selection-guide alongside pause/resume.
- **Rollback.** Revert the inbound-gate skip line + remove the prune tool + `pruneSurfaceRows` +
  manifest/CLI_WRITE_TOOLS entries. Pruned rows are gone (the one-time op already ran) — that is
  the operator's intended outcome, not a rollback concern.

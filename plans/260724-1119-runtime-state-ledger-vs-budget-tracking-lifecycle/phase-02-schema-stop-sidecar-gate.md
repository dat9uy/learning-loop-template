---
phase: 2
title: "Schema + stop + in-band lifecycle + sidecar retirement + gate kind-aware enforcement"
status: pending
priority: P1
effort: "4d"
dependencies: [1]
---

# Phase 2: Schema + stop + in-band lifecycle + sidecar retirement + gate kind-aware enforcement

## Overview

The merged phase (validate D3): the schema, the `stop` tool, in-band versioned lifecycle, sidecar retirement, gate kind-aware enforcement, drift scope, `prune` removal, and the L2 contract + L3 "shipped" flip — in one PR. This is the behavioral payoff that clears the "27 stale" warning by concept scope (kind + lifecycle), not deletion. Ships the L2 contract + L3 flip in the same PR (no docs-only gate).

## Decisions applied (validate)

- **D5 — reuse `status`** as the lifecycle field (not a new `tracking_state`): expand the enum to `["initial","active","paused","stopped"]` for `budget-state`; keep `status:"active"` for `ledger-event`. Remove the dead `cleared`/`reconciled`. The 3 existing `status==="active"` gate filters (`file-readers.js:61`, `evaluate-inbound-gate.js:171`, `inbound-state.js:99`) exclude paused/stopped/initial budget-state with zero new lifecycle-filter code; the kind filter still excludes ledger-event.
- **D4 — remove `prune`**: delete `runtime_state_prune_surface` (handler, `pruneSurfaceRows`, both manifests, `CLI_WRITE_TOOLS`, `runtime-state-prune-surface.test.js`, docs entry). The "delete ledger to clear gate" footgun is gone structurally.
- **D1 — restart = new id**: `stop` is terminal per-id; `runtime_state_record` with a NEW id is allowed even when the surface's canonical entity is stopped. `isSurfacePaused` blocks appends to the stopped/paused entity's id, not the whole surface.
- **D8 — one canonical id per surface**: enforce one canonical budget-state id per `affected_system` in `runtime_state_record`; `stop({surface})` targets it; restart (D1) creates a new canonical id (e.g. `vnstock-device-slot-v2`).

## Requirements

- **Schema (D5):** expand `status` enum in `schemas/runtime-state.schema.json` to `["initial","active","paused","stopped"]` (remove `cleared`/`reconciled`); `status:"active"` for ledger-event, lifecycle values for budget-state. `runtime_state_record` writes `status:"active"` for budget-state consumption (`"initial"` for the first record of a fresh entity). Kind-conditional rule enforced in the handler + an `appendLedgerEvent` guard (reject budget-state status not in lifecycle, reject ledger-event status ≠ `active`) — **NOT a Zod `z.object().refine()`** (red-team R3: it silently no-ops `delivery-classify.mjs:schemaValidateRow` and throws in 2 test files). `version` plumbing unchanged (`appendLedgerEvent` maxExisting+1, `readRuntimeStateRowsLatest` max_by(version)).
- **`readBudgetTrackingState(root, surface)` helper:** returns the latest `status` for the surface's canonical budget-state entity. **R11 (Security #3): filter `kind==="budget-state"` BEFORE/AROUND the `max_by(version)` dedup** (dedup is kind-blind; a ledger-event sharing an id could shadow it) — filter kind on the raw stream then dedup, OR make the dedup key `id + kind`. **R1 (Critical): THROW on corrupt/unreadable budget-state rows** (preserve fail-closed for writers — `readRuntimeStateRows` silently skips corrupt lines `:40-43`); the read-gate callers (`inbound-state.js:126-131`, `evaluate-inbound-gate.js:159-166`) already try/catch (fail-open for the gate).
- **`stop` + in-band lifecycle (D1/D8):** `runtime_state_pause({surface})`/`resume`/`stop` append `status: paused`/`active`/`stopped` versions under `withRegistryLock`. `resume` rejects from `stopped` (terminal). `stop` requires `confirm`. `isSurfacePaused` reads `readBudgetTrackingState` (paused/stopped → true); blocks the stopped/paused entity's id only (D1 — a new-id record is a fresh entity, not blocked).
- **Sidecar retirement:** remove `.loop/runtime-tracking.json`; remove the 3-layer write-protection (`core/bound-artifacts.js:59-65`, `core/r2/ownership.js:41-42`, `core/evaluate-bash-gate.js` PATH_WRITE_PATTERNS — R10: confirmed they protect ONLY the sidecar, no sibling un-protected); relocate `hasSurfacePreflightMarker` (used by 4 tools — don't drop it with `runtime-tracking.js`); update `bound-artifacts.test.js:56` (pins the rule order). **R2 (Security #2): fix the preflight marker TTL** — `hasSurfacePreflightMarker` (`runtime-tracking.js:128-132`) is bare `existsSync` (no TTL; a Jul 19 marker persists Jul 24); make it call `readPreflightMarker` (the 30-min TTL at `gate-logic.js:545`) OR consume/delete the marker after `stop` (one-time use). `core/runtime-tracking.js` removed/reduced to the in-band `isSurfacePaused` wrapper. **R7: document the `gate-override.js appendOverrideAudit` bypass** — do NOT route it through `appendLedgerEvent` (sync→async cascade + `affected_system:"gate-logic"` not in `AFFECTED_SYSTEM_ENUM_RUNTIME`); its rows stay version-less/fingerprint-less by design.
- **Gate kind-aware enforcement:** `readRuntimeObservations` (`file-readers.js:55-128`) → `readRuntimeStateRowsLatest` + filter `kind==="budget-state"` + `status==="active"` (fixes both gates: `evaluate-bash-gate.js:75` + `evaluate-inbound-gate.js:169`). `unmapped-active-entry` drift (`:71-110`) fires only for `budget-state` rows missing an `AFFECTED_SYSTEM_TO_CONSTRAINTS` mapping — never `ledger-event`. `checkObservationStaleness` non-meta branch (`inbound-state.js:84-157`): **R5 (FailureMode #8): add an explicit `kind==="budget-state" && status==="active"` guard to `getSidecar()` (`:94`)/`matching` (`:134`)** — `readRuntimeStateRowsLatest` is NOT a kind filter. **R12:** audit `session-start-inject-discoverability.cjs:204` (reads RAW, filters dispatch ledger — unaffected, dispatch stays ledger-event). **R4 (FailureMode #7): 6 existing assertions INVERT** — `gate-integration.test.cjs:230,277,394` (`inbound_gate===true` on ledger-event) and `inbound-state-runtime-state.test.js:77,126,143` (`stale:false` with ledger-event) flip; change fixtures to `budget-state`+`status:"active"` or flip expected values. The redundant `isSurfacePaused` pause-skip (`evaluate-inbound-gate.js:172`) becomes defense-in-depth (lifecycle filter already excludes paused) — keep or remove.
- **`prune` removal (D4):** delete `runtime_state_prune_surface` handler, `pruneSurfaceRows` (`runtime-state.js:149-156`), both manifest entries, `CLI_WRITE_TOOLS` (`cli-tools.js:77`), `runtime-state-prune-surface.test.js`, the `tool-selection-guide.md` + `architecture.md:422` prune paragraph. Grep for any remaining reference.
- **Docs (folded):** add the L2 runtime-state lifecycle contract to `docs/runtime-contract.md`; flip `docs/architecture.md` § Budget tracking lifecycle + prune from "open design, not shipped" to "shipped"; document `stop` (non-destructive retire) as `prune`'s replacement (prune removed).

## Architecture

One PR: the data model (`status` lifecycle, kind load-bearing), the tools (`stop`, in-band pause/resume/stop, sidecar retired, `prune` removed), the gate (kind+status-aware), and the docs (L2 contract + L3 shipped) that make it true. `isSurfacePaused` shifts from a sidecar read to a `max_by(version)` read of the canonical entity's latest `status` (R1: throws on corrupt). Restart = new id (D1). One canonical id per surface (D8). The gate reads latest-by-version per id, filters `kind: budget-state` + `status: active`; ledger logs out by kind, paused/stopped budgets out by lifecycle.

## Related Code Files

- **Modify:** `schemas/runtime-state.schema.json` (status enum), `tools/handlers/runtime-state-record-tool.js` (handler kind-conditional status check :41-66,:92-103; `isSurfacePaused` :83 now entity-id-scoped), `core/runtime-state.js` (`readBudgetTrackingState` helper; `appendLedgerEvent` guard; remove `pruneSurfaceRows`), `tools/handlers/runtime-state-pause-tool.js` + `runtime-state-resume-tool.js` (append in-band versions), `tools/handlers/meta-state-dispatch-finding-tool.js:389` (`isSurfacePaused` usage), `core/runtime-tracking.js` (remove sidecar; in-band `isSurfacePaused`; relocate/keep `hasSurfacePreflightMarker` + fix TTL), `core/bound-artifacts.js:59-65` + `core/r2/ownership.js:41-42` + `core/evaluate-bash-gate.js` (remove sidecar deny), `core/file-readers.js` (`readRuntimeObservations` :55-128 latest+kind+status; `unmapped-active-entry` :71-110 kind guard), `core/evaluate-inbound-gate.js` (`loadStaleActiveObservations` :168-176; pause-skip :172), `core/inbound-state.js` (`checkObservationStaleness` :84-157 kind/status guard), `core/cli-tools.js` (`CLI_WRITE_TOOLS` += `runtime_state_stop`, -= `runtime_state_prune_surface`), `agent-manifest.json` + `tools/handlers/agent-manifest.json` (+ `runtime_state_stop`, - `runtime_state_prune_surface`), `tools/scripts/delivery-classify.mjs` (`schemaValidateRow` :221-234 — status enum, no new field), `docs/runtime-contract.md` (L2 lifecycle), `docs/architecture.md` (§ flip to shipped; remove prune paragraph)
- **Create:** `tools/handlers/runtime-state-stop-tool.js`, `__tests__/runtime-state-stop-tool.test.js`, `__tests__/runtime-state-tracking-lifecycle.test.js`, `__tests__/gate-stale-scan-kind-aware.test.js`
- **Delete:** `tools/handlers/runtime-state-prune-surface-tool.js`, `__tests__/runtime-state-prune-surface.test.js` (`.loop/runtime-tracking.json` is already absent — D6 dropped the live pause, so no migration needed)
- **Read-only:** `core/gate-logic.js` (`findStaleObservations` :1030, `STALENESS_THRESHOLD_MS` :1024)

## Tests (TDD — write first)

- `runtime-state-tracking-lifecycle.test.js` (rewritten from `runtime-tracking.test.js`): pause/resume/stop append `status` versions; no sidecar file; `readBudgetTrackingState` returns latest status; `isSurfacePaused` true for paused/stopped; `resume` rejects from `stopped`; restart = new id (`runtime_state_record` with a new id allowed when canonical entity stopped); corrupt-rows → writer refuses/throws (R1); preflight TTL enforced (R2).
- `runtime-state-stop-tool.test.js`: stop appends `status:"stopped"`, keeps history (count grows); `confirm` required; terminal; restart via new id.
- `gate-stale-scan-kind-aware.test.js`: scan surfaces only `kind: budget-state` + `status: active`; ledger-event + paused/stopped excluded; `unmapped-active-entry` fires only for unmapped budget-state.
- `gate-integration.test.cjs` + `inbound-state-runtime-state.test.js`: flip the 6 inverting assertions (R4) — fixtures → `budget-state`+`status:"active"` or expected values flipped.
- `cli-write-tool-set-drift.test.js`: `runtime_state_stop` in `CLI_WRITE_TOOLS`; `runtime_state_prune_surface` removed.
- `bound-artifacts.test.js:56`: update the rule-order assertion (sidecar deny removed).
- `runtime-state-versioned-dedup.test.js`: still green (version plumbing unchanged).
- Phase 1 regression guard: still green (assertion loosened to non-decreasing).

## Implementation Steps

1. Write the lifecycle + gate + stop tests (above) first (red).
2. Expand the `status` enum + handler kind-conditional check + `appendLedgerEvent` guard (no Zod refine — R3).
3. Add `readBudgetTrackingState` (kind-filtered, throws on corrupt — R1, R11).
4. Rewire `runtime_state_pause`/`resume` to append in-band `status` versions; create `runtime_state_stop` (confirm, terminal); register in manifests + `CLI_WRITE_TOOLS`.
5. Rewrite `isSurfacePaused` to read `readBudgetTrackingState` (entity-id-scoped, D1); relocate `hasSurfacePreflightMarker` + fix TTL (R2); preserve read-gate degrade-to-not-paused.
6. Remove `prune` (handler, `pruneSurfaceRows`, manifests, CLI_WRITE_TOOLS, test, docs) — D4. Grep for stragglers.
7. Gate: `readRuntimeObservations` → latest + `kind: budget-state` + `status: active`; drift kind guard; `checkObservationStaleness` kind/status guard (R5); flip the 6 inverting tests (R4).
8. Retire the sidecar: remove deny-lists (R10), delete `.loop/runtime-tracking.json` if present, remove `core/runtime-tracking.js` sidecar I/O (keep `hasSurfacePreflightMarker`).
9. Docs: L2 contract in `runtime-contract.md`; flip `architecture.md` § to shipped; remove prune paragraph.
10. Make tests green; `pnpm test`; verify the real 33-row sidecar produces ZERO stale observations (all `ledger-event`, out by kind).

## Success Criteria

- [ ] `status` lifecycle (`initial/active/paused/stopped`) on `budget-state`; `status:active` on ledger-event; kind-conditional rule enforced at handler + append boundary (not a Zod refine).
- [ ] `readBudgetTrackingState` kind-filtered + throws on corrupt rows (fail-closed writers).
- [ ] `runtime_state_pause`/`resume`/`stop` append in-band versions; `stop` terminal (restart = new id); no sidecar; preflight TTL fixed.
- [ ] `isSurfacePaused` reads latest `status` (entity-id-scoped); corrupt-rows fail-closed for writers, fail-open for the gate.
- [ ] Gate stale scan surfaces only `budget-state` + `status: active`; drift only for unmapped budget-state; real 33-row sidecar → zero stale.
- [ ] `prune` removed entirely (tool, handler, manifests, CLI_WRITE_TOOLS, test, docs).
- [ ] 6 inverting assertions flipped; Phase 1 guard green (non-decreasing).
- [ ] L2 contract added; L3 flipped to shipped.
- [ ] `pnpm test` green.

## Risk Assessment

- **R1 Critical (fail-direction):** the highest-severity red-team finding — `readBudgetTrackingState` MUST throw on corrupt rows or a stopped surface silently un-stops. Test it explicitly.
- **R3 (schema):** do NOT use `z.object().refine()`. Handler + append-guard only. (D5 reuse-`status` avoids adding a field, so this is lower-risk than the original `tracking_state` plan.)
- **R4 (test inversions):** 6 assertions flip — list each; don't leave them red.
- **R5 (kind guard):** `readRuntimeStateRowsLatest` is NOT a kind filter — add the explicit guard to both `readRuntimeObservations` and `inbound-state.js`.
- **R6 (TOCTOU):** `isSurfacePaused` check outside the lock — document one append may slip through after stop, or move the check inside the lock.
- **R8 (guard):** Phase 1 guard asserts non-decreasing, not `===`.
- **D1/D8 consistency:** one canonical id per surface + restart-new-id must agree — `isSurfacePaused` blocks the stopped entity's id, not the surface; a new-id `runtime_state_record` is a fresh entity (allowed).
- **`prune` removal blast radius:** grep for any test/doc/manifest reference to `runtime_state_prune_surface` after removal.
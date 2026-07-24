---
title: "Runtime-state ledger vs budget tracking lifecycle"
description: "Make runtime-state.jsonl's kind discriminator load-bearing — split budget tracking (versioned lifecycle initial→active→paused→stopped on the status field, in-band) from ledger logs (immutable audit), add non-destructive stop (restart via new id), retire the .loop/runtime-tracking.json sidecar, remove the destructive prune, scope the gate's stale scan to actively-tracked budget-state, and collapse vnstock into one versioned budget-state entity. Continues PR#77 per plans/reports/debug-260723-1426-ledger-vs-budget-tracking-l1l2.md."
status: shipped
priority: P1
effort: "shipped 2026-07-24"
tags: [runtime-state, budget, ledger, lifecycle, gate, l1l2]
created: 2026-07-24
shipped: 2026-07-24
---

# Runtime-state ledger vs budget tracking lifecycle

## Overview

PR#77 exposed a missing concept distinction in `runtime-state.jsonl`: it bundles **budget tracking** (mutable external-resource state with a tracking lifecycle) and **ledger logs** (immutable audit) into one store, with a `kind` discriminator (`ledger-event` | `budget-state`) that is hollow — all 33 real rows are `ledger-event`, `budget-state` has zero rows and no consumer, and the gate's stale scan ignores `kind` entirely. The operator reached for the destructive `prune` to clear a budget gate, deleting a resolved finding's delivery audit trail — the "delete the ledger to clear the gate" flaw class.

The concept investigation (`plans/reports/debug-260723-1426-ledger-vs-budget-tracking-l1l2.md`) named the distinction at L1 (`docs/loop-engine.md` § Budget tracking vs ledger log — already shipped in `e4e5988`) and the intended direction at L3 (`docs/architecture.md` § Budget tracking lifecycle + prune — names the in-band versioned lifecycle + `stop` as "open design, not shipped behavior"). The operator's 2026-07-23 decisions (same report) set the model: both kinds version-numbered with a lifecycle mirroring meta-state's `max_by(version)` flow; vnstock becomes a single versioned `budget-state` entity; `pause`/`stop` are in-band versioned lifecycle records (retiring the `.loop/runtime-tracking.json` sidecar); `stop` is terminal (restart = a new `initial`/fresh entity).

This plan implements that direction. **Most docs are already written; the work is the implementation.** A `--deep` red-team (4 reviewers) + validate interview refined the model: the lifecycle rides the existing `status` field (not a new `tracking_state` field), `prune` is removed (not reserved), Phases 2-5 merge into one PR (no dead-code/docs-only gates), and the vnstock collapse is kept with its hazards (id-collision, history-hidden) explicitly addressed.

The 3-phase shape matches the debug report's "Proposed phased plan" (collapsed from an initial 6-phase TDD draft per the Scope critic + validate D3).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Make `kind` load-bearing: `budget-state` = tracked budget with a `status` lifecycle; `ledger-event` = immutable audit, out of the budget gate by kind | P1 |
| 2 | Give budget tracking an in-band versioned lifecycle `initial → active → paused → stopped` on the `status` field, read via `max_by(version)`, retiring the `.loop/runtime-tracking.json` sidecar | P1 |
| 3 | Add non-destructive `runtime_state_stop` (retire tracking, keep history; terminal — restart = a new id); **remove the destructive `prune`** | P1 |
| 4 | Scope the gate's stale-observation scan + `unmapped-active-entry` drift to actively-tracked `budget-state` (`status: active`); ledger logs cease surfacing | P1 |
| 5 | Collapse the 20 vnstock `ledger-event` rows (15 distinct ids) into one versioned `budget-state` entity (terminal `stopped`); preserve experiment history | P2 |
| 6 | A regression guard so "delete ledger rows to clear the budget gate" cannot recur | P1 |

## Phases

| # | Phase | Status | Deps |
|---|-------|--------|------|
| 1 | [Regression guard (no-delete-to-clear-gate invariant)](./phase-01-start.md) | Shipped | — |
| 2 | [Schema + stop + in-band lifecycle + sidecar retirement + gate kind-aware enforcement](./phase-02-schema-stop-sidecar-gate.md) | Shipped | 1 |
| 3 | [vnstock collapse migration + e2e verification](./phase-03-vnstock-collapse-migration.md) | Shipped | 2 |

## Current state (verified 2026-07-24)

- PR#77 merged as `961210c` (fix #1 pause-skip in UserPromptSubmit, `7717f50`); the destructive prune **never landed on main** — `runtime-state.jsonl` has 33 rows intact.
- All 33 rows: `kind: ledger-event`, `status: active`, `version: undefined` (legacy pre-versioning; read as 0). Breakdown by `affected_system`: **20 vnstock** (15 distinct ids — 5 are versioned re-records; 18 cite `rule-vnstock-device-slot-budget`, 2 cite a finding ref), **12 meta-state-tools** (11 `delivery-*` + 1 `dispatch-*` — the resolved finding `meta-260719T2120Z-…` delivery audit trail), **1 runtime-state** (a re-pin whose id **collides** with a vnstock id — see Phase 3 hazard). The `gate-override.js` audit write path exists (`affected_system: gate-logic`, not in `AFFECTED_SYSTEM_ENUM_RUNTIME`) but has produced **zero** rows in this sidecar. Per-surface distinct ids sum to 28, but the **union is 27** (one id is in two surfaces) — the gate's `dedupStale` (`evaluate-inbound-gate.js:51-67`) dedups by `id` only, so the colliding pair collapses to one → the "27 stale" figure.
- `.loop/runtime-tracking.json` sidecar is **absent on disk** (nothing paused).
- Versioning plumbing exists and is tested: `appendLedgerEvent` assigns `version = maxExisting+1` under `withRegistryLock`; `readRuntimeStateRowsLatest` collapses `max_by(version)` per id. `readRuntimeStateRowsLatest` has exactly one consumer today: `runtime_state_read`.
- L1 naming shipped (`docs/loop-engine.md` § Budget tracking vs ledger log, `e4e5988`); L3 mechanism prose shipped (`docs/architecture.md` § Budget tracking lifecycle + prune, naming the in-band direction as "open design, not shipped"). L2 lifecycle mapping is **not** in `docs/runtime-contract.md`.

## Success Criteria

- [x] `kind` is load-bearing: `budget-state` rows carry a `status` lifecycle (`initial`/`active`/`paused`/`stopped`); `ledger-event` rows are `status: active` audit-only and never enter the budget gate's stale scan or `unmapped-active-entry` drift.
- [x] `runtime_state_pause`/`resume`/`stop` append in-band versioned `budget-state` lifecycle records on `status`; `.loop/runtime-tracking.json` sidecar retired (file removed, deny-lists updated).
- [x] `runtime_state_stop` retires tracking (terminal; restart = a new id) while preserving ledger history; the destructive `prune` is **removed** (tool, handler, manifests, CLI_WRITE_TOOLS, tests, docs).
- [x] The "27 stale active observations" warning clears by concept scope (kind + lifecycle), not by row deletion; row count stays ≥33.
- [x] vnstock is one versioned `budget-state` entity (fresh canonical id `vnstock`, not the colliding one) with terminal `stopped`; experiment history accessible via `runtime_state_read` `include_all_versions`.
- [x] A regression test asserts the gate count drops via lifecycle (pause/stop), not via row deletion (non-decreasing).
- [x] `readBudgetTrackingState` throws on corrupt rows (writer fail-closed preserved).
- [x] `pnpm test` green (2468 passed, 1 skipped; pre-existing `cold-tier-regression` age-stale threshold failure unrelated to this plan); `runtime-state.schema.json`, both tool manifests, `CLI_WRITE_TOOLS`, `tool-selection-guide.md`, and `architecture.md` all reflect the new model.

## Open implementation questions

All resolved by the `--deep` red-team + validate interview (see Validation Log). No open questions remain.

## Red Team Review

`--deep` red-team gate: 4 hostile reviewers (Security Adversary, Assumption Destroyer, Failure Mode Analyst, Scope & Complexity Critic), each verified against the codebase. 24 raw findings deduped to 18 distinct. Defects with a clear fix are **applied inline** to the phase files; the genuine design forks are **resolved by the validate interview** (Validation Log below).

### Applied inline (defects with one right answer)

| # | Finding (lens) | Sev | Disposition |
|---|---|---|---|
| R1 | **Writer fail-direction flips closed→open on corrupt in-band state** — `readBudgetTrackingState` via `readRuntimeStateRows` silently skips corrupt lines (`runtime-state.js:40-43`); a corrupt budget-state line → `isSurfacePaused` false → a STOPPED surface silently un-stops; writers today are fail-closed (`runtime-tracking.test.js:280`) (Security #1) | **Critical** | Phase 2: `readBudgetTrackingState` THROWS on corrupt rows; read-gate callers already try/catch |
| R2 | **Preflight marker has NO TTL** — `hasSurfacePreflightMarker` (`runtime-tracking.js:128-132`) is bare `existsSync`; `stop` (terminal) would inherit indefinite auth (Security #2) | High | Phase 2: TTL-enforced OR one-time-use marker |
| R3 | **`z.object().refine()` silently breaks `schemaValidateRow` + 2 test files** (FailureMode #6) | High | Phase 2: handler + `appendLedgerEvent` guard, NOT a Zod refine (moot for D5 reuse-`status` — no new field added) |
| R4 | **6 existing assertions INVERT** — `gate-integration.test.cjs:230,277,394` + `inbound-state-runtime-state.test.js:77,126,143` (FailureMode #7) | High | Phase 2: list each flip + replacement |
| R5 | **`readRuntimeStateRowsLatest` is NOT a kind filter** — `getSidecar()` (`inbound-state.js:94,:134`) needs an explicit kind+status guard (FailureMode #8) | Medium | Phase 2: kind+status guard on both `readRuntimeObservations` + `inbound-state.js` |
| R6 | **TOCTOU: `isSurfacePaused` check outside the lock** (FailureMode #4) | Medium | Phase 2: move check inside lock OR document one append may slip through (pre-existing) |
| R7 | **gate-override routing is NOT low-risk** — sync→async cascade + `gate-logic` not in enum (FailureMode #5 + Security bonus) | Medium | Phase 2: document the bypass, do NOT route |
| R8 | **Regression guard "row count unchanged" breaks the in-band pause** (Assumption #5) | High | Phase 1: assert "does not decrease" (`>=`) |
| R9 | **27 vs 28 / 18+3≠20 arithmetic + id collision** — the `runtime-state` re-pin shares id `vnstock-device-slot-2026-05-08T10:17:23Z` with a vnstock row (Assumption #4) | Medium | plan.md + Phase 3 fixed; collapse must avoid the shared id (or kind-aware dedup) |
| R10 | **Sidecar deny-list removal narrowly scoped (safe)** + `hasSurfacePreflightMarker` relocation + `bound-artifacts.test.js:56` (Security #5) | — | Phase 2: confirmed safe; relocate marker; update test |
| R11 | **`readBudgetTrackingState` kind filter unspecified** — dedup is kind-blind (Security #3) | High | Phase 2: filter `kind: budget-state` before/around dedup |
| R12 | **session-start call site unaudited** — `session-start-inject-discoverability.cjs:204` (FailureMode #1) | Low | Phase 2: confirmed unaffected (dispatch stays ledger-event) |

### Verified accurate (no finding)

- Assumption #3 — L1 (`docs/loop-engine.md:78-85`) and L3 (`docs/architecture.md:422` "open design, not shipped behavior") docs claims are accurate (the plan understates L1 — it already describes the full in-band lifecycle).

## Validation Log

`--deep` validate gate: critical-questions interview resolving the 7 design forks the red-team surfaced. Decisions propagated to the phase files.

| # | Question | Decision | Effect |
|---|---|---|---|
| D1 | Terminal `stop` + restart model (unimplementable as written) | **Restart = new id** (fresh entity) | `stop` terminal per-id; `runtime_state_record` with a new id allowed when the canonical entity is stopped; `isSurfacePaused` blocks the stopped entity's id, not the surface |
| D2 | Phase 3 vnstock migration (avoidable after Phase 2 kind-exclusion) | **Keep the collapse** | Collapse 20 rows / 15 ids into one versioned `budget-state` entity (honors the operator's re-type decision); hazards (id-collision, history-hidden) addressed in Phase 3 |
| D3 | 6-phase split vs consolidated | **Merge 3+4+5; fold Phase 2 docs** | 3 phases: guard / merged schema+stop+sidecar+gate+docs / vnstock collapse. No dead-code or docs-only PRs |
| D4 | `prune` remove vs reserve | **Remove `prune`** | Delete `runtime_state_prune_surface` (handler, `pruneSurfaceRows`, manifests, `CLI_WRITE_TOOLS`, test, docs) — the footgun is gone structurally |
| D5 | `tracking_state` field vs reuse `status` | **Reuse `status`** | Expand the `status` enum to `initial/active/paused/stopped` (budget-state); keep `active` (ledger-event); remove dead `cleared`/`reconciled`. 3 existing `status==="active"` gate filters reused; no new field (avoids R3) |
| D6 | Phase 1 live sidecar pause vs guard-only | **Guard only; drop live pause** | Phase 1 is a single regression test; the warning clears in Phase 2 (in-band). No create→migrate→delete round-trip |
| D8 | Surface→entity mapping | **One canonical id per surface** | Enforce one canonical budget-state id per `affected_system` in `runtime_state_record`; restart (D1) creates a new canonical id |

## References

- `plans/reports/debug-260723-1426-ledger-vs-budget-tracking-l1l2.md` (concept investigation + operator decisions + revised Phase 3)
- `plans/reports/debug-260723-1410-pr77-runtime-state-prune-flaw.md` (the PR#77 flaw)
- `docs/loop-engine.md` § Budget tracking vs ledger log (L1, shipped)
- `docs/architecture.md` § Budget tracking lifecycle + prune (L3, "open design" → Phase 2 flips to shipped)
- `docs/meta-state-lifecycle.md` (the parallel L2 lifecycle pattern mirrored — note: meta-state has no restart; D1 adds it for budget-state)

<!-- slug: runtime-state-ledger-vs-budget-tracking-lifecycle -->
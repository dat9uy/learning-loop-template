---
title: "Runtime-state durability split"
description: "Reconcile the runtime-state substrate with the L1/L2 durability contract: durable rows (ledger-event + budget-tracking lifecycle) stay committed; ephemeral TTL'd allowance rows (gate-verb) move to a gitignored session-local substrate. Closes the drift the docs now name."
status: pending
priority: P1
effort: ""
tags: [runtime-state, gate-system, bound-artifact, l1-l2-contract]
created: 2026-08-09
---

# Runtime-state durability split

## Overview

The L1 durability axis (`docs/loop-engine.md` § Budget tracking vs ledger log) and the L2 contract (`docs/runtime-contract.md` § Runtime-state row kinds) now distinguish **durable** rows (ledger logs + the budget-tracking lifecycle) from **ephemeral** TTL'd allowance rows (e.g. `gate-verb:*`). The current L3 wiring predates that distinction and commits every row to one file, so an expired allowance can be committed as if it were durable history — the `gate-verb:bash` / `gate-verb:node` rows committed in PRs #119–#122 are the live example. This plan reconciles the mechanism to the contract:

- **Write splits by durability.** `appendLedgerEvent` routes durable rows to the committed `runtime-state.jsonl` and ephemeral rows to a gitignored session-local substrate (`.loop/runtime-state-local.jsonl`), keyed by a new `durability` field.
- **Read merges.** `readRuntimeObservations` unions both substrates, so the gate's projection (and the bash-gate gate-verb allowance check that rides it) sees both durable lifecycle and session-local allowances from one merged view. A fresh clone (no local file) loses only the session-scoped allowances — correct, by contract.
- **The local substrate gets the 3-layer write protection** the 260722-1623 work established (R2 ownership + bash echo/tee + bound-artifacts), plus a `.gitignore` entry.
- **The two committed `gate-verb:*` rows migrate** to the local substrate and are closed (`runtime_state_stop`) there — non-destructive (history preserved in the correct substrate), matching the project's "no destructive prune" stance.
- **The drift is filed as a finding first** (loop pattern: observe-and-defer before doing the work) and **resolved last** with evidence.

This is the Option B structural refactor from the problem-solving + predict analysis. Option A (close the stale rows) is folded into Phase 4 — it happens *during* migration, in the correct substrate, rather than as a standalone procedural patch.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ephemeral TTL'd allowance rows never enter the committed `runtime-state.jsonl` | P1 |
| 2 | The gate's observation projection reads both substrates from one merged view, unchanged at the call sites | P1 |
| 3 | The local substrate is gitignored and protected by all 3 write-protection layers | P1 |
| 4 | The two committed `gate-verb:*` rows are migrated + closed in the local substrate; the committed file has zero gate-verb rows | P1 |
| 5 | L3 docs, the gate-verb-allowance hint, and the drift finding are all reconciled | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [File the durability drift finding](./phase-01-start.md) | Pending |
| 2 | [Durability axis mechanism (schema + write-split + read-merge)](./phase-02-durability-axis-mechanism-schema-write-split-read-merge.md) | Pending |
| 3 | [3-layer write protection + gitignore for local substrate](./phase-03-3-layer-write-protection-gitignore-for-local-substrate.md) | Pending |
| 4 | [Migrate committed gate-verb rows to local + close them](./phase-04-migrate-committed-gate-verb-rows-to-local-close-them.md) | Pending |
| 5 | [Reconcile L3 docs + gate-verb-allowance hint + resolve finding](./phase-05-reconcile-l3-docs-gate-verb-allowance-hint-resolve-finding.md) | Pending |

Phase dependency: 1 → 2 → 3 → 4 → 5 (linear; the mechanism must exist before it is protected, protected before it is trusted with production migration, and migrated before the docs/hint claim it is reconciled).

## Success Criteria

- [ ] `runtime_state_record({affected_system:"gate-verb:node", durability:"ephemeral", ...})` writes to `.loop/runtime-state-local.jsonl`, never `runtime-state.jsonl`.
- [ ] `runtime_state_record` without `durability` (default durable) writes non-`gate-verb` rows to `runtime-state.jsonl` — back-compat for every existing caller.
- [ ] **Symmetric namespace guard (red-team #4):** `gate-verb:*` ⟺ `ephemeral` enforced at the record-tool boundary — a `vnstock` ephemeral row and a durable `gate-verb:*` row are both rejected.
- [ ] `appendLedgerEvent`'s version scan is destination-scoped (reads only the destination file — red-team #6), not the union.
- [ ] `readRuntimeObservations` projects ephemeral allowances from the local substrate AND durable rows from the committed substrate; a fresh clone with no local file projects zero gate-verb observations but preserves durable lifecycle.
- [ ] A malformed line in the local file does NOT block durable writes (per-substrate malformed — red-team #7).
- [ ] Direct shell / Write-tool / R2-path writes to `.loop/runtime-state-local.jsonl` are blocked by all 3 layers (Write-tool rule in `evaluate-write-gate.js` — red-team #3); `git check-ignore` confirms it is ignored.
- [ ] `runtime-state.jsonl` contains zero `gate-verb:*` rows; `.loop/runtime-state-local.jsonl` contains the 2 rows with an appended `stopped` closure routed there by the namespace-deriving stop tool (red-team #1).
- [ ] The gate-verb block-message incantation emits `durability:"ephemeral"` (landed in Phase 2 with the guard — red-team #8).
- [ ] The drift finding is `resolved` in the registry; `docs/architecture.md`'s "Durability drift" note is replaced by the reconciled mechanism; the docs state `runtime_state_read` returns both substrates (red-team #13).
- [ ] `pnpm test` green; no regression in the existing `runtime-state-*`, bash-gate, write-gate, and gate-override suites.

## Red Team Review

### Session — 2026-08-09
**Findings:** 17 (17 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 6 High, 6 Medium
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 hostile reviewers run in parallel; findings deduplicated across all three; all carry `file:line` evidence).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Stop tool sets no `durability` → closure routes to committed file, undoing the migration | Critical | Accept | Phase 4 (stop tool Read→Modify; derive `durability` from `gate-verb:*` namespace) |
| 2 | Stop tool gates on `runtime-tracking`, not `runtime-state-edit` → `preflight_required` | Critical | Accept | Phase 4 (mint `runtime-tracking` before stop) |
| 3 | Write-tool layer is in `evaluate-write-gate.js`, not `bound-artifacts.js` (no runtime-state rule there) | Critical | Accept | Phase 3 (preflight-delegating rule in `evaluate-write-gate.js`; drop `bound-artifacts.js` Modify) |
| 4 | Durability-by-namespace guard deferred but load-bearing — merge trusts the local file on Phase 2 landing | Critical | Accept (strengthened to symmetric `gate-verb:*` ⟺ `ephemeral`) | Phase 2 (record-tool boundary) |
| 5 | Migration rewrites outside `withRegistryLock` → concurrent `runtime_state_record` append clobbered | Critical | Accept | Phase 4 (acquire the shared registry lock) |
| 6 | "Per-destination versioning" contradicts `appendLedgerEvent`'s union-wide `readRuntimeStateRows` scan | High | Accept | Phase 2 (destination-scoped version scan; merged read is read-side only; fix test #5) |
| 7 | One malformed line in the gitignored local file blocks ALL durable `runtime_state_record`/`stop` writes | High | Accept | Phase 2 (per-substrate malformed; local malformation non-fatal to durable writes) |
| 8 | Phase 4→5 window: stale incantation commits gate-verb rows to the wrong file before the hint lands | High | Accept | Phase 2 (incantation `durability:"ephemeral"` edit moved here, ships with the #4 guard) |
| 9 | Migration must use `.tmp + renameSync` (atomic), not truncating `writeFileSync` | High | Accept | Phase 4 (match `migrate-runtime-state-fingerprints.mjs` precedent) |
| 10 | Migration predicate kind-agnostic → can drop a durable `ledger-event` under `gate-verb:*` | High | Accept | Phase 4 (tighten to `gate-verb:* && kind==="budget-state"`) |
| 11 | Two parallel append paths bypass routing; `gate-override.js` hardcodes the path string | High | Accept | Phase 2 (export `RUNTIME_STATE_FILENAME`; import in `gate-override.js`; document dispatch path durable-only) |
| 12 | `change-log-bound-paths.js` `TOP_LEVEL_FILES` missing the local substrate → `meta_state_log_change` can't bind it | Medium | Accept | Phase 3/4 (add the path) |
| 13 | `runtime_state_read` output visibly changes (ephemeral rows mixed in) — "transparent" claim is false | Medium | Accept (document) | Phase 5 docs (document; no new filter — KISS) |
| 14 | JSON schema `affected_system` enum is stale; not the live enforcement layer | Medium | Accept (minimal) | Phase 2 (test the zod enum, not the JSON schema; don't present JSON schema as the boundary) |
| 15 | Cross-substrate tie-break favors local on full tie | Medium | Accept (resolved by #4) | Phase 2 (#4's symmetric guard prevents the collision structurally) |
| 16 | Phase 3 marker story incomplete — 3 markers govern the local file, only the shell one specified | Medium | Accept | Phase 3 (enumerate all 3 markers + which writer each governs) |
| 17 | Migration's `node script.mjs` internal writes bypass the bash-gate → "gated by `runtime-state-edit`" framing is procedural | Medium | Accept | Phase 4 (drop the "gated" framing for internal writes; rely on lock + atomic + backup + `log_change`) |

### Key restructuring implied by the accepts
- **#4 strengthened to a symmetric guard** (`gate-verb:*` ⟺ `ephemeral`) — structurally resolves #10, #15, and the cross-substrate collision class for all surfaces.
- **#8 moves the incantation `durability:"ephemeral"` edit from Phase 5 to Phase 2** — it must ship with the guard or the guard breaks the gate-verb allowance flow.
- **#1 makes the stop tool a Phase-4 Modify** that derives `durability` from the surface namespace.

### Whole-Plan Consistency Sweep
Applied 2026-08-09 after all accepted findings were written into the phase files. Checks:
- Stale "drift" / "will be reconciled" framing: only the **intended** drift note in `docs/architecture.md` (the L3 note this plan's Phase 5 replaces) is referenced; no phase claims the wiring is reconciled before Phase 5.
- Phase 2 now owns the incantation edit (red-team #8); Phase 5 no longer references editing the hint/block message — verified Phase 5's "Related Code Files" and steps drop the hint emitter. No duplicate "edit the incantation" prose across phases.
- Stop tool classification: Phase 4 lists `runtime-state-stop-tool.js` under Modify (red-team #1); no remaining "Read: confirm stop routes" reference. Phase 2 does NOT claim to modify the stop tool.
- Write-tool layer: Phase 3 cites `evaluate-write-gate.js` (red-team #3); no remaining `bound-artifacts.js` Modify reference for the runtime-state rule. R2 ownership + bash-gate + gitignore references unchanged and consistent.
- Versioning claim: Phase 2 states destination-scoped scan (red-team #6); the test spec asserts versions 0,1 in local with a durable row unaffected — consistent with destination-scoped (not union) scan. No remaining "per-destination" prose that contradicts the scan.
- Marker story: Phase 3 enumerates all 3 markers (red-team #16); Phase 4 uses `runtime-state-edit` (migration shell path) + `runtime-tracking` (stop — red-team #2) consistently.
- Success criteria in `plan.md` updated to match: symmetric guard, destination-scoped scan, per-substrate malformed, stop-tool routing, incantation in Phase 2, `runtime_state_read` documented.
- `dependencies` chain unchanged (1→2→3→4→5); the incantation move into Phase 2 does not change phase ordering, only intra-phase scope.
- **Unresolved contradictions: 0.** Plan is consistent across `plan.md` + 5 phases.

## Prior art (not blockedBy)

- `plans/260724-1119-runtime-state-ledger-vs-budget-tracking-lifecycle` (shipped) — introduced the `kind` discriminator this plan refines with the durability axis.
- `plans/260808-1222-gate-verb-allowance-...` (complete, PR #120) and `plans/260808-2018-hint-injection-policy-...` (complete, PR #122) — shipped the gate-verb allowance mechanism whose committed rows this plan corrects.

## Open questions

- None at planning time. (The load-bearing question — is the budget-tracking lifecycle repo-wide or per-clone? — was settled by the L1/L2 docs written this session: the lifecycle is durable/shared; only TTL'd allowances are ephemeral/local. Phase 4 encodes that answer.)

<!-- slug: runtime-state-durability-split -->
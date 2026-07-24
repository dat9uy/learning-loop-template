---
phase: 3
title: "vnstock collapse migration + e2e verification"
status: pending
priority: P2
effort: "1.5d"
dependencies: [2]
---

# Phase 3: vnstock collapse migration + e2e verification

## Overview

Migrate the 20 vnstock `ledger-event` rows (15 distinct ids; 18 cite `rule-vnstock-device-slot-budget`, 2 cite a finding ref; May 2026 install history) into ONE versioned `budget-state` entity (validate D2 — keep the collapse, honoring the operator's re-type decision) with a terminal `stopped` lifecycle, so vnstock clears the gate by lifecycle. Then end-to-end verify the "27 stale active observations" warning is gone across all 33 rows (vnstock by lifecycle, meta-state-tools by kind) with row count ≥33 (no deletion).

## Decisions applied (validate)

- **D2 — collapse** (not drop, not fresh-`initial`): rewrite the 20 rows / 15 distinct ids into one versioned `budget-state` entity, preserving per-experiment history as versions.
- **D8 — one canonical id per surface:** the collapse id is the canonical vnstock budget-state id.
- **D1 — restart = new id:** a future vnstock restart (after `stop`) uses a new canonical id (e.g. `vnstock-device-slot-v2`), not a resumed chain.

## Requirements

- **Functional:**
  - Collapse the 20 vnstock rows / 15 distinct ids into ONE versioned `budget-state` entity (canonical id per D8). **Red-team R9 (Assumption #4): do NOT pick the shared id `vnstock-device-slot-2026-05-08T10:17:23Z`** — the `runtime-state` re-pin row (a `ledger-event`) shares it; a `budget-state` stopped version and a `ledger-event` audit row under one id collapse under `max_by(version)` (kind-blind dedup), breaking the kind separation Phase 2 establishes. Pick a fresh canonical id (e.g. `vnstock-device-slot`) that NO `ledger-event` row currently uses, OR rely on Phase 2's kind-aware dedup (`id + kind`).
  - Each of the 20 rows becomes a version (v0…v19) of the canonical id, `kind: budget-state`, `status: active` (a consumption/snapshot), preserving per-experiment `value`/`delta`/`metadata`/`timestamp`/`source_ref`. Append a terminal `status: stopped` version (latest) so the gate excludes vnstock by lifecycle.
  - **Red-team FailureMode #2: add `include_all_versions` to `runtime_state_read`** (like `meta_state_list`) — `readRuntimeStateRowsLatest` returns ONE row per id; without this, 19 of 20 experiments vanish from the read tool (latest-only). The collapse preserves history in the raw file; the read tool must be able to surface it, or document explicitly that version history is raw-file-only.
  - End-to-end: trigger the inbound gate; confirm ZERO stale active observations (vnstock stopped by lifecycle; 12 meta-state-tools + 1 runtime-state re-pin `ledger-event` out by kind); `runtime-state.jsonl` row count ≥33 (collapse keeps 20 as versions, not fewer rows; the +1 stopped version → 34).
  - The Phase 1 regression guard holds under the full model.
- **Non-functional:** no destructive deletion. The migration runs through the loop's write tools (`meta_state_batch` / `runtime_state_record` / `runtime_state_stop`) — direct `runtime-state.jsonl` writes are blocked (Capability 3). One-time, operator-audited; record via `meta_state_log_change`. The vnstock budget rule (`rule-vnstock-device-slot-budget`) is not modified; the resolved finding `meta-260719T2120Z-…` delivery audit trail (12 delivery + 1 dispatch) stays intact.

## Architecture

The collapse converts 20 per-experiment audit rows into one versioned budget-state entity (canonical id, D8). The gate then sees vnstock as one entity whose latest `status` is `stopped` → out of scope by lifecycle (Phase 2). The 12 meta-state-tools + 1 runtime-state `ledger-event` rows stay audit → out by kind (Phase 2). `include_all_versions` on `runtime_state_read` keeps the experiment history accessible. Net: 0 stale active observations by concept scope.

## Related Code Files

- **Modify:** `runtime-state.jsonl` (via write tools — NOT direct file writes), `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js` (add `include_all_versions` — red-team FailureMode #2), `docs/architecture.md` (§ confirmed shipped — Phase 2 already flipped; verify)
- **Create:** `tools/learning-loop-mastra/__tests__/runtime-state-vnstock-collapse-e2e.test.js`
- **Read-only:** `runtime-state.jsonl` (20 vnstock rows / 15 distinct ids), `meta-state.jsonl` (vnstock rule + resolved finding)

## Tests (TDD — write first)

`runtime-state-vnstock-collapse-e2e.test.js` (NEW):
- Pre-migration: 20 vnstock `ledger-event` rows (real fixture, 15 distinct ids) → gate surfaces them as stale (pre-Phase-2 baseline).
- Post-migration: one canonical `budget-state` entity (id NOT the shared `vnstock-device-slot-2026-05-08T10:17:23Z`), versions v0…v19 preserving the 20 experiments' `value`/`delta`/`metadata`/`timestamp`, latest `status:"stopped"` → gate surfaces ZERO vnstock stale observations; row count ≥34 (20 collapsed + 12 meta-state-tools + 1 runtime-state + 1 stopped).
- Non-vnstock rows (12 delivery/dispatch + 1 runtime-state) unchanged.
- `runtime_state_read({affected_system:"vnstock", include_all_versions:true})` returns all 20+ versions (history accessible).
- `runtime_state_read({affected_system:"vnstock"})` (default) returns the latest `stopped` row only.
- E2e: full `runtime-state.jsonl` → `evaluateInboundGate` → zero stale active observations; Phase 1 regression guard holds.

## Implementation Steps

1. Write the collapse e2e test (above) first (red until the migration runs).
2. Grep `meta-state.jsonl` + `runtime-state.jsonl` for any reference to individual vnstock row ids; confirm the shared id (`vnstock-device-slot-2026-05-08T10:17:23Z`) is the ONLY collision and pick a fresh canonical id (e.g. `vnstock-device-slot`) that no `ledger-event` row uses.
3. Add `include_all_versions` to `runtime_state_read` (FailureMode #2) — parameter + projection bypass.
4. Execute the collapse via `meta_state_batch` (cap 500 ops; 20 well under) or sequential `runtime_state_record` under the lock: rewrite the 20 rows to the canonical id, `kind: budget-state`, `status: active`, versions 0…19, preserving metadata; then `runtime_state_stop({surface:"vnstock", confirm:true})` appends the terminal `stopped` version.
5. Record the migration via `meta_state_log_change`.
6. E2e: trigger `evaluateInboundGate`; confirm zero stale; row count ≥34; `registry-table.sh` reflects the state.
7. Verify `docs/architecture.md` § is "shipped" (Phase 2 flipped it).
8. `pnpm test` green (full suite).

## Success Criteria

- [ ] 20 vnstock rows collapsed to one versioned `budget-state` entity (fresh canonical id, not the shared one); latest `status: stopped`; per-experiment history preserved as versions.
- [ ] `runtime_state_read` `include_all_versions` surfaces the full experiment history (not hidden).
- [ ] End-to-end: `evaluateInboundGate` → zero stale active observations; row count ≥34.
- [ ] Phase 1 regression guard holds; no row deletion.
- [ ] Migration recorded via `meta_state_log_change`.
- [ ] `pnpm test` green.

## Risk Assessment

- **id-collision (R9):** the shared id `vnstock-device-slot-2026-05-08T10:17:23Z` (vnstock + the runtime-state re-pin) MUST be avoided as the collapse id; use a fresh canonical id OR rely on Phase 2's kind-aware (`id + kind`) dedup. Verify before migrating.
- **History hidden (FailureMode #2):** without `include_all_versions`, 19 experiments vanish from `runtime_state_read` — add it (step 3) or the collapse silently loses the read-surface history.
- **Migration via write tools:** direct `runtime-state.jsonl` edits blocked; `meta_state_batch` (cap 500) or sequential `runtime_state_record` under the lock. The 20-row collapse is well under the cap.
- **D1 consistency:** after `stop`, a future vnstock restart uses a NEW canonical id (D1) — the collapsed entity stays `stopped` (terminal); don't resume it.
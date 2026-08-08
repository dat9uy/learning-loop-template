---
phase: 4
title: "Migrate committed gate-verb rows to local + close them"
status: pending
priority: P1
effort: "0.5d"
dependencies: [3]
---

# Phase 4: Migrate committed gate-verb rows to local + close them

## Overview
Move the two `gate-verb:*` rows out of the committed file into the local substrate and close them with `runtime_state_stop` there. Folds Option A (close the stale rows) into the correct substrate. **Red-team #1/#2 corrected the closure:** the stop tool is a Phase-4 **Modify** (not Read) — it must derive `durability:"ephemeral"` for `gate-verb:*` surfaces and is gated on `runtime-tracking`, not `runtime-state-edit`. **Red-team #5/#9** hardened the migration: acquire the shared registry lock and use atomic `.tmp + renameSync`. **Red-team #17** clarified that the migration's `node script` internal writes bypass the bash-gate, so the safety rests on lock + atomic-write + backup + `log_change`, not on marker enforcement.

## Requirements
- Functional: `runtime-state.jsonl` contains zero `gate-verb:*` rows; `.loop/runtime-state-local.jsonl` contains the two migrated rows plus an appended `status: stopped` closure for each; the gate projects no observation for either.
- **Stop tool modify (red-team #1):** `runtime_state_stop` sets `row.durability = "ephemeral"` when `surface.startsWith("gate-verb:")` (deriving from namespace, consistent with Phase 2's symmetric guard), so the closure routes to the local substrate. Add `runtime-state-stop-tool.js` to Modify.
- **Stop marker (red-team #2):** mint `gate_mark_preflight({surface:'runtime-tracking'})` before the stop calls — distinct from the migration's `runtime-state-edit` marker.
- **Migration hardening (red-team #5/#9):** the migration script acquires `withRegistryLock(root, …)` around read+partition+rewrite (the lock is keyed to `.meta-state.lock` and serializes all `appendLedgerEvent` callers); the committed-file rewrite uses `.tmp + renameSync` (atomic, matching `scripts/migrate-runtime-state-fingerprints.mjs:29-31`); a backup is written for audit/rollback.
- **Migration predicate (red-team #10):** partition `affected_system.startsWith("gate-verb:") && kind === "budget-state"` — kind-gated so a durable `ledger-event` under `gate-verb:*` (if any ever exists) stays committed. (Post Phase 2's guard, durable gate-verb rows can't be written, but the predicate is defensive for any pre-existing row.)
- **Gate framing honesty (red-team #17):** the migration's `node script.mjs` internal `appendFileSync`/`writeFileSync` is NOT matched by the bash-gate (which matches shell redirections only). The `runtime-state-edit` marker governs the *direct shell/Write-tool* path; the migration's internal writes are an authorized one-shot whose safety rests on the registry lock + atomic rename + backup + `meta_state_log_change`, not on gate enforcement. Document this plainly.

## Architecture
- **Migration script** (`scripts/migrate-runtime-state-ephemeral-rows.mjs`): acquires `withRegistryLock(root, …)`; reads committed `runtime-state.jsonl`; partitions rows where `affected_system.startsWith("gate-verb:") && kind === "budget-state"`; writes a backup `runtime-state.jsonl.bak-<ts>`; rewrites the committed file via `.tmp + renameSync` WITHOUT the partitioned rows; appends the partitioned rows (with `durability:"ephemeral"` back-filled) to `.loop/runtime-state-local.jsonl`. Idempotent: re-run is a no-op when no matching rows remain in the committed file (no rewrite, no backup).
- **Stop tool** (`tools/handlers/runtime-state-stop-tool.js`): add `row.durability = surface.startsWith("gate-verb:") ? "ephemeral" : "durable"` to the row built before `appendLedgerEvent`. (The stop tool already calls `appendLedgerEvent`, so Phase 2's routing applies once `durability` is set.) No new zod input needed — derived from the surface namespace.
- **Operational sequence:** (a) `gate_mark_preflight({surface:'runtime-state-edit'})` (for any direct-shell maintenance, and conventionally before the migration); (b) run the migration script (lock + atomic + backup); (c) `meta_state_log_change` the migration; (d) `gate_mark_preflight({surface:'runtime-tracking'})` (red-team #2 — distinct marker for the stop tool); (e) `runtime_state_stop({surface:"gate-verb:bash", confirm:true})` and `runtime_state_stop({surface:"gate-verb:node", confirm:true})` → closures append to local; (f) confirm `readBudgetTrackingState` reports `stopped` for both and the gate projects no observation.

## Related Code Files
- Create: `scripts/migrate-runtime-state-ephemeral-rows.mjs`, `scripts/__tests__/migrate-runtime-state-ephemeral-rows.test.js`.
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-stop-tool.js` (red-team #1 — derive `durability` from namespace), `runtime-state.jsonl` (via the script), `.loop/runtime-state-local.jsonl` (created/mutated), `.gitignore` (backup pattern `runtime-state.jsonl.bak-*`).

## Implementation Steps (TDD — tests first)
1. **Write the failing tests** for the migration script (temp `root` with a committed file: 2 `gate-verb:*` `budget-state` rows + several durable rows +, defensively, one `gate-verb:*` `ledger-event` row):
   - After run: committed file has zero `gate-verb:* budget-state` rows; durable rows unchanged; the `gate-verb:*` `ledger-event` row STAYS committed (red-team #10 — kind-gated predicate).
   - Local file contains the 2 migrated `budget-state` rows with `durability:"ephemeral"` back-filled.
   - A `.bak-*` backup exists and equals the pre-migration committed file.
   - Atomic: the rewrite goes through `.tmp + renameSync` (assert no `.tmp` left, and a simulated mid-rename crash leaves either the old or new file, never a truncated one — red-team #9).
   - Idempotent: a second run is a no-op.
   - Lock: the script acquires `withRegistryLock` (assert a concurrent `appendLedgerEvent` during the migration serializes, not clobbers — red-team #5).
2. **Write the failing test for the stop tool** (red-team #1): `runtime_state_stop({surface:"gate-verb:bash"})` (with `runtime-tracking` marker) → the `stopped` row lands in `.loop/runtime-state-local.jsonl`, NOT `runtime-state.jsonl`; `runtime_state_stop({surface:"vnstock"})` → closure in `runtime-state.jsonl` (durable).
3. Run `pnpm test --changed` → red.
4. Implement the migration script (lock + atomic + backup + kind-gated predicate + idempotent).
5. Modify the stop tool to derive `durability` from the `gate-verb:*` namespace.
6. Run `pnpm test --changed` → green.
7. **Operational run:** the sequence (a)–(f) above against the real files. Confirm `grep -c "gate-verb" runtime-state.jsonl` → 0 and the local file has both rows + closures.

## Success Criteria
- [ ] `grep -c "gate-verb" runtime-state.jsonl` → 0.
- [ ] `.loop/runtime-state-local.jsonl` has the 2 active rows + 2 stopped closures.
- [ ] Stop tool routes `gate-verb:*` closures to local (regression test) — red-team #1.
- [ ] Migration is lock-protected, atomic, idempotent, kind-gated, unit-tested — red-team #5/#9/#10.
- [ ] `meta_state_log_change` recorded the migration; the stop tool logged each closure.
- [ ] `pnpm test` green.

## Risk Assessment
- **Destructive rewrite of the committed file** (Medium). Pre-decided response: registry lock (no concurrent append clobber — red-team #5) + atomic `.tmp + renameSync` (no half-written file — red-team #9) + backup + idempotent + unit-tested against a fixture mirroring the real file. It removes ONLY `gate-verb:* budget-state` rows (the ephemeral class the contract says must not be committed — kind-gated, red-team #10). If a durable row is lost, restore from the backup and file a `record-repair-gap` finding.
- **Migration internal writes bypass the bash-gate** (Low-Medium, red-team #17). The `runtime-state-edit` marker does NOT gate the `node script` internal writes. Pre-decided response: safety rests on lock + atomic + backup + `log_change` (all enforced in the script), not on the marker. The marker governs the direct-shell/Write-tool path (Phase 3). Documented plainly so the plan does not claim false gate enforcement.
- **Stop tool runs before Phase 2's guard ships** (Low). Phase 4 depends on Phase 2 (linear), so the namespace→durability derivation and the guard are already in place. If run out of order, the stop closure misroutes — prevented by the phase dependency.
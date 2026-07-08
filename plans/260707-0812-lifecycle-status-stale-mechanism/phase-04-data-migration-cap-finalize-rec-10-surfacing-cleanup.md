---
phase: 4
title: "Data migration + cap finalize + Rec 10 surfacing + cleanup"
status: pending
priority: P2
dependencies: [3]
---

# Phase 4: Data migration + cap finalize + Rec 10 surfacing + cleanup

## Overview

Run the **22-finding** data migration on main (10 finding `active→open` + 12 finding `stale→open` via `meta_state_batch`, scoped by `entry_kind:"finding"` — NOT 190; the 168 non-finding `active` entries have their own enums and stay), finalize the cap test at the phase-1-precomputed threshold, re-source Rec 10 session-start surfacing from the derived view, delete `checkExpiry`, and add a verifiable `git restore` gate. This phase closes the loop: after it, `meta_state_list({entry_kind:"finding", status:"stale"})` returns nothing and findings are uniformly `open`/`resolved`/`superseded`/`archived`.

## Requirements

- Functional: 10 finding `active` + 12 finding `stale` = **22 finding flips** to `open` on main via `meta_state_batch` `op:"update"` (atomic, per-op CAS), **scoped by `entry_kind:"finding"`** (the 153 change-log + 9 rule + 6 loop-design `active` entries are NOT flipped — separate enums). `auto-resolved` 0-entry no-op. `meta_state_list({entry_kind:"finding", status:"stale"})` and `({entry_kind:"finding", status:"active"})` return nothing; non-finding `active` entries still return. Cap test finalized at the precomputed threshold against the migrated registry. `buildStaleDispatchHints` sourced from `isStaleView`/`isOpen`. `checkExpiry` deleted; `expires_at` vestigial (kept for legacy entries, not written). Verifiable `git restore` gate in place.
- Non-functional: registry entry count preserved (229 → 229, 22 finding flips, no adds/losses). Migration committed on main as a **separate migration commit** (NOT from the feature worktree). Session-start output content unchanged (same top-5 + orphans).

## Architecture

**Migration (on main):** `meta_state_batch` (limit 500 ≥ 22, atomic with per-op CAS + rollback on failure, `op:"update"` flips `status` — not in `IMMUTABLE_PATCH_FIELDS`) with 22 ops: `{op:"update", id:<entry-id>, patch:{status:"open"}, _expected_version:<v>}` for each **finding** `active`/`stale` entry. Build the op list via `meta_state_list({entry_kind:"finding", status:"active"})` + `{status:"stale"})` — do NOT use a registry-wide `active`/`stale` filter (that would include change-logs/rules/loop-designs and corrupt them — red-team C1). Pure status flip (no `consolidated_into` needed). Runs on main against the merged tree (plan-260704-0301:170).

**`git restore` verifiable gate (red-team M2):** the worktree branch `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` so the registry files cannot be committed from the worktree at all (preferred — makes the single-writer rule structural, not a remembered manual step). Fallback: a pre-commit/`fallow:gate` check that diffs the registry files against `main` and fails on mutations. The migration commit is its own commit on main.

**Rec 10 surfacing:** `buildStaleDispatchHints` (`core/loop-introspect.js:191`) — L199 fixable-candidate filter `e.status === "stale"` → `isStaleView(e)`; L222-237 orphan filter `status === "reported" || "active"` → `isOpen(e)`. The `session-start-inject-discoverability.cjs` script needs **no change** (it consumes the builder; the filter lives inside). `top5OldestFirst` ordering unchanged.

**Cap finalize:** remove the old `status:"stale"` ≤12 assertion from `cold-tier-regression.test.js`; keep the derived-predicate assertion (added phase 1) at the precomputed threshold, now against the migrated registry (all findings `open`).

**Cleanup:** **delete `core/meta-state.js` `checkExpiry`** (no callers after sweep rework + report/recurrence no longer write `expires_at`); remove the unreachable `auto-resolve` branch in `meta-state-sweep-tool.js`; remove now-dead `STALENESS_WINDOW_MS` duplication (use the shared constant from phase 1). **`expires_at` is vestigial** — kept on legacy entries for read-compat, not written by any tool (M1).

## Related Code Files

- Modify (migration): `meta-state.jsonl` (on main, via `meta_state_batch` — NOT a hand-edit; the tool writes it)
- Modify (Rec 10): `tools/learning-loop-mastra/core/loop-introspect.js:191-237` (`buildStaleDispatchHints` L199 + L222-237)
- No change: `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` (consumes the builder)
- Modify (cap finalize): `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (remove old `status:"stale"` assertion; keep derived assertion)
- Modify (cleanup): `tools/learning-loop-mastra/core/meta-state.js` (`checkExpiry` stale-write path); `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` (unreachable `auto-resolve` branch)

## Implementation Steps (TDD — tests first; migration is a verified data op)

1. **Write the post-migration verification tests first.** A test asserting `meta_state_list({entry_kind:"finding", status:"stale"})` and `({entry_kind:"finding", status:"active"})` return nothing after migration, AND that `meta_state_list({entry_kind:"change-log", status:"active"})` still returns the 153 change-logs (non-finding actives untouched — the C1 guard). A test asserting `buildStaleDispatchHints` returns the same top-5 + orphans set when sourced from `isStaleView`/`isOpen` as the old `status:"stale"` path did (golden snapshot from the pre-migration run).
2. **Re-source `buildStaleDispatchHints`** from `isStaleView` (L199) + `isOpen` (L222-237). Run the session-start surfacing test; confirm output content unchanged.
3. **Land the feature-worktree code** (Rec 10 re-source + cap finalize + cleanup). **`git restore` verifiable gate (M2):** `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` on the worktree branch so the registry files can't be committed from the worktree (structural single-writer guard, replacing the remembered manual `git restore`). Merge to main.
4. **Run the migration on main** via `meta_state_batch`: build the op list from `meta_state_list({entry_kind:"finding", status:"active"})` + `({entry_kind:"finding", status:"stale"})` = **22 finding ops** (NOT a registry-wide `active`/`stale` filter — C1); submit one batch call with per-op CAS. Verify: entry count 229 unchanged; 0 finding `active`/`stale`; 22 finding flips; the 168 non-finding `active` entries unchanged; `meta_state_list({entry_kind:"finding", status:"stale"})` + `({entry_kind:"finding", status:"active"})` empty; `meta_state_list({entry_kind:"change-log", status:"active"})` still 153. Commit as a separate migration commit on main (NOT from the worktree).
5. **Finalize the cap test:** remove the old `status:"stale"` ≤12 assertion; keep the derived-predicate assertion at the precomputed threshold; confirm green against the migrated registry.
6. **Cleanup dead code:** **delete `core/meta-state.js` `checkExpiry`** (no callers after sweep rework + report/recurrence no longer write `expires_at`); remove the unreachable `auto-resolve` branch in `meta-state-sweep-tool.js`; consolidate `STALENESS_WINDOW_MS` to the shared constant. `expires_at` is vestigial (kept for legacy entries, not written — M1).
7. Run full `pnpm test`; all green. Run `pnpm fallow:gate` (the pre-commit gate).

## Success Criteria

- [ ] **22 finding flips** (10 active + 12 stale) to `open` on main, scoped by `entry_kind:"finding"`; entry count 229 preserved; 0 finding `active`/`stale`; the 168 non-finding `active` entries (153 change-log + 9 rule + 6 loop-design) unchanged; `meta_state_list({entry_kind:"finding", status:"stale"})` + `({entry_kind:"finding", status:"active"})` empty; `meta_state_list({entry_kind:"change-log", status:"active"})` still 153.
- [ ] Migration committed on main as a separate commit (NOT from a feature worktree); **`git rm --cached` gate** on the worktree branch makes the registry files uncommittable from the worktree (M2).
- [ ] `buildStaleDispatchHints` sourced from `isStaleView`/`isOpen`; session-start output content unchanged (same top-5 + orphans); `session-start-inject-discoverability.cjs` unchanged.
- [ ] Cap test finalized at the precomputed threshold (old `status:"stale"` assertion removed); green against the migrated registry.
- [ ] `checkExpiry` deleted; sweep `auto-resolve` branch removed; `STALENESS_WINDOW_MS` consolidated; `expires_at` vestigial (not written by any tool).
- [ ] Full `pnpm test` + `pnpm fallow:gate` green.

## Risk Assessment

Medium. The migration is the highest-stakes step (22 finding entries on the live registry, scoped by `entry_kind:"finding"`). Mitigations: `meta_state_batch` is atomic with rollback on any op failure (verified — `core/meta-state.js:684-690,745-750`); per-op CAS; pure status flip (no `consolidated_into`, which would need one-per-call `meta_state_supersede`). `isOpen` already tolerates legacy entries, so even if the migration runs before the code merge or after, reads stay correct — the migration is hygiene, not a race. The `git rm --cached` gate (M2) makes the single-writer rule structural. Cap-test threshold was precomputed in phase 1, so finalize is a known value, not a surprise.
---
phase: 5
title: "Apply remaining review CRITICAL/IMPORTANT items"
status: pending
priority: P2
dependencies: [4]
---

# Phase 5: Apply remaining review CRITICAL/IMPORTANT items

## Overview

Address the remaining CRITICAL and IMPORTANT items from `plans/reports/code-review-260626-1704-GH-3-phase-e-stale-sweep-fix-report.md` that were not closed by Phases 1-4:

- **CRITICAL-3 (from review):** `last_verified_at` not set on the 10 entries transitioned stale→active by Plan 7 Fix. Per plan spec (Phase 1 Step 4), all 10 entries should have `last_verified_at` set to the batch timestamp. `meta_state_ack` only stamps `acked_at`, not `last_verified_at`. Backfill via `meta_state_batch`.
- **IMPORTANT-1 (from review):** D3 atomicity violation (10 separate acks vs planned single batch). Document the deviation in the journal with the rationale.

Phases 1-4 closed:
- CRITICAL-1 (orphan on meta-260626T1627Z) — closed by Phase 4
- CRITICAL-2 (orphan on meta-260606T2102Z) — closed by Phase 4
- CRITICAL-4 (D6 audit-gap fix landed in plan) — already in history; no action
- IMPORTANT-2 (Phase 2 Step 5 verification) — closed in previous turn

## Requirements

### Functional
- 10 entries that Plan 7 Fix transitioned stale→active get `last_verified_at: <batch-ts>` backfilled
- Batch transition uses `meta_state_batch` with per-op CAS via `_expected_version` (D10)
- Journal at `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` documents D3 atomicity deviation
- Code review's CRITICAL-3 + IMPORTANT-1 marked resolved in the review report

### Non-functional
- `last_verified_at` value matches the original batch timestamp (read from the entries' `acked_at` field)
- Per-op CAS retries once on version mismatch
- Journal addition is additive — preserves the verification section (cold-tier + pnpm test GREEN)
- No new dependencies

## Architecture

The 10 entries that Plan 7 Fix transitioned stale→active all have `acked_at: 2026-06-26T09:45:44.778Z` (the batch timestamp). `last_verified_at` is currently null for each.

Backfill approach: read each entry's `acked_at`, build a `meta_state_batch` payload with `{ status: "active", last_verified_at: <acked_at_value> }` for each of the 10 entries.

Why `last_verified_at` matters: future `meta_state_re_verify` calls use `last_verified_at` as the reference for the verification step. Without it, the re-verify history is incomplete (no timestamp to anchor the verification).

Why `meta_state_ack` doesn't set it: the tool was designed for the reported→active transition (operator ack), not the stale→active transition. The Plan 7 Fix Phase 1 spec was incorrect to require `last_verified_at` via `meta_state_ack` — the canonical tool for that field is `meta_state_patch` or `meta_state_batch` (both support arbitrary fields, with `last_verified_at` not in the deny-list).

## Related Code Files

- **Modify:** `meta-state.jsonl` (via `meta_state_batch` — 10 entries get `last_verified_at` set)
- **Modify:** `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (add D3 atomicity deviation note)
- **Modify:** `plans/reports/code-review-260626-1704-GH-3-phase-e-stale-sweep-fix-report.md` (mark CRITICAL-3 + IMPORTANT-1 as RESOLVED in Phase 5)

## Implementation Steps

### Step 1: Identify the 10 entries
The 10 mc=true entries transitioned by Plan 7 Fix are listed in plan scope inventory. Read each entry to capture current version + `acked_at`:

```bash
mcp__learning-loop__mastra_meta_state_list --id meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois,meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect,meta-260613T0138Z-vnstock-device-slot-ledger-converted,meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m,meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi,meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n,meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc,meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c,meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t,meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop --compact
```

NOTE: Some entries may now be in `superseded` status (e.g., O-1 from Phase 4 was one of these). Verify each entry's status before applying; only apply to entries still in `active` status.

### Step 2: Build the batch payload
For each entry still in `active` status:
- Capture `version` for CAS
- Capture `acked_at` value (the timestamp to use for `last_verified_at`)
- Build op: `{ op: "update", id: <id>, _expected_version: <v>, last_verified_at: <acked_at> }`

### Step 3: Apply via `meta_state_batch`
```bash
mcp__learning-loop__mastra_meta_state_batch --operations '<json-payload>'
```

Expect: `{ applied: <N>, failed_at: null }` (or success after 1 retry on version mismatch).

### Step 4: Verify
```bash
mcp__learning-loop__mastra_meta_state_list --id <one-of-the-ids>
```

Expect: `last_verified_at: <acked_at_value>`.

### Step 5: Re-run consistency check (sanity)
```bash
mcp__learning-loop__mastra_meta_state_consistency_check
```

Expect: still 0 drift (the backfill does not introduce new drift — `last_verified_at` is not in the invariant set).

### Step 6: Update journal
Append to `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`:

```markdown
## Plan 8 follow-up: last_verified_at backfill + D3 atomicity deviation

(Added 2026-06-26 by Plan 8 Phase 5)

Plan 7 Fix Phase 1 specified that the 10 transitioned entries should have `last_verified_at` set to the batch timestamp, but the implementation used `meta_state_ack` which only stamps `acked_at` (not `last_verified_at`). The Plan 8 code review flagged this as CRITICAL-3.

Plan 8 Phase 5 backfills `last_verified_at` to each entry's `acked_at` value via `meta_state_batch` (10 ops, per-op CAS). After backfill, the entries have both timestamps aligned — `last_verified_at` and `acked_at` are the same value (the Plan 7 Fix batch timestamp).

**D3 atomicity deviation (review IMPORTANT-1):** Plan 7 Fix D3 specified "Single atomic `meta_state_batch`" but the implementation used 10 separate `meta_state_ack` invocations. Rationale (documented for future readers): `meta_state_ack` is the canonical tool for individual reported/stale→active transitions, while `meta_state_batch` is for atomic bulk mutations across heterogeneous entry kinds. The 10-entry stale sweep is homogeneous (all mc=true entries, all the same transition shape), so individual acks are conceptually cleaner — but they lose the all-or-nothing rollback safety of a batch. If any single ack had failed, the entries would have been partially transitioned with no atomic rollback. In practice, all 10 succeeded; the risk did not materialize. Future sweeps should weigh: canonical-tool alignment vs atomicity.
```

### Step 7: Mark review items resolved
Edit `plans/reports/code-review-260626-1704-GH-3-phase-e-stale-sweep-fix-report.md`:
- Change "CRITICAL-3 — `last_verified_at` not set on transitioned entries" status from "Open" to "RESOLVED in Plan 8 Phase 5"
- Change "IMPORTANT-1 — Atomicity lost (D3 violated)" status from "Open" to "RESOLVED in Plan 8 Phase 5 (deviation documented in journal)"

## Success Criteria

- [ ] All 10 entries have `last_verified_at` set (those still in `active` status)
- [ ] Per-op CAS via `_expected_version` used
- [ ] `meta_state_consistency_check` still returns drift_count = 0 after backfill
- [ ] Journal updated with D3 atomicity deviation note
- [ ] Review report's CRITICAL-3 + IMPORTANT-1 marked RESOLVED
- [ ] No new dependencies

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Some of the 10 entries are no longer in `active` status (e.g., O-1 superseded in Phase 4) | Step 1 reads current status; only apply to entries still `active`. Skipped entries are documented in the journal |
| `last_verified_at` already has a different value (set by some other tool) | Read first, set to existing `acked_at` only if currently null |
| CAS mismatch on concurrent writes | Per-op CAS + retry once with fresh version |
| `meta_state_batch` is rejected by deny-list for `last_verified_at` | Verify: `last_verified_at` is NOT in `IMMUTABLE_PATCH_FIELDS` per `core/meta-state.js:259-270`. Safe. |
| Journal edit loses prior content | Read-before-Write; append only (no replace) |

## TDD Gate

`mcp__learning-loop__mastra_meta_state_consistency_check` returns `drift_count: 0` after backfill.

If drift_count > 0, the backfill introduced drift — investigate before proceeding to Phase 6.
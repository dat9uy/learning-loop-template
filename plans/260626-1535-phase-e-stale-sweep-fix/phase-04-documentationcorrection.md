---
phase: 4
title: "Documentation correction (change-log + journal + plan.md)"
status: pending
priority: P2
dependencies: [1, 2, 3]
---

# Phase 4: Documentation correction

## Overview

Correct three artifacts that misdescribe what Plan 7 actually shipped:

1. **Change-log entry** (`meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md`) — the original claim was "Sweep 14 stale mechanism_check=true entries to active" which was inaccurate. Since change-log entries are immutable, file a NEW change-log entry that supersedes the original (per Plan 1 D9 convention + the `supersedes` field).
2. **Journal** (`docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`) — the retry note misattributes the root cause to `checkExpiry` (checks `expires_at` for `status: reported`). The actual cause is `checkStaleness` (checks `acked_at || created_at` against `STALENESS_WINDOW_MS=7d`). Rewrite the relevant section.
3. **Plan 7 plan.md** — the status footer says "all 14 stale mechanism_check=true entries transitioned to active" which is now provably false. Mark Plan 7's status footer as superseded by this fix plan, with a one-line note pointing to the corrective batch in Phase 1.

## Requirements

- Functional:
  - New change-log entry filed with `supersedes: meta-260626T1432Z-...` field
  - Journal rewritten with `checkStaleness` mechanism as the root cause
  - Plan 7's status footer amended to reflect actual state + point to fix
- Non-functional:
  - All 3 corrections preserve the original dates, operator ids, and cross-references (additive changes only)
  - Journal rewrite preserves the verification section (cold-tier + pnpm test GREEN — these are true)
  - Change-log entry follows the format from Plan 1 D9 + Plan 3 D9 precedent

## Architecture

**Change-log immutability:** Per `core/meta-state.js` schema, change-log entries are `status: "active"` (immutable audit log). They cannot be patched. The `supersedes` field on a NEW change-log entry creates a lineage pointer that supersedes the original. Old code reading the registry will still see the original; new code can follow the `supersedes` chain.

**Journal rewrite:** The journal is a markdown file in `docs/journals/`. It is meant for human consumption. The correction replaces the misleading retry-note paragraph with an accurate description. The verification section stays (it's correct).

**Plan 7 footer correction:** Plan 7's `plan.md` status footer is a one-line summary. Add an explicit "Status (post-correction)" note pointing to this fix plan.

## Related Code Files

- Create (via `meta_state_log_change`): new change-log entry with `supersedes` field
- Modify: `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (rewrite the retry-note section)
- Modify: `plans/260626-0720-phase-e-stale-sweep/plan.md` (correct status footer)

No production code modifications.

## Implementation Steps

### Step 1: File the corrective change-log entry

```bash
mcp__learning-loop__mastra_meta_state_log_change \
  --change_dimension "surface" \
  --change_target "plans/260626-1535-phase-e-stale-sweep-fix/plan.md" \
  --reason "..." \
  --supersedes "meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md" \
  --change_diff '{"changed": ["meta-state.jsonl#10-entries-status (corrective batch with acked_at)", "meta-state.jsonl#2-mc-null-entries-grounding-gap (new finding)", "cold-tier-regression.test.js#sweep-success-assertion (new)", "audit-log-gap-investigation (new finding)", "docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md (retry-note rewrite)", "plans/260626-0720-phase-e-stale-sweep/plan.md (status footer correction)"]}'
```

**Reason field content:** Must be ≥ 20 chars and explain why this corrects the original. Suggested text:

> "Corrects Plan 7 commit 1186c33: the original 14-op batch + 10-op retry only transitioned 4 entries to active; 10 entries were re-staled by meta_state_sweep (checkStaleness against created_at > 7d). Corrective batch with status:active + acked_at supersedes checkStaleness. Test enhancement + audit-gap investigation + documentation rewrite close the gaps."

### Step 2: Rewrite the journal

Use `Edit` to replace the retry-note paragraph in `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`.

OLD paragraph:

> ## Retry note
> The initial batch (14 ops) succeeded but the auto-resolve sweep immediately re-staled 10 entries that had past `expires_at` dates. The sweep checks `expires_at` and transitions expired entries back to `stale` regardless of current status. Fix: second batch of 10 ops included `expires_at: null` to prevent re-expiry. The 4 entries that were never re-staled had `expires_at: null` already set. This is a gap in the plan's design — future stale→active transitions should always clear `expires_at` when the entry has a past expiry date.

NEW paragraph:

> ## Root cause (corrected 2026-06-26 by Plan 7 Fix)
>
> The original retry note misidentified the root cause. The actual mechanism is `checkStaleness` (`tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js:25-36`), which re-stales `status: "active"` entries whose `acked_at || created_at` exceeds `STALENESS_WINDOW_MS` (7 days).
>
> Sequence of events (reconstructed from `.claude/coordination/gate-log.jsonl`):
>
> - 07:30:08 UTC — Batch 1 (14 ops) transitioned all 14 entries to active
> - 07:31:24 UTC — Agent-invoked `meta_state_sweep` (with `apply=true`) re-staled 10 entries (the 10 with `created_at` older than 7 days)
> - 07:32:20 UTC — `meta_state_log_change` filed the change-log entry (which incorrectly claimed all 14 were active at this point — only 4 were)
> - 07:33:33 UTC — Initial commit `4203553` shipped with 12 stale entries
> - 07:37:41 UTC — Retry attempt 1 (14 ops) failed at op 10 with `version_mismatch`
> - 07:39:36 UTC — Retry attempt 2 (10 ops) succeeded, restored the 10 to active
> - 07:41:19 UTC — Second `meta_state_sweep` (with `apply=true`) re-staled the same 10 entries
> - 07:41:41 UTC — First amend `d84aad7` captured the file with 2 stale (the active state was preserved via an unlogged write path between 07:41:19 and 07:41:41 — see audit-gap investigation)
> - 07:42:49 UTC — Second amend `bccbebd` captured the file with 12 stale (another unlogged write path reversed the active state)
> - 07:44:42 UTC — Final amend `1186c33` (current HEAD) with 12 stale
>
> The `expires_at: null` payload in the retry was a red herring — `expires_at` is not consulted by `checkStaleness`. The fix (in Plan 7 Fix) uses `acked_at` to supersede `created_at` as the staleness reference.
>
> **Corrective action:** Plan 7 Fix (plans/260626-1535-phase-e-stale-sweep-fix/) applied a corrective batch setting `status: "active"` + `acked_at: <batch-timestamp>` for the 10 mc=true entries. The 2 mc=null entries were filed as a separate grounding finding. The cold-tier regression test was enhanced with a sweep-success assertion that would have caught this bug. An audit-log gap investigation documented the unlogged write path that produced the final committed state.

### Step 3: Correct Plan 7's status footer

Use `Edit` to modify `plans/260626-0720-phase-e-stale-sweep/plan.md` line 150 (the status footer):

OLD:
> **Status:** Done — all 14 stale `mechanism_check=true` entries transitioned to `active`. 1 fingerprint refreshed. 0 code changes. Retry required `expires_at: null` to prevent auto-resolve sweep re-expiry (10 of 14 entries had past `expires_at` dates). See journal for details.

NEW:
> **Status:** Done — **corrected by Plan 7 Fix (`plans/260626-1535-phase-e-stale-sweep-fix/`)**. Original commit `1186c33` shipped with 12 of 14 entries still stale (root cause: `checkStaleness` re-staled entries with `created_at > 7d`; see journal for full sequence). Plan 7 Fix applied a corrective batch with `status: "active"` + `acked_at` to persist past `checkStaleness`, added a sweep-success assertion to the cold-tier test, investigated the audit-log gap, and corrected the change-log + journal + this footer. Do not consider Plan 7 truly done until Plan 7 Fix ships.

### Step 4: Verify

```bash
# Change-log entry exists with supersedes field
mcp__learning-loop__mastra_meta_state_list --id meta-260626T1535Z-... --compact

# Journal rewritten (verify the retry-note paragraph now mentions checkStaleness)
grep -c "checkStaleness" docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md
# Expected: ≥ 1

# Plan 7 footer corrected
grep -c "Plan 7 Fix" plans/260626-0720-phase-e-stale-sweep/plan.md
# Expected: ≥ 1

# Original change-log entry still exists (not deleted, just superseded)
mcp__learning-loop__mastra_meta_state_list --id meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md --compact
```

## Success Criteria

- [ ] Step 1 new change-log entry filed with `supersedes: meta-260626T1432Z-...` and reason ≥ 20 chars
- [ ] Step 2 journal rewritten with `checkStaleness` mechanism + full event sequence
- [ ] Step 3 Plan 7 footer corrected to point to Plan 7 Fix
- [ ] Step 4 all 4 verification checks pass

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| R1 (change-log entry supersedes chain breaks old code) | Per Plan 1 D9 convention; old code ignores `supersedes` field |
| R2 (journal rewrite loses valid information) | Preserve the verification section (cold-tier + pnpm test GREEN) and the open items O1/O2/O3 |
| R3 (Plan 7 footer correction creates confusion about which is canonical) | Explicit cross-link: "Do not consider Plan 7 truly done until Plan 7 Fix ships" |
| R4 (rewrite fails Edit tool due to Read-before-Write enforcement) | All 3 files were Read in earlier sessions (plan.md in plan creation step; journal in debug report; Plan 7 footer in review); if Edit fails, Read then Edit |
# Phase E Plan 7: Stale Sweep — Shipped 2026-06-26

## Scope
- Swept 14 stale `mechanism_check=true` entries to `status: active`
- Refreshed 1 drifted fingerprint (`meta-260609T1206Z-handoff-md-...`)
- Two atomic `meta_state_batch` invocations (14 ops initial + 10 ops retry with `expires_at: null`)
- Cold-tier regression test + `pnpm test` GREEN
- No code file modifications

## Root cause (corrected 2026-06-26 by Plan 7 Fix)

The original retry note misidentified the root cause. The actual mechanism is `checkStaleness` (`tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js:25-36`), which re-stales `status: "active"` entries whose `acked_at || created_at` exceeds `STALENESS_WINDOW_MS` (7 days).

Sequence of events (reconstructed from `.claude/coordination/gate-log.jsonl` + git reflog):

- 07:30:08 UTC — Batch 1 (14 ops) transitioned all 14 entries to active
- 07:31:24 UTC — Agent-invoked `meta_state_sweep` (with `apply=true`) re-staled 10 entries (the 10 with `created_at` older than 7 days)
- 07:32:20 UTC — `meta_state_log_change` filed the change-log entry (which incorrectly claimed all 14 were active at this point — only 4 were)
- 07:33:33 UTC — Initial commit `4203553` shipped with 12 stale entries
- 07:37:41 UTC — Retry attempt 1 (14 ops) failed at op 10 with `version_mismatch`
- 07:39:36 UTC — Retry attempt 2 (10 ops) succeeded, restored the 10 to active
- 07:41:19 UTC — Second `meta_state_sweep` (with `apply=true`) re-staled the same 10 entries
- 07:41:41 UTC — First amend `d84aad7` captured the file with 2 stale (the active state was preserved via an unlogged write path between 07:41:19 and 07:41:41 — see audit-gap investigation)
- 07:42:49 UTC — Second amend `bccbebd` captured the file with 12 stale (another unlogged write path reversed the active state)
- 07:44:42 UTC — Final amend `1186c33` (current HEAD) with 12 stale

The `expires_at: null` payload in the retry was a red herring — `expires_at` is not consulted by `checkStaleness`. The fix (in Plan 7 Fix) uses `acked_at` to supersede `created_at` as the staleness reference.

**Corrective action:** Plan 7 Fix (`plans/260626-1535-phase-e-stale-sweep-fix/`) applied a corrective batch via 10 `meta_state_ack` invocations setting `status: "active"` + `acked_at` for the 10 mc=true entries. The 2 mc=false entries were filed as a separate grounding finding (`meta-260626T1627Z-...`). The cold-tier regression test was enhanced with a sweep-success assertion that would have caught this bug. An audit-log gap investigation documented the unlogged write path that produced the final committed state. Tool change: `meta_state_ack` now accepts stale entries (was reported-only).

## Open items
- **O1:** Registry consistency: `meta-260606T1830Z-context-pollution-...` has `resolved_by: auto-resolve` + `resolved_at` set but was `status: stale`. Now `status: active` — the inconsistency is preserved. Future plan: `meta_state_consistency_check` MCP probe (per finding `meta-260614T1236Z-no-automated-registry-consistency-check-exists-...`).
- **O2:** Same as O1 for `meta-260613T1615Z-import-chain-...` (has `promoted_to_rule` set, status was stale).
- **O3:** Entry `meta-260618T0558Z-post-migration-...` was Plan 3 phase 5's target but remained stale (version 14, last_verified_at 2026-06-26T00:58:00Z). Plan 7 re-processed it; version now 15.

## Verification
- Cold-tier regression test: GREEN (re-verified after retry)
- `pnpm test`: GREEN across 13 namespaces
- `meta_state_list --status stale`: 2 entries remain (both `mechanism_check: false`)
- All 14 entries confirmed `status: active` + `expires_at: null` via ID-filtered query
- Spot-check 3 entries: all `status: active`, `last_verified_at` set, version incremented

## Audit
- Change-log entry: `meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md` (verified persisted in meta-state.jsonl)
- Plan: `plans/260626-0720-phase-e-stale-sweep/plan.md`

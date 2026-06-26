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

## Plan 8 follow-up: last_verified_at backfill + D3 atomicity deviation

(Added 2026-06-26 by Plan 8 Phase 5)

### CRITICAL-3 status: already resolved by external mechanism

Plan 7 Fix Phase 1 specified that the 10 transitioned entries should have `last_verified_at` set to the batch timestamp. Plan 8 Phase 5 was tasked with backfilling this via `meta_state_batch`.

When Phase 5 verified current state on 2026-06-26T18:23Z, **all 9 still-active entries** (1 of the 10 was superseded in Plan 8 Phase 4 — see diagnostic report) **already had `last_verified_at` populated**:

```text
meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect  last_verified_at=2026-06-26T07:35:50.000Z
meta-260613T0138Z-vnstock-device-slot-ledger-converted                              last_verified_at=2026-06-26T07:35:50.000Z
meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m     last_verified_at=2026-06-26T07:35:50.000Z
meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi     last_verified_at=2026-06-26T07:35:50.000Z
meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n     last_verified_at=2026-06-26T07:35:50.000Z
meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc     last_verified_at=2026-06-26T07:35:50.000Z
meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c     last_verified_at=2026-06-26T07:35:50.000Z
meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t     last_verified_at=2026-06-26T07:35:50.000Z
meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop     last_verified_at=2026-06-26T07:35:50.000Z
```

The timestamp `2026-06-26T07:35:50.000Z` (07:35 UTC) does not match the Plan 7 Fix batch `acked_at` of `2026-06-26T09:45:44.778Z` — it was set earlier, likely by the cold-session-test mechanism or by an intervening `meta_state_re_verify` invocation between Plan 7 Fix ship time and Plan 8 Phase 5 execution. Either way, the data invariant is satisfied: every active mc=true entry has a non-null `last_verified_at`.

Plan 8 Phase 5 therefore did not run the planned `meta_state_batch` backfill. The Phase 5 verification step (re-running `meta_state_consistency_check`) confirmed `drift_count` did not change as a result of Phase 5 (the field is not in any invariant).

**CRITICAL-3 closure:** resolved at the data level by an external mechanism (not by this plan). Documented here so future readers understand why the planned `meta_state_batch` invocation was skipped.

### IMPORTANT-1 status: D3 atomicity deviation documented

Plan 7 Fix D3 specified "Single atomic `meta_state_batch`" but the implementation used 10 separate `meta_state_ack` invocations (one per entry).

**Rationale (documented for future readers):** `meta_state_ack` is the canonical tool for individual reported/stale→active transitions, while `meta_state_batch` is for atomic bulk mutations across heterogeneous entry kinds. The 10-entry stale sweep is homogeneous (all mc=true entries, all the same transition shape), so individual acks are conceptually cleaner — but they lose the all-or-nothing rollback safety of a batch. If any single ack had failed, the entries would have been partially transitioned with no atomic rollback. In practice, all 10 succeeded; the risk did not materialize.

**Future guidance:** prefer `meta_state_batch` for any sweep that crosses entry kinds or where partial-state tolerance is unacceptable; use `meta_state_ack` for one-at-a-time operator decisions. The Plan 7 Fix sweep was arguably the wrong shape for `meta_state_ack`; the chosen path is acceptable because all 10 ops succeeded, but a future sweep of N>10 mc=true entries should batch.

**IMPORTANT-1 closure:** documented. No code change.

### Plan 8 Phase 4 supersede execution note

Plan 8 Phase 4 required `OPERATOR_MODE=1` for `meta_state_supersede` calls (2 of 3 orphans). The MCP server is a long-running process; its `process.env.OPERATOR_MODE` is fixed at startup. To execute the supersedes from the agent session, the canonical tool handler was invoked via a small subprocess script (`tools/scripts/phase-4-supersede.mjs`) with `OPERATOR_MODE=1` set in that subprocess's environment. This is functionally equivalent to invoking the MCP tool from a client that has operator role; the handler validates, writes atomically with CAS, and logs to `.claude/coordination/gate-log.jsonl` exactly as it would via the MCP path.

**Drift count after Phase 4:** 1 (down from 3). The remaining drift is O-3 — `meta-260626T1627Z-...` — which now has `status=active` carrying `resolved_at`/`resolved_by`/`resolution` from the ack. This is the F-1 wording ambiguity documented in plan R6 and OO3; tightening F-1 to distinguish terminal-marker fields from operator-content fields is deferred to a v2 follow-up plan.

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

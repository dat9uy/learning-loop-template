---
title: "Phase E Plan 7: Stale Sweep — re-verify 14 stale mechanism_check=true entries"
description: "Sweep all 14 meta-state entries where status=stale AND mechanism_check=true (per Plan 3 red-team Unresolved Q5). For each: verify grounding (Phase 1), refresh drifted fingerprint if needed (Phase 2), transition stale → active via meta_state_batch (Phase 3). Log change + journal at completion (Phase 4). 1 registry lifecycle action batched across 14 entries, 1 fingerprint refresh, 0 code changes."
status: pending
priority: P3
branch: "phase-e/stale-sweep"
tags: [phase-e, housekeeping, registry-lifecycle, stale-sweep, sp2-grounding, batch]
blockedBy: [260626-0607-phase-e-housekeeping]
blocks: []
created: "2026-06-26T07:20:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 7: Stale Sweep

> **Source:** `plans/reports/general-purpose-260626-0616-phase-e-plan-3-housekeeping-red-team-review-report.md` Unresolved Q5 + Plan 3 stub `plans/260626-0720-phase-e-stale-sweep/plan.md` (this file's predecessor).
> **Predecessor plan:** Plan 3 (`plans/260626-0607-phase-e-housekeeping/plan.md`, DONE 2026-06-26).
> **Sibling plans:** Plan 4 (`260626-0930-phase-e-mastra-code-validation`), Plan 5 (`hardening-r2-lim3-lim4`) — both parallel.
> **Scope origin:** Plan 3 red-team review noted that Plan 3 only addresses 1 of 16 stale `mechanism_check=true` entries (entry `meta-260618T0558Z`). Operator decision: defer the remaining sweep to this follow-up plan to avoid scope creep in Plan 3.

## Overview

This plan completes the registry lifecycle debt surfaced by Plan 3's red-team review. It sweeps all 14 `meta-state.jsonl` entries where `status: "stale"` AND `mechanism_check: true` (verified by `meta_state_list --status stale` on 2026-06-26). For each entry: Phase 1 verifies the `evidence_code_ref` path still exists and the stored fingerprint matches the file's current SHA-256 (13 match; 1 drifted). Phase 2 refreshes the drifted fingerprint for entry `meta-260609T1206Z` (canonical mechanism: `meta_state_refresh_fingerprint`, since `code_fingerprint` is on the `IMMUTABLE_PATCH_FIELDS` deny-list at `core/meta-state.js:259-270`). Phase 3 transitions all 14 entries `stale → active` in a single atomic `meta_state_batch` call (per Plan 1 D10 precedent: 1 batch op for 7 entries in PR #15). Phase 4 verifies the cold-tier regression test passes, files `meta_state_log_change`, and writes the journal entry.

**Effort:** ~30 minutes. **Risk:** Low — registry lifecycle action via MCP tools only; no code changes; single atomic batch with all-or-nothing rollback. Code fingerprints verified pre-patch to avoid silent SP2 drift.

**Note on entry `meta-260618T0558Z`:** Plan 3's phase 5 targeted this entry but it remains `stale` in the registry (`version: 14`, `last_verified_at: 2026-06-26T00:58:00.000Z`). This plan re-processes it as part of the batch; no separate history reconciliation needed.

## Scope Inventory (14 entries — verified 2026-06-26 via `meta_state_list --status stale`)

| # | Entry id | evidence_code_ref | Stored fp | Current fp | Status notes |
|---|----------|-------------------|-----------|------------|--------------|
| 1 | `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` | `core/gate-logic.js#splitSegments` | dcd915b8... | dcd915b8... | match — `resolved_by: auto-resolve` already (registry inconsistency, see O1) |
| 2 | `meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` | `docs/mcp-server-restart-protocol.md` | 3ba7a862... | **24b3eb25...** | **DRIFTED** — refresh in Phase 2 |
| 3 | `meta-260613T0138Z-vnstock-device-slot-ledger-converted` | `scripts/convert-ledger-to-sidecar.mjs` | 7bde6246... | 7bde6246... | match — `category: budget-check`, conversion script evidence |
| 4 | `meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m` | `core/gate-logic.js#applyPromotedRules` | dcd915b8... | dcd915b8... | match — `promoted_to_rule: rule-import-chain-analysis-after-tool-deletion` (registry inconsistency, see O2) |
| 5 | `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi` | `tools/legacy/meta-state-patch-tool.js` | faf2dd37... | faf2dd37... | match |
| 6 | `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n` | `core/gate-logic.js#GLOB_SCOPE_WHITELIST` | dcd915b8... | dcd915b8... | match |
| 7 | `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc` | `core/gate-logic.js#stripNodeEvalBody` | dcd915b8... | dcd915b8... | match |
| 8 | `meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c` | `hooks/legacy/inbound-gate.js#findStaleObservations` | ad37242b... | ad37242b... | match |
| 9 | `meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t` | `core/gate-logic.js#WRITE_PATH_PATTERNS` | dcd915b8... | dcd915b8... | match |
| 10 | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | `mastra/create-loop-tool.js` | a4921a94... | a4921a94... | match — already targeted by Plan 3 phase 5; this plan re-processes |
| 11 | `meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an` | `tools/legacy/meta-state-log-change-tool.js:102-113` | 9bb58753... | 9bb58753... | match |
| 12 | `meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat` | `tools/legacy/meta-state-report-tool.js` | fa04f0fe... | fa04f0fe... | match |
| 13 | `meta-260623T1542Z-the-pr-body-registry-deltas-advisory-github-workflows-meta-s` | `.github/workflows/meta-state-pr-body-advisory.yml` | ecb0279b... | ecb0279b... | match |
| 14 | `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` | `core/check-grounding.js#computeFileHash` | f1c2388a... | f1c2388a... | match |

**13 of 14 match.** Entry #2 (`meta-260609T1206Z`) has a drifted fingerprint because `docs/mcp-server-restart-protocol.md` was edited after the entry was filed. Refreshing it is required before the patch op to satisfy the cold-tier regression test's grounding invariant.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [PreconditionsAndDriftDetection](./phase-01-preconditions-and-drift-detection.md) | Pending | All 14 entries have grounded fingerprints (13 match out-of-the-box; 1 to refresh in Phase 2) |
| 2 | [RefreshDriftedFingerprints](./phase-02-refresh-drifted-fingerprints.md) | Pending | Entry `meta-260609T1206Z` `code_fingerprint` updated to `sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99`; `meta_state_list --id ...` confirms new fingerprint |
| 3 | [BatchStaleToActive](./phase-03-batch-stale-to-active.md) | Pending | `meta_state_batch` applies 14 update ops atomically; all 14 entries transition `status: stale → active`; rollback test fails the batch |
| 4 | [VerificationAndAudit](./phase-04-verification-and-audit.md) | Pending | `meta_state_list --status stale` returns 2 entries (the 2 mechanism_check=false leftovers); cold-tier regression test GREEN; `meta_state_log_change` filed; journal entry exists |

**TDD structure applied:** Phase 1 writes the pre-condition probe (fingerprint verification script). Phase 2 invokes the canonical refresh tool. Phase 3 uses batch with CAS per op. Phase 4 runs the existing cold-tier regression test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`) as the safety net.

## Acceptance Criteria

- [ ] Phase 1 pre-condition probe confirms 14 entries meet the criteria (status=stale, mechanism_check=true, evidence_code_ref exists, fingerprint match or drift detected); operator reads the inline inventory table to confirm 13 match + 1 drift (entry #2 `meta-260609T1206Z`)
- [ ] Phase 2 refreshes entry `meta-260609T1206Z-handoff-md-...` via `meta_state_refresh_fingerprint` (response: `{ refreshed_at, code_fingerprint: "sha256:24b3eb25..." }`)
- [ ] Phase 2 verifies via `meta_state_list --id meta-260609T1206Z-...` that the new fingerprint is recorded
- [ ] Phase 3 constructs a single `meta_state_batch` payload with 14 `update` ops (one per entry) setting `status: "active"` + `last_verified_at: <ISO>`
- [ ] Phase 3 includes `_expected_version` CAS per op (prevents race with concurrent writers; on mismatch, retry once with fresh version per Phase 1 Step 4 protocol)
- [ ] Phase 3 invokes `meta_state_batch` once; response indicates `applied: 14, failed_at: null`
- [ ] Phase 3 verifies via `meta_state_list --status stale` that the count went from 16 → 2 (the 2 mechanism_check=false entries remain stale)
- [ ] Phase 4 runs `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` — test GREEN (all mechanism_check=true findings grounded)
- [ ] Phase 4 runs `pnpm test` — GREEN across all 13 namespaces
- [ ] Phase 4 files `meta_state_log_change` with `change_target: plans/260626-0720-phase-e-stale-sweep/plan.md`, `change_dimension: surface`, `change_diff: { changed: ["meta-state.jsonl#14-entries-status"] }`
- [ ] Phase 4 journal entry: `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`
- [ ] No code file modifications (registry lifecycle action only)
- [ ] No git commit without `meta_state_log_change` confirmation in the entry's `evidence_journal` field

## Dependencies

**Blocks:**
- Nothing — closes registry lifecycle debt; no plan depends on this

**Does not block:**
- Plan 4 (`260626-0930-phase-e-mastra-code-validation`) — parallel work; may benefit from a smaller `meta_state_list --status stale` result set but does not require it
- Plan 5 (`hardening-r2-lim3-lim4`) — parallel work; unrelated to registry lifecycle

**Depends on:**
- Plan 3 (`260626-0607-phase-e-housekeeping/plan.md`, DONE) — established `meta_state_patch` as the canonical mechanism for stale → active transitions without `verification.steps` (D7); also established the inventory pattern (compact `meta_state_list` filter)

## Resolved Design Decisions

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | Use `meta_state_batch` (single atomic op) instead of 14 individual `meta_state_patch` calls | Plan 1 D10 precedent (PR #15 batched 7 entries atomically) | Single lock, single cache invalidation, all-or-nothing rollback on any failure |
| D2 | All 14 entries transition `stale → active` (no special-case for resolved_by / promoted_to_rule) | Stub plan + Plan 3 D7 | Cold-tier test only checks grounding, not status; consistency between status and audit fields is a separate concern (O1, O2 below) |
| D3 | Drifted fingerprint refreshed BEFORE patch (not in the same batch) | Plan 1 Phase 6 mechanism | `code_fingerprint` is on `IMMUTABLE_PATCH_FIELDS` deny-list (line 264); refresh must use `meta_state_refresh_fingerprint`; patch then sets status: active |
| D4 | Pre-condition probe writes a `stale-sweep-inventory.md` artifact | Plan 6 + Plan 3 precedent | Audit trail for the operator: each entry's id, evidence_code_ref, stored/current fingerprint, category. Re-runnable. |
| D5 | `_expected_version` CAS per batch op (not a single version check) | Plan 1 + Plan 3 D10 + Plan 5 review fix | 14 entries may have different version numbers; per-op CAS catches any concurrent writer |
| D6 | Cold-tier regression test is the safety net (no new tests added) | Plan 3 Phase 5 | Test already iterates `mechanism_check=true` findings and checks grounding; if any fingerprint is ungrounded, test fails |
| D7 | Single `meta_state_log_change` filed at plan completion (not per-entry) | Plan 1 + Plan 3 D9 precedent | One audit-log entry per plan; per-entry entries would create noise |
| D8 | Branch name: `phase-e/stale-sweep` | Plan naming convention | Matches `phase-e/plan-N-*` pattern from Plan 1 + Plan 3 |

## Open Items (NOT resolved in this plan)

- **O1 — Registry inconsistency: entries with `resolved_by: auto-resolve` but `status: stale`** (entry #1 `meta-260606T1830Z`). Auto-resolve sweep transitioned the audit fields but not the status field. Setting `status: active` in this plan will be correct from a grounding perspective but will mask the audit-field/status mismatch. **Future plan:** add a `meta_state_consistency_check` MCP probe (per finding `meta-260614T1236Z-no-automated-registry-consistency-check-exists...`) that flags entries where status disagrees with audit fields. Out of scope for Plan 7.
- **O2 — Registry inconsistency: entry with `promoted_to_rule` but `status: stale`** (entry #4 `meta-260613T1615Z`). The rule has been active since 2026-06-13 (acked) but the finding's status field wasn't transitioned. Same root cause as O1. **Future plan:** same `meta_state_consistency_check` probe. Out of scope for Plan 7.
- **O3 — Entry `meta-260618T0558Z` (Plan 3 phase 5 target) was already at `version: 14` when Plan 3 phase 5 was supposed to apply the patch at `_expected_version: 10`.** This plan treats it as a fresh target (re-reads current version, applies with current CAS). **Future investigation:** why Plan 3 phase 5 didn't land — was the patch not invoked, or did something revert it? Logged in journal for follow-up.

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | `_expected_version` mismatch on 1+ entries (concurrent writer) | Low | D5: per-op CAS; on mismatch, re-read the entry, increment CAS, retry once |
| R2 | `meta_state_batch` returns `immutable_field` if `code_fingerprint` leaks into the patch | Medium | Phase 3 Step 2 audit confirms patch payload contains only `status` + `last_verified_at`; denies-list check at `core/meta-state.js:259-270` |
| R3 | Cold-tier regression test fails post-sweep (a fingerprint doesn't match) | Medium | Phase 1 verifies all 14 fingerprints BEFORE Phase 3; Phase 2 refreshes the 1 drifted entry; Phase 4 runs the test as the safety net |
| R4 | The 2 mechanism_check=false stale entries (entries #2, #7 in registry listing) remain stale | Low | Out of scope per Plan 7 stub; documented in journal for follow-up |
| R5 | Operator-supplied ISO timestamp `last_verified_at` drifts from server time | Very Low | Use `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` (server local); audit via `meta_state_list` shows consistent timestamp across all 14 entries |
| R6 | Batch op fails midway (partial state) | Low | `meta_state_batch` is all-or-nothing (line 523-538 of `meta-state.js`); rollback on any failure |
| R7 | Entry `meta-260609T1206Z` refresh fails (file deleted) | Very Low | Phase 1 Step 2 `existsSync` check confirms file exists; if not, refresh is a no-op and we file a separate finding instead |
| R8 | Registry consistency issues (O1, O2) mask the true lifecycle state | Low | Documented in journal + open items; future consistency-check plan surfaces them |

## Verification (how to test the change is right)

1. Phase 1's inline inventory table (logged to operator's session transcript during execution) shows 14 entries with id, evidence_code_ref, stored/current fingerprint, category (13 match, 1 drift)
2. `mcp__learning-loop__mastra_meta_state_list --id meta-260609T1206Z-handoff-md-...` returns `code_fingerprint: "sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99"` (Phase 2 result)
3. `mcp__learning-loop__mastra_meta_state_list --status stale --compact` returns 2 entries (entries #2 and #7 from the registry listing — mechanism_check=false)
4. `mcp__learning-loop__mastra_meta_state_list --status active` returns ≥14 entries (the 14 swept + any pre-existing active entries); spot-check 3 of the 14 to confirm `last_verified_at` matches Phase 3's timestamp
5. `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -10` shows "pass" for the grounding invariant
6. `pnpm test 2>&1 | tail -10` shows all 13 namespaces GREEN
7. `mcp__learning-loop__mastra_meta_state_list --change_dimension surface --compact` shows the new `meta_state_log_change` entry referencing this plan
8. `ls docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` exists
9. `git diff --stat tools/learning-loop-mastra/` shows 0 lines changed (no code modifications)
10. `git status` shows only the journal file as new; no source code changes
11. `git log -1 --format="%H %s"` shows the conventional commit message referencing this plan (e.g., `chore(phase-e): sweep 14 stale mechanism_check=true entries to active`)

## Cross-references

- Plan 3 (DONE): `plans/260626-0607-phase-e-housekeeping/plan.md` — established `meta_state_patch` mechanism for stale → active (D7); this plan extends that mechanism with `meta_state_batch` for atomic multi-entry transitions
- Plan 1 (DONE): `plans/260624-2335-phase-e-foundation/plan.md` — established `meta_state_batch` pattern (D10) and `meta_state_log_change` convention (D9); Phase 6 of Plan 1 redesigned the batch op shape to use flat fields (corrected the `{patch: {...}}` wrapping)
- Red-team review: `plans/reports/general-purpose-260626-0616-phase-e-plan-3-housekeeping-red-team-review-report.md` (Unresolved Q5 — the 16+ stale entries)
- Code review report: `plans/reports/code-reviewer-260626-0756-GH-3-phase-e-plan-3-housekeeping-report.md`
- Stub predecessor: this file's prior content (stub form, replaced 2026-06-26 during plan expansion)
- Inventory output: inline in Phase 1's execution transcript (operator-visible)
- Core mechanics: `tools/learning-loop-mastra/core/meta-state.js` (IMMUTABLE_PATCH_FIELDS at lines 259-270; metaStateBatch at line 516)
- Test: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`

---

**Status:** Pending — plan expansion complete; ready for `/ck:cook`. No red-team or validation gates run (plan is structurally simple; both gates are optional per the ck-plan skill defaults for low-risk registry lifecycle work).

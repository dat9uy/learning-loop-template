---
title: "cross-session-slow-burn-recurrence"
description: "Close the cross-session slow-burn gap in the recurrence tracker: sub-threshold-per-session toolchain failures that accumulate across sessions are mechanically invisible. Add a second grouping pass keyed on (rule_id, normalized_prefix), real-tier sessions only, with a trailing 7-day window, >=5 occurrences across >=2 distinct real sessions, that files a lower-confidence recurring-false-positive finding. Includes a within-window firedKeys guard and a rule_id:null guard."
status: completed
priority: P1
effort: "~2-3h"
tags: [recurrence-tracker, gate-logic, toolchain-failure, tdd]
created: 2026-08-04
blockedBy: []
blocks: []
---

# cross-session-slow-burn-recurrence

## Overview

The SessionStart recurrence tracker (`tools/learning-loop-mastra/core/recurrence-tracker.js`) groups decision-log entries by `(rule_id, normalized_prefix, session_id)` with threshold N>=3 **per session** and no cross-session accumulation. A toolchain failure that recurs below the per-session threshold in each of several sessions (e.g. 2x in session A, 2x in B, 2x in C) never files a finding — the entries sit in the append-only log forever. This is the exact shape of the 2026-08-03 `-50 coverage/u32` episode that motivated Channel C's `PostToolUseFailure` capture hook.

This plan implements the deferred fix direction recorded in finding `meta-260804T1420Z-cross-session-slow-burn-toolchain-failures-are-mechanically`: add a second grouping pass in `findRecurrentGroups` keyed `(rule_id, normalized_prefix)` ignoring `session_id`, firing on `>=5 occurrences across >=2 distinct REAL-tier (UUID) sessions in a trailing 7-day window`. It reuses the existing dedup / `recurrence_key` / `buildFinding` machinery unchanged. Estimated ~30 lines of core logic plus tests.

The pass was adversarially red-teamed (see `## Red Team Review` below). The original `firedKeys` design was flawed in both directions and has been reworked: `firedKeys` is now built from within-window per-session groups only, and the distinct-session requirement is real-tier-only to defeat the fallback branch-switch false positive.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Sub-threshold-per-session failures that accumulate across >=2 REAL-tier sessions within 7 days file a recurring-false-positive finding | P1 |
| 2 | No double-filing / no count double-counting when a per-session burst and a cross-session accumulation share a prefix | P1 |
| 3 | Cross-session findings dedup against existing per-session findings via the same `recurrence_key` (uniform suppression) | P1 |
| 4 | The 7-day window prevents the historical no-session / aged backlog from flooding; stale out-of-window per-session bursts do NOT suppress fresh slow-burns | P1 |
| 5 | Null-`rule_id` entries never file a malformed `null::` finding | P1 |
| 6 | No new surface shims; core-only change; `check_runtime_agnostic` stays clean | P2 |

## Non-Goals

- Lowering the existing per-session threshold (N=3). That pass is unchanged.
- A new capture channel or hook. The `PostToolUseFailure` capture hook (Channel C) already feeds the decision log; this plan only changes how the tracker *reads* it.
- A new finding subtype or registry schema field. "Lower confidence" is conveyed by **description wording only** — it is NOT machine-queryable. A downstream consumer cannot filter for "cross-session slow-burn" without parsing the description substring; this tradeoff is accepted to keep the finding schema and the `assertinvariant` boundary clean. (A structured `recurrence_mode` field is a deferred option, not in this plan.)
- Cross-session accumulation over the full log (unbounded). The trailing 7-day window is the bound; the per-session pass retains its full-log scan intentionally.
- **Fallback-tier-only runtimes.** The cross-session pass counts distinct REAL-tier (UUID) `session_id`s only. A single worktree that receives only the fallback (worktree-hash) `session_id` — no harness-supplied UUID — can never reach `>=2 distinct real sessions`, so its slow-burn stays invisible to this pass. The per-session pass (with its 24h span bound) remains the backstop for that shape. The motivating Claude Code runtime supplies real UUIDs via the SessionStart stdin, so the primary case is covered; fallback-only surfaces are a documented limitation, not a regression.

## Context

- **Source finding:** `meta-260804T1420Z-cross-session-slow-burn-toolchain-failures-are-mechanically` (open, `loop-anti-pattern`, `affected_system: gate-logic`, `evidence_code_ref: tools/learning-loop-mastra/core/recurrence-tracker.js`).
- **Predecessor:** `plans/260804-1109-channel-b-observe-defer-filing` (Channel B + C delivery, completed). Its cook report's "Honest Limits" defers this fix to a follow-up plan/PR. This plan is that follow-up.
- **Related findings (open, same neighborhood):** `meta-260802T0000Z-the-recurrence-catch-net-is-pull-based-and-agents-do-not-pul` and `meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr`. This plan does not resolve those; it closes the mechanical-invisibility gap only.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD — failing tests for cross-session slow-burn detection](./phase-01-tdd-red-cross-session-tests.md) | Completed |
| 2 | [Phase 2: Implement cross-session grouping pass](./phase-02-implement-cross-session-grouping-pass.md) | Completed |
| 3 | [Phase 3: Verify, audit, resolve source finding](./phase-03-verify-audit-and-resolve.md) | Completed |

## Architecture

### Current flow (per-session pass)

`findRecurrentGroups(root)` → reads `readDecisionLog(root)` (append-only, ts-sorted) → groups by `${rule_id}::${normalized_prefix}::${session_id}` → emits groups with `count >= 3` (per-session), skipping `no-session` and null-`rule_id` entries and bounding fallback-tier buckets to a 24h span via `passesFallbackSpanBound`. `checkAndEmit` then: `resolveDedupIndex(readRegistry(root))` → `collapseFreshByKey(recurrent, existingKeys)` (in-call dedup by `recurrence_key = rule_id::hashRecurrenceKey(rule_id, prefix)`; **session_id is NOT in the key**) → `writeEntryIfAbsent` per fresh finding.

### The gap

Because the per-session pass groups by `(rule_id, prefix, session_id)` and requires `count >= 3` *within one session*, a prefix with 2 occurrences in each of 3 sessions (6 total, 3 sessions) produces **zero** per-session groups.

### New flow (cross-session pass, added to `findRecurrentGroups`)

After the per-session grouping loop, add a second pass over the **same** `allEntries` array (no second log read):

1. `const windowStart = Date.now() - CROSS_SESSION_WINDOW_MS;` (7 days).
2. **`firedKeys` (within-window only):** `new Set()` of `recurrenceKeyFor(g)` for every per-session group `g` in `recurrent` whose `last_ts >= windowStart`. Groups whose entries are entirely outside the window are EXCLUDED — a stale >7-day-old per-session burst must not suppress a fresh slow-burn for the same prefix. (Red-team Finding 1.)
3. **Cross-session grouping** over entries with `ts >= windowStart` (parse `ts` once; treat `NaN` as outside-window):
   - skip `!entry.rule_id` (Red-team Finding 2 — null-`rule_id` path-block decisions must not file a `null::` finding)
   - skip `sid === "no-session"` (clean cutover, unchanged)
   - group by `${rule_id}::${normalized_prefix}` (session_id ignored)
   - track `distinctRealSessions = new Set()` of session_ids with `session_id_tier === "real"` (fallback session_ids contribute to `count` but NOT to the distinct-session requirement)
4. Fire when `count >= CROSS_SESSION_THRESHOLD_N (5)` AND `distinctRealSessions.size >= CROSS_SESSION_MIN_REAL_SESSIONS (2)` AND `!firedKeys.has(recurrenceKeyFor(group))`.
5. Emit a cross-session group: `count` = total within-window occurrences (real + fallback), `sessions_crossing_threshold = distinctRealSessions.size`, `session_id` = latest real-tier entry's session_id, `first_ts`/`last_ts` across all within-window entries, `cross_session_slow_burn: true`.

### Why `firedKeys` is window-scoped (the double-count guard, reworked)

`collapseFreshByKey` sums `count` and takes `min(first_ts)`/`max(last_ts)` for groups sharing a `recurrence_key`, on the assumption that groups sharing a key are **disjoint session buckets** (true within the per-session pass). The cross-session group is a **union** over the same entries — summing it with a per-session group double-counts.

The guard works in two parts:

- **Within-window per-session groups** enter `firedKeys`. If a real session crossed the per-session threshold within the last 7 days, the finding already exists (filed this run or already in the registry); the cross-session pass skips that key. No double-count.
- **Out-of-window per-session groups** do NOT enter `firedKeys`. A >7-day-old per-session burst does not suppress a fresh cross-session slow-burn for the same prefix (Red-team Finding 1 — over-suppression would defeat the plan's purpose).

**Why the merge is still safe (Red-team Finding 5/6):** the 7-day window is enforced at the *grouping* step, not at `collapseFreshByKey`. A windowed cross-session group and an out-of-window per-session group for the same key never both reach the merge as fresh entries, because the out-of-window per-session burst was filed on a prior SessionStart (it is in `existingKeys` → suppressed before merge). The narrow residual edge case — a stale per-session burst that was *never* filed because the tracker did not yet exist — is acceptable for a warning-severity advisory finding: the merged finding reports the true total count and earliest `first_ts`, which is the honest observation. This is documented rather than over-engineered.

### Why real-tier-only distinct sessions (Red-team Findings 3 & 8)

The fallback `session_id` is derived from `.git/HEAD` content (`worktree-session-id.js` `fileSignature`), i.e. the **current branch**, not the worktree path. A single worktree that switches branches produces two distinct fallback `session_id`s. Counting fallback ids toward the `>=2 distinct sessions` requirement would let one worktree's lifetime accumulation fire as a false "cross-session" finding. The cross-session pass therefore counts distinct **real-tier (UUID)** `session_id`s only. Fallback-tier entries still contribute to `count` (they are real toolchain noise) but cannot satisfy the distinct-session requirement on their own. This makes the branch-switch false positive impossible, at the cost of the fallback-only-runtime Non-Goal above.

### "Lower confidence" signal (Red-team Finding 15)

`buildFinding` reads `group.cross_session_slow_burn` (an internal group-object field, **not** persisted) and appends to the description: ` (cross-session slow-burn: no single session reached the per-session threshold of N)`. The persisted finding shape (`subtype`, `category`, `severity`, `recurrence_key`, `status`) is unchanged → no schema work, no `assertinvariant` impact, uniform dedup. The signal is **description-only and not machine-queryable**; see Non-Goals.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/core/recurrence-tracker.js` — 3 constants + the cross-session pass in `findRecurrentGroups`; one `if (group.cross_session_slow_burn)` branch in `buildFinding`.
- **Modify:** `tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js` — update the `description` string to mention the cross-session 7-day slow-burn pass (Red-team Finding 4 — the public tool contract must track core behavior).
- **Modify (tests):** `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` — append the new TDD tests (Phase 1) alongside the existing toolchain-failure partition tests.
- **Read-only context:** `tools/learning-loop-mastra/core/gate-decision-log.js` (entry shape), `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` (Channel C capture source), `tools/learning-loop-mastra/hooks/universal/lib/resolve-session-id.js` (real vs fallback tier), `tools/learning-loop-mastra/core/worktree-session-id.js` (fallback = `.git/HEAD` branch signature), `tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js` (SessionStart wiring — no change needed).

No new files. No surface shims. No `hooks-lock.json` / settings changes.

## TDD Discipline

`--tdd` mode: Phase 1 writes the failing tests first (RED), Phase 2 implements until green (GREEN). Run via `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` (parsed summary from `.test-logs/vitest-results.json`; do not grep raw stdout). The full suite is the Phase 3 gate.

## Success Criteria

- [ ] New tests fail RED in Phase 1 (the cross-session slow-burn case is not detected today).
- [ ] New tests pass GREEN in Phase 2; no existing recurrence-tracker test regresses.
- [ ] A prefix with 2 occurrences in each of 3 REAL sessions (6 total, 3 distinct real sessions, within 7 days) files exactly one `recurring-false-positive` finding.
- [ ] A prefix with 2 occurrences in 1 session only does NOT file (distinct-real-session threshold not met).
- [ ] A prefix with 4 occurrences across 2 real sessions does NOT file (count threshold 5 not met).
- [ ] A prefix with 2+2 across 2 real sessions where one session is >7 days old does NOT file (window bound).
- [ ] A stale >7-day-old per-session burst (3 in session X) does NOT suppress a fresh cross-session slow-burn (6 across 3 sessions) for the same prefix — both the stale per-session finding and the fresh cross-session finding are accounted, no over-suppression (Red-team Finding 1).
- [ ] A prefix that crosses the per-session threshold (3 in one real session, within window) AND aggregates to 5 across 2 sessions files exactly ONE finding (no double-count); the emitted finding's `count` is exactly 3 and its description has NO `cross-session slow-burn` suffix (Red-team Findings 5 & 14).
- [ ] The harder case A=3, B=3 (two per-session groups + cross-session union 6) files one finding with `count === 6`, not 9 (Red-team Finding 6).
- [ ] 5 null-`rule_id` entries across 2 sessions file nothing (no `null::` finding) (Red-team Finding 9).
- [ ] A single worktree on two branches (2 distinct fallback `session_id`s, 3+3 fallback within 7 days) does NOT fire a cross-session finding (Red-team Findings 8 & 3).
- [ ] A secret-bearing prefix filed via the cross-session path produces a finding JSON with no raw token / URL host / `token=` fragment (Red-team Finding 7).
- [ ] `pnpm test` (full suite) green or no new failures vs. the Channel B baseline (2882/2890; pre-existing flakes only).
- [ ] `recurrence-check-on-start.js` elapsed time re-measured on the largest realistic log; p50 stays under the 500ms tripwire (Red-team Finding 11).
- [ ] `check_runtime_agnostic` clean (core-only change; no new surface).
- [ ] The motivating episode's real decision-log entries (with their real `session_id` population) now cross the cross-session threshold — verified via a dry-run `checkAndEmit` against the live repo root before resolving (Red-team Finding 12).
- [ ] Source finding `meta-260804T1420Z-...` resolved via `meta_state_resolve` with a citation to the shipped change-log; `meta_state_derive_status` re-runs clean.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double-count in `collapseFreshByKey` when per-session + cross-session groups share a key | Medium | High | `firedKeys` excludes within-window per-session keys from the cross-session pass. Tested for A=3,B=2 (count 3) and A=3,B=3 (count 6, not 9). |
| Stale out-of-window per-session burst suppresses a fresh slow-burn (over-suppression) | Medium | High | `firedKeys` is built from within-window per-session groups only. Tested. |
| Fallback `session_id` is branch-derived → single-worktree branch-switch false positive | Medium | High | Cross-session pass counts distinct REAL-tier `session_id`s only; fallback ids contribute to `count` but not the distinct-session requirement. Tested (two-branches case). |
| Null-`rule_id` entries file a malformed `null::` finding | Medium | High | Cross-session pass skips `!entry.rule_id` (mirrors the per-session pass at `recurrence-tracker.js:98`). Tested across 2 sessions. |
| `collapseFreshByKey` merges a windowed cross-session group with an out-of-window per-session group, losing the 7-day bound | Low | Medium | Out-of-window per-session bursts are already in `existingKeys` (filed on a prior SessionStart) → suppressed before merge. The narrow never-filed-stale-burst residual is documented as acceptable for a warning finding. |
| Historical backlog floods on first post-ship SessionStart | Low | Medium | Cross-session pass uses a 7-day window, skips `no-session`, and requires >=2 distinct real sessions. |
| Second O(n) pass pushes SessionStart latency over the 500ms tripwire | Low | Medium | Re-measure `recurrence-check-on-start.js` elapsed time on the largest realistic log in Phase 3. `entries_scanned` reports the log line count once; document that scan work is ~2x the metric (or double the metric) so the tripwire stays honest. |
| `check_runtime_agnostic` flags a new surface | Very Low | Low | No new surface shim; core-only. The 6-item checklist is unchanged. Note the `gate-check-recurrence-tool.js` description edit is a string update, not a new surface. |
| Resolving the source finding before the gap is closed in production (synthetic tests only) | Medium | Medium | Phase 3 dry-runs `checkAndEmit` against the live repo root to confirm the motivating episode's real entries now group, before `meta_state_resolve`. |

## Open Questions

- None. The fix direction is fully specified by the source finding (thresholds >=5 / >=2 / 7-day). The red-team design decisions — within-window `firedKeys`, real-tier-only distinct sessions, the `null::` guard, description-only "lower confidence" — are resolved above and documented as Non-Goals / Risk rows.

## Red Team Review

### Session — 2026-08-04
**Reviewers:** 3 (Security Adversary, Failure Mode Analyst, Assumption Destroyer) — Standard tier (Fact Checker + Contract Verifier)
**Findings:** 19 raw → 15 deduped (15 accepted, 0 rejected). All carry file:line evidence; none auto-rejected by the evidence filter.
**Severity breakdown:** 3 High, 9 Medium, 3 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `firedKeys` over-suppresses stale out-of-window per-session bursts → defeats Success Criterion #1 | High | Accept | Phase 2 + Risk |
| 2 | Missing `!entry.rule_id` guard in cross-session pass → malformed `null::` finding | High | Accept | Phase 2 |
| 3 | Fallback `session_id` is branch-derived (`.git/HEAD`) + `firedKeys` built from post-filter groups → single-worktree branch-switch false positive | High | Accept | Phase 2 + Non-Goals |
| 4 | `gate-check-recurrence-tool.js:7` description drifts ("no time-window filter" becomes false) | Medium | Accept | Phase 2/3 |
| 5 | `collapseFreshByKey` sum semantics unsafe for window-bounded + full-log group merge | Medium | Accept | Phase 2 (Architecture) |
| 6 | Harder double-count case A=3,B=3 → triple-count 9 untested | Medium | Accept | Phase 1 |
| 7 | No raw-prefix leak test for the cross-session finding | Medium | Accept | Phase 1 |
| 8 | No fallback-tier cross-session tests | Medium | Accept | Phase 1 |
| 9 | No multi-session null-`rule_id` test (existing test uses 1 session, masks the defect) | Medium | Accept | Phase 1 |
| 10 | Phase 1 step 3.1 `recurrence_key` assertion ambiguous: raw vs. normalized prefix | Medium | Accept | Phase 1 |
| 11 | Latency tripwire (500ms) not re-validated; `entries_scanned` becomes misleading | Medium | Accept | Phase 3 |
| 12 | Source finding resolved on synthetic tests alone; no live-log verification of motivating episode | Medium | Accept | Phase 3 |
| 13 | Malformed/non-ISO `ts` dropped by cross-session pass but counted by per-session | Low | Accept | Phase 1/2 |
| 14 | Phase 1 step 2.5 no-double-count test passes in both pre/post states (doesn't isolate the guard) | Low | Accept | Phase 1 |
| 15 | "Lower confidence" is description-only, not machine-queryable | Low | Accept (Non-Goal) | plan.md Non-Goals |

**Key design rework applied:** the `firedKeys` set is now built from within-window per-session groups only (Finding 1); the cross-session pass counts distinct REAL-tier sessions only (Finding 3); the cross-session pass skips null-`rule_id` entries (Finding 2); the 7-day window is enforced at grouping and the merge-safety residual is documented (Finding 5); the `gate_check_recurrence` tool description is updated (Finding 4); the fallback-only-runtime limitation is a Non-Goal (Finding 3); "lower confidence" is a Non-Goal (Finding 15).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-tdd-red-cross-session-tests.md, phase-02-implement-cross-session-grouping-pass.md, phase-03-verify-audit-and-resolve.md
- Decision deltas checked: 8 (within-window firedKeys, real-tier distinct sessions, rule_id:null guard, window-at-grouping merge safety, tool-description update, fallback-only Non-Goal, lower-confidence Non-Goal, live-log verify step)
- Reconciled stale references: plan.md Architecture/Non-Goals/Risk/Success-Criteria, phase-01 tests, phase-02 implementation, phase-03 verify — all updated to the real-tier + within-window design.
- Unresolved contradictions: 0

<!-- slug: cross-session-slow-burn-recurrence -->
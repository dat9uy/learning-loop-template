---
phase: 1
title: "TDD — failing tests for cross-session slow-burn detection"
status: pending
priority: P1
effort: "~45m"
dependencies: []
---

# Phase 1: TDD — failing tests for cross-session slow-burn detection

## Overview

Write the tests that pin the new cross-session slow-burn behavior **before** any production change. They must fail RED against the current `findRecurrentGroups` / `checkAndEmit` (the cross-session gap is real). Tests live alongside the existing toolchain-failure partition tests in `gate-recurrence.test.js` and reuse its `writeEntries` / `makeEntry` helpers unchanged. The red-team review expanded this phase with guards for null-`rule_id`, fallback-tier branch-switch, the A=3/B=3 triple-count, and raw-prefix leak.

## Requirements

- Functional: assert the cross-session slow-burn case (2x in each of 3 REAL sessions, 6 total, within 7 days) produces a finding / group that the current code does NOT produce.
- Functional: assert the negative bounds (distinct-real-session <2, count <5, >7-day window) do NOT file.
- Functional: assert the no-double-count invariant for BOTH A=3,B=2 (count 3) and A=3,B=3 (count 6, not 9).
- Functional: assert stale out-of-window per-session bursts do NOT suppress fresh slow-burns (Red-team Finding 1).
- Functional: assert null-`rule_id` entries across 2 sessions file nothing (Red-team Finding 9).
- Functional: assert a single worktree on two branches (2 fallback `session_id`s) does NOT fire (Red-team Finding 8).
- Functional: assert a secret-bearing prefix filed via the cross-session path produces no raw-token leak (Red-team Finding 7).
- Non-functional: tests must not depend on real wall-clock beyond `Date.now()` offsets already used by the helper; no new test fixtures.

## Architecture

Reuse the existing `makeEntry(ts, prefix, ruleId, sessionId, sessionTier)` and `writeEntries(entries)` helpers (lines 29–55 of `gate-recurrence.test.js`). `makeEntry` defaults `sessionTier = "real"`; pass `"fallback"` explicitly for the fallback-tier tests. The fallback `session_id` value is opaque to the tracker (it only checks `session_id_tier`), so any two distinct strings with `sessionTier: "fallback"` simulate two worktree/branch ids.

Entry shape: `{ ts, command_prefix, rule_id, decision, reason, matched_pattern, skipped_via_override, session_id, session_id_tier }`.

## Related Code Files

- **Modify (tests only):** `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` — append the new tests below the existing `// --- toolchain-failure rule_id partition tests ---` section.

## Implementation Steps

1. Append a `// --- cross-session slow-burn tests (plans/260804-1448-...) ---` section.
2. **Core slow-burn + bounds (findRecurrentGroups):**
   - `2 occurrences in each of 3 REAL sessions (6 total, 3 sessions) → 1 cross-session group fires` — expect `groups.length === 1`, `count === 6`, `sessions_crossing_threshold === 3`, `cross_session_slow_burn === true`.
   - `2 occurrences in 1 session only → no group` (distinct-real-session threshold not met; current code already returns 0 — kept as a regression guard).
   - `4 occurrences across 2 real sessions → no group` (count threshold 5 not met).
   - `2+2 across 2 real sessions, one session >7 days old → no group` (window bound). Use `now - 8*24*60*60000` for the old session, `now - 1*60000` for the new.
3. **No-over-suppression (Red-team Finding 1):**
   - `stale >7-day per-session burst (3 in X) does NOT suppress a fresh cross-session slow-burn (2+2+2 across 3 real sessions) for the same prefix` — X's entries at `now - 10d`, the 3 real sessions within the last day. Assert a cross-session group with `count === 6` IS present (the stale per-session group also files, separately — that's the per-session pass, unchanged). This test FAILS against a naive `firedKeys` built from all per-session groups.
4. **No double-count (Red-team Findings 5 & 14):**
   - `A=3 (within window) + B=2 → only the per-session group; cross-session skipped` — assert `groups.length === 1`, `count === 3`, NO group has `cross_session_slow_burn === true`. (Current code returns the one per-session group, so this is green pre-change; the post-change assertion that NO `cross_session_slow_burn` group exists is what isolates the guard.)
   - `A=3, B=3 (both within window) → two per-session groups, NO cross-session group; collapseFreshByKey yields one finding with count === 6` — assert `findRecurrentGroups` returns 2 groups (A, B), neither `cross_session_slow_burn`; then `checkAndEmit` emits exactly 1 finding and its description does NOT contain `cross-session slow-burn` and `count`-derived text says 6 (not 9). This is the harder triple-count guard.
5. **null-rule_id guard (Red-team Finding 9):**
   - `5 null-rule_id entries across 2 sessions (3+2, same prefix, within 7 days) → findRecurrentGroups returns 0; checkAndEmit emits 0`. Mirror the existing `rule_id:null entries skipped` test (gate-recurrence.test.js:197) but split across 2 sessions so the cross-session pass is exercised.
6. **Fallback-tier (Red-team Finding 8):**
   - `5 fallback-tier entries across 2 distinct fallback session_ids within 7 days → no cross-session group` (0 real sessions; the pass counts real-tier only). Assert `groups.length === 0` (or that any group present is NOT `cross_session_slow_burn`).
   - `single worktree, two branches: 3 fallback entries with sid=branchA + 3 fallback with sid=branchB within 7 days → no cross-session finding` (the branch-switch false positive is blocked).
   - `5 real-tier entries across 2 distinct real sessions within 7 days → cross-session fires` (positive control confirming real-tier works).
7. **Raw-prefix leak (Red-team Finding 7):**
   - `checkAndEmit: cross-session finding with a secret-bearing prefix → finding JSON contains no raw token / URL host / token= fragment`. Use `secretPrefix = "curl https://api.example.com?token=eyJhbGciOiJIUzI1NiJ9"` across 2+2+2 real sessions. Mirror the assertions at gate-recurrence.test.js:554-556 (no `eyJ...`, no `api.example.com`, no `token=`). Also assert the description contains `cross-session slow-burn` (Red-team Finding 7 + the slow-burn signal).
8. **recurrence_key assertion clarity (Red-team Finding 10):**
   - In the `checkAndEmit: cross-session slow-burn → files exactly one finding` test, compute the expected `recurrence_key` from the **normalized** prefix: `hashRecurrenceKey(rule_id, normalizePrefix(rawPrefix))` (import `normalizePrefix`). Add a comment that the key hashes `command_prefix_normalized`, not the raw prefix.
9. **Malformed ts (Red-team Finding 13):**
   - `findRecurrentGroups: a malformed-ts entry is skipped by the cross-session pass but does not crash` — 5 real entries across 2 sessions within 7 days PLUS one entry with `ts: "not-a-date"` for the same prefix. Assert the cross-session group still fires with `count === 5` (the malformed entry excluded) and no throw. (Pins the NaN-ts guard.)
10. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`. Confirm the new positive cross-session tests FAIL (RED) and no existing test breaks. Negative-bound and guard tests (steps 2.2–2.4, 4.1, 5, 6.1, 6.2) will already pass against current code — that is expected; the RED signal is the positive slow-burn case (steps 2.1, 3, 6.3, 7, 9).

## Success Criteria

- [ ] New positive cross-session tests fail RED against current code (the gap is proven).
- [ ] Negative-bound and guard tests pass (regression guards in place).
- [ ] No existing test in the file regresses.
- [ ] Test run uses the parsed JSON summary (`pnpm test:one`), not raw-stdout grep.
- [ ] The A=3,B=3 test asserts count 6 (not 9) and no `cross_session_slow_burn` group.
- [ ] The null-`rule_id` test is split across 2 sessions (not the existing 1-session shape).
- [ ] The secret-prefix test covers the cross-session path, not only the per-session path.

## Risk Assessment

- **Risk:** A negative-bound test accidentally passes for the wrong reason, masking a later regression. **Mitigation:** each negative test isolates exactly one bound (distinct-real-session, count, window) and asserts the specific unmet condition in the test name.
- **Risk:** The A=3,B=3 test passes pre-change for a reason unrelated to the guard (no cross-session pass exists yet). **Mitigation:** the test asserts the ABSENCE of a `cross_session_slow_burn` group and the count-6 outcome, so it stays meaningful after the pass is added; it does not rely on the guard's absence to pass.
- **Risk:** Test timestamps drift across the 7-day boundary due to `Date.now()` resolution. **Mitigation:** use clearly-outside (`now - 8*24*60*60000`) and clearly-inside (`now - 1*60000`) offsets.
- **Risk:** The fallback-tier tests depend on `session_id_tier` being read by the tracker. **Mitigation:** confirmed in the codebase — `resolveDedupIndex`/grouping read `session_id_tier` via `passesFallbackSpanBound`; the cross-session pass will read it for the real-tier filter.
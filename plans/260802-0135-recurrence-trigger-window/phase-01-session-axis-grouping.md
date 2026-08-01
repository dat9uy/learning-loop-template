---
phase: 1
title: "Session-axis grouping + session_id capture"
status: pending
priority: P1
effort: "1-2h"
dependencies: []
---

# Phase 1: Session-axis grouping + session_id capture

## Overview

Replace the broken 10-min time window with a per-session grouping axis. Capture
`session_id` at the bash-gate interception point, store it in each decision-log entry,
and group `findRecurrentGroups` by `(rule_id, normalized_prefix, session_id)` with
threshold N≥3 **per session** and **no `since` time filter**. This is the core fix that
makes the already-wired SessionStart trigger fire for human-paced cadence.

## Requirements

- Functional:
  - Every decision-log entry written by `bash-gate.js` carries a `session_id`.
  - `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`.
  - The 10-min `since` filter is removed; the whole log is scanned each call.
  - A group reaches the threshold when **one session** contributes ≥3 entries.
  - `recurrence_key` stays `rule_id::normalized_prefix` (cross-session dedup unchanged).
  - The returned group object carries `session_id` (consumed by P4 reopens).
- Non-functional:
  - Stateless: no watermark, no per-session marker file (scan + dedup only).
  - Zero agent-token cost: no `additionalContext` promotion (unchanged).
  - Droid CLI (no payload `session_id`) degrades to `getSessionId(root)`.

## Architecture

`session_id` threads one direction: hook payload → log entry → grouping key. It does
**not** enter `recurrence_key` (which stays prefix-scoped so a persistent prefix files
once and dedups across sessions).

```
bash-gate.js
  input = parseInput(stdin)              # input.session_id (Claude Code UUID)
  sid = input.session_id || getSessionId(root)   # truthy fallback (handles "" too)
  appendDecisionLog(root, { ..., session_id: sid })
        │
        ▼
gate-decision-log.js#appendDecisionLog
  serializes { ts, command_prefix, rule_id, decision, reason,
               matched_pattern, skipped_via_override, session_id }
        │
        ▼
surfaces.js#readJsonlFromAllSurfaces (cross-surface dedup)
  dedup key += `::${session_id ?? ""}`   # so same-ms entries across sessions don't merge
        │
        ▼
recurrence-tracker.js#findRecurrentGroups
  readDecisionLog(root)                  # NO since filter
  group by `${rule_id}::${normalizePrefix(cmd)}::${session_id}`
  threshold: entries.length >= N (per session)
  group.session_id = entries[0].session_id
  # NOTE: multiple groups can share one recurrence_key (same prefix, different
  # sessions). checkAndEmit dedups `fresh` by recurrence_key in-call (Phase 2, C1).
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/hooks/universal/bash-gate.js`
  - `buildLogEntry(decision, command)` → `buildLogEntry(decision, command, sessionId)`; pass `input.session_id || getSessionId(root)` from `main()` (truthy fallback — `??` would pass an empty-string `session_id` through, H2).
  - Add import: `getSessionId` from `../../core/worktree-session-id.js`.
- Modify: `tools/learning-loop-mastra/core/gate-decision-log.js`
  - `appendDecisionLog`: add `session_id: entry.session_id ?? null` to the serialized object. The R6 newline assertion already covers it.
- Modify: `tools/learning-loop-mastra/core/surfaces.js`
  - Add `::${parsed.session_id ?? ""}` to the cross-surface dedup key (M2) so two same-millisecond entries from different sessions are not merged at log-read time.
- Modify: `tools/learning-loop-mastra/core/recurrence-tracker.js`
  - `findRecurrentGroups`: drop the `since`/`windowMs` scan filter (read all entries); change the group key to include `session_id`; add `session_id` to each returned group. Keep `RECURRENCE_THRESHOLD_N = 3`. `RECURRENCE_WINDOW_MS` is removed (or retained unused for tests that pass it — prefer remove + update callers).
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`
  - Add `session_id` to `makeEntry`; update existing tests (the 10-min-window tests become per-session tests); add new cases.

## Implementation Steps (TDD — tests first)

1. **Test first.** In `gate-recurrence.test.js`:
   - Extend `makeEntry(ts, prefix, ruleId, sessionId)` with a `session_id` field.
   - Add: "findRecurrentGroups: 3 occurrences in one session, any age → 1 group" (entries spread across hours, no `since` reliance).
   - Add: "findRecurrentGroups: 2 in session A + 2 in session B → no group (per-session threshold)".
   - Add: "findRecurrentGroups: same prefix across two sessions does NOT merge into one group" (asserts `session_id` is in the key).
   - Add: "group result carries session_id".
   - Add (C3 empirical verification): "bash-gate buildLogEntry uses payload session_id" — spawn `bash-gate.js` (or call `buildLogEntry` directly) with a realistic PreToolUse payload `{ session_id: "abc123", tool_name: "Bash", tool_input: { command: "node -e x" }, hook_event_name: "PreToolUse" }` that triggers an escalation, then read the appended `.gate-decision.log` line and assert it carries `session_id: "abc123"`. Add a second case with a payload **missing** `session_id` and assert the entry falls back to `getSessionId(root)` (non-empty). This pins the docs-confirmed payload shape with a code assertion; if a future runtime drops `session_id`, this test fails loudly instead of silently degrading.
   - Update the existing "3 occurrences in 10min" test to "3 occurrences in one session".
2. **Run tests — expect failure** (grouping still time-windowed, no `session_id`).
3. **Implement `gate-decision-log.js`**: add `session_id` to the serialized entry.
4. **Implement `bash-gate.js`**: extract `sessionId = input.session_id ?? getSessionId(root)`; thread through `buildLogEntry` → `appendDecisionLog`.
5. **Implement `recurrence-tracker.js`**: drop the `since` filter; add `session_id` to the group key and output; remove `RECURRENCE_WINDOW_MS` (update any caller/tests that pass `windowMs`).
6. **Run tests — expect green.** Broaden to the full recurrence + meta-state suite.

## Success Criteria

- [ ] A burst from a prior session (any age >10min) is detected at the next SessionStart.
- [ ] Entries from two different sessions with the same prefix form two groups, not one.
- [ ] Per-session threshold N≥3 holds (2+2 across sessions → no group).
- [ ] `recurrence_key` is still `rule_id::normalized_prefix` (no `session_id` in it).
- [ ] Decision-log entries carry `session_id`; the SessionStart hook test still exits 0.

## Risk Assessment

- **Risk:** `getSessionId(root)` is worktree-stable (hashes `.git/HEAD`), so on Droid or
  if a payload `session_id` is absent, grouping degrades to per-worktree-branch — a
  coarser, noisier threshold (3 over the branch's lifetime, not per session).
  **Mitigation:** acceptable degradation on the non-primary runtime; the primary
  runtime (Claude Code) gets true per-session grouping. Documented in plan.md §D1.
- **Risk:** Dropping the `since` filter scans the whole log every SessionStart. On a
  very large log this could add latency to session start.
  **Mitigation:** the log is per-worktree and append-only; realistic sizes are small.
  Keep it stateless per report rec 4; add a watermark only if profiling shows latency
  (explicitly deferred — do not pre-build).
- **Risk:** Existing tests pass `windowMs`/`since` options that are now ignored.
  **Mitigation:** update those tests in step 1; remove the unused constant to avoid
  dead-code (fallow) findings.
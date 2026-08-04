---
phase: 2
title: "Implement cross-session grouping pass"
status: completed
priority: P1
effort: "~45m"
dependencies: [1]
---

# Phase 2: Implement cross-session grouping pass

## Overview

Add the cross-session slow-burn grouping pass to `findRecurrentGroups` in `tools/learning-loop-mastra/core/recurrence-tracker.js`, the slow-burn description branch in `buildFinding`, and the updated description in `gate-check-recurrence-tool.js`. Green the Phase 1 tests. The change is core-only: ~30 lines of logic plus the `buildFinding` branch and the tool-description string. No new surface, no schema change, no new files. The red-team rework is baked in: within-window `firedKeys`, real-tier distinct sessions, the `null::` guard, and the NaN-ts guard.

## Requirements

- Functional: a prefix with `>=5` occurrences across `>=2` distinct REAL-tier sessions within a trailing 7-day window, where no within-window single real session reached the per-session threshold, files one `recurring-false-positive` finding.
- Functional: a stale >7-day-old per-session burst does not suppress a fresh cross-session slow-burn for the same prefix (`firedKeys` is window-scoped).
- Functional: null-`rule_id` entries never file a `null::` finding.
- Functional: a single worktree on two branches (2 distinct fallback `session_id`s) does not fire a cross-session finding.
- Functional: the persisted finding shape (`subtype`, `category`, `severity`, `recurrence_key`, `status`) is unchanged; only the description gains a slow-burn suffix.
- Non-functional: the per-session pass code path is untouched; one decision-log read (the cross-session pass reuses `allEntries`).

## Architecture

### Constants (top of `recurrence-tracker.js`, next to `RECURRENCE_THRESHOLD_N`)

```js
const CROSS_SESSION_THRESHOLD_N = 5;                       // total occurrences within the window
const CROSS_SESSION_MIN_REAL_SESSIONS = 2;                   // distinct REAL-tier session_ids required
const CROSS_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;    // trailing 7-day window
```

### `findRecurrentGroups` — second pass

After the existing per-session `groups` loop and its `recurrent` collection, before `return recurrent`:

1. `const windowStart = Date.now() - CROSS_SESSION_WINDOW_MS;`
2. **`firedKeys` (within-window only):**
   ```js
   const firedKeys = new Set();
   for (const g of recurrent) {
     if (new Date(g.last_ts).getTime() >= windowStart) {
       firedKeys.add(recurrenceKeyFor(g));
     }
   }
   ```
   Groups whose entries are entirely outside the window are EXCLUDED from `firedKeys` (Red-team Finding 1).
3. **Cross-session grouping** over `allEntries`:
   ```js
   /** @type {Map<string, { rule_id, command_prefix_normalized, entries: Array, realSessions: Set<string> }>} */
   const crossGroups = new Map();
   for (const entry of allEntries) {
     if (!entry.rule_id) continue;                                  // Finding 2: null-rule_id guard
     const tsMs = new Date(entry.ts).getTime();
     if (!Number.isFinite(tsMs) || tsMs < windowStart) continue;     // Finding 13: NaN + window bound
     const sid = entry.session_id ?? "no-session";
     if (sid === "no-session") continue;                            // clean cutover
     const normalized = normalizePrefix(entry.command_prefix);
     const key = `${entry.rule_id}::${normalized}`;
     if (!crossGroups.has(key)) {
       crossGroups.set(key, { rule_id: entry.rule_id, command_prefix_normalized: normalized, entries: [], realSessions: new Set() });
     }
     const cg = crossGroups.get(key);
     cg.entries.push(entry);
     if (entry.session_id_tier === "real") cg.realSessions.add(sid);  // Finding 3: real-tier only
   }
   ```
4. For each cross-session group where `entries.length >= CROSS_SESSION_THRESHOLD_N` AND `realSessions.size >= CROSS_SESSION_MIN_REAL_SESSIONS` AND `!firedKeys.has(recurrenceKeyFor({ rule_id, command_prefix_normalized: normalized }))`:
   - push into `recurrent`:
     ```js
     {
       rule_id, command_prefix_normalized: normalized,
       session_id: <latest real-tier entry's session_id>,
       count: entries.length,
       sessions_crossing_threshold: realSessions.size,
       first_ts: entries[0].ts, last_ts: entries[entries.length-1].ts,
       sample_commands: entries.slice(0, 3).map(e => e.command_prefix),
       cross_session_slow_burn: true,
     }
     ```
5. `return recurrent` (unchanged signature).

### `buildFinding` — slow-burn description branch

After the existing `description` string is built, when `group.cross_session_slow_burn` is true, append:
` (cross-session slow-burn: no single session reached the per-session threshold of ${RECURRENCE_THRESHOLD_N})`.

`cross_session_slow_burn` is a group-object field only; it is NOT copied into the persisted finding object → finding schema and `assertinvariant` boundary untouched.

### `gate-check-recurrence-tool.js` — description update (Red-team Finding 4)

Update the `description` string to reflect the new behavior, e.g.:
> "Check the gate's decision log for recurring false-positive patterns and auto-file findings. Per-session pass: groups by (rule_id, normalized_prefix, session_id), threshold N>=3 per session, full-log scan (no time filter). Cross-session slow-burn pass: groups by (rule_id, normalized_prefix) ignoring session_id, >=5 occurrences across >=2 distinct REAL-tier sessions in a trailing 7-day window. Emits a meta_state finding with a hashed recurrence_key and rule-record-derived evidence_code_ref."

### Window enforced at grouping, not merge (Red-team Finding 5)

The 7-day window is applied at the cross-session grouping step (step 3). `collapseFreshByKey` is unchanged. Merge safety relies on: (a) within-window per-session groups are in `firedKeys` so their cross-session group never forms; (b) out-of-window per-session groups were filed on a prior SessionStart → in `existingKeys` → suppressed before merge. The narrow never-filed-stale-burst residual is documented in plan.md Risk Assessment.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/core/recurrence-tracker.js` — 3 constants; cross-session pass in `findRecurrentGroups`; slow-burn branch in `buildFinding`.
- **Modify:** `tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js` — `description` string update.

## Implementation Steps

1. Add the three `CROSS_SESSION_*` constants next to `RECURRENCE_THRESHOLD_N`.
2. In `findRecurrentGroups`, after the per-session `recurrent` loop, add the windowed `firedKeys` set (within-window `last_ts` filter).
3. Add the cross-session grouping loop (reuse `allEntries`; `!entry.rule_id` skip; `Number.isFinite(tsMs) && tsMs >= windowStart` filter; `no-session` skip; `session_id_tier === "real"` distinct-session tracking).
4. Push qualifying cross-session groups into `recurrent` with `cross_session_slow_burn: true`.
5. In `buildFinding`, append the slow-burn suffix when `group.cross_session_slow_burn`.
6. Update the `description` string in `gate-check-recurrence-tool.js`.
7. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` — all Phase 1 tests go GREEN; no existing recurrence test regresses.
8. Re-seed the file index if a drift error appears mid-loop: `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (or `SKIP_PRESEED=1` for a single bypass). Prefer letting `pnpm test:one` handle seeding where it does.

## Success Criteria

- [ ] All Phase 1 tests GREEN.
- [ ] All pre-existing tests in `gate-recurrence.test.js` GREEN (no regression — the per-session pass is untouched).
- [ ] No new file created; `recurrence-tracker.js` and `gate-check-recurrence-tool.js` are the only non-test files changed.
- [ ] The persisted finding JSON for a slow-burn case has unchanged `subtype`/`category`/`severity`/`recurrence_key`/`status` vs. a per-session finding; only `description` differs.
- [ ] The A=3,B=3 case yields one finding with `count === 6` (not 9).
- [ ] The null-`rule_id` across-2-sessions case emits 0.
- [ ] The two-branch fallback case emits 0.

## Risk Assessment

- **Risk:** `recurrenceKeyFor` is module-private (a function declaration, hoisted) and is called inside `findRecurrentGroups` for `firedKeys` — a new internal call site. **Mitigation:** it is a pure function already in scope (function declarations hoist); no refactor needed. Build `firedKeys` from the same `{rule_id, command_prefix_normalized}` shape `recurrenceKeyFor` reads.
- **Risk:** The cross-session pass scans `allEntries` a second time. **Mitigation:** `allEntries` is in memory (one log read); the second pass is O(n). `entries_scanned` still reports `allEntries.length` once — Phase 3 clarifies the metric (scan work is ~2x) or doubles it.
- **Risk:** `Date.now()` makes the window a moving target. **Mitigation:** intended trailing-window semantics; tests control it via `makeEntry(now - N)`. The per-session pass keeps its full-log scan (no time filter) — only the cross-session pass is window-bounded.
- **Risk:** Forgetting the `!entry.rule_id` skip (the literal Finding 2 defect). **Mitigation:** the Phase 1 multi-session null-`rule_id` test fails RED without it.
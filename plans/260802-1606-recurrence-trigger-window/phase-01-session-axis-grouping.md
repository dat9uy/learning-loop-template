# Phase 1: Session-axis grouping + session_id capture

## Context

The recurrence trigger never fires because `findRecurrentGroups` filters
`readDecisionLog({ since: now - 10min })` (`recurrence-tracker.js:40-42`). The 10-min
window does double duty as burst-definition + scan-range. At the next SessionStart
(hours/days later) a prior session's burst is >10 min old → zero groups → nothing filed.
Fix: replace the time axis with the **session axis** — group per-session, drop the
`since` filter, scan the full append-only log, rely on dedup. Stateless (no watermark).

Report: `investigation-260802-1606-recurrence-trigger-design-post-lifecycle.md` §3 (unchanged core), design decision #1.

## Requirements

- Decision-log entries written by `bash-gate.js` carry `session_id`.
- `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`, threshold
  N≥3 **per session**, with **no `since` time filter**.
- `recurrence_key` stays `rule_id::normalized_prefix` (cross-session dedup) — `session_id`
  is grouping-only, NOT in `recurrence_key`. (P2 changes the prefix to a hash; here it
  stays raw — P1 is grouping only.)
- `checkAndEmit` dedups `fresh` groups by `recurrence_key` within the call → **one finding
  per key per call** even when multiple sessions cross threshold for the same prefix.

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (full; grouping
  `:37-68`, dedup `:84-97`, write `:109-125`), `tools/learning-loop-mastra/core/gate-decision-log.js`
  (`appendDecisionLog` `:33-49`, `readDecisionLog` `:59-65`), `tools/learning-loop-mastra/hooks/universal/bash-gate.js`
  (how `appendDecisionLog` is called `:42,49-52`), `tools/learning-loop-mastra/hooks/universal/lib/protocol-adapter.js`
  (`parseInput` — confirm `session_id` is on the parsed object), `tools/learning-loop-mastra/core/worktree-session-id.js`
  (`getSessionId(root)` fallback shape).
- **Modify:** `recurrence-tracker.js` (grouping + dedup), `gate-decision-log.js`
  (`appendDecisionLog` accepts/serializes `session_id`; `readDecisionLog` returns it),
  `bash-gate.js` (pass `session_id` into `buildLogEntry`).

## Steps

1. **Capture `session_id` at the gate.** In `bash-gate.js`, read `session_id` from the
   parsed hook input (`input.session_id`); fall back to `getSessionId(root)` from
   `worktree-session-id.js` when absent. Pass it into `buildLogEntry` → `appendDecisionLog`.
2. **Serialize `session_id` in the log entry.** `appendDecisionLog` adds `session_id` to
   the stringified line (after `skipped_via_override`). It is nullable for the fallback
   case. Re-verify the newline-injection guard (`gate-decision-log.js:44-46`) still holds
   — `session_id` is a UUID/hash, but keep the assertion belt-and-suspenders.
3. **Group per-session, drop `since`.** In `findRecurrentGroups`: remove the
   `sinceTs`/`since` filter (`:40,42`); read the **full** log via `readDecisionLog(root)`
   (no `since`). Build the group key as `${rule_id}::${normalizePrefix(...)}::${entry.session_id ?? "no-session"}`.
   Threshold N≥3 applies **per key** (i.e. per session). Each recurrent group records
   `session_id`.
4. **In-call dedup by `recurrence_key`.** In `checkAndEmit`, after filtering `fresh`
   against `existingKeys`, dedup `fresh` **by `recurrence_key`** (`rule_id::prefix`) so
   multiple per-session groups for the same prefix collapse to one finding. Keep the first
   group's counts/samples (or aggregate counts — see Validation); stamp `session_id` from
   the (first) emitting session on the finding.
5. **Tests first (TDD).** Write characterization tests before/with the change:
   - A burst from a prior session (entries aged >10 min, any age) is detected at the next
     call → group formed → finding filed. (This is the core bug fix.)
   - The same prefix escalating 3× in session A and 3× in session B (two `session_id`s)
     produces **one** finding (in-call dedup), not two.
   - `rule_id: null` entries are still skipped (`:47`).
   - `recurrence_key` does NOT contain `session_id` (cross-session dedup preserved).

## Validation

- `pnpm test --filter recurrence` (or the recurrence-tracker test suite) green.
- `node tools/learning-loop-mastra/bin/loop.mjs` unaffected (no schema change to
  findings yet — `session_id` on the *finding* is optional/added in P2 if needed; P1 adds
  it to the *log entry* and the *group*, not necessarily the finding schema).
- Manual: seed a `.gate-decision.log` fixture with a >10-min-old 3× burst + distinct
  `session_id`s; run `checkAndEmit` (or `gate_check_recurrence` tool); assert exactly one
  finding filed with the right `recurrence_key`.

## Risk

- **`session_id` absence on a runtime.** The `getSessionId(root)` worktree-hash fallback
  degrades per-session grouping to per-worktree grouping on runtimes without a UUID. That
  is acceptable (worktree is a coarser session proxy) and documented in decision #1. If
  BOTH are absent, the `"no-session"` bucket groups across sessions — still fires (the
  burst is detected), just not session-partitioned. Not a correctness regression vs. the
  current never-fires state.
- **Full-log scan cost.** Dropping `since` makes every SessionStart read+parse+sort the
  whole append-only log. 18,688 lines is trivial today; flag for a future watermark if
  profiling shows SessionStart latency hurting. Out of scope here (plan §6).

## Rollback

Revert the three modified files. The trigger returns to its current never-fires state
(no behavior regression — it produces nothing today). No schema/log-format migration to
undo (new `session_id` field on log entries is additive; old entries lack it and group
into `"no-session"`, which is harmless).

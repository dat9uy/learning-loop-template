# Phase 1: Session-axis grouping + session_id capture + hashed recurrence_key

## Context

The recurrence trigger never fires because `findRecurrentGroups` filters
`readDecisionLog({ since: now - 10min })` (`recurrence-tracker.js:40-42`). The 10-min
window does double duty as burst-definition + scan-range. At the next SessionStart
(hours/days later) a prior session's burst is >10 min old → zero groups → nothing filed.
Fix: replace the time axis with the **session axis** — group per-session, drop the
`since` filter, scan the full append-only log, rely on dedup. Stateless (no watermark).

This phase also carries the **prefix hashing** (moved out of the old P2 sequencing —
red-team finding: P1 alone would guarantee raw-secret-prefix commits to the tracked
`meta-state.jsonl` from the historical backlog, and a revert does not unpublish git
history). No phase ordering may ever write a raw prefix.

Report: `investigation-260802-1606-recurrence-trigger-design-post-lifecycle.md` §3 (unchanged core), design decisions #1 + #2.

## Requirements

- Decision-log entries written by `bash-gate.js` carry a **validated** `session_id`
  (UUID-shaped and length-capped; anything else falls back to `getSessionId(root)` —
  the harness stdin payload is not trusted blindly).
- `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`, threshold
  N≥3 **per session**, with **no `since` time filter**.
- **Clean cutover:** entries with no `session_id` (all ~28.7K historical lines across
  the three surface logs) group into a `"no-session"` bucket that **never fires**.
  Without this, the first post-ship SessionStart would file ~14 stale lifetime-accumulated
  findings at once (real counts from the current union log: top group has 46 hits over
  weeks) and P3 would then mute those prefixes permanently.
- **Fallback-tier span bound:** when the grouping `session_id` came from the
  `getSessionId(root)` worktree fallback (not a real UUID), the bucket is
  lifetime-accumulating like `"no-session"`; such a group fires only if
  `last_ts - first_ts ≤ 24h` (per-worktree is a coarse session proxy, not a lifetime
  counter).
- `recurrence_key = rule_id::sha256(normalized_prefix)[:16]` — hashed **in this phase**
  (16 hex chars = 64 bits; birthday-safe far beyond registry scale). `session_id` is
  grouping-only, NOT in `recurrence_key` (cross-session dedup).
- `checkAndEmit` dedups `fresh` groups by `recurrence_key` within the call → **one finding
  per key per call** even when multiple sessions cross threshold for the same prefix.
- The cross-surface read dedupe key (`surfaces.js:242-244`,
  `ts::command_prefix::rule_id::decision`) gains `session_id`, so two same-millisecond
  escalations on different surfaces/runtimes are not silently collapsed before grouping.

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (full; grouping
  `:37-68`, dedup `:84-97`, write `:109-125`), `tools/learning-loop-mastra/core/gate-decision-log.js`
  (`appendDecisionLog` `:33-49`, `readDecisionLog` `:59-65`), `tools/learning-loop-mastra/core/surfaces.js`
  (`readJsonlFromAllSurfaces` dedupe `:216-255`), `tools/learning-loop-mastra/hooks/universal/bash-gate.js`
  (how `appendDecisionLog` is called `:42,49-52`), `tools/learning-loop-mastra/hooks/universal/lib/protocol-adapter.js`
  (`parseInput` — confirm `session_id` is on the parsed object), `tools/learning-loop-mastra/core/worktree-session-id.js`
  (`getSessionId(root)` fallback shape).
- **Modify:** `recurrence-tracker.js` (grouping + hash + dedup + span bound),
  `gate-decision-log.js` (`appendDecisionLog` accepts/serializes `session_id`;
  `readDecisionLog` returns it), `bash-gate.js` (validate + pass `session_id` into
  `buildLogEntry`), `surfaces.js` (dedupe key gains `session_id`).

## Steps

1. **Capture + validate `session_id` at the gate.** In `bash-gate.js`, read
   `input.session_id`; accept it only if UUID-shaped and ≤64 chars, else fall back to
   `getSessionId(root)` from `worktree-session-id.js`. Record which tier produced it
   (real vs fallback) on the log entry — P1's span bound needs the distinction. Pass it
   into `buildLogEntry` → `appendDecisionLog`. Note: the newline-injection assertion at
   `gate-decision-log.js:44-46` is dead code for string fields (`JSON.stringify` escapes
   newlines) — do not cite it as the safety mechanism; the validation above is the guard.
2. **Serialize `session_id` in the log entry.** `appendDecisionLog` adds `session_id`
   (and the fallback-tier flag) to the stringified line. Nullable/defaults for old entries.
3. **Group per-session, drop `since`, honor cutover + span bound.** In
   `findRecurrentGroups`: remove the `sinceTs`/`since` filter (`:40,42`); read the **full**
   log via `readDecisionLog(root)` (no `since`). Group key
   `${rule_id}::${normalizePrefix(...)}::${entry.session_id ?? "no-session"}`. Threshold
   N≥3 per key. **Skip** the `"no-session"` key entirely (clean cutover). For groups whose
   `session_id` is fallback-tier, require `last_ts - first_ts ≤ 24h`. Do NOT round-trip
   structured fields through the joined string for later parsing — carry
   `{rule_id, prefix, session_id}` as fields on the group object (a prefix containing `::`
   corrupts `key.split("::")`; red-team: pre-existing corruption at `recurrence-tracker.js:56`,
   made unrecoverable by a 3-field key).
4. **Hash the recurrence key.** Add `hashPrefix(prefix)` (`node:crypto`,
   `createHash("sha256").update(`${rule_id}::${prefix}`).digest("hex").slice(0, 16)` —
   `rule_id` in the input so identical prefixes under different rules don't share a hash).
   `recurrence_key = ${rule_id}::${hash}` everywhere, including the `existingKeys` lookup.
5. **In-call dedup by `recurrence_key`.** In `checkAndEmit`, after filtering `fresh`
   against `existingKeys`, dedup `fresh` by `recurrence_key` so multiple per-session
   groups for the same prefix collapse to one finding. Stamp the emitting `session_id`
   on the finding.
6. **Cross-surface dedupe key.** Add `session_id` to the dedupe key in
   `readJsonlFromAllSurfaces` (`parsed.session_id ?? ""` keeps old entries deduping as
   before).
7. **Tests first (TDD):**
   - A burst from a prior session (entries aged >10 min, any age) is detected at the next
     call → group formed → finding filed. (Core bug fix.)
   - The same prefix escalating 3× in session A and 3× in session B produces **one**
     finding (in-call dedup), not two.
   - Historical entries without `session_id` (3+, even 46×) produce **zero** findings
     (clean cutover).
   - A fallback-tier group spanning >24h does not fire; ≤24h does.
   - A prefix containing `::` groups and hashes correctly (no split corruption).
   - An invalid/oversized `session_id` falls back to `getSessionId(root)`.
   - `rule_id: null` entries are still skipped (`:47`).
   - Two same-millisecond entries with distinct `session_id`s both survive the
     cross-surface dedupe.
   - `recurrence_key` is `rule_id::sha256(rule_id::prefix)[:16]` and contains no raw
     prefix.

## Validation

- Recurrence test suite green.
- Manual: seed a `.gate-decision.log` fixture with a >10-min-old 3× burst with
  `session_id`s + a 46× no-session historical group; run `checkAndEmit`; assert exactly
  one finding (from the session burst) with a hashed `recurrence_key`.

## Risk

- **Backlog flood — mitigated by design (was the loudest red-team finding).** The
  `"no-session"`-never-fires cutover means historical bursts (including the already-known
  false-positive B) never auto-file — **pure silence, no digest** (validated 2026-08-02;
  the 46-hit `rule-no-raw-stdout-vitest` backlog group is knowingly dropped). Accepted
  consequence: a burst straddling the deploy
  (2 pre-ship + 2 post-ship escalations) under-counts until 3 post-ship escalations
  accumulate — a deliberate clean cutover, not a regression (the trigger produces nothing
  today).
<!-- Updated: Validation Session 1 - pure cutover confirmed, no digest -->
- **Full-log scan cost — corrected figure.** Every SessionStart reads+parses+dedupes+sorts
  the three-surface union (~28.4K lines today: `.factory` 18,688 + `.mastracode` 9,509 +
  `.claude` 181 — not the single-surface 18,688 previously cited), on a cold process.
  P4 ships a latency tripwire (stderr timing + budget); the watermark stays deferred until
  the tripwire fires.
- **Dictionary-oracle residual (documented, accepted).** Hashed keys hide secret *values*
  but not command *identity* (low-entropy prefixes are enumerable by anyone with repo
  access). Accepted: the alternative (not committing findings) defeats the feature.

## Rollback

Revert the four modified files. The trigger returns to its current never-fires state.
No schema/log-format migration to undo (new fields on log entries are additive). Because
hashing ships in this phase, no raw-prefix finding can exist to redact.

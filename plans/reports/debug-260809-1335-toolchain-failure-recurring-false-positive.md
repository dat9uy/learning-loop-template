# Debug Report: `meta-260808T200708Z-038e9eea` — toolchain-failure recurring-false-positive

- **Report type:** debug / root-cause investigation (ak-debug)
- **Date:** 2026-08-09
- **Target:** `meta-260808T200708Z-038e9eea`
- **Status:** diagnosis complete — false positive by design; no code change warranted

## Executive Summary

The finding `meta-260808T200708Z-038e9eea` is a **recurring-false-positive filed by the
recurrence tracker** under rule `toolchain-failure`. It reports that the command
`pnpm exec vitest run tools/learning-loop-mastra/__…` exited non-zero **4 times in one
session** (2026-08-08T18:34:14Z → 19:31:12Z, session `1e2de8fb-76a7-4db5-930f-6f6e95bc89aa`).

Root cause: **not a gate-logic bug.** The four "failures" were real non-zero exits
(legitimately captured by the PostToolUseFailure hook), but they were **expected TDD
iteration** on the runtime-state durability-split feature, which shipped as commit
`a57ba5f4` (~2h after the last failure). The capture hook, the recurrence tracker's
grouping/hashing/filing, and the dedup index all behaved exactly as designed and tested.

This is the third occurrence of the same pattern. The sister finding
`meta-260807T054940Z-cbab4a3d` (same rule, same subtype) was operator-resolved on
2026-08-07 to exactly this conclusion: *"Expected user-driven TDD iteration, not a
gate-logic bug."*

**Recommendation:** resolve `meta-260808T200708Z-038e9eea` with a resolution recording
the TDD-footprint finding. No code change.

## Technical Analysis

### The finding record

| Field | Value |
|---|---|
| id | `meta-260808T200708Z-038e9eea` |
| entry_kind / category | finding / `gate-logic-bug` |
| subtype | `recurring-false-positive` |
| severity | `warning` |
| status | `open` |
| description | Pattern recurred **4 time(s)** across **1 session(s)** under rule `toolchain-failure`; first 2026-08-08T18:34:14.475Z, last 2026-08-08T19:31:12.787Z |
| recurrence_key | `toolchain-failure::bee8c9131a7d1b6d` |
| evidence_code_ref | `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` |
| mechanism_check | `true` |

Derived status at debug time: **`active-uncertain`** (code-only derivation, `drift: false`,
recommendation `investigate`).

### Evidence chain (all verified)

1. **Hook captured real failures.** The 4 decision-log entries in
   `.claude/coordination/.gate-decision.log`:
   `18:34:14`, `18:46:57`, `19:12:59`, `19:31:12` — all `rule_id=toolchain-failure`,
   `decision=toolchain-failure`, `matched_pattern=post-tool-use-failure`,
   `session_id=1e2de8fb-…`, `session_id_tier=real`. (A 5th entry `pnpm test 2>&1` at
   `19:08:21` belongs to a different normalized-prefix group, below threshold.)

2. **Tracker grouped and hashed correctly.** Re-ran `normalizePrefix` + `hashRecurrenceKey`
   on the prefix `pnpm exec vitest run tools/learning-loop-mastra/__` →
   `bee8c9131a7d1b6d`, an **exact match** to the finding's recurrence-key tail. Threshold
   N≥3 crossed (4 ≥ 3). Filing was deterministic and correct.

3. **Dedup honored.** `resolveDedupIndex` suppresses any non-archived
   recurring-false-positive sharing a key. No duplicate toolchain-failure finding was
   filed for this key.

4. **The session was TDD work, not a broken build.** The finding session's subagents:
   - `tester` — "Independent tester verification"
   - `code-reviewer` — "Code review of durability split"
   - `git-manager` — "Commit durability split changes"

   This is the **runtime-state durability split**, which landed ~2h after the last
   failure as `a57ba5f4` `feat(runtime-state): split substrate by durability with
   namespace guard (#123)`. Nothing was committed during 18:34–19:31Z — active iteration.

5. **No code is currently broken.** All three implicated suites pass:
   - `toolchain-failure-capture.test.cjs` — **11/11 pass**
   - `gate-recurrence.test.js` — **50/50 pass**
   - `runtime-state-durability-split.test.js` — **11/11 pass**

### Why the subtype reads as a false positive (by design)

`recurring-false-positive` is the registry's normal category for "the same toolchain
command exited non-zero 3+ times in one session." It is **not** a claim that the hook or
tracker misfired. The capture hook is fail-open, noise-filtered to a small toolchain
command set, and prefix-normalized; the recurrence tracker is deliberately pull-free and
auto-files on a same-session burst. When an operator iterates on a failing test during
TDD, the mechanism fires exactly as specified.

### Precedent

| Finding | Rule | Count | Disposition |
|---|---|---|---|
| `meta-260807T054940Z-cbab4a3d` | toolchain-failure | 3× / 1 session | resolved by operator 2026-08-07: "Expected user-driven TDD iteration, not a gate-logic bug" |
| `meta-260807T103723Z-350fd591` | toolchain-failure | 3× / 1 session | still open |
| `meta-260808T200708Z-038e9eea` | toolchain-failure | 4× / 1 session | **this finding** |

`meta-260807T103723Z-350fd591` (2026-08-07T10:05-10:06Z, session `204d98b8-…`) is a
separate, still-open sibling of the same class and can be evaluated under the same
criteria.

## Recommendations

1. **Resolve `meta-260808T200708Z-038e9eea`** as operator-resolution recording the
   TDD-footprint finding (mirroring the `cbab4a3d` precedent). No code change.
2. **Optionally sweep the sibling `meta-260807T103723Z-350fd591`** under the same
   standard, and the open `rule-no-raw-stdout-vitest` recurring findings, if the operator
   wants the open-finding backlog to reflect only actionable items.
3. **No tracker changes recommended.** The mechanism is tested (50/50) and behaves per
   spec. If repeated TDD-driven false positives become noise, the lever is operational
   (resolve-on-recognition), not a threshold change — threshold changes would trade
   false-positive suppression for missed real recurrences.

## Evidence

- Finding record (full, `compact:false`): `meta_state_list` on `meta-260808T200708Z-038e9eea`
- Decision-log entries: `.claude/coordination/.gate-decision.log` (5 entries in window)
- Recurrence-key re-derivation: `recurrence-tracker.js` `normalizePrefix`/`hashRecurrenceKey`
  → `bee8c9131a7d1b6d` (exact match)
- Session subagents: `…/1e2de8fb-…/subagents/*.meta.json`
- Test runs (all pass): toolchain-failure-capture 11/11, gate-recurrence 50/50,
  runtime-state-durability-split 11/11
- Sister finding resolution: `meta-260807T054940Z-cbab4a3d` v1

## Unresolved Questions

- None blocking. (The still-open sibling `meta-260807T103723Z-350fd591` is a follow-up
  candidate but not part of this finding's scope.)

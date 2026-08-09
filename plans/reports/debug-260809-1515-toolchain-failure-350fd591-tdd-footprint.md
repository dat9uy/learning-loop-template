# Debug Report: `meta-260807T103723Z-350fd591` — toolchain-failure recurring-false-positive

- **Report type:** debug / root-cause investigation (ak-debug)
- **Date:** 2026-08-09
- **Target:** `meta-260807T103723Z-350fd591`
- **Status:** diagnosis complete — false positive by design (TDD-iteration footprint); no code change warranted

## Executive Summary

The finding `meta-260807T103723Z-350fd591` is a **recurring-false-positive filed by the
recurrence tracker** under rule `toolchain-failure`. It reports that the command
`pnpm exec vitest run --bail=1 tools/learning-loop-…` exited non-zero **3 times in one
session** (2026-08-07T10:05:52Z → 10:06:52Z, session `204d98b8-4a5d-4f45-98ae-a23c04130f77`).

Root cause: **not a gate-logic bug.** The three "failures" were real non-zero exits
(legitimately captured by the PostToolUseFailure hook), but they were **expected TDD
iteration** on the shell-parse / legacy-mcp test work (and the concurrent
`rule-no-raw-stdout-vitest` rule work) that shipped the same day as the gate-verb layer
(PR #119, `9d420981`, ~7h after the last failure). The capture hook, the recurrence
tracker's grouping/hashing/filing, and the dedup index all behaved exactly as designed
and tested.

This is the **third and last open occurrence** of the same class. Both sister findings
were operator-resolved to exactly this conclusion:

- `meta-260807T054940Z-cbab4a3d` — resolved 2026-08-07: *"Expected user-driven TDD
  iteration, not a gate-logic bug."*
- `meta-260808T200708Z-038e9eea` — resolved 2026-08-09, mirroring `cbab4a3d`, citing the
  prior debug report `debug-260809-1335-toolchain-failure-recurring-false-positive.md`.

**Recommendation:** resolve `meta-260807T103723Z-350fd591` with a resolution recording
the TDD-footprint finding (mirroring the `cbab4a3d` / `038e9eea` precedent). No code
change.

## Technical Analysis

### The finding record

| Field | Value |
|---|---|
| id | `meta-260807T103723Z-350fd591` |
| entry_kind / category | finding / `gate-logic-bug` |
| subtype | `recurring-false-positive` |
| severity | `warning` |
| status | `open` |
| description | Pattern recurred **3 time(s)** across **1 session(s)** (latest `204d98b8-…`) under rule `toolchain-failure`; first 2026-08-07T10:05:52.255Z, last 2026-08-07T10:06:52.952Z |
| recurrence_key | `toolchain-failure::15a87fb170ba2676` |
| evidence_code_ref | `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` |
| mechanism_check | `true` |

### Evidence chain (all verified)

1. **Hook captured real failures.** The 3 decision-log entries in
   `.claude/coordination/.gate-decision.log` for session `204d98b8`:

   | ts | command_prefix | rule_id | session_id_tier |
   |---|---|---|---|
   | 2026-08-07T10:05:52.255Z | `pnpm exec vitest run --bail=1 tools/learning-loop-` | toolchain-failure | real |
   | 2026-08-07T10:06:23.354Z | `pnpm exec vitest run --bail=1 tools/learning-loop-` | toolchain-failure | real |
   | 2026-08-07T10:06:52.952Z | `pnpm exec vitest run --bail=1 tools/learning-loop-` | toolchain-failure | real |

   All `matched_pattern=post-tool-use-failure`. A 4th entry at 10:09:10Z
   (`pnpm test:one tools/learning-loop-mastra/__tests__`) belongs to a different
   normalized-prefix group and did not contribute to this finding's count.

2. **Tracker grouped and hashed correctly.** Re-ran `normalizePrefix` + `hashRecurrenceKey`
   (from `core/recurrence-tracker.js`) on the prefix
   `pnpm exec vitest run --bail=1 tools/learning-loop-` (normalized to 50 chars) →
   `toolchain-failure::15a87fb170ba2676`, an **exact match** to the finding's
   recurrence-key tail. Threshold N≥3 crossed (3 = 3). Filing was deterministic and correct.

3. **Dedup honored.** `resolveDedupIndex` suppresses any non-archived
   recurring-false-positive sharing a key. No duplicate toolchain-failure finding was
   filed for this key; the gate-recurrence.test.js suite (50/50, below) exercises the
   dedup path.

4. **The session was TDD work, not a broken build.** The finding session `204d98b8` on
   2026-08-07 was iterating on the shell-parse / legacy-mcp tests and the concurrent
   `rule-no-raw-stdout-vitest` rule. The same session shows `rule-no-raw-stdout-vitest`
   escalations at 10:00:28Z, 10:08:34Z, 10:08:41Z (the rule the prior session narrowed
   in commit `462f393c`). The three `--bail=1` vitest runs at 10:05–10:06Z span ~1 minute
   — the signature of iterative verification of a failing test, not a stuck build.
   The gate-verb layer shipped later that day as PR #119
   (`9d420981`, author date 2026-08-07T23:49:09+07:00), ~7h after the last capture.

5. **No code is currently broken.** Both implicated suites pass fresh (run 2026-08-09,
   exit 0 — no decision-log entry written by the verification itself):
   - `toolchain-failure-capture.test.cjs` — **11/11 pass**
   - `gate-recurrence.test.js` — **50/50 pass**
   - **Total: 61/61 pass**

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
| `meta-260807T103723Z-350fd591` | toolchain-failure | 3× / 1 session | **this finding** — last open of the class |
| `meta-260808T200708Z-038e9eea` | toolchain-failure | 4× / 1 session | resolved by operator 2026-08-09 (mirrors `cbab4a3d`; cites `debug-260809-1335`) |

## Recommendations

1. **Resolve `meta-260807T103723Z-350fd591`** as operator-resolution recording the
   TDD-footprint finding (mirroring the `cbab4a3d` / `038e9eea` precedent). No code
   change.
2. **No tracker changes recommended.** The mechanism is tested (61/61) and behaves per
   spec. If repeated TDD-driven false positives become noise, the lever is operational
   (resolve-on-recognition), not a threshold change — threshold changes would trade
   false-positive suppression for missed real recurrences.
3. With this resolution the open toolchain-failure recurring-false-positive backlog
   reaches zero open siblings.

## Evidence

- Finding record (full, `compact:false`): `meta_state_list` on `meta-260807T103723Z-350fd591`
- Decision-log entries: `.claude/coordination/.gate-decision.log` (3 entries in window +
  1 separate-prefix entry at 10:09:10Z)
- Recurrence-key re-derivation: `recurrence-tracker.js` `normalizePrefix`/`hashRecurrenceKey`
  → `toolchain-failure::15a87fb170ba2676` (exact match, verified via standalone node script)
- Test runs (all pass, fresh 2026-08-09): toolchain-failure-capture 11/11,
  gate-recurrence 50/50 (61/61 total, exit 0)
- Sister findings: `meta-260807T054940Z-cbab4a3d` v1, `meta-260808T200708Z-038e9eea` v1
- Prior sibling report: `plans/reports/debug-260809-1335-toolchain-failure-recurring-false-positive.md`

## Unresolved Questions

- None. This finding's scope is closed by the diagnosis; resolution follows the
  established operator precedent.
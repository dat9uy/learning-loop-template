> **Update 2026-08-09:** Disposition revised — the "leave open / do not resolve" recommendation below is superseded. The 4 open `rule-no-raw-stdout-vitest` findings were **resolved** (resolved suppresses re-filing, per dedup `status !== "archived"`; only archiving re-admits), and an unanchored-regex false-fire was filed as a separate finding. See `plans/reports/debug-260809-1423-rule-no-raw-stdout-vitest-recurrence-disposition.md`. The diagnosis above (real violations) stands; the disposition did not.

# Debug Report: `meta-260809T062511Z-c44b0a38` — rule-no-raw-stdout-vitest recurrence

- **Report type:** debug / root-cause investigation (ak-debug)
- **Date:** 2026-08-09
- **Target:** `meta-260809T062511Z-c44b0a38`
- **Status:** diagnosis complete — NOT a gate-logic bug; NOT a false positive. 5 recurrences are real raw-stdout violations, correctly escalated. Left open (repo precedent).

## Executive Summary

- **Issue:** Tracker filed `recurring-false-positive` under rule `rule-no-raw-stdout-vitest` for 5 `npx vitest run …`-prefixed escalations across 4 sessions (08-03 → 08-08). Stored decision-log prefixes look like bare commands (no pipe), implying a false positive.
- **Impact:** Low — diagnostic/mislabel, no gate bypass, no broken behavior. Gate + tracker both correct.
- **Root cause:** NOT a gate bug. All 5 full commands were real `… | tail/grep/head` raw-stdout violations; the **80-char decision-log truncation** (`COMMAND_PREFIX_MAX_LEN = 80` in `gate-decision-log.js`) cut off the pipe, so the stored prefix appears bare. Transcripts prove the pipes; HEAD repro confirms all 5 still escalate.
- **Status:** Diagnosis complete. Finding left open per precedent; shape documented.
- **Fix:** None to gate/tracker. Real-violation class: fix direction is test-runner discipline (`pnpm test:one`), not prose stripping or threshold change.

## Timeline

```
08-03 03:53Z  capture 1  npx vitest run …/write-gate-lineage-scan…stable-artifacts…  2>&1 | tail -25
08-04 04:41Z  capture 2  npx vitest run …/hint-registry…rule-derived-process-hints…  2>&1 | tail -25
08-07 11:48Z  capture 3  npx vitest run …/gate-logic-verb-layer…shell-parse-classify…  2>&1 | tail…
08-07 15:52Z  capture 4  same shape (session b9485ce7)                               | tail…
08-08 20:29Z  capture 5  npx vitest run …/migrate-runtime-state-ephemeral…           2>&1 | tail -15
08-09 ~14:0xZ investigation: recovered true commands from transcripts; verified HEAD behavior
```

## Technical Analysis

### Findings

1. **All 5 stored decision-log prefixes are exactly 80 chars** and appear to be bare `npx vitest run …/__tests__/<file>` (verified: each `len=80`). No pipe visible in the log.
2. **The truncation hides the pipe.** `gate-decision-log.js:5` `COMMAND_PREFIX_MAX_LEN = 80`; `appendDecisionLog` slices to 80 via `oneLinePrefix`. These long multi-file commands place `2>&1 | tail -25` at char ~90–120, beyond the cut.
3. **Recovered true commands (session transcripts, `~/.claude/projects/…/<session>.jsonl`)** — all 5 contain real pipes:
   - `npx vitest run …/write-gate-lineage-scan.test.js …/stable-artifacts-no-plan-ids.test.js 2>&1 | tail -25`
   - `npx vitest run …/hint-registry.test.cjs …/rule-derived-process-hints.test.cjs 2>&1 | tail -25; echo`
   - `npx vitest run …/gate-logic-verb-layer.test.js …/shell-parse-classify.test.js … 2>&1 | tail…` (×2)
   - `npx vitest run …/migrate-runtime-state-ephemeral-rows.test.js … 2>&1 | tail -15`
4. **HEAD repro (evaluateBashGate) — decisive:**
   - True full commands → **all 5 escalate** (rule `rule-no-raw-stdout-vitest`, pattern `regex`).
   - Stored (truncated) bare prefixes → **all `ok`**.
   - Rule's own test (`evaluate-bash-gate.test.js:359`) asserts `bare vitest run → ok`; only piped shapes escalate. Confirms code + tests are correct.
5. **Recurrence key collision-by-truncation is the real artifact.** `recurrence-tracker.js` `normalizePrefix` slices to 50 chars → bucket `npx vitest run tools/learning-loop-mastra/__tests_`. All `npx vitest run …/__tests__/…` commands hash to one key. The tracker sees only the truncated prefix, so it cannot tell bare (ok) from piped (violation). This is a **diagnostic observability gap**, not a correctness bug — the tracker is designed to file on same-prefix bursts and did.
6. **Sibling precedent (same rule, all open, none resolved/archived):**
   - `meta-260807T065133Z-6d1973a8` — printf-feed harness shape (`printf '<json>' | node bash-gate.js`); **residual false positive**, stays open (pipe-target classification rejected as unsound; archive would re-file).
   - `meta-260807T054940Z-92fb5b00` — `pnpm test:one <file> 2>&1 | <reader>`; **real violation**, stays open (fix = test-runner discipline).
   - `meta-202608040535131Z-a5a14e16` — `pnpm/npx vitest run <files>`; **real violation**, stays open (same class as this finding).
   - `6d1973a8` explicitly: *"Do not archive: archiving re-admits the recurrence_key and the append-only decision-log entries would re-file at next SessionStart."*

### Confirmed vs hypothesis

- **Confirmed:** 5 captures were real piped commands; gate escalates them at HEAD; gate logic and tracker logic are correct.
- **Confirmed (artifact):** 80-char truncation makes these look bare, causing the misleading `recurring-false-positive` label.
- **Not a bug:** no code change warranted in `gate-logic.js`, `evaluate-bash-gate.js`, or `recurrence-tracker.js`.

### Evidence

- Finding record: `meta_state_list` on `meta-260809T062511Z-c44b0a38` (5×/4 sessions, key `rule-no-raw-stdout-vitest::e59ca64ab3793006`).
- Decision-log entries: `.claude/coordination/.gate-decision.log` — 5 entries, each `command_prefix` len=80, rule `rule-no-raw-stdout-vitest`, decision `escalate`, reason matches v2 pattern.
- True commands: session transcripts `6bd99328/dfbd8673/b9485ce7/f4710b27` under `~/.claude/projects/…/`.
- Repro: `evaluateBashGate` on true commands → 5/5 escalate; on truncated prefixes → 5/5 ok.
- Truncation constants: `gate-decision-log.js:5` (80), `recurrence-tracker.js:6` (50).
- Rule definition: `rule-no-raw-stdout-vitest` v2 pattern `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b`.
- Sibling findings: `6d1973a8`, `92fb5b00`, `a5a14e16` (all open).

## Recommendations

### Immediate (P0)
- [ ] None — no gate/tracker correctness bug, no security/behavior risk.

### Short-term (P1)
- [ ] Append a shape-verification note to `meta-260809T062511Z-c44b0a38` (v1), mirroring the sibling treatment (`a5a14e16`, `92fb5b00`): record that all 5 events are real multi-file `npx vitest run … | tail/grep` violations, correctly escalating; leave open as a documented class. Effort: low.
- [ ] (Optional) Note in the same patch that the 80-char decision-log truncation hides pipes for long multi-file vitest commands, which is why these recurrences read as false positives. Effort: low.

### Long-term (P2)
- [ ] (Optional, diagnostics only) Consider raising `COMMAND_PREFIX_MAX_LEN` in `gate-decision-log.js` (80 → e.g. 160) or having the tracker flag a prefix that may hide a pipe, so future recurrences don't mislead operators into thinking the gate false-fired. Not a correctness fix; weigh against log-noise and the 50-char `normalizePrefix` hash already in place. Effort: medium.
- [ ] Do NOT archive or resolve this finding as "false positive" — resolving would contradict precedent that these are genuine violations; archiving re-files the recurrence_key at next SessionStart (per `6d1973a8`). If the open-finding backlog matters, the lever is test-runner discipline (use `pnpm test:one`), not registry housekeeping.

## Unresolved Questions

- None blocking. (Optional P2 diagnostics improvement around prefix truncation is a follow-up candidate, not part of this finding's disposition.)

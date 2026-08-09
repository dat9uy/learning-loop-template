# Disposition Report: rule-no-raw-stdout-vitest recurring-false-positive findings

- **Report type:** disposition / correction of `debug-260809-1420-…`
- **Date:** 2026-08-09
- **Supersedes:** the *disposition* (not the diagnosis) of `plans/reports/debug-260809-1420-rule-no-raw-stdout-vitest-recurrence-shape.md`
- **Scope:** `meta-260809T062511Z-c44b0a38` + 3 open siblings under `rule-no-raw-stdout-vitest`
- **Outcome:** 4 findings resolved; 1 false-fire finding filed; no gate/tracker code change.

## Why the 1420 report's disposition doesn't hold

The 1420 report's **diagnosis is correct** (5 real `npx vitest run …/__tests__/… 2>&1 | tail/head/grep` violations; gate + tracker + dedup correct). Its **disposition** ("leave open; do not resolve/archive") is wrong, and the operator flagged two problems with it:

1. **Don't make the auto-filer incorrect.** The report's P2 (raise `COMMAND_PREFIX_MAX_LEN` 80→160 / have the tracker flag a pipe-hiding prefix) modifies the auto-filer to chase a cosmetic diagnostic-labeling issue — a time sink that risks a real correctness regression and does not address the actual problem.
2. **Don't leave it open.** An open backlog is hard for humans and agents to review and double-check.

The report followed the "leave open" precedent of sibling `6d1973a8` ("Do not archive: archiving re-admits the recurrence_key"). That warning is about **archiving**, not resolving. The report over-generalized "don't archive" into "leave open."

## The conflicting (correct) precedent

Two resolution precedents exist in the registry and were ignored by the 1420 report:

- `meta-260807T054940Z-cbab4a3d` — resolved 2026-08-07, "Expected user-driven TDD iteration, not a gate-logic bug. … No code change."
- `meta-260808T200708Z-038e9eea` — resolved 2026-08-09, "Mirrors operator resolution precedent cbab4a3d. No code change warranted."

`cbab4a3d`'s resolution text states the key insight directly:

> "The subtype `recurring-false-positive` here reads as the registry normal category for the same-prefix pattern firing 3+ times in one session, **not a claim that the hook misfired**."

That is the answer to concern (1): the `recurring-false-positive` subtype is the tracker's **normal recurrence-category label, not a verdict**. Resolving with that recorded keeps the auto-filer correct — it documents that the auto-filer worked as designed.

## Why resolving is safe (won't re-file)

`recurrence-tracker.js` dedup filter (resolveDedupIndex): `e.entry_kind === "finding" && e.subtype === "recurring-false-positive" && e.recurrence_key && e.status !== "archived"`. So `open`, `accepted`, **and `resolved`** all suppress re-filing; only `archived` re-admits. `readRegistry` (meta-state.js `_readAndParseRegistry`) returns max-by-version with **no status filter**, so resolved entries (which preserve `recurrence_key`) are visible to the dedup.

Empirically verified via `GATE_RECURSION_DRY_RUN=1 gate_check_recurrence`:

```
suppressed rule-no-raw-stdout-vitest::e59ca64ab3793006 by existing finding meta-260809T062511Z-c44b0a38
suppressed rule-no-raw-stdout-vitest::424bbd5fa3489dbc by existing finding meta-260807T054940Z-92fb5b00
suppressed rule-no-raw-stdout-vitest::a52c972d904c2221 by existing finding meta-202608040535131Z-a5a14e16
suppressed rule-no-raw-stdout-vitest::386a95d8135a1e79 by existing finding meta-260807T065133Z-6d1973a8
findings_emitted: 0
```

The auto-filer will NOT re-file these keys at next SessionStart.

## A real problem the 1420 report missed: the unanchored-regex false-fire

The rule's pattern `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b` is **unanchored** and matches the pattern as **text**, not only as a real test invocation piped to a reader. Reproducible this session: the rule escalated on an extraction command whose literal list content contained the tokens `pnpm test` and `| grep` (no vitest process invoked), and on investigative `grep -E "Test Files|Tests"`, `echo "=== where rule-no-ra…"`, `node --input-type=module` commands (decision log 2026-08-09 07:09–07:13Z, session `662cb9bd`). `6d1973a8` (printf-feed test harness) is a prior instance of the same root cause.

- Decision is `escalate` (warn, non-blocking) → no work is stopped, but it generates noise and can file spurious recurrences.
- Filed as a first-class finding: `meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru` (gate-logic-bug, warning). Recommended direction (not applied): deliberate rule-pattern refinement requiring an actual test invocation before the pipe-to-reader. Deliberately NOT rushed — modifying the rule is the auto-filer-adjacent code change the operator warned about.

## Actions taken

| Finding | recurrence_key | verdict | disposition |
|---|---|---|---|
| `meta-260809T062511Z-c44b0a38` | `…::e59ca64ab3793006` | real violations (5×, 4 sessions, cross-session slow-burn) | resolved |
| `meta-260807T054940Z-92fb5b00` | `…::424bbd5fa3489dbc` | real violation (`pnpm test:one … 2>&1 \| reader`) | resolved |
| `meta-202608040535131Z-a5a14e16` | `…::a52c972d904c2221` | real violations (`pnpm/npx vitest run … \| reader`) | resolved |
| `meta-260807T065133Z-6d1973a8` | `…::386a95d8135a1e79` | residual false positive (printf-feed test harness; rule matches fixture text) | resolved |
| `meta-260809T1433Z-…-vitest-ru` | (slug id; no recurrence_key) | unanchored-regex false-fire (root cause) | open (filed) |

All 4 resolves: `resolved_by: operator`, resolution text cites evidence (timestamps, sessions, keys), the "subtype is normal recurrence label not a misfire" point (per cbab4a3d/038e9eea), and the no-code-change verdict. `6d1973a8`'s resolution references the false-fire finding as its root cause.

No code change to `gate-decision-log.js`, `recurrence-tracker.js`, `evaluate-bash-gate.js`, `gate-logic.js`, or the rule pattern. The 80-char `command_prefix` truncation is a stored-log cosmetic only; the gate evaluates the full command.

## Follow-up (expected, not blocking)

The dry-run surfaced a **fresh** recurrent group from this investigation session (`662cb9bd`, normalized prefix `cd /home/datguy/codingProjects/learning-loop-templ`, count 5 ≥ per-session threshold 3) — the false-fire symptom. It is not suppressed (distinct recurrence_key from the 4 resolved) and will file a `recurring-false-positive` at the next SessionStart. When it does, resolve it pointing to the false-fire root-cause finding `meta-260809T1433Z-…-vitest-ru` (same disposition as `6d1973a8`). The durable fix is the rule-pattern refinement recorded there.

## Unresolved questions

- Whether/when to tighten the rule pattern (the false-fire finding's open question). Not blocking; decision deferred to the operator.
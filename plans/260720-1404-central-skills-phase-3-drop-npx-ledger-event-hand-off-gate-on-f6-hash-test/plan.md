---
title: "Central-skills Phase 3: drop npx ledger-event hand-off, gate on F6 hash test"
description: "Plan-edit to plans/260719-1428-central-skills-management Phase 3 (Finding C of problem-solving-260719-2029). Drop the unwired Q4 runtime-state ledger-event hand-off; make the F6 hash test the sole npx-round-trip gate (real npx when available, hash-recompute-and-compare when not); decouple F11/F12 from the ledger row (plain presence + byte-identity tests). Open + resolve the C meta-state finding (loop-anti-pattern / escape-hatch-abuse). Operator manually strikes the two corrupt same-id rows in runtime-state.jsonl (gate blocks agent direct edit; no delete tool). No new code."
status: completed
priority: P2
effort: "0.5d"
tags: [central-skills, phase-3, runtime-state, ledger-event, f6-hash-gate, plan-edit, meta-state]
created: 2026-07-20
blockedBy: []
---

# Central-skills Phase 3: drop npx ledger-event hand-off, gate on F6 hash test

## Overview

Finding C of `plans/reports/problem-solving-260719-2029-runtime-state-records-sandbox-handoff.md`
diagnosed the Q4 decision in `plans/260719-1428-central-skills-management/` as an unwired hand-off:
"whichever sandbox can run npx executes the round-trip, writes a ledger-event, and Phase 3 reads it
back to confirm." Three failures — no sandbox is constructed/selected, the report-back loop is
untested, and the same-id "correction" append can't supersede at any id-keyed `find` site
(`meta-state-dispatch-finding-tool.js:45-50` returns the first match). The inversion: a static plan
cannot "read runtime-state back and mark a criterion met" — only a test does.

This plan is a **plan-edit** (no new code). It drops the ledger-event hand-off and makes the **F6
hash test** (`phase-03…md:78` step 17 — already specified) the sole npx-round-trip gate: real `npx`
when available, hash-recompute-and-compare when not. F11/F12 become plain file-presence + byte-identity
tests with no runtime-state dependency. The two corrupt same-id rows in `runtime-state.jsonl` are
struck by the operator (the write-gate blocks the agent; `runtime_state_record` only appends; the
`runtime-state` rule is a simple-glob block with a broken override — same shape as the schemas gate
fixed in 260720-1112). The C finding is opened then resolved, and a change-log records the edit.

**Relationship to other plans:** this plan *mutates the content of* `plans/260719-1428-central-skills-management/`
(its phase-03 + plan.md). It is not a blockedBy execution dependency — 260719-1428 is `in-progress`
and this edit lands inside its Phase 3 scope. A/B/D from the same report are already resolved
(260719-2201 + 260720-1112); C is the last open item.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Drop the Q4 ledger-event hand-off from central-skills Phase 3; gate the npx-round-trip criterion on the F6 hash test | P1 |
| 2 | Decouple F11/F12 from the ledger row — plain presence + byte-identity tests, no runtime-state dependency | P1 |
| 3 | Open + resolve the C meta-state finding; log a change-log for the plan-edit + row strike | P2 |
| 4 | Strike the two corrupt same-id rows from `runtime-state.jsonl` (operator manual bypass) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Open C finding](./phase-01-start.md) | Pending |
| 2 | [Edit central-skills phase-03 + plan.md](./phase-02-edit-central-skills-phase-03-planmd.md) | Pending |
| 3 | [Row strike + closeout](./phase-03-row-strike-closeout.md) | Pending |

## Success Criteria

- [ ] `phase-03…md` status note + Risk Assessment contain no live ledger-event hand-off language; npx-unavailable fallback = F6 hash test (recompute + compare).
- [ ] F11/F12 described as plain tests with no runtime-state dependency anywhere in 260719-1428.
- [ ] `plan.md` Q4 block carries a supersession note (audit trail preserved, not erased); Action Item + Confirmed Decisions updated to "F6 hash test (NOT ledger-event)".
- [ ] C finding opened (`loop-anti-pattern` / `escape-hatch-abuse`, `evidence_code_ref` set) then resolved.
- [ ] `meta_state_log_change` records the plan-edit + row strike.
- [ ] Two corrupt same-id rows struck from `runtime-state.jsonl` (operator manual); gate-log note recorded.
- [ ] Whole-plan consistency sweep on 260719-1428: 0 unresolved contradictions (no stale "ledger-event" / "reads it back" / "whichever sandbox" / "metadata.hashes" references).
- [ ] `pnpm test:iter` green (sanity — no test depended on the struck rows).

## Risk Assessment

- **Editing another plan's validation log (plan.md Q4)** — preserve the audit trail via a supersession note; do not erase the original Q4 rationale. The Q4 decision was wrong (unwired), not undisclosed.
- **`runtime-state.jsonl` write-gate** — `bound-artifacts.js:50-54` blocks direct writes; `runtime_state_record` only appends; the `runtime-state` rule is a simple-glob block, not promoted, so `gate_override` returns "unknown rule_id" (same broken-override shape as the schemas gate). `gate_mark_preflight` unlocks only `product/**` + `skills/**`. → Operator performs the one-time row strike manually (chosen); record a gate-log/change-log note (who/when/why). The inbound gate re-pins `runtime-state.jsonl` after the edit, which is consistent.
- **Adjacent gap (out of scope)** — the runtime-state.jsonl write-gate's broken override is itself a new gate-logic finding (same shape as `meta-260720T1104Z…` schemas gate). Note it; do not fix here. Striking rows by a sanctioned path would require extending preflight or promoting the rule — a separate plan.
- **Striking rows safety** — no test asserts those rows exist; the hand-off is being dropped, so nothing reads them. The inbound gate re-pin absorbs the edit.

## Unresolved Questions

None. All decisions locked: minimal row disposal = operator manual bypass; npx-unavailable fallback = F6 hash test; F11/F12 = plain tests; C finding = open-then-resolve with change-log.

<!-- slug: central-skills-phase-3-drop-npx-ledger-event-hand-off-gate-on-f6-hash-test -->
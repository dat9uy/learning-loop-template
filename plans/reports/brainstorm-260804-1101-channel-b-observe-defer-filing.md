# Brainstorm — Channel B: observe-and-defer → registry

**Finding:** `meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr` (open, version 2, severity warning, category loop-anti-pattern).

## Contract

**Outcome.** Close the finding: live-session friction that is NOT a bash-gate gate-logic-bug escalation (the "observe-and-defer" / toolchain-failure class) reaches the meta-state registry instead of dying in a stateful plan report, so the loop's self-model drives resolution rather than a human retrospective.

**Constraints.** Loop-native primitives only (no new substrate — settled in v1 §7). Stateless-hook norm. `meta-state.jsonl` is committed/tracked → captured content must be redacted. The `reopens` writer arg on `meta_state_report` and `cascade_from` on `meta_state_resolve` were **dropped** (warm hint #7); only the read path survives for 17 historical edges. B-revival is therefore "resolve B directly with the new evidence as the resolution note," not cascade-resolve.

**Non-goals.** Rebuilding Channel A (it works). Adding SessionEnd / commit-msg / push-inline triggers (rejected v1 §3). Promoting the trigger to `additionalContext` (v1 §4 — every-session token cost). Re-deriving finding B (`meta-260615T1920Z`) now — wait for structured counts (v1 lean).

**Acceptance criteria.**
1. An agent-checklist rule exists and is active: when an agent observes a gate or toolchain failure and chooses to defer it as out-of-scope, it MUST `meta_state_report` (category `loop-anti-pattern`, with `session_id`) **before** deferring.
2. A "leave-X-open" validation checks the registry for that filed deferral, not only re-running verification steps.
3. The finding's own resolution does not depend on the disease it names — at least one channel actually fires in vivo (the meta-irony v2 names).
4. No new substrate, no new files beyond the rule's promotion; reuses `meta_state_report`.
5. A re-check mechanism is defined: after N sessions, query `meta_state_list({ session_id })` for `loop-anti-pattern` filings on deferred toolchain failures; if absent, escalate to auto-capture.

## Scouting evidence (current state)

- **Channel A is shipped.** `recurrence-tracker.js` groups by `(rule_id, normalized_prefix, session_id)`, N≥3 per session, **no 10-min `since` filter**; redaction via hash-derived id (no raw prefix in slug); dedup. Commits `ad87a6ec`, `f03bc39f`, `160616b1`. v1 window bug fixed.
- **Reopens linkage (v1 rec 5) not shippable as designed** — `reopens`/`cascade_from` writer args dropped. B-revival route: resolve B directly with new evidence.
- **Channel B is the remaining gap.** No rule/design covers observe-and-defer filing. The `-50` coverage/`u32` toolchain failure was **never filed** (registry grep: 0 hits); fixed by external code review (commit `72988c6b`), confirming the channel did not self-correct.

## Chosen direction (user-approved)

**Rule + measure, then escalate.** Ship the agent-checklist steering rule now; add a re-check after N sessions; escalate to auto-capture only if the rule fails to change behavior.

Rationale: the `-50` episode proves a rule alone is the same channel that already failed (the agent had `meta_state_report` and chose not to file). But auto-capturing toolchain failures is a new surface justified by a single episode (YAGNI). "Measure, then escalate" lets the registry carry the evidence before over-building — the same lean v1 took on finding B.

## Phases (handoff to plan)

**Phase 1 — Steering rule (agent-checklist).**
- Promote a rule: "When you observe a gate or toolchain failure (fallow:gate / pnpm test / build / coverage-parse) and choose to defer it as out-of-scope, you MUST `meta_state_report` (category `loop-anti-pattern`, with `session_id`) before deferring. Validating 'leave-X-open' requires checking the registry for that filed deferral, not only re-running verification steps."
- `enforcement: agent`, `pattern_type: agent-checklist`, `affected_system: meta` (or `gate-logic`).
- Source the finding's own id as the promotion's `finding_id`.

**Phase 2 — Measure (re-check).**
- Define the re-check: after N sessions, `meta_state_list({ session_id })` filtered to `loop-anti-pattern` filings whose description references a deferred toolchain failure.
- If the next observe-and-defer episode files → rule works; resolve the finding.
- If it does not file → escalate to Phase 3.

**Phase 3 — Escalate (conditional, not built now).**
- Widen recurrence-capture to machine-detectable toolchain-failure stderr (coverage-parse `u32` violations, negative hit counters, build non-zero). New stderr parser → decision log → recurrence-tracker grouping by `(failure_signature, session_id)` with redaction. Only built if Phase 2 shows the rule alone fails.

## Unresolved risks / questions

- **Rule compliance is the known weak point.** The `-50` agent had the tool and didn't file. Phase 2's re-check is what catches a repeat; if the operator never re-checks, the rule is silent. The re-check cadence (N sessions) is an operator-intent constant — pick a default and revisit from data.
- **"Toolchain failure" boundary.** The rule names fallow:gate / pnpm test / build / coverage-parse. Edge cases (lint warnings, flaky tests) may not warrant filing. The rule text should scope to failures the agent *defers as out-of-scope*, not every non-zero exit.
- **Finding B (`meta-260615T1920Z`).** With the reopens writer gone, B-revival is "resolve B with new evidence," not cascade-resolve. Defer until the trigger/Phase-2 produces structured counts; do not touch B in this delivery.
- **Does the rule need a `scope_predicate`?** It applies wherever the loop runs; likely no predicate, but confirm at plan time.

## Handoff

Next owning workflow: the installed plan skill (`/ak:plan`), then `/ak:cook`. This delivery is scoped to Phase 1 (rule promotion) + Phase 2 (define the re-check). Phase 3 is explicitly conditional and not built in this delivery.
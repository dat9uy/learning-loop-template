# Plan: inbound-gate emission collapse

**Status:** ready
**Date:** 2026-07-09
**Finding:** `meta-260708T2338Z` (inbound-state-gate re-fires + dumps full stale inventory)
**Report:** `plans/reports/from-problem-solving-to-operator-260709-0450-rec456-shipped-next-move-findings-triage-report.md`

## Context

The inbound state gate (`UserPromptSubmit` hook → `core/evaluate-inbound-gate.js`) re-fires on every message matching a broad state-change regex and dumps the full stale-active-observation id list inline into operator context. Observed 2026-07-08: a ~44-line `vnstock-device-slot-*` dump (with duplicate ids repeated up to 8×) injected twice in one meta-surface session. Four symptoms: (1) re-fires every qualifying message — no once-per-session memoization; (2) no dedup; (3) cross-surface noise — vnstock stale debt floods a meta session; (4) unbounded list grows with stale debt → O(messages × stale) context leak.

Root cause: the gate conflates *detecting* a state-change signal with *surfacing* the full stale inventory inline.

## Goal

Collapse the inline dump to a one-line scoped, deduped, rate-limited pointer. Same meta-pattern as the `stale-ref` collapse (PR #38) and the intake_agent slim: *emit a pointer to where the data lives, not the data.*

## Decision (plan-level)

- **Dedup** the id list (`new Set`).
- **Per-session suppression = signature-keyed time window** (self-contained; no SessionStart coupling). Token `.inbound-stale-surfaced` stores `{ signature, ts }`. `alreadySurfaced = tokenPresent && token.signature === currentSignature && (now − token.ts) < SUPPRESS_WINDOW_MS` (default 30 min). Rationale: the existing SessionStart hook (`session-start-inject-discoverability.cjs`) targets only `.claude` and writes `session-context.json`; coupling a cross-surface token clear there adds fragility for marginal gain. A 30-min signature-keyed window collapses the re-fire (the finding's #1 complaint) without it. A changed stale set re-emits immediately (signature mismatch). A new session within the window still gets the one-line pointer (it is told to review via `meta_state_list` / `runtime_state_read`) — acceptable.
- **Pointer instead of dump:** the first emission lists surfaces + count, not every id: "N stale active observations detected (surfaces: vnstock, …); review via `meta_state_list` / `runtime_state_read`." Suppressed repeats emit: "… already surfaced this session … inline list suppressed."
- **Surface scoping:** group stale observations by `affected_system` (the field on the observation object; fallback `other`). The finding's open sub-question (gate on surface-relevance to the active task vs dedup+rate-limit only) → **dedup + rate-limit + surface-list now**; surface-relevance gating deferred (UQ1).
- **Preserve the `INBOUND STATE GATE` header** string — pinned by `inbound-state-gate.test.cjs:251` (`additionalContext.includes('INBOUND STATE GATE')`). `contextWasInjected` (L104) only checks `additionalContext != null`. Both stay satisfied.

## Files to modify (bound artifacts → Rec 12 change-log each, in-PR)

- `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` — `buildContextMessage`: dedup, surface-group, pointer form; add `staleSignature` + `groupStaleBySurface`; `evaluateStateChangeWarning`/`warnDecision` thread `priorSignature` + return `stale_signature`. (bound: `core/**`)
- `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` — read the token (`readFromAllSurfaces`), pass `priorSignature` to the evaluator, write/update the token on warn (`writeToAllSurfaces`). (bound: `hooks/**` under `tools/`)
- Tests: `.claude/coordination/__tests__/inbound-state-gate.test.cjs` — add cases for dedup, suppression-on-repeat-same-signature, surface-list pointer, re-emit-on-changed-signature; keep L251 header assertion. (`__tests__` — not a bound artifact; no change-log)

## Acceptance criteria

1. A warn with N stale ids where K are unique emits at most K ids' worth of *surface grouping*, never the raw duplicated list.
2. A second qualifying message with the same stale signature within the suppress window emits the one-line "already surfaced" pointer, not the inline list.
3. The first emission lists surfaces + count, not every id.
4. `INBOUND STATE GATE` header preserved (L251 passes); `additionalContext` non-null on warn (L104 passes).
5. Existing marker behavior (`writeOperatorMessageMarker` on warn) unchanged.
6. Tests green; new cases cover dedup, once-per-session, surface-list.
7. Per-file `meta_state_log_change` for each bound-artifact edit, in-PR.

## Phases

- `phase-01-inbound-gate-emission-collapse.md` — the single implementation phase.

## Risks / rollback

- **Risk:** once-token suppresses a genuinely new stale observation surfaced mid-session. Mitigation: token is keyed by the stale-id set signature; if the set changes, re-emit. Also SessionStart clears it.
- **Risk:** surface grouping misclassifies an id. Mitigation: fall back to `constraint_type` or an "other" bucket; the pointer is a hint, not authority.
- **Rollback:** `git revert` the PR (change-logs in-PR → clean).
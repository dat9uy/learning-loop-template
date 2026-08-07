---
phase: 1
title: "Unblock the test runner (Finding B)"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 1: Unblock the test runner (Finding B)

## Overview
Close the schema-vs-implementation drift so a `gate-verb:<verb>` observation can be
recorded, AND add real age-based expiry so the allowance is a bounded 30-min window
(not indefinite). This unblocks the canonical test runner
(`pnpm test:one` → `bash tools/scripts/test-one.sh`) and legitimate `node -e`,
needed to run tests cleanly in later phases.

## Requirements
- Functional: `runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state",
  id:"gate-verb:bash", source_ref:..., timestamp:...})` is ACCEPTED (after
  `gate_mark_preflight({surface:"runtime-state"})`), persisted as a `budget-state` row,
  and — while active and **≤30 min old by age-based expiry added in this phase** —
  satisfies the matching `gate-verb:<verb>` constraint in `evaluateBashGate`. Older
  than 30 min, it does NOT.
- Non-functional: write-side enum and read-side mapping derive from the SAME source
  (`patterns.json["gate-verbs"]`) so the `gate-verb:*` entries cannot drift. The shared
  read happens inside `runtime-state.js` (not `file-readers.js`) to avoid a circular
  import.

## Architecture
- `core/runtime-state.js` `AFFECTED_SYSTEM_ENUM_RUNTIME` is a frozen literal array.
  `core/file-readers.js` `AFFECTED_SYSTEM_TO_CONSTRAINTS` derives the
  `gate-verb:<verb>` identity mappings from `patterns.json`. The fix: re-read
  `patterns.json["gate-verbs"]` INSIDE `runtime-state.js` (mirroring `file-readers.js:36-40`
  and `gate-logic.js:29` — `readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  "patterns.json"))`) and append the `gate-verb:<verb>` entries to the enum. Do NOT
  place a shared helper in `file-readers.js` — it imports from `runtime-state.js`, so a
  helper there creates `runtime-state.js → file-readers.js → runtime-state.js` (circular;
  red-team #13).
- **Age-based expiry (red-team #1, Critical — the 30-min time-box must be built, it is
  not free).** The bash gate's `checkObservationStaleness` (`evaluate-bash-gate.js:114,139`)
  uses **marker-mode** (`isObservationStaleByMarker`, `inbound-state.js:122`): an
  observation is stale ONLY if a fresh (<30 min) operator marker exists with
  `markerTime > obs.updated_at`; with no marker it returns `{stale:false}` — so an
  observation is valid **indefinitely**. `OBSERVATION_STALENESS_WINDOW_MS` is the *marker*
  TTL; observation-age expiry (`isObservationStaleByAge`, `observation-staleness.js:35-39`)
  is called only by the **inbound** gate, not the bash gate. Fix: for `gate-verb:*`
  constraint matches in `evaluate-bash-gate.js`, also apply age-based expiry
  (`isObservationStaleByAge(obs, OBSERVATION_STALENESS_WINDOW_MS)`) so a gate-verb
  observation older than 30 min no longer satisfies the constraint. (Consider whether
  the same age expiry should apply to the existing `vnstock` constraint path too —
  scope creep risk; default to gate-verb:* only unless the marker-mode gap is clearly
  wrong for vnstock.)
- The observation is recorded ON-DEMAND (operator/agent) when the test runner or a
  legitimate `bash -c`/`node -e` is needed — NOT at session-start. Auditable in
  `runtime-state.jsonl`; bounded by the new age expiry.

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/runtime-state.js` (`AFFECTED_SYSTEM_ENUM_RUNTIME` — re-read patterns.json)
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (age-based expiry for `gate-verb:*`)
- Read/verify: `tools/learning-loop-mastra/core/file-readers.js`, `core/patterns.json`, `core/constants.js`, `core/observation-staleness.js`, `core/inbound-state.js`, `tools/handlers/runtime-state-record-tool.js`
- Add test: focused test (see steps) under `tools/learning-loop-mastra/__tests__/`
- Modify docs: `AGENTS.md` §2 (budget/observation flow) and/or `CLAUDE.md` budget note

## Implementation Steps (TDD)
1. **Test first (RED):** add a unit test asserting `runtime_state_record` ACCEPTS
   `affected_system:"gate-verb:bash"` (with `id:"gate-verb:bash"`, after the preflight
   marker) and that `readRuntimeObservations` surfaces a `gate-verb:bash` observation
   from it. Add a second test: that observation satisfies the constraint at age 0 but
   NOT at age >30 min (age-based expiry). Use a temp root + temp `runtime-state.jsonl`.
   Confirm both fail on current code.
2. **Fix enum (GREEN for the record):** re-read `patterns.json["gate-verbs"]` inside
   `runtime-state.js` and append `gate-verb:<verb>` entries to
   `AFFECTED_SYSTEM_ENUM_RUNTIME`. Keep existing literals.
3. **Fix expiry (GREEN for the window):** in `evaluate-bash-gate.js`, for `gate-verb:*`
   constraint matches, apply `isObservationStaleByAge(obs, OBSERVATION_STALENESS_WINDOW_MS)`
   so observations older than 30 min are treated as not-found. Verify the age test passes.
4. **Verify:** both new tests pass; `gate-logic-verb-layer.test.js` unchanged and green
   (no behavior change to `matchGateVerb`).
5. **Docs (red-team #6):** the operator note MUST be accurate:
   ```
   gate_mark_preflight({surface:"runtime-state"})   // unlock the record path
   runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state",
     id:"gate-verb:bash", source_ref:"local:...", timestamp:"<ISO>"})
   ```
   Note: `id` MUST equal `affected_system` (`runtime-state-record-tool.js:109` else
   `canonical_id_required`); `gate_mark_preflight({surface:"runtime-state"})` must
   precede it (`runtime-state-record-tool.js:70` else `preflight_required`). The
   allowance is bounded to 30 min by age expiry (Phase 1 step 3).
6. **Enum boundary (red-team #15):** any `meta_state_report`/`meta_state_resolve`
   describing this surface uses `affected_system:"gate-logic"` (NOT `"gate-verb:bash"`,
   which is not in `AFFECTED_SYSTEM_ENUM`).
7. **Operator step (approval-gated, not code):** when executing later phases, the
   operator approves recording a `gate-verb:bash` observation so the agent can use the
   canonical runner. (`pnpm exec vitest run <file>` remains usable without it — no
   `bash` verb — as the fallback.)

## Success Criteria
- [ ] `runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state",
  id:"gate-verb:bash",...})` is accepted (after preflight) and surfaces as an active
  `gate-verb:bash` observation.
- [ ] That observation satisfies the constraint at age 0 and does NOT at age >30 min
  (age-based expiry enforced in the bash gate for `gate-verb:*`).
- [ ] Every `gate-verb:<verb>` in `patterns.json` is accepted by the record schema.
- [ ] `gate-logic-verb-layer.test.js` and the runtime-state tests are green.
- [ ] No new drift: grep confirms both the enum and the mapping read `patterns.json`;
  the read happens in `runtime-state.js` (no `file-readers.js` circular import).
- [ ] DRY claim narrowed (red-team #15): the `gate-verb:*` entries cannot drift; the
  legacy literal entries (`fastapi` etc.) remain unmapped — pre-existing, out of scope.
- [ ] Docs note accurate (preflight + canonical-id + 30-min age expiry).

## Risk Assessment
- **Indefinite allowance (Critical, mitigated):** without the age-based expiry (step 3),
  a `gate-verb:bash` observation allows ALL bash (incl. `bash -c "evil"`) indefinitely.
  The age expiry bounds the window to 30 min. The promoted-rule layer is a **denylist,
  not a sandbox** (red-team #9) — arbitrary `bash -c` bodies not matching a promoted
  rule pass during the window; the bounded window + deliberate/auditable recording is
  the mitigation, NOT a docker/sudo precedent (red-team #2: docker/sudo have no
  observation path — they are unconditional blocks).
- **New bypass surface (High):** `gate-verb:bash` was previously always-blocked; this
  makes it observation-satisfiable. Mitigation: bounded 30-min window, auditable, on-demand.
- **Enum explosion / circular import (low):** re-reading `patterns.json` in
  `runtime-state.js` avoids both drift and the circular import.
- **No security weakening to matchGateVerb:** the verb matcher is untouched; only the
  release valve is wired and time-boxed.
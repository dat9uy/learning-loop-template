# Phase 4: Integration regression + hook failure containment + runtime-agnostic audit

## Context

P1–P3 each have unit tests; this phase is the cross-phase integration regression,
**SessionStart hook failure containment** (red-team: the hook has zero error handling —
one bad group crashes it deterministically every session), a **latency tripwire** for the
full-log scan, and the runtime-agnostic audit required before shipping any loop feature
(project rule: `check_runtime_agnostic` against the 6-item checklist; regression test at
`__tests__/runtime-agnostic.test.js`). It also verifies the P4-dissolution claim
end-to-end via the **grounding query** (corrected mechanic — not `meta_state_relationships`)
and the silent-write-channel invariant (0 agent tokens).

Report: §1 (P4 dissolves), §3 (silent channel), plan goals #3/#5.

## Requirements

- An end-to-end test over a realistic multi-session `.gate-decision.log` (aged bursts
  across distinct `session_id`s, a historical no-session backlog group, one secret-shaped
  prefix, one strip-eval-rule prefix) → `checkAndEmit` files exactly the right findings:
  one per `recurrence_key`, hashed keys, gate-rule `evidence_code_ref`, suppressed against
  existing open/accepted/resolved, **zero findings from no-session backlog groups**.
- The recurring finding for the strip-eval rule **co-locates with B at `gate-logic.js`**
  via `meta_state_check_grounding` / `meta_state_query_drift` (findings-on-a-file) — with
  NO `reopens` write and no declared edge (P4 dissolution confirmed end-to-end, using the
  read path that actually exists per `docs/meta-state-lifecycle.md:246`).
- The SessionStart hook **fails open**: any `checkAndEmit` throw → exit 0 with a stderr
  diagnostic; one bad group never blocks other groups or future sessions.
- The hook emits no `hookSpecificOutput.additionalContext` (silent-write channel; 0 agent
  tokens).
- Scan latency is measured and logged (stderr) with a defined budget — the tripwire that
  schedules the deferred watermark work.
- `check_runtime_agnostic` passes; `__tests__/runtime-agnostic.test.js` updated if the
  feature surface changed; `pnpm test` green.

## Files

- **Read:** `tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js`
  (`:13-28` — no try/catch today), `tools/learning-loop-mastra/core/recurrence-tracker.js`
  (final state post-P1–P3), the runtime-agnostic checklist (`rule-runtime-agnostic-features`),
  `__tests__/runtime-agnostic.test.js`.
- **Modify:** integration test file(s) for recurrence, `recurrence-check-on-start.js`
  (failure containment + timing), `__tests__/runtime-agnostic.test.js` if warranted.

## Steps

1. **Hook failure containment.** In `recurrence-check-on-start.js`: wrap `main()` so any
   throw exits 0 with a stderr diagnostic (matching `appendToAllSurfaces`' fail-open
   contract, `surfaces.js:19-20`). In `checkAndEmit`'s write loop (tracker): per-group
   try/catch, log-and-continue — one schema rejection or lock failure must not skip the
   remaining groups or crash every future session start. (Without this, a deterministic
   throw at group k replays at every SessionStart forever, since groups 1..k-1 are now
   dedup-suppressed.)
2. **End-to-end integration test.** Fixture:
   - Log: (a) 3× strip-eval-rule prefix in session A (aged >10 min), (b) 3× same prefix
     in session B (distinct `session_id`), (c) 3× secret-shaped prefix in session A,
     (d) a 46× historical no-session group (the real backlog shape), (e) two
     same-millisecond entries with distinct `session_id`s (cross-surface dedupe).
   - Registry: B (`status: accepted`, `evidence_code_ref: …/gate-logic.js#stripNodeEvalBody`),
     a backfilled strip-eval rule record, and a pre-existing `resolved`
     `recurring-false-positive` for a third prefix.
   - Assert: **one** finding for the strip-eval prefix (in-call dedup across A+B),
     `evidence_code_ref` = the rule record's value; **one** finding for the secret
     prefix, whole-JSON grep clean, `id` hash-derived; **zero** for the resolved prefix
     (suppression + stderr diagnostic); **zero** for the no-session backlog (clean
     cutover); both same-ms entries counted; **zero** `reopens` fields.
3. **Grounding verification (corrected mechanic).** Run `meta_state_check_grounding`
   (and/or `meta_state_query_drift`) for `gate-logic.js`; assert the emitted finding and
   B both appear as findings touching that file. Do NOT assert via
   `meta_state_relationships` — that tool reads the declared-edge graph only.
4. **Silent-channel + fail-open assertions.** Invoke the hook with a stub SessionStart
   payload: (a) happy path → no `hookSpecificOutput.additionalContext` in output;
   (b) `checkAndEmit` forced to throw → exit code 0, stderr diagnostic present.
5. **Latency tripwire (budget validated 2026-08-02).** The hook logs scan duration +
   entry counts to stderr every run. Budget: **p50 added SessionStart latency < 500ms**
   on the current ~28.4K-line union; measure on a real session and record the number in
   the ship report. Crossing the budget schedules the watermark work (currently
   deferred, plan decision #6).
<!-- Updated: Validation Session 1 - tripwire budget pinned to 500ms p50 -->
6. **Runtime-agnostic audit.** `check_runtime_agnostic` on the changed feature. Confirm
   `session_id` capture + grouping work across all three wired runtimes and that the
   cross-surface read (`readJsonlFromAllSurfaces`) handles mixed old/new entry shapes.
7. **Broad suite.** `pnpm test` green; re-run the seed step so the file-index baseline
   absorbs edit drift.

## Validation

- All assertions above pass.
- `check_runtime_agnostic` returns no failures.
- `pnpm test` fully green; file-index baseline regenerated.
- Measured SessionStart latency recorded in the ship report with the tripwire budget.
- `loop.mjs list` / tool-count parity unchanged (no new tools).

## Risk

- **Cross-surface `session_id` divergence.** Different runtime UUIDs for the "same"
  operator session → in-call dedup by `recurrence_key` still collapses them (that's the
  point of excluding `session_id` from the key). Covered by the integration test.
- **File-index baseline drift.** Editing `recurrence-tracker.js` may invalidate
  mechanism_check findings citing that path. Re-run `pnpm test` (seed); surface any
  drift-stale findings in the ship report, do not silently leave them.
- **Fail-open masks real errors.** Accepted: stderr diagnostics + the dedup-hit lines are
  the observability channel; a hook that blocks session start is worse than a skipped
  recurrence check.

## Rollback

Revert P1–P3 + the hook hardening. The trigger returns to its current never-fires state.
No schema migration (zero findings ever filed). Archive any findings filed during testing
in a real registry (`meta_state_archive`) — they are test artifacts. Document the rollback
in the ship report.

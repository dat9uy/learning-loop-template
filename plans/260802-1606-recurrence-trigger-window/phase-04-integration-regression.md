# Phase 4: Integration regression + runtime-agnostic audit

## Context

P1–P3 each have unit tests; this phase is the cross-phase integration regression +
the runtime-agnostic audit required before shipping any new loop feature (project rule:
`check_runtime_agnostic` against the 6-item checklist; regression test at
`__tests__/runtime-agnostic.test.js`). It also verifies the P4-dissolution claim end-to-end
(the recurring finding co-cites B via file-index with no `reopens` write) and the
silent-write-channel invariant (0 agent tokens).

Report: §1 (P4 dissolves), §3 (silent channel), plan goals #3/#5.

## Requirements

- An end-to-end test: a realistic multi-session `.gate-decision.log` (aged bursts across
  distinct `session_id`s, one secret-shaped prefix, one strip-eval-rule prefix) →
  `checkAndEmit` files exactly the right findings: one per `recurrence_key`, hashed
  prefixes, gate-rule `evidence_code_ref`, suppressed against existing open/accepted/resolved.
- The recurring finding for the strip-eval rule **co-cites B** at `gate-logic.js` file
  granularity via file-index — verified with NO `reopens` write on the finding (P4
  dissolution confirmed end-to-end).
- The SessionStart hook emits no `hookSpecificOutput.additionalContext` (silent-write
  channel; 0 agent tokens).
- `check_runtime_agnostic` passes against the 6-item checklist for the changed feature.
- `__tests__/runtime-agnostic.test.js` regression updated if the feature surface changed.
- Broad suite green: `pnpm test`.

## Files

- **Read:** `tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js`
  (confirm no `additionalContext` emission `:24-25`), `tools/learning-loop-mastra/core/recurrence-tracker.js`
  (final state post-P1–P3), the runtime-agnostic checklist (`rule-runtime-agnostic-features`),
  `__tests__/runtime-agnostic.test.js`.
- **Modify:** integration test file(s) for recurrence (add/extend the end-to-end suite),
  `__tests__/runtime-agnostic.test.js` if the feature surface warrants a regression row.

## Steps

1. **End-to-end integration test.** Build a fixture with:
   - A `.gate-decision.log` containing: (a) a 3× burst of a strip-eval-rule prefix in
     session A (aged >10 min — would be missed by the old window), (b) a 3× burst of the
     same prefix in session B (distinct `session_id`), (c) a 3× burst of a secret-shaped
     prefix (`curl https://api?token=eyJsecret`) in session A.
   - A fixture registry with: B (`meta-260615T1920Z-…`, `subtype: strip-bypass-accepted`,
     `status: accepted`, `evidence_code_ref: tools/learning-loop-mastra/core/gate-logic.js#stripNodeEvalBody`),
     and a pre-existing `resolved` `recurring-false-positive` for a third prefix.
   - Run `checkAndEmit`. Assert:
     - **One** finding for the strip-eval prefix (in-call dedup across sessions A+B), with
       `evidence_code_ref` = the strip-eval rule record's `evidence_code_ref` (co-cites B).
     - **One** finding for the secret prefix, with `recurrence_key` = `rule_id::sha256(prefix)[:12]`
       and **no** raw secret in `description`/`recurrence_key`.
     - **Zero** findings for the resolved prefix (suppressed; no grace window).
     - **Zero** `reopens` field on any emitted finding (P4 dissolution).
2. **Co-citation verification.** Run the file-index neighborhood read (or
   `meta_state_relationships`) for the emitted strip-eval finding; assert B appears as a
   co-citing record at `gate-logic.js` file granularity. This proves the P4 link emerges
   from P2's `evidence_code_ref` fix with no declared edge.
3. **Silent-channel assertion.** Invoke the `recurrence-check-on-start.js` hook with a
   stub SessionStart payload; capture stdout; assert the JSON output contains no
   `hookSpecificOutput.additionalContext` key (0 agent tokens). The hook's only emission is
   the `console.error` line + the registry write.
4. **Runtime-agnostic audit.** Run `check_runtime_agnostic` against the changed feature
   (the hook + tracker changes). The 6-item checklist: shim-not-fork + cross-surface
   iteration. Confirm the `session_id` capture + log read work across all three wired
   runtimes (`.claude`, `.factory`, `.mastracode`) — the decision-log is cross-surface
   (`appendToAllSurfaces`), so the trigger already iterates surfaces; assert the
   `session_id`/grouping change doesn't break the cross-surface read.
5. **Broad suite.** `pnpm test` green (recurrence + meta-state + cli-mcp-subset +
  workflow-parity + runtime-agnostic + cold-tier regression). Re-run the seed step so the
  file-index baseline absorbs any `meta-state.js`/`recurrence-tracker.js` edit drift.

## Validation

- All assertions above pass.
- `check_runtime_agnostic` returns no failures (or failures are fixed before ship).
- `pnpm test` fully green; file-index baseline regenerated (cold-tier regression green).
- `loop.mjs list` / tool-count parity unchanged (no new tools added — P4 added none, by
  design).

## Risk

- **Cross-surface `session_id` divergence.** If `.claude`/`.factory`/`.mastracode` write
  the same burst with different `session_id`s (different runtime UUIDs for the "same"
  operator session), in-call dedup by `recurrence_key` still collapses them to one finding
  (cross-session dedup is the point of `recurrence_key` excluding `session_id`). Verify
  this holds in the integration test with two surface logs.
- **File-index baseline drift.** Editing `recurrence-tracker.js` (cited by the stale
  `evidence_code_ref` we're removing) may invalidate mechanism_check findings citing that
  path. Re-running `pnpm test` (seed step) regenerates the baseline; if findings cite the
  *old* `-mcp` path, they may need `meta_state_refresh_file_index` or re-grounding —
  surface in the ship report, do not silently leave drift-stale findings.

## Rollback

Revert P1–P3. The trigger returns to its current never-fires state. No schema migration
(zero findings were ever filed). If any findings were filed during testing in a real
registry, archive them (`meta_state_archive`) — they are test artifacts, not real
recurrences. Document the rollback in the ship report.

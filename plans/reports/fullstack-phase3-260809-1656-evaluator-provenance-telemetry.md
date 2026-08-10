# Phase 3 Report — Evaluator Provenance and Decision Telemetry

- Phase: phase-03-evaluator-provenance-and-decision-telemetry
- Plan: `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/plan.md`
- Status: DONE_WITH_CONCERNS
- Date: 2026-08-09

## Summary

Phase 3 threads classifier provenance (`event_source`, `match_origin`,
`candidate_kind`, `event`) from `applyPromotedRules()` through
`evaluateBashGate()` and the universal Bash hook into the cross-surface
decision log, and adds a separate non-permission `ok`+`unexpected-match`
telemetry event for proven inert-data matches. Provenance is additive,
optional, and fail-open for logging; the gate decision stays fail-closed. The
Phase-1 RED evaluator/log tests are now GREEN; the Phase-4 recurrence-eligibility
tests remain RED by design.

## Files Modified

- `tools/learning-loop-mastra/core/gate-logic.js` (+~130): `buildPromotedMatchResult()` helper, dual-view telemetry in the promoted non-matched path, kill-switch guard.
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (+15): returns the telemetry result only after hard_block/constraint/path combine.
- `tools/learning-loop-mastra/core/gate-decision-log.js` (+8): optional `event_source`/`match_origin`/`candidate_kind`/`event` on the serialized line.
- `tools/learning-loop-mastra/hooks/universal/bash-gate.js` (+21): `emitIfBlocked` appends log + returns with no envelope for `ok`+`unexpected-match`; `buildLogEntry` copies the 4 provenance fields.
- `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` (+5): `event_source: "toolchain-failure-capture"` tag (partitioning marker).
- Tests: `__tests__/legacy-mcp/gate-promoted-rules.test.js`, `__tests__/legacy-mcp/gate-decision-log.test.js`, `core/evaluate-bash-gate.test.js`, `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js`, `__tests__/toolchain-failure-capture.test.cjs`.

## (a) RED count before vs after

- Before: 15 RED tests (Phase-1 baseline: 7 command-classification-contract + 4 gate-recurrence + 1 decision-log + 3 promoted-rules).
- After: 11 RED — the Phase-4-only subset:
  - 7 in `__tests__/command-classification-contract.test.js` (recurrence-eligibility assertions)
  - 4 in `__tests__/legacy-mcp/gate-recurrence.test.js`
- The 1 decision-log and 3 promoted-rules RED tests are now GREEN. These 11 must remain RED until Phase 4.

## (b) Telemetry flow (ok + unexpected-match, no deny/allow override)

1. `applyPromotedRules()` runs the dual-view raw-detection path: when the
   command does not match after the blanker but the raw command matches the
   rule regex (and `GATE_HEREDOC_BLANKER !== "0"`), `buildPromotedMatchResult()`
   classifies in event mode. Proven inert-data → returns
   `{ decision: "ok", event: "unexpected-match", match_origin: "inert-data",
   candidate_kind: "unexpected-match", event_source: "bash-gate-evaluator", ... }`.
2. `evaluateBashGate()` does NOT return it early. It runs the full
   hard_block/constraint/path combine first, then at the very end returns the
   telemetry result — so a real docker/constraint/path-write decision wins.
3. `bash-gate.js` `emitIfBlocked()` sees `decision === "ok"` + `event ===
   "unexpected-match"`, appends the decision-log entry via `buildLogEntry()`
   (copying the provenance fields), and returns WITHOUT printing a
   `hookSpecificOutput` envelope — the command is allowed, no deny/allow
   override reaches the harness, exit code stays 0.
4. Cross-surface dedup key (`ts::command_prefix::rule_id::decision::session_id`)
   excludes provenance, so a telemetry row cannot be confused with a later
   real decision on the same command.

## (c) Public-contract change

Additive and optional only — no existing field changed:
- `applyPromotedRules` matched/unexpected-match results may carry
  `event_source`, `match_origin`, `candidate_kind`, `event`.
- `appendDecisionLog` serialized line includes these four fields only when
  present (absent → byte-identical legacy lines).
- `buildLogEntry` in `bash-gate.js` copies them when present.
- The frozen vocabulary is unchanged (`bash-gate-evaluator` |
  `toolchain-failure-capture`; `executable` | `inert-data` | `mixed` |
  `unknown`; `ordinary-rule-fire` | `unexpected-match` | `unclassified`).

## (d) Forged-log fixture result

PASS. A hand-appended parseable JSONL row with flat unexpected-match fields
round-trips verbatim through the reader: `deepStrictEqual` over sorted keys
confirms the reader fabricates no producer marker and strips no fields. Trust
for automatic filing is enforced at the recurrence boundary (Phase 4) by the
producer path, not this reader.

## Test results

- Focused evaluator suite: 119 pass.
- Modified test files (5): 146 pass.
- Hook integration (`toolchain-failure-capture.test.cjs` + bash-gate visibility): 16 pass.
- Core suite: 342 pass; write-gate: 49 pass; bash-gate related: 52 pass; `.claude/coordination`: 62 pass.
- Full legacy-mcp: 1947 passed, 11 failed (Phase-4 RED only).
- Full project `npx vitest run`: 13 failures = 11 Phase-4 RED + 2 NEW placement-manifest failures (see Concerns).

## Concerns / Blockers

1. **2 `placement-manifest.test.js` failures — pre-existing Phase 2 gap, NOT caused by Phase 3.**
   `core/placement.yaml` enumerates 67 production files but `core/command-classification.js`
   (created in Phase 2, still untracked `??` in git) is absent. My Phase 3 diff
   modifies only existing files and adds no new core production files, so these
   failures are a Phase 2 debt. `placement.yaml` is NOT in Phase 3's file-ownership
   list, so I did not modify it. Fix belongs to the Phase 2 owner: add
   `command-classification.js` (and its test, if the manifest covers tests) to
   `core/placement.yaml`, then commit the Phase 2 artifacts.
2. The 11 Phase-4 RED tests remain intentionally failing — do not treat as a
   regression; they are the recurrence-candidate filtering acceptance tests.

## Next Steps

- Phase 2 owner: add `command-classification.js` (+ test) to `core/placement.yaml` to clear the placement-manifest failures.
- Phase 4: recurrence-candidate filtering makes the remaining 11 RED tests GREEN.
- Phase 5: contract drift and cross-surface validation.

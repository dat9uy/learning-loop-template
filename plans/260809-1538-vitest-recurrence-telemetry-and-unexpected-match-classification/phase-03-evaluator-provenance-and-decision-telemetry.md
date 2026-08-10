---
phase: 3
title: "Evaluator provenance and decision telemetry"
status: completed
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Evaluator provenance and decision telemetry

## Overview

Thread classifier provenance from `applyPromotedRules()` through `evaluateBashGate()` and the universal Bash hook into the cross-surface decision log. Keep provenance additive, optional, and fail-open for logging while the gate decision remains fail-closed.

## Requirements

- Functional: evaluator returns explicit provenance for matched promoted-rule events.
- Functional: ordinary executable matches are not unexpected; proven inert-data matches are explicit unexpected-match candidates; ambiguous matches are unclassified.
- Compatibility: `evaluate-write-gate.js` and all existing `applyPromotedRules()` callers continue to work.
- Security: optional fields preserve JSONL newline hardening and do not leak raw command bodies beyond existing prefix policy.
- Separation: `toolchain-failure-capture.js` remains a distinct event source.

## Architecture

Current seams:

- `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/gate-logic.js:1701-1824` — promoted-rule evaluator and two match passes.
- `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/evaluate-bash-gate.js:236-241` — promoted-rule result pass-through.
- `/home/datguy/learning-loop-template/tools/learning-loop-mastra/hooks/universal/bash-gate.js:41-58` — non-OK hook logging and envelope.
- `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/gate-decision-log.js:33-50` — fixed-field serialization and newline guard.
- `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/evaluate-write-gate.js:416-420` — null-command compatibility caller.

Decision event fields are additive:

```js
{
  ...existing,
  event_source: "bash-gate-evaluator" | "toolchain-failure-capture",
  match_origin: "executable" | "inert-data" | "mixed" | "unknown",
  candidate_kind: "ordinary-rule-fire" | "unexpected-match" | "unclassified"
}
```

`event_source` is a producer marker, not user-supplied classification. The pair is discriminated and fail-closed: `candidate_kind: "unexpected-match"` is valid only with `match_origin: "inert-data"`; `candidate_kind: "ordinary-rule-fire"` is valid only with `match_origin: "executable"` or an explicitly documented ordinary origin; all other combinations—including missing, malformed, or conflicting fields—normalize to unclassified/telemetry-only. A same-identity cross-surface duplicate with disagreement is also downgraded. The recurrence tracker accepts automatic promoted-rule candidates only when the row has the exact evaluator source marker, a valid enum pair, and an explicit unexpected-match kind. The decision-log reader remains backward-compatible, but file-originated rows without a verifiable evaluator marker are never eligible for automatic filing. No persisted finding schema changes.

The plan must also close the existing write seam: before enabling automatic filing from provenance, add a regression test and a trusted producer boundary so an ordinary shell command cannot append a forged `.gate-decision.log` row. The validation decision is to ship the smallest gated/trusted producer protection in this follow-up; if implementation proves that authenticity cannot be established without a disproportionate redesign, stop automatic filing for file-originated unexpected rows and retain operator-filed handling rather than weakening the boundary.

## Tests Before

1. Extend `gate-promoted-rules.test.js` and `evaluate-bash-gate.test.js` for ordinary, unexpected, mixed, and unknown outcomes.
2. Extend `gate-decision-log.test.js` for optional-field round trip, old-row compatibility, cross-surface append, concurrent writes, `since`, and newline hardening.
3. Add hook integration assertions that `bash-gate.js` copies evaluator provenance and still emits the same `hookSpecificOutput` envelope.
4. Add a toolchain capture fixture proving it writes an explicit separate source/event classification and is not treated as a promoted rule.
5. Add a forged-log fixture and a cross-surface disagreement fixture. The tests must prove that a parseable JSONL row is not automatically trusted merely because it contains the expected flat fields; only the evaluator producer path can mark an automatic candidate, and disagreement downgrades to unknown.

## Refactor

1. Return classifier metadata from the matched branch in `applyPromotedRules()` while preserving `decision`, `reason`, `rule_id`, `meta_state_id`, and `pattern_type`.
2. Propagate fields through `evaluateBashGate()` unchanged.
3. Copy optional fields in `buildLogEntry()`.
4. Serialize optional fields in `appendDecisionLog()` with stable null/default behavior for old callers.
5. Do not log `ok` commands globally in this phase. For a proven inert-data candidate, define a separate non-permission telemetry event/result (for example `event: "unexpected-match"` alongside `decision: "ok"`) that the hook logs without emitting a deny/allow override to the harness. The event must carry `event_source: "bash-gate-evaluator"`; it must not be represented as an ordinary blocked rule fire. If the hook/runtime cannot safely emit this separate telemetry event, keep the candidate operator-filed and do not broaden logging.

## Tests After

- Real Vitest violations still escalate.
- Sanctioned parser workflows remain allowed.
- Executable bodies and mixed commands never receive unexpected-match.
- Proven inert-data matches carry explicit unexpected-match metadata.
- Existing log schema consumers ignore/accept the additional fields.

## Implementation Steps

1. Implement evaluator result fields behind Phase 2 classifier tests.
2. Update hook/log adapters.
3. Keep toolchain-failure source tagged separately.
4. Run focused evaluator, hook, and decision-log suites.
5. Inspect all `applyPromotedRules()` callers and update only required type/shape assertions.

## Todo

- [ ] Add evaluator provenance fields.
- [ ] Propagate through evaluateBashGate and Bash hook.
- [ ] Extend decision-log serializer safely.
- [ ] Preserve null-command write-gate path.
- [ ] Verify toolchain-failure separation.

## Success Criteria

- [ ] Provenance is evaluator-generated, never inferred by recurrence tracker.
- [ ] Existing callers and hook output remain compatible.
- [ ] Decision-log entries with and without provenance read successfully.
- [ ] No raw command data or newline injection is introduced.

## Dependency Map

- Depends on classifier output from Phase 2.
- Blocks recurrence filtering in Phase 4.
- Feeds Phase 5 end-to-end cross-surface projection tests.

## Risk Assessment

- **Risk:** allowed unexpected matches are not emitted, so Phase 4 has no real event input. **Signal:** synthetic classifier tests pass but no integration event reaches the log. **Response:** add a narrowly defined telemetry event for proven inert matches; do not mark ordinary blocked rule fires unexpected.
- **Risk:** write-gate caller receives command-only metadata assumptions. **Signal:** write-gate tests fail on `command=null`. **Response:** return unknown/unclassified for null command and preserve existing path matching.
- **Risk:** log schema migration rejects old lines. **Signal:** `readDecisionLog()` drops or throws on legacy fixture rows. **Response:** default missing fields at tracker boundary, not during destructive rewrite.
- **Risk:** file-originated provenance is forgeable or surfaces disagree. **Signal:** a hand-appended JSONL row or partial fan-out can trigger a finding, or same-identity rows resolve differently by surface order. **Response:** validate the producer marker and discriminated pair; fail closed on conflicts; if authenticity cannot be established, disable automatic filing for file-originated candidates and leave them operator-filed.
- **Risk:** recurrence output leaks inert payloads. **Signal:** `sample_commands` or handler output contains raw secrets/PII-shaped values. **Response:** move privacy-safe structural samples/hashes into the recurrence result before enabling unexpected candidates.

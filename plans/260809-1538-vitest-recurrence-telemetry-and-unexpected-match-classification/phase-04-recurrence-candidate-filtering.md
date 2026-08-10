---
phase: 4
title: "Recurrence candidate filtering"
status: completed
priority: P1
effort: "6h"
dependencies: [3]
---

# Phase 4: Recurrence candidate filtering

## Overview

Change recurrence tracking from “every repeated rule event is a false-positive finding” to explicit candidate filtering. Ordinary rule fires and unclassified legacy events remain telemetry; only parser-proven unexpected-match events enter the existing grouping, deduplication, and write path.

## Requirements

- Functional: filter promoted-rule recurrence by explicit `candidate_kind === "unexpected-match"` plus proven inert origin.
- Functional: preserve existing recurrence thresholds, per-session/cross-session grouping, exact-key dedup, dry-run behavior, and archived/non-archived suppression.
- Compatibility: historical rows lacking provenance do not auto-file; existing findings remain readable and unchanged.
- Separation: toolchain-failure recurrence remains on its own branch/semantics.
- Privacy: recurrence descriptions and keys retain current redaction; no raw command payload is added to registry findings.

## Architecture

`findRecurrentGroups()` at `recurrence-tracker.js:242-290` becomes provenance-aware before grouping. The recurrence-mode normalized key remains coarser than gate mode and retains the completed heredoc plan's redirect/delimiter blanking and post-terminator residue salt (`recurrence-tracker.js:72-179`). The tracker must not infer candidate kind from `rule_id`, `reason`, command prefix, or key collision. It must first validate the producer marker and the discriminated provenance pair: only `event_source: "bash-gate-evaluator"` + `candidate_kind: "unexpected-match"` + `match_origin: "inert-data"` is eligible. Contradictory or cross-surface-conflicted rows are unclassified. Provenance must not be added to the recurrence key; same-identity rows with disagreement must fail closed rather than let dedup order choose a winner.

Because current `applyPromotedRules()` strips inert data before its matching branch, Phase 3 must provide the dual-view event path before this filter can satisfy the positive candidate criterion: raw text is inspected for telemetry only, the exact match span is proven inert against the gate view, and the hook emits a separate non-permission event. If that path cannot be made trustworthy, the implementation must leave the class operator-filed and keep automatic candidate count at zero for it.

`buildFinding()` remains the same persisted finding shape for the minimal cut. `resolveDedupIndex()`, `collapseFreshByKey()`, and locked `writeEntryIfAbsent()` retain current exact-key semantics.

### File inventory

| File | Action | Test impact |
|---|---|---|
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/recurrence-tracker.js` | Modify | Eligibility filter and explicit toolchain branch |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` | Modify | Main recurrence matrix |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js` | Modify only if public description is stale | Tool contract text |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js` | Read | Event fixture compatibility |

## Tests Before

1. Three ordinary Vitest rule fires under one session produce `checked_groups` telemetry but zero emitted findings.
2. Three explicit, evaluator-produced unexpected-match events produce one finding with unchanged schema/key behavior; a forged file-originated row or a row with the wrong producer marker produces zero automatic findings.
3. Missing provenance and `candidate_kind: "unclassified"` are ignored for automatic promoted-rule recurrence.
4. Contradictory pairs (`unexpected-match` + `executable`, `ordinary-rule-fire` + `inert-data`) normalize to unclassified and cannot cross the threshold.
5. Two cross-surface rows with the same dedup identity but different provenance are treated as one conflicted/unknown event, not selected by append order.
6. A mixed/executable event is ignored even if recurrence normalization collapses its payload.
7. Toolchain-failure recurrence retains current behavior and is not filtered by promoted-rule candidate logic.
8. Existing resolved/accepted/open/archived exact-key tests remain unchanged.
9. Distinct semantic classes under one rule remain separate; adjacent heredoc/key-normalization tests remain green.
10. `sample_commands` and tool output are privacy-safe for inert payloads; secrets, tokens, PII-shaped values, and multiline data are not surfaced raw.

## Refactor

1. Add a small pure eligibility helper (for example `isUnexpectedMatchCandidate(entry)`) with explicit defaults.
2. Apply it before per-session and cross-session promoted-rule grouping.
3. Keep separate toolchain handling rather than treating `toolchain-failure` as an unexpected promoted-rule event.
4. Preserve `entries_scanned` and recurrence counters so telemetry remains observable.
5. Replace `sample_commands` with structural classes/hashes for automatically surfaced inert candidates; do not return raw payloads through `gate_check_recurrence`.
6. Keep operator-filed path/documentation for parser-unprovable classes.

## Tests After

- Run recurrence focused suite and all heredoc/key-normalization regression tests.
- Run cross-surface integration through `gate_check_recurrence` and SessionStart recurrence hook fixtures.
- Confirm no rule-level suppression field is read or required.

## Implementation Steps

1. Implement eligibility tests and helper.
2. Filter grouping inputs, preserving ordering and session/window logic.
3. Verify write/dedup behavior with synthetic unexpected events.
4. Update only stale tool description text; do not change thresholds or finding schema.
5. Run focused and broader tests.

## Todo

- [ ] Add explicit candidate filter.
- [ ] Add ordinary/unclassified/toolchain regression tests.
- [ ] Preserve dedup and cross-session semantics.
- [ ] Verify no raw command leakage.
- [ ] Run tracker and integration suites.

## Success Criteria

- [ ] Legitimate repeated Vitest rule fires do not auto-file recurrence findings.
- [ ] Proven unexpected matches still can file findings.
- [ ] Legacy rows are telemetry-only.
- [ ] Toolchain-failure behavior is unchanged.
- [ ] Existing distinct-shape and exact-key contracts pass.

## Dependency Map

- Depends on Phase 3 log fields.
- Blocks Phase 5 end-to-end integration and final drift validation.
- Adjacent completed heredoc plan is a regression baseline, not a dependency to modify.

## Risk Assessment

- **Risk:** filtering all rule events accidentally suppresses toolchain failures. **Signal:** existing toolchain recurrence tests stop emitting. **Response:** partition by explicit event source before applying promoted-rule eligibility.
- **Risk:** legacy backlog is re-filed under a new key. **Signal:** first recurrence scan writes findings from rows with absent provenance. **Response:** default absent provenance to unclassified and assert zero writes.
- **Risk:** coarser normalization collapses real trailing commands. **Signal:** existing residue-salt over-collapse test fails. **Response:** restore recurrence-mode residue guard; do not alter gate mode.

---
phase: 1
title: "Contract baseline and regression matrix"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Contract baseline and regression matrix

## Overview

Establish the behavioral contract before refactoring. Add RED tests for ordinary promoted-rule telemetry, explicit unexpected-match candidates, legacy log compatibility, and the existing Vitest gate/parser matrix. Record the current fail-closed boundaries and effective rule-version discrepancy without changing product behavior.

## Requirements

- Functional: distinguish `ordinary-rule-fire`, `unexpected-match`, `unclassified`, and separate `toolchain-failure` event classes in test fixtures.
- Functional: prove only explicit unexpected-match events are eligible for automatic recurrence filing.
- Compatibility: old decision-log rows without provenance remain readable and telemetry-only.
- Safety: real executable Vitest pipes and executor-body cases remain escalated/visible.
- TDD: every new behavior test must fail or pin the current missing contract before implementation phases begin.

## Architecture

Tests use synthetic decision-log entries and direct evaluator calls. They do not infer provenance from `rule_id`, `reason`, or normalized prefixes. The baseline preserves the completed heredoc/key-normalization plan's gate matrix and coarser tracker grouping, then adds event eligibility as a separate axis.

### File inventory

| File | Action | Test impact |
|---|---|---|
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js` | Modify | Add optional provenance round-trip/default/legacy cases |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js` | Modify | Add ordinary-vs-unexpected evaluator contract fixtures |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/evaluate-bash-gate.test.js` | Modify | Preserve Vitest executable/sanctioned workflow matrix |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` | Modify | Add recurrence eligibility and legacy exclusion cases |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-{data-command-quotes,heredoc,quoted-strings,verb-layer,cli-argv-payload,echo-prose-pipe-target,inert-sink}.test.js` | Read/extend only if RED case belongs there | Preserve parser safety boundaries |

## Tests Before

1. Add decision-log tests for `match_origin` and `candidate_kind` as optional fields, including old rows with both absent.
2. Add evaluator assertions that a real `vitest run|pnpm test` reader command remains a match and is not labelled unexpected merely because it recurs.
3. Add recurrence fixtures: three ordinary fires → zero findings; three explicit unexpected-match events → one candidate; missing/unknown provenance → zero automatic findings; toolchain-failure remains separate.
4. Add effective-rule fixture coverage for `head` versus `tail|grep`; do not silently rewrite the registry during this phase.

## Test scenario matrix

| Scenario | Expected decision/event | Expected recurrence |
|---|---|---|
| `vitest run ... | tail` | escalate, ordinary rule fire | no automatic finding |
| `pnpm test ... | grep` | escalate, ordinary rule fire | no automatic finding |
| inert quoted data proven by parser | evaluator provenance unexpected-match | eligible |
| `bash -c "vitest ..." | tail` | visible executable match | ordinary/unknown, never unexpected |
| unquoted executor heredoc | visible/escalated | never unexpected |
| old log line without provenance | readable | telemetry-only |
| `toolchain-failure` | existing event source | existing separate semantics |
| two distinct semantic shapes | separate recurrence keys | remain distinguishable |

## Implementation Steps

1. Write the RED tests and run only the affected Vitest files; capture the expected failures.
2. Add fixtures through existing helpers (`mkdtempSync`, `GATE_ROOT`, cross-surface readers); do not hand-edit persisted registry data.
3. Verify current effective active rule rows and note any duplicate/version mismatch as a contract-drift input for Phase 5.
4. Freeze the test vocabulary and field defaults used by later phases.

## Todo

- [ ] Add RED provenance and event-kind fixtures.
- [ ] Add recurrence eligibility regression cases.
- [ ] Preserve all executor/heredoc/pipe safety cases.
- [ ] Run focused tests and record the baseline failure set.

## Success Criteria

- [ ] Tests fail for the missing event-classification behavior, not because of fixture/setup errors.
- [ ] Existing gate and recurrence tests remain green except for intentionally new RED assertions.
- [ ] No source, registry, or runtime hook implementation is changed in this phase.

## Dependency Map

- Blocks Phase 2's classifier extraction and Phase 3's evaluator/log wiring.
- Uses shipped behavior from `/home/datguy/learning-loop-template/plans/260809-1548-heredoc-blanker-recurrence-key-normalization/`; does not alter it.
- No dependency on runtime-specific hook artifacts.

## Risk Assessment

- **Risk:** a fixture labels ordinary use as unexpected by assertion wording. **Signal:** test passes before implementation or accepts missing provenance. **Response:** require explicit fields in synthetic events and assert absent fields are ineligible.
- **Risk:** active duplicate Vitest rule rows make the RED matrix ambiguous. **Signal:** evaluator result differs between isolated and live registry roots. **Response:** use isolated rule fixtures for behavior and defer live-registry parity to Phase 5.

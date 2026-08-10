---
phase: 2
title: "Shared command classification substrate"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Shared command classification substrate

## Overview

Extract a small pure, runtime-neutral classification seam used by the gate and recurrence tracker. Preserve existing gate blanking and tracker coarsening as explicit modes; do not replace them with one shared rewritten command.

## Requirements

- Functional: expose semantic regions/provenance sufficient to distinguish executable, inert-data, mixed, and unknown matches.
- Functional: support explicit `gate`, `recurrence`, and `event` modes.
- Safety: gate mode fails closed and preserves executor bodies, command substitutions, redirects, process substitution, unquoted heredoc bodies, and unknown syntax.
- Compatibility: existing exports and tests remain valid, with wrappers where needed.
- Performance: avoid a second full parse on the hot gate path; recurrence memoization remains bounded to the short-lived tracker process.

## Architecture

Preferred new module: `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/command-classification.js`. It composes existing `shell-parse.js` token/verb data and gate-logic blanker primitives without importing hooks, runtime adapters, or hint code.

Conceptual API:

```js
classifyCommand(command, {
  mode: "gate" | "recurrence" | "event",
  rulePattern,
}) => {
  regions: [...],
  normalized: string,
  match_origin: "executable" | "inert-data" | "mixed" | "unknown",
  candidate_kind: "ordinary-rule-fire" | "unexpected-match" | "unclassified",
}
```

The exact API can change if tests show a smaller seam is safer. The invariant is that mode determines policy and provenance is structured, not inferred from recurrence-key coarsening.

The event mode uses a **dual-view** algorithm: (1) inspect the raw command only to locate a possible rule-text match for telemetry; (2) compare that match's source span/segment against the gate-safe classified view; (3) emit `unexpected-match` only when the exact match is proven to lie entirely inside an inert region that the gate intentionally blanked. A match spanning an inert region and an executable region, a full-command pipe-spanning match without stable offsets, or any parser exception is `unknown`/`unclassified`. Raw detection never changes the permission decision and never treats an executable match as unexpected.

The classifier must return a conservative result on failure. It may expose `classification_error: true` and an unblanked fallback view, but it must not throw into `applyPromotedRules()` in a way that reaches its existing `catch`/`continue` path and turns a matched command into `{ decision: "ok" }`. Add an injected-throw test around the evaluator boundary before wiring the classifier into gate decisions.

### File inventory

| File | Action | Test impact |
|---|---|---|
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/command-classification.js` | Create | Pure classifier unit tests |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/command-classification.test.js` | Create | Mode and provenance matrix |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/shell-parse.js` | Modify only if span/token helper is needed | Existing parser deep-equality tests must be updated carefully |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/gate-logic.js` | Modify | Existing blanker/evaluator tests |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/recurrence-tracker.js` | Modify | Existing key normalization tests |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-*.test.js` | Read-only regression set | No safety regression |

## Tests Before

1. Add pure tests for quoted inert data, real executable pipes, `bash/sh/python -c`, process substitution, redirects, command substitutions, quoted/unquoted heredocs, herestring exclusion, and malformed syntax.
2. Add mode-difference tests: gate preserves executable content; recurrence collapses approved data variants; event emits unexpected only when match provenance is proven.
3. Add fail-closed tests: classifier exceptions return unblanked/unknown gate views, never an allowed decision.

## Refactor

1. Reuse `classifyPolicyTokens()` and `resolveVerbIndex()` from `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/shell-parse.js:69-173`.
2. Reuse `safeStripHeredocBodies()` and inert-sink logic from `gate-logic.js:533-653,907-1164` through narrow internal adapters.
3. Keep `stripNodeEvalBody`, CLI payload, and message/data blanking semantics unchanged unless a RED test identifies a duplicated classification decision.
4. Replace recurrence tracker-side classification calls with recurrence-mode output while retaining residue salt and existing recurrence-key hash.
5. Have gate evaluation use event-mode metadata without changing the two-pass per-segment/full-command matching order.

## Tests After

- Add contract tests that gate and recurrence modes intentionally produce different normalized strings for executable-vs-data cases.
- Add over-collapse guards for distinct trailing real commands and distinct semantic classes.
- Run the full legacy parser matrix unchanged after the extraction.

## Implementation Steps

1. Create the pure module and export only the smallest tested functions.
2. Wire compatibility wrappers around existing `strip*` exports rather than deleting public helpers.
3. Add source-region or token-span metadata internally only if needed to prove match origin; do not add noisy fields to all parser tokens without a consumer.
4. Ensure classifier errors are caught at the existing `safeStrip...` boundary and preserve fail-closed behavior.
5. Remove only demonstrably dead duplicated classification code after all tests pass.

## Todo

- [ ] Add classifier RED tests.
- [ ] Implement explicit mode policy.
- [ ] Preserve heredoc/executor/pipe safety matrix.
- [ ] Refactor tracker normalization through recurrence mode.
- [ ] Run parser, gate, and recurrence suites.

## Success Criteria

- [ ] Pure classifier has no runtime/hook imports.
- [ ] Gate and tracker use shared semantic primitives with explicit modes.
- [ ] No executor body becomes inert due to extraction.
- [ ] Existing adjacent-plan heredoc and key-normalization tests pass.

## Dependency Map

- Depends on Phase 1 fixtures.
- Blocks Phase 3 evaluator provenance.
- Must remain compatible with `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/evaluate-write-gate.js`, which calls `applyPromotedRules(null, filePath, rules)` and must not receive a command-only provenance assumption.

## Risk Assessment

- **Risk:** shared blanker silently broadens bypasses. **Signal:** an executor/herestring/trailing-command case changes from escalate/block to ok. **Response:** revert to mode-specific adapters and keep provenance event-only until the offending span is modeled.
- **Risk:** source-span matching cannot handle full-command regexes spanning pipes. **Signal:** real pipe case loses provenance or ordinary match becomes unexpected. **Response:** classify mixed/unknown and keep telemetry-only; never guess inert origin.
- **Risk:** parser output compatibility breaks. **Signal:** deep-equality tests or shell-parse consumers fail on added fields. **Response:** keep spans internal or expose a separate classifier result, not token-shape mutation.

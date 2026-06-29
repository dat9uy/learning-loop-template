---
phase: 1
title: "Evaluators-TddTests"
status: completed
effort: "0.25 day"
---

# Phase 1: TDD Tests (Red — Write Failing Tests for the 3 Evaluators)

## Overview

Per the locked TDD discipline (Phase E Mechanism A+B plan validation Q2), tests live **next to the implementation** in `core/evaluate-{write-gate,bash-gate,inbound-gate}.test.js` (sibling pattern, mirroring `core/loop-introspect.test.js` and `core/meta-state.test.js`). This phase writes the failing tests first; Phase 2 implements the evaluators to turn them green.

## Requirements

- **Functional:** 3 test files, ~30 total tests covering happy paths + edge cases + the 7-rule write-gate cascade + the 12 inbound-state-change patterns + path-write detection in bash-gate.
- **Non-functional:** tests run via `node --test` (no Jest/Vitest); zero external deps; tests are pure (no `node:fs`, no subprocess) — fixtures use plain object literals matching the existing test style.

## Architecture

Test files import evaluators from `./evaluate-{name}-gate.js`. Tests assert return shapes (decisions + reasons) for each input combination. **No mocking** — evaluators are designed pure (zero I/O). The integration points (`readPreflightMarker`, `loadPromotedRules`) are passed as injected inputs in v1 OR read minimal state via existing primitives (locked decision below in §"Decisions").

## Related Code Files

### Create

- `tools/learning-loop-mastra/core/evaluate-write-gate.test.js` (10-12 tests)
- `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js` (10-12 tests)
- `tools/learning-loop-mastra/core/evaluate-inbound-gate.test.js` (6-8 tests)

## Implementation Steps

1. **Step 1 — Read existing tests for pattern.** Read `core/loop-introspect.test.js` and `core/meta-state.test.js` to confirm `node --test` style + how they handle injected inputs.
2. **Step 2 — Lock evaluator signatures in test imports.** All 3 test files `import { evaluateWriteGate, evaluatePreflight } from "./evaluate-write-gate.js";` (and equivalents for bash + inbound). Tests fail with `ERR_MODULE_NOT_FOUND` — expected red.
3. **Step 3 — Write write-gate tests.** Cover: (a) records/** block + reason, (b) runtime-state.jsonl + meta-state.jsonl + schemas/** + node_modules/** + .loop-preflight-* blocks, (c) product/** with valid preflight marker → ok, (d) product/** with no marker → block + checklist, (e) product/** with stale marker (>30min) → block, (f) promoted-rule escalation, (g) unknown path → ok, (h) evaluatePreflight seam direct test.
4. **Step 4 — Write bash-gate tests.** Cover: (a) constraint match + active observation → ok, (b) constraint match + no observation → block, (c) constraint match + stale observation → escalate, (d) side-effect-import → hard block (no override), (e) PATH_WRITE_PATTERNS each regex blocks (records, meta-state.jsonl, runtime-state.jsonl, preflight markers), (f) promoted-rule escalation, (g) safe command → ok, (h) empty/null command → ok, (i) bash-gate decision combination (constraint + path).
5. **Step 5 — Write inbound-gate tests.** Cover: (a) short prompt (<10 chars) → ok, (b) question prompt → ok, (c) state-change phrase + no observations → ok, (d) state-change phrase + active observations but none stale → ok, (e) state-change phrase + stale observation → warn with context message, (f) STATE_CHANGE_PATTERNS coverage (each of the 12 regexes matches a known phrase).
6. **Step 6 — Verify red.** Run `pnpm test --filter=evaluate-write-gate` (and equivalents). Expect all tests to fail with module-not-found errors — this is the intended TDD red.

## Success Criteria

- [x] 3 test files exist with the locked import statements (testing against not-yet-created evaluators).
- [x] Total ~50 tests covering happy paths + edge cases as listed above (exceeded ~30 target).
- [x] `pnpm test` (filtered) reports all new tests failing with module-not-found (intended red).
- [x] No `@mastra/*` or `node:fs` imports in any test file (pure pattern).
- [x] All 1311 baseline tests still pass (new tests don't break existing).

## Risk Assessment

- **R1.1 — Signature lock-in:** if Phase 2 changes an evaluator's signature, tests may need rewriting. Mitigation: write a 1-line "signature contract" comment at the top of each test file listing the locked inputs/outputs. Phase 2 must match exactly.
- **R1.2 — Pattern coverage drift:** the 12 STATE_CHANGE_PATTERNS in inbound-gate and 11 PATH_WRITE_PATTERNS in bash-gate are copy-pasted from the hook files. If the operator adds a new pattern to the hook file before Phase 2 starts, the test snapshot drifts. Mitigation: snapshot the pattern arrays in the test file itself (asserting the exact array contents), so any drift is detected on `pnpm test`.

## Decisions Locked in This Phase

| Question | Choice | Why |
|---|---|---|
| Test file location | Sibling `core/evaluate-*-gate.test.js` (NOT `__tests__/`) | Phase E Mechanism A+B validation Q2 + namespaced runner discovery (`loop-introspect.test.js`, `meta-state.test.js` are siblings) |
| Integration strategy | Use existing `core/gate-logic.js` primitives directly (no injection in v1) | KISS — primitives already pure; injection layer adds surface without payoff |
| Snapshot pattern arrays | Yes — assert exact regex strings in tests | R1.2 mitigation: catches hook-file drift between Phase 1 and Phase 2 |
| Fixture style | Plain object literals matching `gate-logic.js` return shapes | Matches existing test style; no new test infrastructure |

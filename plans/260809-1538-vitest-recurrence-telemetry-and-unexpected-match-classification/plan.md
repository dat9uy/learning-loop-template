---
title: "Vitest recurrence telemetry and unexpected-match classification"
description: "Separate ordinary promoted-rule telemetry from proven unexpected-match recurrence candidates without rule-level suppression."
status: completed
priority: P1
effort: "3d"
tags: [bugfix, refactor, gate-logic, recurrence, tdd, meta]
blockedBy: []
blocks: []
created: 2026-08-09
branch: main
---

# Vitest recurrence telemetry and unexpected-match classification

## Overview

Repair the L2 event contract behind the Vitest recurrence finding. A promoted-rule match remains deterministic gate telemetry; only an evaluator-proven `unexpected-match` event may enter automatic `recurring-false-positive` recurrence filing. The gate and tracker share a mode-aware command-classification substrate while preserving fail-closed gate semantics and coarser recurrence grouping.

This plan uses the accepted brainstorm contract in [`plans/reports/analysis-260809-1450-vitest-recurrence-proliferation-rule-level-suppression.md`](../reports/analysis-260809-1450-vitest-recurrence-proliferation-rule-level-suppression.md). No product code is implemented by this plan.

## Accepted design contract

### Outcome

- Repeated legitimate `rule-no-raw-stdout-vitest` fires remain visible in `.gate-decision.log` but do not auto-file `gate-logic-bug` / `recurring-false-positive` findings.
- A parser-proven inert-data match can be labelled `unexpected-match` and can still produce an automatic recurrence candidate.
- Gate and tracker reuse classification/tokenization primitives with explicit `gate`, `recurrence`, and `event` modes.
- `core/hint-registry.js` remains the canonical owner of the agent-facing L2 test-output contract; runtime surfaces project it rather than copying prose.

### Constraints

- Preserve L1 boundaries: rules are promoted invariants; findings are deferred decisions. No new accepted-rule L1 concept.
- No `recurrence_filing`, `suppress-true-positive`, or accepted-limitation field on `rule-no-raw-stdout-vitest`.
- No persisted finding-schema change in the first implementation.
- Preserve exact recurrence-key dedup and the existing distinct-shape regression contract.
- Preserve `applyPromotedRules()`'s per-segment and full-command passes.
- Gate mode stays fail-closed: executor bodies, redirects, command substitutions, process substitution, and unknown syntax remain visible.
- Recurrence mode may be coarser for grouping but cannot use coarsening as proof of unexpectedness.
- Historical decision-log rows without provenance are unclassified and do not auto-file new findings.
- Toolchain-failure capture remains a separate event source.
- Unclassifiable historical false-positive classes remain operator-filed.

### Non-goals

- Rule-level recurrence suppression.
- Regex-only anchoring or broadening as the fix.
- Semantic recurrence aggregation or threshold changes.
- Rewriting the shell parser wholesale.
- Adding a Mastracode SessionStart hint surface; `hooks-lock.json` currently marks it as none.
- Rotating `.gate-decision.log`.
- Changing PR #130's resolve-not-archive behavior.

## Goals

| # | Goal | Priority | Evidence |
|---|------|----------|----------|
| 1 | Add mode-aware command provenance without weakening gate matching | P1 | `gate-logic.js:533-653,907-1164,1701-1824`; parser tests |
| 2 | Persist optional `match_origin` / `candidate_kind` telemetry | P1 | `gate-decision-log.js:33-50`; `bash-gate.js:41-58` |
| 3 | File recurrence findings only for explicit `unexpected-match` candidates | P1 | `recurrence-tracker.js:242-290,461-575` |
| 4 | Make the test-output contract and runtime projections drift-testable | P2 | `hint-registry.js:1-33,231-240`; runtime projection tests |

## Architecture and data flow

```text
command
  │
  ▼
mode-aware classifier ── gate mode ──► existing rule/constraint decision
  │                    └ recurrence ─► coarser grouping representation
  └ event mode ───────► match_origin + candidate_kind
                              │
                              ▼
                     bash-gate decision object
                              │
                              ▼
                 cross-surface .gate-decision.log
                              │
                              ▼
                    recurrence-tracker filter
                     ├ ordinary/unclassified → telemetry only
                     ├ unexpected-match     → recurrence grouping + finding
                     └ toolchain-failure    → separate existing path

hint-registry TEST_OUTPUT_CONTRACT
  ├ pnpm-test-discipline prose / pointers
  ├ contract drift test against package/config/scripts/rule data
  └ runtime projections (Claude + Factory; Mastracode pull-only)
```

The classifier is pure and runtime-neutral. `hint-registry.js` is the canonical agent-facing contract owner, but gate evaluation must not import runtime hook code or depend on hint injection ordering. The drift test verifies the contract against executable artifacts; it does not create a second prose mirror.

## Phases

| # | Phase | Status | Dependency | TDD anchor |
|---|-------|--------|------------|------------|
| 1 | [Contract baseline and regression matrix](./phase-01-start.md) | Completed | None | Establish RED tests for event classes, contract owner, and current gate matrix |
| 2 | [Shared command classification substrate](./phase-02-shared-command-classification-substrate.md) | Completed | Phase 1 | New pure classifier tests before extraction |
| 3 | [Evaluator provenance and decision telemetry](./phase-03-evaluator-provenance-and-decision-telemetry.md) | Completed | Phase 2 | RED evaluator/log schema tests before wiring |
| 4 | [Recurrence candidate filtering](./phase-04-recurrence-candidate-filtering.md) | Completed | Phase 3 | RED tracker tests for ordinary/unexpected/legacy/toolchain events |
| 5 | [Contract drift and cross-surface validation](./phase-05-contract-drift-and-cross-surface-validation.md) | Completed | Phases 3-4 | RED drift and projection parity tests before final docs/artifact alignment |

## Dependencies and adjacency

- `plans/260809-1548-heredoc-blanker-recurrence-key-normalization/` is complete and adjacent. It owns heredoc blanking and tracker-key normalization; this plan must consume its shipped behavior, not reimplement or reverse it.
- `plans/260615-1530-bash-gate-debate-stderr-override-recurrence/` is shipped historical context for the decision-log and recurrence architecture. Its original “every repeated gate event is a false-positive finding” behavior is the contract being corrected here.
- `tools/learning-loop-mastra/core/surfaces.js` remains the cross-surface source of truth. No runtime-specific feature fork is allowed.

## File ownership matrix

| Phase | Create | Modify | Read-only integration evidence |
|---|---|---|---|
| 1 | `tools/learning-loop-mastra/__tests__/legacy-mcp/command-classification-contract.test.js` (or the repository-approved equivalent) | `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js`, `gate-logic-heredoc.test.js`, `gate-recurrence.test.js` only where RED fixtures need explicit event expectations | `gate-logic.js`, `shell-parse.js`, current Vitest rule |
| 2 | `tools/learning-loop-mastra/core/command-classification.js`, `tools/learning-loop-mastra/__tests__/legacy-mcp/command-classification.test.js` | `core/gate-logic.js`, `core/recurrence-tracker.js` | Existing parser and blanker tests |
| 3 | None | `core/gate-logic.js`, `core/evaluate-bash-gate.js`, `core/gate-decision-log.js`, `hooks/universal/bash-gate.js`, `hooks/universal/toolchain-failure-capture.js` only for explicit source tagging, plus evaluator/log tests | `evaluate-write-gate.js` caller compatibility |
| 4 | None | `core/recurrence-tracker.js`, `__tests__/legacy-mcp/gate-recurrence.test.js`, `tools/handlers/gate-check-recurrence-tool.js` description if its public wording is now inaccurate | Existing registry write/dedup tests |
| 5 | `tools/learning-loop-mastra/__tests__/test-output-contract-drift.test.cjs` | `core/hint-registry.js`, `__tests__/hint-registry.test.cjs`, `__tests__/rule-derived-process-hints.test.cjs`, `docs/loop-engine.md`, `docs/runtime-contract.md`, and only generated/session artifacts if existing tests require regeneration | Claude/Factory projection hooks; `hooks-lock.json`; Mastracode pull-only wiring |

No phase may modify the same new module or test fixture concurrently. Product code outside these paths is out of scope.

## Success criteria

- [x] Real `vitest run … | tail/grep/head` violations still escalate under the effective `rule-no-raw-stdout-vitest` rule.
- [x] `pnpm test:iter`, `pnpm test:one`, and `vitest-failures.sh` remain the sanctioned JSON-artifact workflow.
- [x] Repeated `ordinary-rule-fire` events do not auto-file `gate-logic-bug` / `recurring-false-positive` findings.
- [x] A parser-proven inert-data match can emit `candidate_kind: "unexpected-match"` and recur into a finding.
- [x] `unknown` / missing provenance remains telemetry-only; it never becomes an automatic false-positive finding.
- [x] Executable `bash -c`, `sh -c`, `python -c`, process substitution, redirects, command substitutions, and real trailing commands remain visible.
- [x] Two genuinely distinct semantic command classes under one rule remain distinct; no rule-wide suppression exists.
- [x] Existing heredoc and tracker-key tests from the completed adjacent plan remain green.
- [x] Optional decision-log fields preserve newline hardening and old log readability.
- [x] `core/hint-registry.js` owns one canonical structured test-output contract/prose source; Claude and Factory projections derive from it; Mastracode remains pull-only.
- [x] Drift tests detect disagreement among package scripts, Vitest JSON reporter, parser exit semantics, effective promoted rule, canonical hint contract, and runtime projections.
- [x] `pnpm exec vitest --run ...` focused suites, then the repository's full required test command, pass without weakening assertions.

## Validation and implementation gates

1. Before each phase implementation: write the regression test and demonstrate RED (or pin the current contract for a refactor).
2. After each phase: run the phase's focused Vitest files, then run all touched legacy/core suites.
3. Before final handoff: run the contract drift suite, `pnpm test:iter`/the project's equivalent deterministic parser workflow, and the full required suite.
4. Run the runtime-agnostic audit required by the repository before shipping the feature.
5. Treat provenance authenticity and privacy as release gates: forged/legacy/conflicted rows must not auto-file, and candidate samples must not expose raw inert payloads.
6. Re-read every phase and this plan after red-team/validation edits; search for stale terms (`recurrence_filing`, rule-level suppression, unconditional recurrence, separate contract owner) and reconcile all references before recommending cook.

## Risks and mitigations

| Risk | Observable break signal | Pre-decided response |
|------|-------------------------|----------------------|
| Extracted classifier weakens a gate bypass boundary | Existing executable-body, heredoc, pipe, or redirect tests turn green/allowed unexpectedly | Stop phase; restore fail-closed fallback and rework classifier in event-only mode before continuing |
| Regex match cannot be mapped to source provenance | Event returns `unknown` for a known inert case or labels mixed/executable content as inert | Keep event telemetry-only; add only parser-proven spans; leave class operator-filed |
| Existing logs are treated as current candidates | Legacy fixture causes a new finding after tracker change | Require explicit candidate kind; add migration-free legacy exclusion test |
| Toolchain events change category or dedup behavior | `toolchain-failure` recurrence tests differ | Keep explicit event source branch; revert any generic promoted-rule filter touching it |
| Contract owner couples gate to injection surfaces | Numeric hint ordering or runtime hook tests fail after contract edit | Keep gate generic; use `hint-registry` as canonical contract/prose source plus executable drift assertions, not runtime imports |
| Effective rule versions disagree on reader set (`tail|grep` vs `tail|head|grep`) | Drift test reports stale/duplicate rule or head mismatch | Resolve the active registry version through the canonical record tool; do not hide mismatch in prose or add suppression metadata |
| Log growth or scan cost regresses | `entries_scanned` latency tripwire or recurrence test budget fails | Do not add aggregation in this plan; profile and open a separate rotation/aggregation plan |

## Unresolved questions

1. Should ordinary rule-fire telemetry gain a separate count/report surface beyond `.gate-decision.log`? Deferred; not required for the recurrence correctness fix.
2. Which historical inert-data classes cannot be proven by the parser? Those remain operator-filed; enumerate during implementation without expanding automatic classification.
3. Provenance uses two serialized fields for compatibility, but their pair is a discriminated contract: `unexpected-match` requires `inert-data`, `ordinary-rule-fire` requires an executable/ordinary origin, and contradictions or missing producer markers are unclassified. Cross-surface disagreement fails closed. The implementation must also define the separate non-permission telemetry event needed for a proven inert raw match; otherwise that class remains operator-filed.
4. The effective registry contains historical duplicate `rule-no-raw-stdout-vitest` rows with differing pattern text. The plan treats the canonical active/latest record as authority and requires the drift test to expose disagreement; it does not authorize direct registry edits during planning.

## Red Team Review

### Adversarial review — 2026-08-09

- Reviewers: security adversary, assumption/contract verifier, failure-mode analyst.
- Raw findings: 8; accepted: 8; rejected: 0.
- Critical blockers addressed:
  1. **Forgeable provenance:** added `event_source`, discriminated pair validation, cross-surface conflict downgrade, forged-log tests, and an explicit requirement to close the `.gate-decision.log` write seam. If authenticity cannot be established, automatic filing remains disabled and the class stays operator-filed.
  2. **Classifier exception fallthrough:** classifier failures now require an unblanked/unknown fallback and an evaluator test proving a rule cannot turn into `ok` through the existing catch/continue path.
  3. **Missing allowed-event path:** defined a separate non-permission `event: "unexpected-match"` telemetry event alongside `decision: "ok"`; if the hook cannot emit it safely, the candidate remains operator-filed.
  4. **Ambiguous source mapping:** required dual-view raw candidate detection, exact source-span proof, and conservative mixed/unknown handling for pipe-spanning or mixed matches.
  5. **Payload leakage:** required privacy-safe structural/hash samples and tests across recurrence tracker and tool output.
  6. **Cross-surface partial writes:** same-identity provenance disagreement now fails closed rather than being selected by surface/dedup order.
  7. **Contradictory fields:** `unexpected-match` requires `inert-data`; ordinary fires require executable/ordinary origin; all other pairs are unclassified.
  8. **Versioned rule rows:** drift validation uses canonical max-version resolution; same-kind append history is not treated as suppression or a delete task.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-shared-command-classification-substrate.md`, `phase-03-evaluator-provenance-and-decision-telemetry.md`, `phase-04-recurrence-candidate-filtering.md`, `phase-05-contract-drift-and-cross-surface-validation.md`.
- Decision deltas checked: 8 red-team findings and resulting provenance, dual-view, privacy, and version-resolution decisions.
- Reconciled stale references: 6 (field semantics, event path, classifier fallback, conflict handling, privacy output, versioned registry handling).
- Unresolved contradictions: 0.

### Validation Session 1 — 2026-08-09

- **Questions asked:** 3
- **Decisions confirmed:**
  1. **Provenance trust:** add a trusted producer boundary for evaluator-originated events. A flat marker alone is not sufficient; forged, legacy, partial, or conflicted file-originated rows remain ineligible. The plan must gate/protect the producer path or fail closed to operator-filed handling.
  2. **Event emission:** emit a separate non-permission `event: "unexpected-match"` telemetry record alongside `decision: "ok"` for evaluator-proven inert matches. It must not alter the harness allow/deny result. If the runtime cannot safely support this channel, fall back to operator-filed handling.
  3. **Privacy output:** automatic candidate recurrence results use structural classes/hashes only, not raw `sample_commands` for inert payloads.
- **Propagation:** Phase 3 updated with trusted producer-boundary and separate telemetry-event requirements; Phase 4 updated with strict eligibility/conflict rules and structural/hash output; plan release gates updated.

### Verification Results

- **Tier:** Full (5 phases; Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier)
- **Claims checked:** 30+ sampled claims across all phases
- **Verified:** 30+ | **Failed:** 0 | **Unverified:** 0
- **Evidence:** current source inspection and three independent research/scout reports; red-team review verified the remaining failure modes and all accepted fixes are now propagated.

#### Verification notes

- `applyPromotedRules()` current two-pass and strip chain verified at `tools/learning-loop-mastra/core/gate-logic.js:1701-1824`.
- Existing hook/log path and non-OK-only behavior verified at `tools/learning-loop-mastra/hooks/universal/bash-gate.js:41-58` and `core/gate-decision-log.js:33-50`.
- Existing recurrence grouping/dedup and raw sample exposure verified at `core/recurrence-tracker.js:242-291,343-404,461-575`.
- Canonical hint projection and runtime matrix verified at `core/hint-registry.js:1-33,231-240`, `core/loop-introspect.js:119-213`, and `hooks-lock.json:13-29`.
- Versioned active Vitest rule projection verified from `meta-state.jsonl` rows 12/99/292; drift tests must use canonical max-version resolution.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all five `phase-*.md` files.
- Decision deltas checked: 3 validation decisions plus 8 red-team decisions.
- Reconciled stale references: 3 (provenance trust, event emission, privacy output).
- Unresolved contradictions: 0.

### Research and scout synthesis

- The diagnosis report source-verified the L1/L2/L3 distinction and rejected rule-level suppression.
- `applyPromotedRules()` currently returns `decision`, `rule_id`, `meta_state_id`, and `pattern_type` only (`gate-logic.js:1701-1824`).
- `bash-gate.js:41-58` logs only non-`ok` decisions and does not persist provenance.
- `gate-decision-log.js:33-50` has additive JSONL serialization with newline hardening.
- `recurrence-tracker.js:255-269` currently groups every entry with a `rule_id`; `buildFinding()` (`:507-541`) unconditionally stamps `gate-logic-bug` / `recurring-false-positive`.
- `hint-registry.js:1-33,231-240` is the current canonical hint/prose source; runtime hooks project it. `.mastracode` has no SessionStart hint hook.
- Current source/test inspection did not execute the full suite; validation phase must run the focused and full commands.

### Whole-plan consistency target

After red-team/validation, re-read `plan.md` and all five phase files. Confirm zero unresolved contradictions before recommending `/ak:cook`.

<!-- slug: vitest-recurrence-telemetry-and-unexpected-match-classification -->

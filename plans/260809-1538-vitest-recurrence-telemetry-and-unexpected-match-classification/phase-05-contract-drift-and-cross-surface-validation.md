---
phase: 5
title: "Contract drift and cross-surface validation"
status: completed
priority: P2
effort: "6h"
dependencies: [3, 4]
---

# Phase 5: Contract drift and cross-surface validation

## Overview

Pin the canonical L2 Vitest test-output contract and prove that executable scripts, reporter configuration, live rule data, hint projections, and runtime adapters do not drift. Keep `core/hint-registry.js` authoritative for the agent-facing contract, while treating package/config/scripts/rule artifacts as executable participants verified by tests.

## Requirements

- Functional: `pnpm-test-discipline` in `core/hint-registry.js` is the canonical prose/structured contract source.
- Functional: drift tests validate package scripts, JSON reporter path, parser exit semantics, effective promoted-rule policy, and the sanctioned workflow.
- Compatibility: Claude and Factory projections derive from core builders; no manual runtime prose mirror is introduced.
- Runtime boundary: Mastracode remains pull-only because `hooks-lock.json` marks SessionStart hint wiring as none.
- Documentation: update L2 docs only if the shipped event contract or test-output ownership wording changes; avoid duplicating implementation details in docs.

## Architecture

The canonical owner remains `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/hint-registry.js:231-240`. If implementation needs machine-readable fields, add a structured contract adjacent to the existing `pnpm-test-discipline` row in the same module, with the prose derived from or tested against those fields. Do not make gate logic import `loop-introspect.js` or runtime hooks.

Consumers/projections:

- `core/loop-introspect.js:119-213` — pure builders.
- `tools/handlers/loop-describe-tool.js` and `loop-get-instruction-tool.js` — inspection/on-demand consumers.
- `.claude/hooks/universal/session-start-inject-{discoverability,process-hints}.cjs` — Claude projections.
- `.factory/hooks/loop-surface-inject.cjs` — Factory projection.
- `.mastracode` — no SessionStart hint surface; assert this remains intentional.

### File inventory

| File | Action | Test impact |
|---|---|---|
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/test-output-contract-drift.test.cjs` | Create | Mechanical artifact/projection parity |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/core/hint-registry.js` | Modify if structured contract fields are needed | Existing hint-registry tests |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` | Modify | Canonical shape/order/contract tests |
| `/home/datguy/learning-loop-template/tools/learning-loop-mastra/__tests__/rule-derived-process-hints.test.cjs` | Modify only for derived contract assertions | Projection consistency |
| `/home/datguy/learning-loop-template/tools/scripts/test-one.sh` | Read/modify only if executable contract is stale | Parser invocation |
| `/home/datguy/learning-loop-template/tools/scripts/vitest-failures.sh` | Read/modify only if executable contract is stale | JSON path/exit semantics |
| `/home/datguy/learning-loop-template/package.json` | Read/modify only if sanctioned command is stale | Script contract |
| `/home/datguy/learning-loop-template/vitest.config.mjs` | Read/modify only if reporter path is stale | JSON artifact contract |
| `/home/datguy/learning-loop-template/docs/loop-engine.md` | Modify only if L2 wording is stale | Documentation alignment |
| `/home/datguy/learning-loop-template/docs/runtime-contract.md` | Modify only if runtime/discoverability wording is stale | Documentation alignment |

## Tests Before

1. Add `test-output-contract-drift.test.cjs` with expected current policy values. It should fail if the registry prose/structured fields, package scripts, JSON reporter path, parser script exit codes, or effective rule disagree.
2. Add projection tests comparing `loop-introspect` output, Claude hook payloads, Factory output, and `loop_get_instruction` result for the canonical slug.
3. Add a negative assertion that runtime adapters do not contain a second full Vitest policy paragraph.
4. Add an explicit `hooks-lock.json` assertion that Mastracode has no SessionStart hint injection; do not create a new hook as part of this plan.

## Refactor

1. Keep canonical policy content in `hint-registry.js`; derive pointers and full text through existing builders.
2. Make the drift test parse source/config/scripts rather than rely only on natural-language substring checks.
3. Align the effective active rule fixture and test pattern (`head` versus `tail|grep`) through the canonical registry path only if the discrepancy is confirmed as stale data; record the decision in the plan's validation log.
4. Update L2 docs only when they state the old unconditional recurrence semantics or wrong contract owner.

## Tests After

- Run focused hint, runtime projection, and drift suites.
- Run end-to-end gate hook → cross-surface decision log → recurrence check with isolated roots.
- Run all affected legacy/core tests, then the repository's required full test command and fallow gate.
- Run runtime-agnostic audit before shipping.

## Implementation Steps

1. Write drift/projection tests.
2. Implement minimal canonical contract fields/prose alignment.
3. Verify Claude/Factory projections and Mastracode pull-only boundary.
4. Verify effective rule data and sanctioned parser behavior.
5. Run whole-plan consistency sweep and record zero contradictions.

## Todo

- [ ] Add executable contract drift tests.
- [ ] Add cross-surface projection parity tests.
- [ ] Preserve numeric hint/index compatibility.
- [ ] Resolve and document effective rule version mismatch if confirmed.
- [ ] Update L2 docs only where claims are stale.
- [ ] Run full validation and runtime-agnostic audit.

## Success Criteria

- [ ] One canonical `pnpm-test-discipline` contract drives agent-facing projections.
- [ ] Drift test catches script/config/rule/hint disagreement.
- [ ] No runtime-specific hint copy is introduced.
- [ ] Mastracode remains pull-only by explicit matrix test.
- [ ] End-to-end recurrence behavior satisfies all eight acceptance criteria from the analysis report.

## Dependency Map

- Depends on evaluator/log behavior from Phase 3 and tracker filtering from Phase 4.
- Final phase; blocks implementation handoff only until all focused/full tests and consistency checks pass.

## Risk Assessment

- **Risk:** `hint-registry.js` becomes coupled to gate enforcement. **Signal:** gate imports introspection/hook modules or hint ordering changes gate output. **Response:** keep contract data/prose in the registry but use a pure local projection; gate depends only on classifier/evaluator.
- **Risk:** live duplicate rule versions make drift assertions non-deterministic. **Signal:** multiple active rows resolve differently. **Response:** use canonical `loadPromotedRules()` resolution and report the stale duplicate; do not add rule suppression.
- **Risk:** runtime parity test assumes Mastracode startup injection. **Signal:** hooks-lock test says none. **Response:** assert pull-only behavior and omit startup parity for Mastracode.
- **Risk:** the canonical contract test fails because the append-only registry contains legitimate versioned rows with different historical patterns. **Signal:** raw-line comparison sees versions 0/1/2 while `loadPromotedRules()` resolves one max-version row. **Response:** compare through the canonical max-version projection and separately assert the resolved effective rule; never treat same-kind version history as a rule-level suppression or direct-delete task.

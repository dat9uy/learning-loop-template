---
phase: 1
title: "Characterization Tests + Bug Red-Tests"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Characterization Tests + Bug Red-Tests

## Overview

Lock the *current* relationship behavior with tests **before** any refactor — the tests-first foundation that makes the one-consumer-at-a-time migration (Phase 3) safe. Two kinds of tests: (1) **characterization** of the 3 forward + 2 inverse implementations + the dual-field fallback, so a migration that silently changes behavior fails loud; (2) **bug #1 regression-prevention** — the inverse-index layer (`buildInverseIndexes.indexReopens`) has no forward `reopens` index, so a centralized module mirroring it would regress `outbound.reopens`; pin the invariant that forward + inverse `reopens` come from one source. No production code changes this phase — purely additive tests. The codebase stays green.

## Requirements

- Functional: characterization tests lock every existing relationship surface the centralization will touch — the 4 factories' `outboundRefs`/`inboundRefs`, `buildInverseIndexes`' 6 inverse maps (5 of which `loop-introspect.test.js` does NOT cover today), the relationships tool's wire shape + dual-field `promoted_to_rule` fallback, and the CI validator's `OUTBOUND_EXTRACTORS` (including its `loop-design` kind-`"meta"` divergence + omitted rule edges).
- Functional: a **regression-prevention test** asserts the centralized module's eventual contract from *outside*: forward `reopens` (from `entry.reopens`) AND inverse `reopened_by` are both derivable for the same child/parent pair. Express it against the factory today (it passes); it becomes the gate the new module must not regress.
- Non-functional: tests are additive only — no production import changes, no behavior change.
- Non-functional: tests use the repo's existing test harness (`vitest`/`node:test`, per `plans/260713-1625-vitest-migration-replace-node-test-c8`) and the existing fixtures in `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js`.

## Architecture

```
No production changes. Additive test files only.

__tests__/core/                          (or __tests__/phase-e-foundation/ — match the neighbor convention)
  + relationship-characterization.test.js   (locks the 3 forward + 2 inverse + dual-field fallback surfaces)
  + reopens-symmetry.test.js                (bug #1 regression-prevention: forward + inverse from one source)
```

The characterization test imports the **current** surfaces directly (`core/entry/{finding,rule,change-log,loop-design}.js`, `core/loop-introspect.js#buildInverseIndexes`, `tools/handlers/meta-state-relationships-tool.js`, `scripts/validate-registry-refs.js#OUTBOUND_EXTRACTORS`) and asserts their *observed* behavior — including the known divergences — so Phase 3 migrations can prove equivalence (or document an intended change like the 2→1 dedup) against this oracle.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/core/relationship-characterization.test.js`
- Create: `tools/learning-loop-mastra/__tests__/core/reopens-symmetry.test.js`
- Read (oracle sources, no modify): `core/entry/finding.js`, `rule.js`, `change-log.js`, `loop-design.js`, `index.js`, `consolidates-refs.js`, `inbound-from-loop-design.js`, `core/loop-introspect.js`, `tools/handlers/meta-state-relationships-tool.js`, `tools/handlers/meta-state-relationship-validate-tool.js`, `scripts/validate-registry-refs.js`
- Read (existing fixtures): `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js`, `__tests__/legacy-mcp/build-inverse-indexes.test.js`, `__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js`

## Implementation Steps (TDD — tests first, no production code)

### Tests Before

1. **Inventory the oracle (read-only):** enumerate each factory's `outboundRefs`/`inboundRefs` emitted edges + kinds from source (`finding.js:49-75`, `rule.js:50-89`, `change-log.js:12-39`, `loop-design.js:24-42`). Record the exact expected edge sets — these become assertions. Note `rule.js:64-82` dual-field `seenPromotedFrom` dedup (1 ref) and `loop-introspect.js:672-691` dual-source non-dedup (2 refs) — assert **both current** behaviors verbatim (the difference is the bug).
2. **Characterize `buildInverseIndexes` 6 maps (red-team R11 — corrected coverage):** today `__tests__/legacy-mcp/build-inverse-indexes.test.js` covers 5 of 6 maps (origin/promoted_to_rule/addresses/supersedes/reopens — empty at `:11-15`, populated at `:34-35,68-71`), and `core/loop-introspect.test.js` covers `consolidated_into_inverse`. Add the **dual-field 2-ref artifact** assertion (a fixture with a finding that has BOTH `promoted_to_rule` AND a rule whose `origin` points at it → `promoted_to_rule_inverse.get(findingId).length === 2`, current behavior; Phase 3 changes this to 1) — this is the one gap `build-inverse-indexes.test.js:67` locks but Phase 1 should characterize independently. Assert `reopens_inverse` is keyed by the stale parent.
3. **Characterize the relationships tool wire shape + fallback (red-team R1):** assert the dual-field `resolveOutboundRefs` fallback (`meta-state-relationships-tool.js:195-209`) patches `outbound.promoted_to_rule` from `origin_inverse` for a finding lacking it — and that the snapshot test `meta-state-relationships-snapshot.test.js:73-78` locks this for a legacy finding. The fallback PERSISTS in Phase 3 (only its O(N) rebuild becomes a targeted `inverseRefs` lookup); this characterization is the oracle that the targeted lookup preserves the patched value. Assert `groupOutbound`/`groupInbound`/`INBOUND_KEY_MAP` produce the documented keys (`reopened_by`, `consolidated_by`, `superseded_by`, `origin_of`, `promoted_from`, `addressed_by`).
4. **Characterize the CI validator divergences (pin the bugs):** assert `OUTBOUND_EXTRACTORS.rule` (`validate-registry-refs.js:121-123`) emits only `origin` (omits `supersedes`/`applies_to_resolution`), and `OUTBOUND_EXTRACTORS["loop-design"]` (`:126`) classifies a non-rule target as kind `"meta"` (NOT `"finding"`). These are *current wrong behavior* — Phase 3 fixes them; the characterization proves the fix is a change.
5. **Characterize `computeTopReferences` / `top_references` (red-team R6):** `computeTopReferences` (`loop-introspect.js:795-814`) sums `refs.length` across the 6 inverse maps including `promoted_to_rule_inverse`. Build a fixture where a rule is the dual-field target of a promotion and assert its citation count in `buildRegistrySummary` → `computeTopReferences` output (the count the warm `loop_describe` `registry_summary.top_references` shows). Phase 3's 2→1 dedup halves this count; the characterization asserts the CURRENT 2-ref count so Phase 3 updates it deliberately (the existing `meta-state-sweep-summary.test.js:50` asserts existence only, not counts — this fills the gap).
6. **Bug #1 regression-prevention test:** build a parent finding `meta-stale-parent` and a child finding `meta-child-reopens` with `reopens: ["meta-stale-parent"]`. Assert: (a) `child.outboundRefs()` includes `{kind:"finding", id:"meta-stale-parent", field:"reopens"}` (forward — factory populates it); (b) `parent.inboundRefs()` includes the child via `reopens` → `reopened_by`; (c) `buildInverseIndexes(entries).reopens_inverse.get("meta-stale-parent")` includes `meta-child-reopens` (inverse present). **The invariant under test:** forward `reopens` AND inverse `reopened_by` are both derivable for the pair — whichever module produces them later must preserve this. (The factory passes today; `buildInverseIndexes` has the inverse but not a forward index — the test documents that gap so the new module must supply both.) Note: finding #1's `evidence_code_ref` points at `loop-introspect.js:285` (the inverse-index layer), and the bug WAS real at its 2026-07-24 re-verify; the tool-layer forward read was fixed out-of-band after that, so the test passes today against the factory — Phase 6's resolution records this nuance.

### Tests After (regression gates for Phase 3)

6. Run the new characterization suite — all green against current code (it locks current behavior, including the divergences). This is the oracle Phase 3 migrates against.
7. Run the bug #1 symmetry test — green (factory supplies forward; `reopens_inverse` supplies inverse).
8. Run the existing relationship/introspect suite (39 tests) — unchanged green.

### Regression Gate

`pnpm test` on `relationship-characterization.test.js` + `reopens-symmetry.test.js` + the existing relationship/introspect files — all green; no production code changed.

## Success Criteria

- [x] Characterization tests lock all 3 forward implementations (factories, `buildInverseIndexes.indexX`, validator `OUTBOUND_EXTRACTORS`) and both inverse implementations (rule.js dedup + loop-introspect non-dedup)
- [x] The dual-field 2-ref `promoted_to_rule_inverse` artifact is asserted at length 2 (current) — red-team R11: `build-inverse-indexes.test.js` already covers 5/6 maps; Phase 1 adds the independent dual-field characterization + the `consolidated_into_inverse` gap
- [x] The relationships tool dual-field fallback (legacy-finding `promoted_to_rule` patch, snapshot `:73-78`) + wire-shape keys are locked — the fallback PERSISTS in Phase 3 (red-team R1)
- [x] The CI validator divergences (rule omits 2 edges; loop-design kind `"meta"`) are pinned as *current* behavior (oracle for the Phase 3 fix)
- [x] `computeTopReferences`/`top_references` citation counts characterized at the CURRENT 2-ref values (red-team R6) — the oracle Phase 3 updates to 1-ref
- [x] Bug #1 regression-prevention test: forward `reopens` + inverse `reopened_by` both derivable for a child/parent pair — green today (finding #1's `evidence_code_ref` is the inverse-index layer; the tool-layer was fixed out-of-band after #1's re-verify — Phase 6 records the nuance)
- [x] No production code changed; existing relationship/introspect tests still green
- [x] New tests added in the repo's harness (vitest/node-test), using existing fixtures

## Risk Assessment

**Low.** Additive tests only; no production code touched. The one subtlety: the characterization tests must assert the divergent/buggy behavior *as-is* (2-ref dedup, kind `"meta"`, omitted rule edges) — not the desired behavior — so Phase 3 can prove a *change* rather than silently passing. Mis-asserting the desired behavior here would make Phase 3's fixes invisible. Mitigation: assert from direct source reads (Steps 1-4), and clearly comment each divergence test with "// CURRENT (buggy) behavior — Phase 3 fixes this" so the oracle intent is unambiguous. The bug #1 test must assert the factory's *correct* forward behavior (it populates `outbound.reopens`), since the regression to prevent is the new module failing to supply it — getting this backwards would green-light the regression.

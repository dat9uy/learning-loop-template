---
phase: 3
title: "MechanismB-EntryFactories"
status: pending
priority: P2
dependencies: [2]
effort: "0.5d"
---

# Phase 3: Mechanism B — 4 Entry Factories

## Overview

Implements the operator scope expansion from the brainstorm: *"core should be related to modelling relationship as well. So let's expand the scope (rules is not just validation or status check, but the relationship between entry)."* Each of the 4 meta-state entry kinds gets a factory function that wraps the canonical Zod schema (soft inversion — schemas stay source of truth), exposes lifecycle helpers (`isActive`, `isStale`, etc.), and surfaces the entry's outbound/inbound relationship methods.

This is Phase 3 of two for Mechanism B. Phase 4 wires the cross-cutting helpers and re-implements `meta_state_relationships` on top. Phase 5 writes the tests.

**TDD ordering:** write the factory unit tests as siblings (`core/entry/{finding,rule,change-log,loop-design}.test.js` — sibling pattern confirmed by validation session 2026-06-27 to match the namespaced runner's discovery) BEFORE the factory code. Watch them fail. Then implement the factories (green). This is the "red → green" gate for Mechanism B's data model.

## Requirements

- **Functional:** `createFinding(data)`, `createRule(data)`, `createChangeLog(data)`, `createLoopDesign(data)` each parse input via the canonical Zod schema and return a frozen object with status helpers + relationship methods.
- **Functional:** every factory exposes `outboundRefs()` (1-hop forward, no registry reads) and `inboundRefs(root)` (1-hop backward, requires registry read).
- **Non-functional:** **instance.schema** (i.e., `createFinding(data).schema`) === canonicalSchema (reference equality — not a copy). Enforced by a one-line test in Phase 5. Future wrapping of `metaState*EntrySchema` (`.partial()`, `.brand()`, etc.) breaks this contract and requires an ADR.
- **Non-functional:** every returned object is **deep-frozen** (a `deepFreeze` helper in `entry/index.js` recursively freezes `data.verification`, `data.change_diff`, and other nested objects — addresses the `Object.freeze` shallow limitation). Lifecycle helpers (`resolve`, `supersedeBy`, `promote`, `ship`) return NEW deep-frozen objects; never mutate.

## Architecture

**Soft inversion contract:**

```js
// entry/rule.js (illustrative)
import { metaStateRuleEntrySchema } from "../meta-state.js";
import { readRegistry } from "../meta-state.js";
import { checkResolutionEvidence } from "../gate-logic.js";  // lives in gate-logic.js, not meta-state.js

export function createRule(data) {
  const parsed = metaStateRuleEntrySchema.parse(data);
  return Object.freeze({
    kind: "rule",
    data: parsed,
    schema: metaStateRuleEntrySchema,  // reference equality, NOT a copy — load-bearing invariant

    // Status
    isActive()           { return parsed.status === "active"; },
    isConsultChecklist() { return parsed.pattern_type === "consult-checklist"; },

    // Validation logic (was: applyPromotedRules's per-rule branch)
    matches(command, filePath) { /* ... */ },
    appliesTo(root)          { /* scope predicate */ },

    // Resolution evidence — imported from gate-logic.js (NOT meta-state.js as the original plan claimed)
    async checkResolutionEvidence(root) { return checkResolutionEvidence(parsed, root); },

    // Lineage
    supersedes(other) { return parsed.supersedes === other.data.id; },

    // Relationships
    outboundRefs() { /* pure: no I/O */ },
    inboundRefs(root) { /* reads registry */ },
  });
}
```

The pattern is identical for `createFinding`, `createChangeLog`, `createLoopDesign`. Each factory is ~80-120 LoC. The directory layout:

```
core/entry/
├── finding.js
├── rule.js
├── change-log.js
├── loop-design.js
├── index.js          ← Phase 4
└── __tests__/         ← Phase 5
    ├── finding.test.js
    ├── rule.test.js
    ├── change-log.js
    └── loop-design.test.js
```

**Relationship surface (per §4.3 of the brainstorm):**

| Kind | Outbound refs | Inbound refs |
|---|---|---|
| **Finding** | `consolidated_into`, `reopens[]`, `promoted_to_rule` (legacy) | `reopens` reverse, `promoted_to_rule` reverse, `origin`, `applies_to_resolution` |
| **ChangeLog** | `supersedes`, `consolidates` | `consolidated_into` reverse |
| **Rule** | `origin`, `supersedes`, `applies_to_resolution` | `promoted_to_rule` reverse |
| **LoopDesign** | `proposed_design_for[]`, `addresses[]` | (leaf) |

Every factory's `outboundRefs()` returns a list of `{kind, id, field}` objects. `inboundRefs(root)` scans the registry (read via `readRegistry(root)`) and returns the inverse list.

**Soft-inversion safeguards (from `/ck:predict` verdict):**

1. `createRule.schema === metaStateRuleEntrySchema` (reference equality) — enforced by a test in Phase 5.
2. `core/README.md` documents: "Schema = validation source. Factory = ergonomic surface. Schema reachable via `createEntry.schema`." — written in Phase 4.
3. ADR-style comment in `core/README.md`: "Soft inversion by operator decision 2026-06-27. Revisit if (a) `.shape` consumers drop below 3, OR (b) factory methods start needing cross-cutting logic that schemas can't express." — written in Phase 4.
4. No code changes beyond this verdict yet — Mechanism A ships first per step-by-step. ✓

## Related Code Files

- Create: `tools/learning-loop-mastra/core/entry/finding.js`
- Create: `tools/learning-loop-mastra/core/entry/rule.js`
- Create: `tools/learning-loop-mastra/core/entry/change-log.js`
- Create: `tools/learning-loop-mastra/core/entry/loop-design.js`

No other files modified in this phase.

## Implementation Steps

1. **Write the factory unit tests FIRST** (TDD red phase). All tests use the **sibling pattern** (`core/entry/*.test.js`) per validation decision 2026-06-27 — the namespaced runner `run-pnpm-test-namespaced.mjs` already discovers this pattern from existing tests like `loop-introspect.test.js` and `meta-state.test.js`.
   - `core/entry/finding.test.js` — fixture: a Finding with all fields populated. Assert `outboundRefs()` returns the right refs; assert `inboundRefs(rootFixture)` returns the right refs; assert `Object.isFrozen(finding)`; assert `finding.schema === metaStateFindingEntrySchema`.
   - `core/entry/rule.test.js` — fixture: a Rule. Assert `isActive`, `isConsultChecklist`, `matches` (regex + glob + consult-checklist branches), `appliesTo` (scope_predicate branches), `outboundRefs`, `inboundRefs`.
   - `core/entry/change-log.test.js` — fixture: a ChangeLog. Assert `outboundRefs`, `inboundRefs`, frozen.
   - `core/entry/loop-design.test.js` — fixture: a LoopDesign. Assert `outboundRefs`, `inboundRefs` (empty), frozen.
   - Run: `node --test tools/learning-loop-mastra/core/entry/{finding,rule,change-log,loop-design}.test.js`. Expected: 4 failing test files (factories don't exist yet).

2. **Write `entry/finding.js`.**
   - Import `metaStateFindingEntrySchema` from `../meta-state.js`.
   - Import `readRegistry` for inbound traversal.
   - Export `createFinding(data)`:
     - Parse via `metaStateFindingEntrySchema.parse(data)`.
     - Return frozen object with `kind`, `data`, `schema` (reference), `isActive`, `isStale`, `isBlocking`, `outboundRefs`, `inboundRefs`.
   - `outboundRefs()` — pure: walk `data.consolidated_into`, `data.reopens`, `data.promoted_to_rule`; return array of `{kind, id, field}`.
   - `inboundRefs(root)` — read registry, scan for findings/rules/change-logs/loop-designs that reference `data.id` in any of: `reopens`, `origin`, `applies_to_resolution`, `promoted_to_rule` (legacy). Return array.

3. **Write `entry/rule.js`.**
   - Same shape as `finding.js` but for rules.
   - **Import `checkResolutionEvidence` from `../gate-logic.js`** (NOT `../meta-state.js` — the function lives in `gate-logic.js:691`, not `meta-state.js`). The original plan's claim was a fact error caught by red-team.
   - `matches(command, filePath)` — branching on `pattern_type`:
     - `regex` + `command` → use `gate-logic.globMatch` or equivalent against the stripped command.
     - `glob` + `filePath` → use `gate-logic.globMatch`.
     - `consult-checklist` / `resolution-evidence-required` → return `false` (the rule fires elsewhere).
   - `appliesTo(root)` — branching on `scope_predicate`:
     - `none` (or undefined) → `true`.
     - `project_has_learning_loop_mcp` → check if `<root>/tools/learning-loop-mcp/` exists. **Use the existing `projectHasLearningLoopMcp(root)` helper at `gate-logic.js:578` — and add `export` to its declaration** so the factory can import it. One-line change: `function projectHasLearningLoopMcp(root)` → `export function projectHasLearningLoopMcp(root)`.
   - `checkResolutionEvidence(root)` — import from `../gate-logic.js` and delegate: `return checkResolutionEvidence(parsed, root)`. No duplication.

4. **Write `entry/change-log.js`.**
   - Same shape. `outboundRefs` covers `supersedes` (ChangeLog→ChangeLog) and `consolidates` (string of comma-separated finding ids → split into array). `inboundRefs` covers `consolidated_into` reverse (Finding→ChangeLog).

5. **Write `entry/loop-design.js`.**
   - Same shape. `outboundRefs` covers `proposed_design_for[]` and `addresses[]`. `inboundRefs` is always empty (loop-design is a leaf in the graph).

6. **Re-run the unit tests.**
   - `node --test tools/learning-loop-mastra/core/entry/{finding,rule,change-log,loop-design}.test.js`
   - Expected: 4 passing test files.
   - **Sibling pattern is committed from the start (validation decision 2026-06-27)** — the namespaced runner `pnpm test` (which uses `run-pnpm-test-namespaced.mjs`) already discovers `core/*.test.js` files via the existing pattern that picks up `loop-introspect.test.js`, `meta-state.test.js`, etc. No verify-then-fallback dance.

7. **Run the full test suite.**
   - `pnpm test`
   - Expected: all baseline tests pass + 4 new test files run (≈20-30 new tests).

8. **Commit.**
   - One commit: `feat(core): add 4 entry factories with relationship methods (Mechanism B)`
   - Body: `Soft-inversion wrappers around the canonical Zod schemas. Each factory exposes lifecycle helpers + outbound/inbound refs. ~120 LoC per factory. All tests green.`

## Success Criteria

- [ ] `core/entry/{finding,rule,change-log,loop-design}.js` exist and export a `create*` factory
- [ ] Every factory returns a frozen object with `kind`, `data`, `schema`, status helpers, `outboundRefs()`, `inboundRefs(root)`
- [ ] `createRule.schema === metaStateRuleEntrySchema` (reference equality)
- [ ] `createFinding.schema === metaStateFindingEntrySchema`
- [ ] `createChangeLog.schema === metaStateChangeEntrySchema`
- [ ] `createLoopDesign.schema === metaStateLoopDesignSchema`
- [ ] Each factory's `outboundRefs()` returns the correct list for fixture data
- [ ] Each factory's `inboundRefs(rootFixture)` returns the correct list for fixture data
- [ ] All existing tests still pass (baseline measured at Phase-0)
- [ ] 4 new test files pass (≈20-30 tests), **verified that `pnpm test` actually runs them** (namespaced runner discovery check)

## Risk Assessment

- **R1 (factory methods shadow canonical behavior):** if `matches()` or `appliesTo()` drifts from `applyPromotedRules`'s logic, the gate fires wrong. Mitigation: the unit tests use the same fixtures as the existing `applyPromotedRules` tests; if those tests exist, mirror their expectations. (If they don't, add fixtures derived from `meta-state.js`'s exported test data.)
- **R2 (inbound traversal is O(N) per call):** scanning the full registry for every `inboundRefs(root)` is fine for a 100-entry registry, expensive for 10k. Mitigation: the existing `loop-introspect.js` has `buildInverseIndexes` which is O(N) once and queries in O(1). Phase 4's `inboundRefs(root)` can use the same approach (read registry once, cache, return subset). Out of scope here — keep it simple, optimize later.
- **R3 (frozen output breaks callers that mutate):** the existing code reads fields off raw registry entries (`entry.id`, `entry.origin`). A frozen object that *also* exposes `data` gives callers the same shape via `entry.data.id`. Mitigation: factories expose both `data` (raw, parsed, frozen) and shortcut helpers (`isActive()`, `kind`). Callers can use whichever shape they prefer.
- **R4 (schema equality test fails because Zod returns a new object on each parse):** `metaStateRuleEntrySchema` is a module-level export; it's the same reference every time. `createRule(data).schema === metaStateRuleEntrySchema` is reference-equality, not value-equality. If a future refactor wraps the schema in a getter, the test catches it.
- **R5 (factories duplicate logic from `meta-state.js`):** yes, intentionally — the ergonomic surface is the factory's purpose. The canonical logic stays in `meta-state.js`; factories compose it. If duplication becomes a maintenance burden, the soft-inversion ADR clause triggers a refactor to a different pattern.
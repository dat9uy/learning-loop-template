---
phase: 2
title: "Core Relationship-Graph Module"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Core Relationship-Graph Module

## Overview

Land the declarative single source of truth — `core/entry/relationship-graph.js` — owning (a) the cross-ref field table per kind, (b) forward + inverse resolution, (c) write-time structural RI validation, and (d) the retrieval wire shape. **No consumers rewired this phase** — purely additive, codebase stays green. The module folds in the two existing narrow leaf helpers (`parseConsolidates` from `consolidates-refs.js`, `inboundFromLoopDesign` from `inbound-from-loop-design.js`) but does NOT delete them yet (Phase 3 repoints consumers, then deletes after import-chain analysis). The module is **pure and dependency-light**: no `gate-logic`, no `stale-view`, no `core/meta-state.js` imports — the declarative cross-ref table lives as data, not by importing schemas. This keeps the post-merge CI validator decoupled and avoids an import cycle with the schema owner. Add a **forward `reopens` resolution** the index layer lacks today (bug #1 regression-prevention).

## Requirements

- Functional: export `forwardRefs(entry)` → `[{kind, id, field}]` — one forward resolver covering all 4 kinds, matching the union of the 4 factories' `outboundRefs` (including rule `applies_to_resolution`, which the validator currently omits — the graph emits it; the `"*"` wildcard is not emitted as an edge).
- Functional: export `inverseRefs(targetId, entries)` → `[{kind, id, field}]` — one inverse resolver. For `promoted_to_rule` it canonicalizes on `rule.origin` (1 ref per finding, deduped) — NOT the dual-source 2-ref artifact.
- Functional: export `buildInverseIndexes(entries)` → the **same 6 named maps** shape (`addresses_inverse`, `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`, `reopens_inverse`, `consolidated_into_inverse`) that `core/loop-introspect.js#buildInverseIndexes` produces today — preserving the public export shape. Population: `promoted_to_rule_inverse` from `rule.origin` alone (1 ref, deduped); the other 5 per current semantics. **Add forward `reopens` derivable from `entry.reopens`** (the index layer's gap).
- Functional: export `resolveStructuralRI(entry, existenceSet)` → `{ok: boolean, dangling: [{field, id}]}` — **ID-EXISTENCE ONLY** (red-team R3: a `Set<string>` carries no kind, so kind-match is NOT checked; drop the `expectedKind` claim). `existenceSet` is a `Set<string>` of ids (caller injects; `readRegistry` projected union or in-batch `entries[]`). **`applies_to_resolution` is RI-EXEMPT** (red-team R4 — it's `z.string()`, not an entry-id ref; a determinism-checklist pattern is valid); `"*"` and empty/absent fields are exempt. Tombstones count as present (liveness out of scope — red-team R8).
- Functional: the wire-shape projection (`groupOutbound`, `groupInbound`, `INBOUND_KEY_MAP`) + `computeDanglingRefs` **STAY in `meta-state-relationships-tool.js`** (red-team R10 — presentation logic + `computeDanglingRefs` needs `stale-view`; moving them into a pure graph would break purity). The graph does NOT export them.
- Functional: export `parseConsolidates` and `inboundFromLoopDesign` (folded from the two leaf helpers; same behavior, re-exported so consumers can migrate incrementally).
- Non-functional: **pure** — no `fs`, no `gate-logic`/`stale-view` imports, no `core/meta-state.js` import. Only stdlib + the two folded helpers' logic. The cross-ref table is a plain object literal keyed by `entry_kind`.
- Non-functional: runtime-agnostic by construction (core, universal location); passes `check_runtime_agnostic`.

## Architecture

```
core/entry/relationship-graph.js   ← NEW, pure
  import { parseConsolidates } from "./consolidates-refs.js"  // temporary import; Phase 3 folds the body in + deletes the file

  // (a) declarative cross-ref table — DATA, not schema imports
  const CROSS_REFS = {
    "finding":     [{ field:"reopens",             targetKind:"finding",     multi:true  },
                    { field:"consolidated_into",    targetKind:"change-log",  multi:false },
                    { field:"promoted_to_rule",     targetKind:"rule",        multi:false, legacy:true }],
    "change-log":  [{ field:"supersedes",           targetKind:"change-log",  multi:false },
                    { field:"consolidates",          targetKind:"finding",     multi:true  }],
    "rule":        [{ field:"origin",               targetKind:"finding",     multi:false, canonicalPromotion:true },
                    { field:"supersedes",            targetKind:"rule",        multi:false },
                    { field:"applies_to_resolution", targetKind:"finding",     multi:false, forwardOnly:true, riExempt:true }],  // red-team R4/R10: RI-EXEMPT (z.string, not an entry-id ref); forwardOnly (no inverse map); dropped redundant wildcardOk (generic "*" skip)
    "loop-design": [{ field:"proposed_design_for",  targetKind:"rule|finding", multi:true },
                    { field:"addresses",             targetKind:"finding",     multi:true }],
  }  // cascade_from NOT declared (not persisted)

  forwardRefs(entry)
    → for each CROSS_REFS[entry.entry_kind ?? "finding"]: read entry[field]; skip "" / null / [] / "*";
      emit { kind: kindForId(id, entries?) ?? targetKind, id, field }
      (kindForId: lookup-first → fallback by prefix: "rule-"→rule, "loop-design-"→loop-design, else finding)
      ⚠️ loop-design fallback returns "finding" (NOT "meta") — fixes the validator bug

  inverseRefs(targetId, entries)
    → entries.flatMap(e => forwardRefs(e).filter(r => r.id === targetId))

  buildInverseIndexes(entries)
    → const idx = newIndexState(); // the 6 named Maps
      for (const e of entries) for (const r of forwardRefs(e)) pushToIndex(idx, r);
      // promoted_to_rule_inverse sourced ONLY from rule.origin (canonicalPromotion) —
      // a finding's legacy promoted_to_rule is NOT pushed to the inverse (dedup bug fix: 2→1).
      return idx   // identical 6-map shape to loop-introspect.js#buildInverseIndexes

  resolveStructuralRI(entry, existenceSet /* Set<string> */)   // ID-EXISTENCE ONLY (red-team R3)
    → const dangling = [];
      for (const r of forwardRefs(entry))
        if (!riExemptField(r.field) && !existenceSet.has(r.id))      // applies_to_resolution EXEMPT (red-team R4); "*" filtered by forwardRefs
          dangling.push({field:r.field, id:r.id});                    // NO expectedKind (Set<string> has no kind — red-team R3)
      return { ok: dangling.length === 0, dangling }

  // groupOutbound / groupInbound / INBOUND_KEY_MAP / computeDanglingRefs STAY in meta-state-relationships-tool.js
  // (presentation logic + computeDanglingRefs needs stale-view — red-team R10; the graph stays pure)
  export { forwardRefs, inverseRefs, buildInverseIndexes, resolveStructuralRI,
           parseConsolidates, inboundFromLoopDesign, CROSS_REFS, diffChangedRefs }
```

`newIndexState` and `pushToIndex`/`pushUnique` mirror the existing `loop-introspect.js:626-723` internals (the graph may import or re-derive them; prefer re-deriving to keep the module self-contained). The 6-map shape is the locked public contract — `loop-describe` + `meta_state_list` + `build-inverse-indexes.test.js` consume it.

### Why `promoted_to_rule_inverse` becomes 1 ref (canonical `rule.origin`)

The inverse `promoted_to_rule_inverse` is the set of findings promoted to a given rule. `rule.origin` (`meta-state.js:493`, required) is the canonical forward promotion ref. Deriving the inverse from `rule.origin` alone yields 1 ref per finding. Today `loop-introspect.js:684` (`indexOrigin` `pushUnique`) + `:690` (`indexPromotedToRule` `pushToIndex`) produce 2 refs for a dual-field entry — double-counting one relationship. The graph sources only from `rule.origin` (the `canonicalPromotion` flag drives `buildInverseIndexes` to skip the legacy `finding.promoted_to_rule` as an inverse source). The legacy field stays on disk (no migration). `build-inverse-indexes.test.js:67` is updated in Phase 3 (same change as the consumer migration) — Phase 2's own test asserts the new 1-ref canonical behavior so the module is self-consistent before rewiring.

### Why the module must NOT import `core/meta-state.js`

The schemas (`metaStateEntrySchema` etc.) live in `meta-state.js`, which itself imports from `core/entry/` (the factories). Importing `meta-state.js` from `relationship-graph.js` would form a cycle (`meta-state.js → entry/factories → relationship-graph.js → meta-state.js`) and re-couple the CI validator to runtime drift logic. The cross-ref table is therefore plain data — field names are string literals, validated at the schema layer by `entryIdRefsRefine`/`entryIdRefArray` (format only). The graph's `resolveStructuralRI` adds *target existence* on top; format validation stays in the schema.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/entry/relationship-graph.js`
- Create: `tools/learning-loop-mastra/__tests__/core/relationship-graph.test.js` (module unit tests: forward/inverse/RI/wire-shape, including the 1-ref canonical dedup + the forward `reopens` resolution)
- Read (re-derive from, no modify yet): `core/loop-introspect.js` (`buildInverseIndexes:613-624`, `newIndexState:626-645`, `indexX:658-723`), `tools/handlers/meta-state-relationships-tool.js` (`groupOutbound/groupInbound/INBOUND_KEY_MAP:14-58`), `core/entry/consolidates-refs.js`, `core/entry/inbound-from-loop-design.js`, `core/entry/loop-design.js` (`kindForId:11-17`)

## Implementation Steps (TDD — tests first)

### Tests Before

1. Create `__tests__/core/relationship-graph.test.js`. Assert against the contract above with small hand-built entries (no fs):
   - `forwardRefs` for each kind emits the declared edges with correct `kind`/`field`; `reopens`/`consolidates`/`proposed_design_for`/`addresses` are multi; `applies_to_resolution:"*"` is NOT emitted as an edge; empty/`null`/`[]` omitted; `promoted_to_rule`(legacy) emitted forward but the inverse comes only from `rule.origin`.
   - `kindForId` loop-design fallback returns `"finding"` for a `meta-…` target (the validator-bug fix), `"rule"` for `rule-…`.
   - `inverseRefs(targetId, entries)` returns exactly the entries whose `forwardRefs` point at `targetId`.
   - `buildInverseIndexes` returns the 6 named maps; `promoted_to_rule_inverse.get(findingId).length === 1` for a dual-field entry (canonical, NOT the current 2); `reopens_inverse` keyed by the parent; `consolidated_into_inverse` per current CSV/array semantics (mirror `loop-introspect.test.js`).
   - `resolveStructuralRI`: all targets present → `{ok:true, dangling:[]}`; one missing target → `{ok:false, dangling:[{field,id}]}` (NO `expectedKind` — id-existence only, red-team R3); `applies_to_resolution:"test-session-123"` (not a registry id) → `{ok:true}` (RI-EXEMPT — red-team R4); `"*"` wildcard exempt; empty fields exempt; a tombstone id → `{ok:true}` (liveness out of scope — red-team R8).
   - `diffChangedRefs(newRefs, oldRefs)`: returns only the (field,id) pairs in `newRefs` not in `oldRefs`; excludes `applies_to_resolution` (RI-exempt); array-reorder / dedup of `consolidates` does NOT produce a spurious "changed" ref (red-team R7 trace).
   - (NOT tested here: `groupOutbound`/`groupInbound`/`INBOUND_KEY_MAP` — they STAY in the relationships tool, red-team R10; tested in Phase 3 against the tool.)
2. Run → expect failure (module doesn't exist).

### Implementation

3. Create `core/entry/relationship-graph.js` per the Architecture block. Temporarily `import { parseConsolidates } from "./consolidates-refs.js"` (fold the body in during Phase 3's consumer migration, not here — keep Phase 2 focused on the new module). Re-derive `kindForId`, `newIndexState`, `pushToIndex`/`pushUnique` from the existing sources (do not import `loop-introspect.js` internals if they're not already exported; if exported, import to avoid duplication, but verify no `stale-view`/`gate-logic` transitive import).
4. Re-run Phase 2 tests → green.

### Verification

5. Run `check_runtime_agnostic` on `core/entry/relationship-graph.js` → passes (pure, no surface logic, no fs).
6. Run Phase 1 characterization tests → still green (additive; no consumer rewired — factories + `loop-introspect` + tools unchanged).
7. `pnpm test` on `relationship-graph.test.js` + the Phase 1 suite.

## Success Criteria

- [ ] `core/entry/relationship-graph.js` exists, pure (no `fs`/`gate-logic`/`stale-view`/`meta-state.js` imports), exports `forwardRefs`/`inverseRefs`/`buildInverseIndexes`/`resolveStructuralRI`/`diffChangedRefs`/`parseConsolidates`/`inboundFromLoopDesign`/`CROSS_REFS`. Does NOT export the wire shape (stays in the tool — red-team R10)
- [ ] `buildInverseIndexes` returns the identical 6 named maps; `promoted_to_rule_inverse` is 1 ref (canonical `rule.origin`), asserted at length 1 for a dual-field entry
- [ ] `forwardRefs` emits `reopens` (forward) AND `buildInverseIndexes` derives `reopens_inverse` (inverse) — both from one source; `applies_to_resolution` emitted forward (for the relationships tool) but `applies_to_resolution:"*"` not emitted as an edge
- [ ] `resolveStructuralRI` is **id-existence only** (no `expectedKind` — red-team R3); `applies_to_resolution` RI-exempt (red-team R4); `"*"` + empty fields exempt; tombstones count as present (red-team R8)
- [ ] `diffChangedRefs` returns only introduced/repointed refs; excludes `applies_to_resolution`; array-reorder/dedup does not spuriously flag (red-team R7)
- [ ] `kindForId` loop-design fallback returns `"finding"` (not `"meta"`)
- [ ] `check_runtime_agnostic` passes; Phase 1 characterization + existing 39 tests still green (additive-only)
- [ ] `consolidates-refs.js` + `inbound-from-loop-design.js` NOT deleted yet (consumers not repointed; kept as re-exports in Phase 3 — red-team R10)

## Risk Assessment

**Low-moderate.** Additive module, no consumers rewired. The two subtleties: (1) the 1-ref canonical `promoted_to_rule_inverse` differs from the current 2-ref behavior — but Phase 2's own test asserts the *new* behavior, and Phase 1's characterization asserts the *old* behavior; Phase 3 reconciles by updating `build-inverse-indexes.test.js:67` in the same change as the consumer rewiring (the divergence is intentional and documented). (2) the module must stay pure to keep the CI validator decoupled and avoid the `meta-state.js` import cycle — the cross-ref table is plain data, and re-deriving `kindForId`/`pushToIndex` avoids importing `loop-introspect.js` internals that may transitively pull `stale-view`. Verify the import graph with `grep -r "require.*meta-state\|from.*meta-state"` on the new file (expect zero). The forward `reopens` resolution is additive and matches the factory; it cannot regress the tool (Phase 3 wires it).

---
phase: 2
title: "citation kind substrate"
status: completed
priority: P1
effort: ""
dependencies: []
---

# Phase 2: `citation` kind substrate

## Overview

Land the `citation` kind as a kinded entry in its own `citations.jsonl`,
mirroring `change-log.jsonl`. It carries `source`/`target` (in CROSS_REFS) and a
required `rationale` (the verb, as prose — no validated enum). This phase adds
the storage, append, union-read, cache, leak-guard, and RI plumbing, and
introduces a generic `citations_inverse` map **additively** (non-breaking —
on-record fields still exist and their named maps still populate). Phases 3 and
4 then flip the writers and de-route the on-record fields (inert-historical),
collapsing each named map into `citations_inverse`. No free `meta_state_cite` tool;
lifecycle tools emit citations internally.

## Requirements

- Functional: `citation` is a kinded entry (`entry_kind:"citation"`, id, version)
  in `citations.jsonl`; schema requires `source`, `target`, `rationale`,
  `recorded_at`, `recorded_by`; `status` is `z.literal("active")` (immutable
  audit, like change-log). `source`/`target` are declared in `CROSS_REFS` with
  `targetKind:"any"`, so `resolveStructuralRI` validates both exist (warn-only —
  verified: `forwardRefs` emits refs for any CROSS_REFS entry regardless of
  `targetKind`; it does NOT no-op). `buildInverseIndexes` gains a new generic
  `citations_inverse` map (target→sources) sourced from citation rows; the
  migrated fields' named maps stay (sourced from on-record fields) until
  Phases 3–4 de-route them. `readRawLines` unions the third file; the read cache
  keys on its mtime+size. `appendCitationEntryAtomic` is atomic +
  cache-invalidating. `assertNoCitationLeak` rejects `entry_kind:"citation"`
  writes to `meta-state.jsonl` AND `change-log.jsonl`, AND non-citation writes to
  `citations.jsonl` (three path checks — NOT the single suffix match
  `assertNoChangeLogLeak` uses).
- Non-functional: write-time RI stays warn-only (deliberate-orphan semantics
  preserved); no hard rejection at emission; the append continues on a dangling
  target. `kindForId` resolves `citation-` ids. No double-counting: `citations_inverse`
  and the migrated named maps serve different wire keys (`cited_by` vs named), so
  their coexistence in Phase 2 is non-overlapping.

## Architecture

The `citation` kind mirrors `change-log` exactly: a separate append-only file, a
dedicated append function (`appendCitationEntryAtomic` via `trueAppendAtomicRaw`
+ `invalidateCache`), a schema (`metaStateCitationEntrySchema`), and a CROSS_REFS
entry. Because it is kinded, `resolveStructuralRI`/`readRawLines`/the read
cache/leak-guard all reuse without new machinery — this is the "kind-per-file is
production-native" grounding the investigation cited. The verb
(`resolves-to`/`derived-from`/`refines`) is untyped prose in `rationale`
(required — it is the semantic carrier); per the owner-confirmed red-team
resolution, **the named inverse maps that currently branch on the verb are
collapsed into a single generic `citations_inverse` (target→sources)**, so that
no runtime branch consumes the verb — keeping it prose-honest per the state-3 L1.
(The red-team proved the named maps DO branch on the field name; the collapse
removes that branch rather than assuming it never existed.)

`buildInverseIndexes` gains a **new `citations_inverse` map** (target id →
source ids) sourced from citation rows. In Phase 2 this map is empty (writers
still use on-record fields); the 3 migrated fields' existing named maps
(`consolidated_into_inverse`/`origin_inverse`/`supersedes_inverse`/
`promoted_to_rule_inverse`) still populate from on-record fields. Phases 3–4
de-route each migrated field from CROSS_REFS (its named map empties) as its
citation emission turns on (`citations_inverse` picks up the edge) — one
collapse per flip, no double-counting. `reopens_inverse`/`addresses_inverse`/
`proposed_design_for_inverse` stay named (those fields are not migrated). The
wire shape (`meta_state_relationships`) gains a generic `cited_by:[{source,
rationale}]` key; the named keys (`consolidated_by`/`origin_of`/`superseded_by`/
`promoted_from`) are removed per flip. `ref_field:"<migrated-field>"` queries
become `ref_field:"citation"`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`CITATION_FILENAME` near L103/110; `getCitationPath`; `metaStateCitationEntrySchema`; `appendCitationEntryAtomic` near L233; `readRawLines` L859-877 union the third file; write dispatch L1273-1277; `ENTRY_ID_REF_PREFIXES` L301 add `citation-`; `assertNoCitationLeak` sibling to L165-176)
- Modify: `tools/learning-loop-mastra/core/read-registry-cache.js` (add the third mtime+size to the cache key)
- Modify: `tools/learning-loop-mastra/core/registry-append-atomic.js` (`assertNoCitationLeak` sibling to `assertNoChangeLogLeak` L76-92)
- Modify: `tools/learning-loop-mastra/core/entry/relationship-graph.js` (`CROSS_REFS` L57-80 add `citation` → `source`/`target` `targetKind:"any"`; `kindForId` L95-102 `citation-` prefix; `buildInverseIndexes` L241-259 add the generic `citations_inverse` map; `indexRef` L222-239 populate it by the citation's `target`/`source` field values, NOT `entry.id`)
- Modify: `tools/learning-loop-mastra/core/entry/index.js` (`validateCrossRefs`/`findOrphans`/`outboundRefsAll` L30-66 — re-source from citations; see Scope Decision)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (`computeDanglingRefs` L101-128 reads citation edges)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (`buildInverseIndexes` L113 — citation-sourced `ref_by`/`ref_field`)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (inverse_indexes L233 reads citations; orphan detection L211-220 additive)
- Modify: `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (its own `computeDanglingRefs` reads citations)
- Create: `tools/learning-loop-mastra/core/__tests__/citation-substrate.test.js` (TDD driver)
- Create: `tools/learning-loop-mastra/core/entry/citation.js` (factory wrapper mirroring `change-log.js`)

## Scope Decision — `core/entry/index.js` dead surface

`validateCrossRefs`/`findOrphans`/`outboundRefsAll` (index.js:30-66) have **no
production consumers** (only `index.test.js`). Re-source them from the citation
log OR delete as dead code (YAGNI). Recommendation: **re-source** (keep the
graph-orphan concept available for the cold-tier `orphans` view), but if the
re-sourcing is non-trivial, deleting is acceptable since `loop-describe-tool.js`
owns the only live orphan detection. Decide in implementation; either way
`index.test.js` is updated.

## Implementation Steps (TDD — tests first)

1. **Write the failing test** `core/__tests__/citation-substrate.test.js`:
   - `metaStateCitationEntrySchema` parses a citation `{id, entry_kind:"citation",
     source, target, rationale, recorded_at, recorded_by, status:"active"}`;
     rejects a citation missing `rationale` (required).
   - `appendCitationEntryAtomic` writes a line to `citations.jsonl` (not
     `meta-state.jsonl`/`change-log.jsonl`); the read cache invalidates so a
     subsequent `readRegistry` sees the new citation in the union.
   - `resolveStructuralRI(citation, existenceSet)` flags a dangling `target` (and
     `source`) as warn-only (append continues; a gate-log advisory emits).
   - `forwardRefs(citation)` returns `[{source},{target}]`; `buildInverseIndexes`
     includes a citation-sourced edge in the new generic `citations_inverse` map
     (target→sources), keyed by the citation's `target` id with the citation's
     `source` id as the value (NOT `entry.id` — use `source`/`target`, not the
     citation id). The migrated named maps still populate from on-record fields
     (coexistence is non-overlapping — different wire keys).
   - `kindForId("citation-…")` returns `"citation"`.
   - `assertNoCitationLeak` throws when a citation entry would be appended to
     `meta-state.jsonl` OR `change-log.jsonl`; a non-citation entry to
     `citations.jsonl` is likewise rejected (three path checks).
   - `readRawLines` union includes all three files; a stale-cache regression test
     (append a citation, confirm the next read sees it — guards the cache key).
2. Run — confirm failure (no citation kind/file/schema).
3. Add `CITATION_FILENAME`/`getCitationPath`/`metaStateCitationEntrySchema`/
   `appendCitationEntryAtomic` mirroring the change-log pattern (meta-state.js).
4. Add `citation` to `CROSS_REFS` with `source`/`target` (`targetKind:"any"`,
   `multi:false`); add `citation-` to `kindForId` + `ENTRY_ID_REF_PREFIXES`.
5. Extend `readRawLines` to union `citations.jsonl`; extend the read-cache key
   (`read-registry-cache.js`) with the third mtime+size.
6. Add `assertNoCitationLeak` (registry-append-atomic.js) + the meta-state.js
   mirror; extend the write dispatch (L1273-1277) to route `entry_kind:"citation"`
   to `appendCitationEntryAtomic`.
7. Make `buildInverseIndexes` populate the new generic `citations_inverse` map
   (target→source) from citation rows — route citations in `indexRef` by their
   `target`/`source` field values, NOT by `entry.id`. `forwardRefs`/`inverseRefs`
   follow citations by `target`. Update `computeDanglingRefs`
   (relationships-tool + validate-registry-refs.js) and `loop-describe-tool`
   orphan/inverse reads to include citation edges.
8. Create `core/entry/citation.js` factory wrapper (mirrors `change-log.js`).
9. Re-run the test — confirm green. Run `relationship-graph.test.js`,
   `relationship-characterization.test.js`, `build-inverse-indexes.test.js`,
   `meta-state-relationships-dangling-refs.test.js` — all stay green (the new
   `citations_inverse` map is additive; the named maps are untouched in Phase 2).

## Success Criteria

- [x] `citation` kind parses; `rationale` is required; append writes to
      `citations.jsonl` only; the read cache invalidates (stale-cache test green).
- [x] `resolveStructuralRI` validates `source`/`target` warn-only; `buildInverseIndexes`
      populates the new generic `citations_inverse` (target→source) from citations.
- [x] `kindForId` resolves `citation-` ids; `readRawLines` unions all three files.
- [x] `assertNoCitationLeak` prevents cross-file leakage both directions (three path checks).
- [x] Existing relationship/index/dangling-refs tests stay green (`citations_inverse`
      is additive; named maps untouched).

## Risk Assessment

- **Forgetting the cache key** = stale reads after a citation append. The
  stale-cache test (step 1) is the guard; do not skip it.
- **`resolveStructuralRI` tombstone-as-present** (scout R8): a citation target
  that is an archive tombstone counts as present. Acceptable — liveness is out of
  scope for RI; the warn-only advisory is the surface.
- **`indexRef` routing** must not double-count: a citation has both `source` and
  `target`; ensure the inverse maps key correctly (target→source for "who cites
  me") without duplicating on-record edges that will be removed in Phases 3–4.
- **Write-time RI stays warn-only.** Do not hard-reject a dangling citation
  target; the `dangling_refs` "missing" view and cold-tier `orphans` depend on
  the append continuing.
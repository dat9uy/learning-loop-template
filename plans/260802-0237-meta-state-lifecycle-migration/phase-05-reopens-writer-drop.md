---
phase: 5
title: "drop reopens/cascade_from writers"
status: completed
priority: P2
effort: ""
dependencies: [4]
---

# Phase 5: drop `reopens`/`cascade_from` writers

## Overview

Drop the `reopens` writer (`meta_state_report`'s `reopens` arg) and the
`cascade_from` input to `meta_state_resolve`. The `reopens` field and its read
path are **retained** — the 17 historical edges stay queryable and the existing
cascade mechanism keeps working for already-seeded data. This makes resolved
honestly terminal going forward: new evidence appends a new finding; no operation
un-closes an old one as a side-effect. No replacement linkage is built here (the
investigation's file-index co-citation premise was false; a co-citation layer is
a recurrence-trigger concern, out of scope).

## Requirements

- Functional: `meta_state_report` no longer accepts a `reopens` arg (schema
  rejects it). `meta_state_resolve` no longer accepts `cascade_from` (schema
  rejects it); the `validateCascadeChildren` path is removed from the handler.
  The `reopens` field stays on the finding schema (read-only historical);
  `reopens_inverse` and `meta_state_relationship_validate`'s orphan-claim keep
  reading it. Existing seeded `reopens` edges + cascade still resolve for
  already-seeded data via the read path.
- Non-functional: no new write surface; the 17 historical edges are not migrated
  (they stay as on-disk historical data). `assertinvariant` wrapping unchanged.

## Architecture

`reopens` + `cascade_from` is the one operation that un-closes a record as a
side-effect of opening another — the mutation smell inside the append-only model.
Dropping the writers (not the field) makes the invariant honest going forward
without destroying the 17 historical edges or breaking the read-side tools that
characterize them. The `validateCascadeChildren` logic (which read
`child.reopens` to verify the cascade link) is removed because no new cascades
can be initiated; the historical cascade path is intentionally left read-only
(any operator need to close a stale parent is now an explicit `meta_state_resolve`
on the parent, not a side-effect).

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js` (remove `reopens` from schema L39 + the spread L91)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js` (remove `cascade_from` from schema L23 + the cascade path L127-150; remove `validateCascadeChildren` L205-229)
- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (prose L83 "4 statuses" → reflects new enum; slugs `reopens` L93 + `reopens-script` L129 — update to describe the writer-drop + read-path retention)
- Modify: `tools/learning-loop-mastra/core/field-glossary.js` (`reopens` entry L69 — mark read-only historical)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-resolve-cascade.test.js` (remove `cascade_from`-initiated tests; keep any read-side characterization of historical edges)
- Verify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationship-validate-tool.test.js` (the `reopens` claim mechanism reads the field — stays green because the field + read path are retained; the test seeds `reopens` via `writeEntry`, not the report tool)
- Verify: `tools/learning-loop-mastra/__tests__/core/reopens-symmetry.test.js` (forward+inverse symmetry of historical edges — stays green; read path unchanged)

## Implementation Steps (TDD — tests first)

1. **Write the failing tests** (red):
   - `meta_state_report` with a `reopens` arg is rejected (schema error).
   - `meta_state_resolve` with a `cascade_from` arg is rejected (schema error);
     no cascade closure occurs.
   - A finding seeded with a historical `reopens` edge (via `writeEntry`,
     bypassing the tool) is still returned by `meta_state_relationships`
     (`reopens_inverse`) and `meta_state_relationship_validate`'s orphan-claim
     still reads it — read path intact.
2. Run — confirm red (writers still accept the args).
3. Remove `reopens` from `meta_state_report`'s schema + spread.
4. Remove `cascade_from` from `meta_state_resolve`'s schema + the cascade path +
   `validateCascadeChildren`.
5. Update `hint-registry.js` slugs (`reopens`, `reopens-script`) and the L83
   status-count prose; update `field-glossary.js` `reopens` entry to
   read-only-historical.
6. Rewrite `meta-state-resolve-cascade.test.js`: drop the `cascade_from`-initiated
   closure tests; keep a characterization test that a historical `reopens` edge
   still resolves via the read path.
7. Re-run — confirm green. Run `meta-state-relationship-validate-tool.test.js`,
   `reopens-symmetry.test.js` — confirm still green (read path retained).

## Success Criteria

- [ ] `meta_state_report` rejects `reopens`; `meta_state_resolve` rejects
      `cascade_from`; no new `reopens`/cascade can be initiated.
- [ ] The `reopens` field + `reopens_inverse` read path + orphan-claim remain;
      the 17 historical edges still query; existing cascade resolves for
      already-seeded data.
- [ ] `hint-registry` + `field-glossary` prose updated.
- [ ] `reopens-symmetry` + `relationship-validate` tests stay green; the cascade
      test rewritten green.

## Risk Assessment

- **Do NOT remove the `reopens` field from the schema** — that would break the
  read path, `reopens-symmetry.test.js`, `meta-state-relationship-validate-tool.test.js`,
  and the historical cascade. This phase drops writers only.
- **`validateCascadeChildren` removal** means `meta_state_resolve` no longer
  closes a stale parent as a side-effect. If an operator needs to close a stale
  parent, they call `meta_state_resolve` on the parent directly. This is the
  intended going-forward behavior (resolved is terminal; no side-effect closure).
- **The 17 historical edges are not migrated to citations.** They stay as on-disk
  `reopens` field values on findings. The read path surfaces them. If a future
  plan wants them as citations, that is a separate migration — out of scope here.
- **`meta_state_relationship_validate`'s orphan-claim** reads `entry.reopens`
  (L56-57). Retaining the field keeps this green. Verify the test still seeds
  `reopens` via `writeEntry` (it does — scout-confirmed), so the writer drop
  doesn't affect it.
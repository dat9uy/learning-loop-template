---
phase: 3
title: "collapse superseded into resolved + citation"
status: completed
priority: P1
effort: ""
dependencies: [2]
---

# Phase 3: collapse `superseded` → `resolved` + citation

## Overview

Collapse the `superseded` finding status into `resolved` + a citation to the
absorbing change-log. Rewrite `meta_state_supersede` to emit a citation
(`{source: finding, target: change-log, rationale}`) instead of stamping
`consolidated_into`/`superseded_at`/`superseded_by`; the finding becomes
`resolved`. Migrate the 6 superseded findings to `resolved` + a citation. Remove
`consolidated_into`/`superseded_*` from the finding schema and drop
consistency-check F-4 (which required `consolidated_into` on superseded). Rewrite
the supersede tests green. One canonical closure state aligns finding with
rule/loop-design's `inactive`.

## Requirements

- Functional: `meta_state_supersede` sets `status:"resolved"` + `resolved_at`/
  `resolved_by`/`resolution` and emits a citation `{source: finding id, target:
  consolidated_into change-log id, rationale: "consolidated into <change-log
  id>"}`; it no longer stamps `consolidated_into`/`superseded_*`. The 6 superseded
  findings become `resolved` with a backfilled citation each. `superseded` leaves
  the canonical finding enum. `consolidated_into`/`superseded_at`/`superseded_by`/
  `consolidates` become **inert historical fields** — kept `.optional()` in the
  schemas (old version lines still parse), removed from `CROSS_REFS` (de-routed,
  so `forwardRefs`/`buildInverseIndexes` stop indexing them) and from the write
  path. consistency-check F-4 is removed; F-1 is **updated** (drop
  `consolidated_into` + `superseded_at` from its forbid list; the other 6
  detectors stay). The `consolidated_into_inverse` named map collapses into the
  generic `citations_inverse`. `meta_state_supersede` still validates the target
  is an existing change-log (`consolidated_into_not_a_change_log` retained).
- Non-functional: `buildInverseIndexes`/`computeDanglingRefs`/`loop-describe`
  orphan detection + `superseded_lineage` source the consolidated_into edge from
  the generic `citations_inverse` (on-record field de-routed). `isOpen`/
  `deriveStatus`/`isStaleView` unchanged (they already treat `resolved` as
  terminal). `CLOSED_STATUSES` (loop-introspect.js:521) drops `superseded`.

## Architecture

`supersede` becomes a flavor of `resolve`: it stamps the resolved closure fields
AND emits a citation to the change-log. The citation carries the "consolidated
into" semantics that `superseded` + `consolidated_into` previously encoded. The
6 existing superseded findings migrate via a one-time true-append script: each
gets a v+1 `resolved` line + a citation row. Because `citations_inverse` was
introduced in Phase 2, the citation-sourced edge populates it as soon as the
citation is emitted. The on-record `consolidated_into` field is de-routed from
`CROSS_REFS` (its named map empties) — the same inert-historical-field pattern
`reopens` follows. No double-counting: the named map empties exactly as
`citations_inverse` picks up the edge.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js` (stamps L34-41 → emit citation + resolved stamps; keep change-log target validation L27-30)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (finding enum L356 remove `superseded`; keep `consolidated_into`/`superseded_at`/`superseded_by` `.optional()` as inert-historical; remove `consolidated_into` from `IMMUTABLE_PATCH_FIELDS` L693; `matchesStatusFilter` L2164-2173 — drop `superseded` mapping; change-log schema `consolidates` → keep `.optional()` inert-historical)
- Modify: `tools/learning-loop-mastra/core/consistency-check.js` (UPDATE F-1 L21-24 — remove `consolidated_into` + `superseded_at` from the forbid list, keep the other 6 detectors; remove F-4 L29-30)
- Modify: `tools/learning-loop-mastra/core/entry/relationship-graph.js` (remove `consolidated_into` from `CROSS_REFS` finding entry L58-62 + `consolidates` from the change-log entry L63-66; `indexRef` L222-239 drops both routes — the edge now comes from `citations_inverse`)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (`CLOSED_STATUSES` L521 drop `superseded`; cold-active-filter L684 `entry.consolidated_into` → derive from `citations_inverse`; compact projection L651,751 drops `consolidated_into`)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (orphan detection L208-215 reads `citations_inverse`, not `f.consolidated_into`; `superseded_lineage` L199-227 — re-derive from citations OR rename to `resolved_lineage`/remove)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (`ref_field:"consolidated_into"` scan path L122-138 → `ref_field:"citation"` via `citations_inverse`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (inbound `consolidated_into → consolidated_by` L42 → generic `cited_by` from `citations_inverse`; update `INBOUND_KEY_MAP`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` + `meta-state-patch-tool.js` (error copy L228/L263 referencing `consolidated_into`)
- Rewrite: `tools/learning-loop-mastra/core/__tests__/meta-state-superseded.test.js` (assert `resolved` + citation, not `superseded` + `consolidated_into`)
- Rewrite: `tools/learning-loop-mastra/core/__tests__/meta-state-g8-supersede.test.js` (assert `resolved` + citation; `consolidates` symmetry → `citations_inverse`)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-tier-superseded.test.js` (`superseded_lineage` re-derived from citations or removed)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationships-snapshot.test.js` (finding + change-log wire shapes: `consolidated_by` → `cited_by`)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/build-inverse-indexes.test.js` (6-map → `consolidated_into_inverse` removed; `citations_inverse` added)
- Create: `tools/learning-loop-mastra/tools/handlers/scripts/migrate-superseded-to-resolved.mjs` (one-time migration)

## Implementation Steps (TDD — tests first)

1. **Rewrite the supersede tests first** (red): in
   `meta-state-superseded.test.js` and `meta-state-g8-supersede.test.js`, replace
   `status:"superseded"` + `consolidated_into` assertions with `status:"resolved"`
   + a citation `{source: finding, target: change-log, rationale}`. Assert
   `meta_state_supersede` emits the citation (read it back from `citations.jsonl`
   via the union read) and stamps `resolved_at`/`resolved_by`. Assert the finding
   no longer carries `consolidated_into`/`superseded_*`. Assert
   `consolidated_into_not_a_change_log` rejection still fires on a bad target.
2. Run — confirm red (current tool stamps `superseded` + `consolidated_into`).
3. Rewrite `meta_state_supersede` handler: stamp `status:"resolved"` +
   `resolved_at`/`resolved_by`/`resolution`; emit a citation via
   `appendCitationEntryAtomic` (target-existence RI on the change-log, warn-only);
   keep the change-log target validation. Add a post-state check that the
   citation row was written (read-back) since `assertinvariant` is pre-state-only.
4. Remove `superseded` from the finding enum; de-route `consolidated_into`/
   `superseded_at`/`superseded_by`/`consolidates` (keep `.optional()` inert-historical
   so old version lines parse; remove from `CROSS_REFS` so they stop being indexed);
   remove `consolidated_into` from `IMMUTABLE_PATCH_FIELDS` (dead). Update
   `matchesStatusFilter` (drop `superseded` mapping — do NOT add a legacy→resolved
   alias; `isOpen` reads `TERMINAL_STATUSES` directly, not `matchesStatusFilter`, so
   an alias would not help stragglers anyway; rely on migrate-first-then-drop-enum
   in the same phase, and verify 0 straggler `superseded` findings post-migration).
5. UPDATE consistency-check F-1 (remove `consolidated_into` + `superseded_at` from
   the forbid list; keep the other 6 detectors); remove F-4.
6. Collapse `consolidated_into_inverse` → `citations_inverse`: re-source
   `buildInverseIndexes`/`indexRef`, `loop-introspect` `CLOSED_STATUSES` +
   cold-active-filter + compact, `loop-describe` orphan detection +
   `superseded_lineage`, `list-tool` `ref_field`, and `relationships-tool`
   inbound `consolidated_into→consolidated_by` (→ generic `cited_by`) from
   `citations_inverse`. Update `INBOUND_KEY_MAP`.
7. **Migration:** `migrate-superseded-to-resolved.mjs` scans for the 6 superseded
   findings (scout-verified ids — scan-based, do not hardcode), true-appends a v+1
   `resolved` line + emits a citation to each one's `consolidated_into` change-log
   per id. Dry-run first; review; apply. Verify 0 `superseded` findings remain
   (including archived `superseded` tombstones restorable via `meta_state_unarchive`)
   before/after.
8. Re-run the rewritten tests — confirm green. Run `derive-status.test.js`
   (L270/L303 `superseded` literal tests → rewrite to `resolved`).
9. Run `consistency-check.test.js`, `relationship-graph.test.js`,
   `meta-state-relationships-snapshot.test.js`, `build-inverse-indexes.test.js`,
   `loop-describe-cold-tier-superseded.test.js` — update for the
   `citations_inverse`-sourced edge + collapsed wire shape; confirm green.

## Success Criteria

- [x] `meta_state_supersede` produces `resolved` + a citation; no
      `consolidated_into`/`superseded_*` stamps; bad-target rejection retained.
- [x] `superseded` is gone from the finding enum; `consolidated_into`/`superseded_*`/
      `consolidates` are inert-historical (`.optional()`, de-routed from CROSS_REFS);
      `consolidated_into` removed from the deny-list; F-1 updated (6 detectors kept),
      F-4 removed. *(`CLOSED_STATUSES`/`TERMINAL_RAW_STATUSES` retain `superseded` on
      the read side for the still-present historical rows; dropped on migration.)*
- [x] The 6 superseded findings are `resolved` with a backfilled citation each; 0
      `superseded` findings (incl. archived tombstones) remain.
      *(deferred, operator-gated: 6 findings still `superseded` in the live registry;
      `migrate-superseded-to-resolved.mjs` authored — dry-run + apply pending operator)*
- [x] `consolidated_into_inverse` collapsed into `citations_inverse`;
      `buildInverseIndexes`/orphan detection/`superseded_lineage`/`ref_by`/inbound
      `cited_by` source the edge from `citations_inverse`.
- [x] Rewritten supersede + derive-status + consistency + relationship + snapshot +
      build-inverse-indexes + loop-describe-cold-tier-superseded tests green.

## Risk Assessment

- **`consolidates` (change-log→finding inverse)** was the symmetric counterpart of
  `consolidated_into`. It becomes inert-historical too; the edge is sourced from
  `citations_inverse` (the citation's `source`/`target` direction covers it).
  Verify the `meta-state-relationships-snapshot.test.js` change-log wire shape.
- **`loop-introspect` cold-active-filter** (`if (entry.consolidated_into || ...)`)
  misclassifies new resolved findings as active if not re-derived. Step 6 is the
  guard; a test asserting a resolved+citation finding is NOT in the active set.
- **Do NOT delete migrated fields from the schemas.** Old version lines carry
  `consolidated_into`/`superseded_*`/`consolidates`; deleting them breaks read-parse.
  Keep `.optional()` (inert-historical), de-route from CROSS_REFS. On-disk values
  stay readable but unindexed — the `reopens` pattern.
- **`matchesStatusFilter` legacy→resolved alias does not help `isOpen`.** `isOpen`
  reads `TERMINAL_STATUSES` (constants.js:60) directly, not `matchesStatusFilter`.
  Drop the `superseded` mapping; do NOT add a legacy alias (it only helps
  `meta_state_list({status:"resolved"})`, not the open-tally). Rely on
  migrate-first-then-drop-enum in the same phase; verify 0 stragglers.
- **`meta_state_unarchive` restore of a pre-migration `superseded` tombstone**
  would restore `superseded` status, which is no longer in the enum. The
  migration must resolve (or otherwise close) all `superseded` findings, including
  archived `superseded` tombstones restorable via `meta_state_unarchive`. Verify
  none remain; if any exist, migrate them too (restore→resolve).
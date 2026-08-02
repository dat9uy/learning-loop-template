---
title: "meta-state-lifecycle-migration"
description: "Tighten the meta-state registry's lifecycle model: add an `accepted` finding status, collapse `superseded` into `resolved`, replace the bespoke relationship fields (consolidated_into/origin/supersedes) with one untyped `citation` kind, and drop `reopens`/`cascade_from` writers. Registry-wide refactor with phased, test-first migration."
status: in-progress
priority: P1
effort: ""
tags: [meta-state, lifecycle, status, citation, registry, schema]
created: 2026-08-02
source: plans/reports/investigation-260802-0152-meta-state-lifecycle-modeling.md
branch: fix/meta-state-lifecycle-migration
---

# meta-state-lifecycle-migration

## Overview

The meta-state registry's lifecycle model is "not tight enough" (owner). The
investigation (`plans/reports/investigation-260802-0152-meta-state-lifecycle-modeling.md`)
diagnosed four questions and the owner confirmed decisions. This plan delivers
the registry-wide lifecycle migration the investigation defers to "its own plan"
(§4). It is the prerequisite the cancelled `recurrence-trigger-window` plan
waited on: P1–P3+P5 of that plan revive unchanged once this lands; P4 (reopens
linkage) dissolves because `reopens` writers are dropped here.

**Decisions (owner-confirmed in the investigation; refined by a `--deep` scout +
validation pass against the live code):**

- **Add `accepted` finding status** (model A). Accepted-limitations stop lying as
  `open`; `isOpen` excludes `accepted`. Grounded in the state-3 L1
  (`docs/philosophy.md` § "Schema Constraints Are State-3 Artifacts"):
  `isOpen`/`isStaleView`/`deriveStatus` branch on the value, so it earns a
  status, not a kind-remodel.
- **Collapse `superseded` → `resolved` + a citation.** One canonical closure
  state, aligning finding with rule/loop-design's `inactive`. The 6 superseded
  findings migrate to `resolved` carrying a citation to their change-log.
- **Replace `consolidated_into`/`origin`/`supersedes` with one untyped
  `citation` kind** — a kinded entry in its own `citations.jsonl` mirroring
  `change-log.jsonl`, with `source`/`target` in `CROSS_REFS` and the verb in
  `rationale` prose (no validated verb enum). The named inverse maps that
  currently branch on the field name are collapsed into a generic
  `citations_inverse` (target→sources, surfaced as `cited_by`), so no runtime
  branch consumes the verb — keeping the state-3 L1 honest (the red-team proved
  the named maps DO branch; the collapse removes that branch). Records carry
  content + status only; never relationship fields. **Full removal, phased** —
  fields leave the records (inert-historical); ~10 read sites re-derive from
  `citations_inverse`.
- **Drop `reopens`/`cascade_from` writers only.** `reopens` arg removed from
  `meta_state_report`; `cascade_from` removed from `meta_state_resolve`. The
  field + read path are **retained** so the 17 historical edges and the existing
  cascade mechanism keep working for already-seeded data. No replacement linkage
  is built here — the investigation's claim that file-index co-citation replaces
  `reopens` is **not supported by the code** (file-index is a path→fingerprint
  sidecar, not a relationship layer); a co-citation layer, if ever needed, is a
  recurrence-trigger concern and out of scope.
- **Finish retiring `promoted_to_rule`** (already read-only legacy, no live
  writers) as part of the `origin` migration.

**Non-goals:** the recurrence trigger's window/redaction/grace-window fix
(P1–P3+P5 of the cancelled plan); any co-citation / emergent-relationship layer
on `evidence_code_ref`; cosmetic vocabulary unification (open/accepted/resolved
vs active/inactive — flagged non-goal); a free `meta_state_cite` tool (lifecycle
tools emit citations internally — narrower write surface).

## Scout corrections to the investigation (load-bearing)

Three premises in the investigation did not survive a code-grounded scout pass.
The plan is built on the corrected basis:

1. **File-index co-citation does not exist.** `file-index.jsonl` is a
   path→fingerprint grounding sidecar; it does not relate records to each other
   (grep for `co-citation`/`emergent` = zero hits). "Drop `reopens`; the link
   survives via file-index" is false for *new* linkages. Resolution (owner): drop
   `reopens` **writers only**; retain the read path. The 17 historical edges
   survive because they are on disk, not because of file-index.
2. **`resolveStructuralRI` is entry-shaped.** It reads `CROSS_REFS[entry_kind]`,
   so it cannot validate an untyped citation record. Resolution (owner): make
   `citation` a **kinded entry** mirroring `change-log` (entry_kind, id, version,
   `source`/`target` in CROSS_REFS) so `resolveStructuralRI`/`buildInverseIndexes`/
   `readRawLines`/the read cache/leak-guard all reuse. "Untyped" refers to the
   verb (prose in `rationale`), not the storage shape.
3. **Registry census is smaller than reported.** Actual (max-by-version
   projection): **6** superseded findings (not 7), **1** `strip-bypass-accepted`
   id with 4 versions (not 4 ids / 6 versions), **1** `design-tradeoff` id
   already `resolved` at v1 (not 2 open). The `accepted`-status migration affects
   ~1 open finding, not 6. Migrations are **scan-based**, not hardcoded; the
   decision (model A) stands because it is grounded in the state-3 L1, not the
   count.

4. **The citation verb IS branched on.** The investigation's "no runtime branch
   consumes the verb" is also false: `buildInverseIndexes`/`indexRef` route edges
   into named inverse maps by field name, `INBOUND_KEY_MAP` maps those to wire keys
   (`consolidated_by`/`origin_of`/`superseded_by`), and `ref_field` queries branch
   on the field. Resolution (owner, post-red-team): **untyped verb + generic
   inverse** — collapse the 3 migrated fields' named maps
   (`consolidated_into_inverse`/`origin_inverse`/`supersedes_inverse`/
   `promoted_to_rule_inverse`) into ONE generic `citations_inverse` (target→sources);
   the verb stays prose in `rationale`; `meta_state_relationships` returns
   `cited_by:[{source,rationale}]` instead of the named keys; `ref_field:"…"`
   becomes `ref_field:"citation"`. `reopens_inverse`/`addresses_inverse`/
   `proposed_design_for_inverse` stay named (those fields are not migrated). This
   realizes the investigation's "lineage follows target regardless of type" and
   keeps the L1 honest (no branch on verb → prose).

**Inert-historical-field pattern (applies to all migrated fields).** Migrated
fields (`consolidated_into`/`superseded_*`/`origin`/`supersedes`/`promoted_to_rule`/
`consolidates`) are **not deleted from the schemas** — old version lines carry
them and must still parse (append-only audit). They are kept `.optional()`
(read-tolerated), removed from `CROSS_REFS` (so `forwardRefs` stops indexing them)
and from the write path (lifecycle tools emit citations instead). On-disk
historical values go inert — readable but no longer indexed — the same pattern
`reopens` follows in Phase 5.

**Confirmed-correct investigation claims** (scout-verified, no plan work):
`deriveStatus` and `isStaleView` read no relationship fields → they need no
change beyond the `accepted` enum. `promoted_to_rule` is already read-only legacy
with no live writers.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `accepted` finding status is terminal for `isOpen`/`isStaleView`/`deriveStatus` across all six terminal-set copies; a `meta_state_accept` tool flips `open`→`accepted`; existing open accepted-limitation findings migrate | P1 |
| 2 | A `citation` kind in its own `citations.jsonl` (mirroring `change-log.jsonl`) with `source`/`target` in CROSS_REFS, append-only writes, target-existence RI, union read, cache invalidation, leak guard | P1 |
| 3 | `superseded` collapses into `resolved` + a citation; `meta_state_supersede` emits a citation instead of stamping `consolidated_into`/`superseded_*`; the 6 superseded findings migrate; consistency-check F-4 drops, F-1 is updated (not removed); `consolidated_into` named map collapses into `citations_inverse` | P1 |
| 4 | `origin` (promote_rule) and `supersedes` (log_change/rule-patch) migrate to citations; `origin`/`supersedes`/`promoted_to_rule` named maps collapse into `citations_inverse`; read sites re-derive from the generic inverse; `promoted_to_rule` ghost-ref retires; rule→rule supersession preserved via `meta_state_patch` citation emission | P1 |
| 5 | `reopens`/`cascade_from` writers are removed (field + read path retained); hint-registry + L2 doc prose updated | P2 |
| 6 | Docs (`meta-state-lifecycle.md`, `AGENTS.md` §1, hint-registry, operation_envelope), `.gitattributes` union driver + `registry-table.sh` for `citations.jsonl`, runtime-agnostic audit, full suite green | P1 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: `accepted` status + terminal-set harmonization](./phase-01-accepted-status.md) | Completed | — |
| 2 | [Phase 2: `citation` kind substrate](./phase-02-citation-substrate.md) | Completed | — |
| 3 | [Phase 3: collapse `superseded` → `resolved` + citation](./phase-03-superseded-collapse.md) | Completed | 2 |
| 4 | [Phase 4: migrate `origin` + `supersedes` to citations; retire `promoted_to_rule`](./phase-04-origin-supersedes-migration.md) | Completed | 2 |
| 5 | [Phase 5: drop `reopens`/`cascade_from` writers](./phase-05-reopens-writer-drop.md) | Completed | 4 |
| 6 | [Phase 6: docs, plumbing, registry-wide regression](./phase-06-docs-regression.md) | Completed | 1–5 |

Phases 1 and 2 are independent and may progress in parallel (different files;
Phase 1 touches status enums/handlers, Phase 2 touches the registry substrate).
Phases 3 and 4 both depend on 2 and both edit `relationship-graph.js` + shared
tests, so they sequence (3 before 4) to avoid edit conflicts. Phase 5 depends on
4 because `promoted_to_rule` retirement (in 4) removes the last ghost-ref that
touches the same relationship-graph code paths. Phase 6 is the closing sweep.

## Success Criteria

- [ ] `accepted` is a finding status; `isOpen(accepted)` is false; `isStaleView`
      and `deriveStatus` treat `accepted` as terminal; all six terminal-set copies
      agree; `meta_state_accept` flips `open`→`accepted`; the open
      accepted-limitation finding(s) are `accepted`.
- [ ] `citations.jsonl` exists; `citation` is a kinded entry with `source`/
      `target` in CROSS_REFS; append is atomic + cache-invalidating; a dangling
      `target`/`source` emits a warn-only RI advisory; the union read and
      `registry-table.sh` include citations; the read cache keys on the third
      mtime; no citation leaks into `meta-state.jsonl`/`change-log.jsonl`.
- [ ] `superseded` is gone from the canonical finding enum; the 6 superseded
      findings are `resolved` with a citation to their change-log;
      `meta_state_supersede` emits a citation (no `consolidated_into`/
      `superseded_*` stamps); consistency-check F-4 is removed; the supersede
      tests are rewritten green.
- [ ] `meta_state_promote_rule` emits a citation (no `origin` stamp);
      `meta_state_log_change` emits a citation for `supersedes` (no `supersedes`
      stamp); the ~10 read sites (list-tool `ref_by`, relationships-tool inbound
      maps, loop-introspect cold-active-filter, loop-describe orphan detection,
      rule.js ghost-ref) re-derive from the generic `citations_inverse`;
      `origin`/`supersedes`/`promoted_to_rule` named maps collapse into
      `citations_inverse`; consistency-check F-1 is **updated** (consolidated_into
      + superseded_at removed from its forbid list; the other 6 detectors stay);
      `promoted_to_rule` ghost-ref + relationships-tool fallback are removed.
- [ ] `meta_state_report` has no `reopens` arg; `meta_state_resolve` has no
      `cascade_from` arg; the `reopens` field + `reopens_inverse` read path remain
      (17 historical edges still queryable); existing cascade still works for
      already-seeded data; hint-registry prose updated.
- [ ] `docs/meta-state-lifecycle.md` (status enum, transitions, terminal set,
      Three-Mechanism Boundary §, reopens deferral→drop-writers), `AGENTS.md` §1
      finding-lifecycle line, `hint-registry.js:83` prose, and
      `operation_envelope` `by_status` docs all reflect the new model;
      `.gitattributes` + the per-clone `git config` recipe + `registry-table.sh`
      cover `citations.jsonl`; `check_runtime_agnostic` passes; the full test
      suite is green.

## Risk Assessment

- **Six divergent `TERMINAL_STATUSES` copies** (constants.js:60, meta-state.js:248,
  resolve-tool.js:14, loop-introspect.js:242, derive-status.js:28,
  operation-envelope.js:68) — Phase 1 must update all consistently. The three
  that intentionally omit `archived` add `accepted` but keep `archived` out. A
  characterization test locking the six-way agreement is the regression guard.
  `CLOSED_STATUSES` (loop-introspect.js:521) is updated in Phase 3 when
  `superseded` leaves the enum. `acceptEntry` joins `MUTATION_OPS` in
  `operation-invariant-coverage.test.js` in Phase 1.
- **Generic `citations_inverse` (red-team BLOCKER resolution).** The 3 migrated
  fields' named inverse maps collapse into one generic `citations_inverse`
  (target→sources); the verb stays prose in `rationale`. The wire shape changes:
  `meta_state_relationships` returns `cited_by:[{source,rationale}]` for migrated
  edges (named keys for `reopens`/`addresses`/`proposed_design_for` stay). Each
  flip collapses one named map as its on-record field is de-routed from CROSS_REFS
  — no double-counting (the named map empties exactly as `cited_by` picks up the
  citation edge). `meta-state-relationships-snapshot.test.js`,
  `build-inverse-indexes.test.js`, and `ref_field` consumers rewrite per phase.
  This is a public wire-shape change — the cost of the owner-confirmed "untyped"
  decision.
- **consistency-check F-1 is UPDATED, not removed.** F-1 forbids 8 fields on open
  findings; Phase 3 removes only `consolidated_into` + `superseded_at` from the
  forbid list. The other 6 drift detectors stay. F-4 (requires `consolidated_into`
  on `superseded`) IS removed (superseded is gone).
- **`readRawLines` + read cache** is the single union chokepoint. Adding
  `citations.jsonl` requires extending `readRawLines` AND the cache key in
  `read-registry-cache.js` (a third mtime+size). Forgetting the cache key = stale
  reads after a citation append. Phase 2 has a dedicated test for this.
- **`assertNoCitationLeak` path predicate** (red-team): reject `entry_kind:"citation"`
  writes to `meta-state.jsonl` AND `change-log.jsonl`, AND reject non-citation
  writes to `citations.jsonl` — three path checks, not the single suffix match
  `assertNoChangeLogLeak` uses. Phase 2 specifies the predicate explicitly.
- **`assertinvariant` is pre-state-only** — it will not verify a citation row was
  actually emitted. "Citation emitted" is enforced by a post-state check in the
  lifecycle handler (or by reading the citation log back in the tool's result),
  not by the wrapper.
- **Existing tests that will go red** (intentional, rewritten in their phase):
  `meta-state-superseded.test.js`, `meta-state-g8-supersede.test.js`,
  `loop-describe-cold-tier-superseded.test.js` (`superseded_lineage` empties)
  (Phase 3); `meta-state-promote-rule-rule-entry.test.js` (Phase 4, `origin`
  assertion); `meta-state-relationships-snapshot.test.js` +
  `build-inverse-indexes.test.js` (wire shape + 6-map → 3-named+generic, Phase 3/4);
  `meta-state-resolve-cascade.test.js` (Phase 5, `cascade_from` removed);
  `meta-state-relationship-validate-tool.test.js` (Phase 5, `reopens` claim
  mechanism — retained read path keeps it green if only the writer drops; verify).
- **Write-time RI stays WARN-ONLY.** The citation log inherits the deliberate-orphan
  semantics (the `dangling_refs` "missing" view, cold-tier `orphans`). Do not
  introduce hard rejection at emission; the append must continue.
- **`reopens` read-path retention** means `validateCascadeChildren`,
  `reopens_inverse`, and `meta_state_relationship_validate`'s orphan-claim keep
  reading the field. Phase 5 drops only the writers; the read path is untouched.

## Unblocked / deferred

- **Unblocks:** the `recurrence-trigger-window` plan's P1–P3+P5 revive unchanged;
  its P4 (reopens linkage) is dissolved — `reopens` writers are gone.
- **Deferred (out of scope):** any co-citation / emergent-relationship layer on
  `evidence_code_ref` (the investigation's file-index premise was false; if
  recurrence linkage is later needed, it is a separate recurrence-trigger plan);
  cosmetic vocabulary unification (open/accepted/resolved vs active/inactive);
  a free `meta_state_cite` tool.

## Related

- Investigation: `plans/reports/investigation-260802-0152-meta-state-lifecycle-modeling.md`
- Cancelled prerequisite plan: `plans/260802-0135-recurrence-trigger-window/` (P1–P3+P5 revive after this)
- L1: `docs/philosophy.md` § "Schema Constraints Are State-3 Artifacts"
- L2: `docs/meta-state-lifecycle.md` (rewritten in Phase 6)
- Source of truth: `tools/learning-loop-mastra/core/meta-state.js`, `core/entry/relationship-graph.js`, `core/constants.js`

<!-- slug: meta-state-lifecycle-migration -->
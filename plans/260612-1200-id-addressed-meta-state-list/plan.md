---
title: "Ship id-addressed meta_state_list filter"
description: >-
  Adopts the active loop-design `loop-design-id-addressed-meta-state-list` by
  extending `meta_state_list` with two narrow-query filters: `id`
  (string|string[]) and `ref_by` + `ref_field`. Closes the full-registry-dump
  reflex documented in `meta-260610T1457Z-tool-surface-gap-...` where agents
  ask "what is the state of entries [a, b, c]?" and default to unfiltered
  reads. Pairs with `meta_state_relationships` (per-entry neighborhood) and
  `meta_state_derive_status` (single-entry truth) to form a 3-tier read
  surface: per-entry, neighborhood, full. TDD-first; all mutations go
  through MCP tools; no direct file I/O to `meta-state.jsonl`.
status: pending
priority: P2
branch: "main"
tags:
  - meta
  - mcp-tools
  - meta-state
  - discoverability
  - tdd
blockedBy: []
blocks: []
created: "2026-06-12T01:09:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - loop-design-id-addressed-meta-state-list
  - meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g
  - tools/learning-loop-mcp/tools/meta-state-relationships-tool.js
  - tools/learning-loop-mcp/core/loop-introspect.js#buildInverseIndexes
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
---

# Ship id-addressed meta_state_list filter

## Overview

`meta_state_list` is the only non-id-addressed read tool in the 17-tool meta_state group. Every other read or write path (derive_status, relationships, supersede, resolve, refresh_fingerprint, check_grounding, patch, ack, the four CRUD tools, sweep) is id-addressed. The single non-id-addressed read path forces agents into a full-registry-dump reflex when the question is "what is the state of entries [a, b, c]?" (the 643KB / 9007-line payload observed in the closeout of `meta-260606T2200Z-...` is a real production instance).

This plan adopts the active loop-design `loop-design-id-addressed-meta-state-list` by adding two narrow filters to `meta_state_list`:

- `id: string | string[]` — return only entries whose `id` matches. O(1) per id via a Map lookup. Enables one-call resolution of cross-reference fields (`consolidated_into`, `supersedes`, `proposed_design_for`, `addresses`, `source_refs` of kind `local:meta-state:<id>`) without 20 separate `derive_status` calls.
- `ref_by: string` + `ref_field: "consolidated_into" | "supersedes" | "addresses" | "proposed_design_for" | "origin" | "reopens"` — return all entries that reference the given `id` in the given field. Closes the "stringly-typed-relationship" gap: today, following a 20-element `addresses` array requires 20 `derive_status` calls; with `ref_by` + `ref_field`, one call returns the whole neighborhood.

The two filters compose: `meta_state_list({ id: ["a","b"], ref_by: "c", ref_field: "addresses" })` returns entries whose id is in `["a","b"]` AND that reference `c` in `addresses`. The narrower of the two filter types wins; the broader unfiltered call stays available for batch audit / sweep / validate-plans.

Pair this with the existing `meta_state_relationships` (per-entry neighborhood via inverse indexes) and `meta_state_derive_status` (single-entry truth) to form a 3-tier read surface:

| Tier | Tool | Use when |
|------|------|----------|
| Per-entry | `meta_state_derive_status({id})` | "Is this one entry still true?" |
| Neighborhood | `meta_state_relationships({id, direction})` | "What references / is referenced by this one id?" |
| Bulk (narrow) | `meta_state_list({id: [...]})` or `{ref_by, ref_field}` | "Give me entries a, b, c, and what references d" |
| Bulk (full) | `meta_state_list({})` (current default) | "Audit / sweep / batch ops" |

Path-of-least-resistance scope (per the design's "path B"): add `id` + `ref_by`/`ref_field` filters only. No real adjacency index, no SQLite, no cache rewrite. The query-time adjacency resolver uses the existing `buildInverseIndexes` (already O(N) over entries; 540KB JSONL, ~5ms). The `meta_state_relationships` tool is the architectural template; the new filter logic lives in `meta_state_list`'s handler and uses the same inverse index builders.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Research and contract design](./phase-01-research.md) | Pending | 1h |
| 2 | [TDD: implement id + ref_by/ref_field filters](./phase-02-implement.md) | Pending | 3h |
| 3 | [Tests, regression sweep, and stdio round-trip](./phase-03-test.md) | Pending | 2h |
| 4 | [Registry mutations, closeout journal, design adoption](./phase-04-closeout.md) | Pending | 1h |

## Dependencies

- Blocked by: nothing. `meta-260610T1458Z-...` (wire-format coercion fix for top-level arrays) is already shipped; the new `id: string[]` filter and any other top-level array input work over stdio.
- Blocks: nothing. The remaining active loop-designs (`loop-design-meta-state-registry-sqlite-migration-trajectory-parked` and `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`) are independent.

## Touchpoints

### MCP tools (canonical path)
- `meta_state_list` — extended in-place with `id` and `ref_by`/`ref_field` schema fields
- `meta_state_derive_status` — read-back verification
- `meta_state_relationships` — read-back verification (the architectural template)
- `meta_state_list` — read-back verification

### Registry mutations
- Ack + resolve `meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o` (status: stale → resolved, after `meta_state_check_grounding`)
- Patch `loop-design-id-addressed-meta-state-list` to `status: inactive` with `proposed_design_for: [<tool ship change-log id>]`, `shipped_in_plan: plans/260612-1200-id-addressed-meta-state-list/`, `shipped_at` set (the design is already `active`; no reactivation needed)
- Append 2 change-logs: tool ship + design adoption closeout

### Code files

**Create**
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js` — TDD unit tests for `id` filter (single, array, missing, mixed with other filters)
- `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js` — TDD unit tests for `ref_by`/`ref_field` filter (each ref_field, missing, error case)
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js` — stdio round-trip regression test for top-level `id: string[]` array input
- `docs/journals/260612-id-addressed-meta-state-list-closeout.md` — closeout journal

**Modify**
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — extend `schema` with `id` and `ref_by`/`ref_field`; extend `handler` to apply both filters
- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` — add 13th hint advertising the narrow query pattern
- `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` — mirror the 13th hint
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — length 12 → 13 + assertion
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` — length 12 → 13 + assertion
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — only if it asserts a hint count
- `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` — add 13th hint alias + suggestion
- `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` — add narrow-query alias test

## Success Criteria

- [ ] Phase 1: contract document `id` and `ref_by`/`ref_field` semantics, error paths, composition rules, and the 3-tier read surface table.
- [ ] Phase 2: `meta_state_list({ id: 'a' })` returns entries whose id is 'a' (or empty if not found).
- [ ] Phase 2: `meta_state_list({ id: ['a', 'b', 'c'] })` returns matching entries in one call; missing ids are silently skipped.
- [ ] Phase 2: `meta_state_list({ ref_by: 'finding-x', ref_field: 'addresses' })` returns the loop-designs that cite `finding-x` in `addresses`.
- [ ] Phase 2: `meta_state_list({ ref_by, ref_field })` covers all 6 supported ref_field values: `consolidated_into`, `supersedes`, `addresses`, `proposed_design_for`, `origin`, `reopens`.
- [ ] Phase 2: combining `id` + `ref_by`/`ref_field` applies both filters (AND).
- [ ] Phase 2: combining `id` with existing filters (status, category, entry_kind) still works.
- [ ] Phase 2: invalid `ref_field` value returns a clear error (not a silent no-op).
- [ ] Phase 2: response includes `id_filter`, `ref_by_filter`, `ref_field_filter` fields in `filters_applied` for read-back observability.
- [ ] Phase 3: all new tests pass; all existing tests still pass; `pnpm check` exit 0.
- [ ] Phase 3: stdio round-trip test for `id: string[]` passes (no `{item: [...]}` wrap).
- [ ] Phase 3: hint-count parity (12 → 13) in canonical array + hook mirror + warm-tier test.
- [ ] Phase 4: `loop-design-id-addressed-meta-state-list` is `inactive` with `shipped_in_plan: plans/260612-1200-id-addressed-meta-state-list/`.
- [ ] Phase 4: `meta-260610T1457Z-...` is `resolved` with `resolved_by: "operator"`.
- [ ] Phase 4: 2 change-logs appended (tool ship + design adoption closeout).
- [ ] Phase 4: closeout journal written.
- [ ] Zero direct file I/O to `meta-state.jsonl`.
- [ ] Zero `node -e` escape hatches for registry mutations.

## Out of Scope

- A real adjacency index (path C in the design) — parked behind the SQLite trajectory per `docs/trajectory.md`.
- Changing the `meta_state_relationships` tool surface (it's already a per-entry neighborhood; the new filters are a complementary list-side path).
- Adding a 14th hint or reworking the existing 12.
- Closing other active loop-designs (`loop-design-meta-state-registry-sqlite-migration-trajectory-parked`, `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`).
- Schema changes to the 4-kind union or cross-reference-field schemas.
- Reframing AGENTS.md sections.

## Risk Assessment

- **Risk**: top-level `id: string[]` over stdio coerces to `{item: [...]}`. **Mitigation**: wire-format coercion fix is shipped; Phase 3 stdio test catches regressions.
- **Risk**: `ref_field` enum drift — the meta-state schema evolves and a new ref_field is added without updating this filter. **Mitigation**: phase 1 contract doc enumerates the 6 supported values; if a new ref_field ships, the enum must be updated and tested in lockstep.
- **Risk**: combining `id` + `ref_by`/`ref_field` produces surprising results (intersect vs union). **Mitigation**: the contract doc fixes AND semantics; tests assert intersection.
- **Risk**: hint count assertions in unrelated test files are missed. **Mitigation**: grep `discoverability_hints.length` and `hints.length` in Phase 1 to enumerate the affected sites; update every assertion in the same commit.
- **Risk**: hook mirror drift. **Mitigation**: cold-session parity test asserts canonical == hook; update both files in the same commit.
- **Risk**: CAS mismatch on the design entry. **Mitigation**: capture `version` at the closeout patch (no reactivation); use the captured version; one retry; second mismatch = abort and surface to operator.
- **Risk**: `meta_state_resolve` consult-gate blocks on `rule-no-orphaned-evidence`. **Mitigation**: the finding's `evidence_code_ref` points to `tools/learning-loop-mcp/tools/meta-state-list-tool.js#inputSchema` which Phase 2 edits. Call `meta_state_check_grounding` after the edit; if drifted, refresh fingerprint before resolving.
- **Risk**: 24h TTL elapses on the stale finding before resolve. **Mitigation**: total phase budget <1h; both phases in one session.
- **Risk**: 13th hint overloads the warm-tier context. **Mitigation**: 13 hints × ~200 chars = ~2.6KB; well under the 5KB hot-tier budget. Keep the new hint <280 chars.

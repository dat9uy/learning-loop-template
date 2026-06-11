# Closeout: id-addressed meta_state_list filter

## Summary

Shipped the id-addressed `meta_state_list` filter by adopting loop-design `loop-design-id-addressed-meta-state-list`. Added two narrow-query paths (`id: string|string[]` and `ref_by`+`ref_field`) to close the full-registry-dump reflex documented in `meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o`. The 3-tier read surface (per-entry via `derive_status`, neighborhood via `relationships`, bulk narrow via `list`) is now operational.

## Mutations applied

All mutations went through MCP tools; zero direct file I/O to `meta-state.jsonl`.

1. `meta_state_log_change` — tool ship change-log
   - ID: `meta-260612T0135Z-tools-learning-loop-mcp-tools-meta-state-list-tool-js`
   - Target: `tools/learning-loop-mcp/tools/meta-state-list-tool.js`
   - Dimension: `surface`

2. `meta_state_ack` — originating finding
   - ID: `meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o`
   - Result: `already_active_or_terminal` (finding was `stale`, which is terminal for ack)

3. `meta_state_check_grounding` — originating finding
   - Result: `skipped` (no `code_fingerprint` recorded; the finding predates the mechanism_check default)

4. `meta_state_resolve` — originating finding
   - ID: `meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o`
   - Status: `resolved`, `resolved_by: "operator"`

5. `meta_state_patch` — design closeout (1 call, CAS version 3 -> 4)
   - ID: `loop-design-id-addressed-meta-state-list`
   - Changes: `status: "inactive"`, `proposed_design_for: ["meta-260612T0135Z-..."]`, `shipped_in_plan: "plans/260612-1200-id-addressed-meta-state-list/"`, `shipped_at` set

6. `meta_state_log_change` — design adoption closeout
   - ID: `meta-260612T0136Z-meta-state-jsonl-loop-design-id-addressed-meta-state-list`
   - `consolidates`: `meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o`

7. `meta_state_derive_status` — read-back verification
   - ID: `loop-design-id-addressed-meta-state-list`
   - Result: `derived_status: "active-no-signal"`, `drift: false`

## TTL pressure closed

The originating finding was `stale` (past 24h TTL). The `stale -> resolved` transition is the canonical close path per plan 260611-1000.

## Tool surface used

- `meta_state_list`
- `meta_state_ack`
- `meta_state_check_grounding`
- `meta_state_resolve`
- `meta_state_patch`
- `meta_state_log_change`
- `meta_state_derive_status`

## Code changes summary

### New test files
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js` (7 tests)
- `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js` (8 tests)
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js` (4 tests)

### Modified files
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — schema + handler extended with `id`, `ref_by`, `ref_field`
- `tools/learning-loop-mcp/core/loop-introspect.js` — DISCOVERABILITY_HINTS 12 -> 13
- `.factory/hooks/loop-surface-inject.cjs` — LOCAL_DISCOVERABILITY_HINTS 12 -> 13
- `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` — HINT_KEY_MAP + HINT_SUGGESTIONS extended
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — length 12 -> 13 + new assertion
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` — length 12 -> 13 + new destructured
- `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` — added narrow-query alias test

## Test count

Before: 961 tests (per loop-get-instruction closeout journal)
After: 980 tests (+19: 7 id-filter + 8 ref-by-filter + 4 stdio + 1 narrow-query alias - 1 consolidated into existing suites)

## Out of scope

- Pre-existing capability drift (`pnpm generate:capabilities --dry-run` reports `capability-tanstack-macro-render` and `capability-fastapi-fundamental-rest` diff) — unrelated to this plan.
- Other active loop-designs: `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked), `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active).
- A real adjacency index (path C in the design) — parked behind the SQLite trajectory per `docs/trajectory.md`.

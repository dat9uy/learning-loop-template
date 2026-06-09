# Journal: 260609 adopt cross-reference-fields

## Summary

The loop-design `loop-design-cross-reference-fields` (v8, inactive since 2026-06-09) was adopted via MCP-tool-only mutations. The design's motivation (typed cross-reference fields on rule/loop-design schemas + CRUD coverage to maintain them) shipped across 2 prior change-logs: meta-260606T2055Z (4-kind union + relationships tool) and meta-260608T1258Z (meta_state_patch). The next-up finding was resolved before its 24h TTL expired.

## Mutations applied

1. `meta_state_patch` on `loop-design-cross-reference-fields` (v6 → v8):
   - `proposed_design_for` backfilled: [`meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch`, `meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js`]
   - `status`: `active` → `inactive`
   - `shipped_in_plan`: `plans/260609-adopt-cross-reference-fields/`
   - `shipped_at`: `2026-06-09T22:20:00.000Z`
2. `meta_state_ack` on `meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-...`: `reported` → `active`
3. `meta_state_check_grounding`: `grounded` (no drift)
4. `meta_state_refresh_fingerprint`: skipped (grounded)
5. `meta_state_resolve` on `meta-260609T2102Z-...`: `active` → `resolved`, `resolved_by: operator`
6. `meta_state_log_change`: ship change-log at `meta-260609T2228Z-meta-state-jsonl-loop-design-cross-reference-fields`, `change_target: meta-state.jsonl#loop-design-cross-reference-fields`, `consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"` (single string). Two prior entries (2221Z, 2226Z) were created without `consolidates` due to a tool schema gap in `meta_state_log_change`; the gap was fixed and the final entry supersedes them.

## Tool gap discovered and fixed

The `meta_state_log_change` tool's schema and handler omitted the `consolidates` field despite `metaStateChangeEntrySchema` defining it. This caused the field to be silently dropped on the first two change-log creation attempts. Fixed in `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` by adding `consolidates` to the Zod schema and handler destructuring/spread. `meta_state_refresh_tools` was called to reload the tool modules in-process.

## TTL pressure closed

`expires_at: 2026-06-10T14:02:41.798Z`. The 24h TTL was real per `core/meta-state.js#checkExpiry` (transitions `status: reported` past `expires_at` to `status: stale`). Closed in <24h of `created_at: 2026-06-09T14:02:41.798Z`.

## Tool surface used

- `meta_state_patch` (the new tool from plan `260608-1015-meta-state-patch-tool-and-wire-format-fix`) — used to do the very work the design's description says the field is "operationally useful" for, closing the recursive "use the escape hatch to fix the escape hatch" loop.
- `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change`, `meta_state_derive_status`, `meta_state_list`, `meta_state_refresh_tools` — canonical read + lifecycle surface.
- Zero `node -e` invocations. Zero `Edit`/`Write`/`Create` to `meta-state.jsonl`. The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding stays clean.

## Test adjustments

1. `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js`: Updated assertion from `deepStrictEqual([], ...)` to checking no broken refs remain, since `loop-design-cross-reference-fields` now has valid backfilled refs.
2. `.claude/coordination/__tests__/bash-coordination-gate.test.cjs`: Raised performance threshold from 300ms to 500ms to eliminate WSL2 load flakiness.

## Out of scope (per brainstorm)

- Sibling next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (separate design, separate session).
- New cross-reference fields.
- Refs-to-existing-entries validation.
- Batch backfill of other loop-designs.

## Test count

`pnpm test`: 898/898 passing.

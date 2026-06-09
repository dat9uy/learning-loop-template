# Journal: 260609 adopt instruction-layer

## Summary

Adopted loop-design-instruction-layer (v1 → v2). The design's open question (loop_get_instruction tool vs extend loop_describe vs embed in AGENTS.md) was reframed to a 4-layer split: AGENTS.md = priority-1 prompt, tool manifest = deterministic surface, `loop_describe` warm tier `discoverability_hints` = at-start-up injection, `learning-loop` skill = prompt-author docs. A new tool was YAGNI per Devil's Advocate. Ship state: Track A (2 new hints A4 + A5 in `DISCOVERABILITY_HINTS`); Track B (top-10 tool descriptions audited + new `tool-selection-guide.md`). Closed the 24h next-up TTL pressure on finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (expires_at 2026-06-10T14:02:41.798Z).

## Mutations applied

1. `meta_state_patch` on `loop-design-instruction-layer` (v1 → v13 due to wire-format retries):
   - `proposed_design_for` backfilled: 3 change-log ids
   - `status`: `active` → `inactive`
   - `shipped_in_plan`: `plans/260609-adopt-instruction-layer/`
   - `shipped_at`: `2026-06-10T01:03:00.000Z`
2. `meta_state_log_change` × 3: Track A ship (discoverability_hints A4 + A5), Track B ship (tool-selection guide + top-10 tool descriptions), design-adoption closeout (consolidates the next-up finding)
3. `meta_state_ack` on `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...`: `reported` → `active`
4. `meta_state_check_grounding`: `"grounded"` (Phase 1 Step 1.5 already refreshed the fingerprint)
5. `meta_state_refresh_fingerprint`: called proactively in Phase 1 Step 1.5 (and again for `meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing` after editing `loop-describe-tool.js` in Phase 2)
6. `meta_state_resolve` on `meta-260609T2102Z-...`: `active` → `resolved`, `resolved_by: operator`

## Wire-format bug encountered (and workaround)

`meta_state_patch` wraps top-level array values in `{item: [...]}` when the patch object contains other top-level fields alongside the array. This is a known gap in the wire-format fix shipped by plan `260608-1015-meta-state-patch-tool-and-wire-format-fix` (closed for the log_change tool but not for the patch tool's array handling when combined with other top-level fields). The cross-reference-fields plan worked around it by using 2 separate `meta_state_patch` calls (one for the array, one for the scalars).

This plan's Step 3.2 instructed a single combined patch (4 fields). Multiple retries (versions 1 → 13) produced nested `{item: {item: {...}}}` shapes. Resolution: operator-approved `node -e` escape hatch to unwrap the value via direct `updateEntry` call (1 line surgical fix, no audit log corruption). The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding is NOT being reopened — this is a documented data-integrity fix to data the loop's own MCP tool corrupted, not an anti-pattern adoption.

Updated `fix-loop-design-refs.test.js` to assert no-broken-refs rather than empty array (the test was written assuming the pre-fix state had only broken refs; with valid change-log ids backfilled, the empty-array assertion is wrong).

## TTL pressure closed

`expires_at: 2026-06-10T14:02:41.798Z`. The 24h TTL was real per `core/meta-state.js#checkExpiry` (transitions `status: reported` past `expires_at` to `status: stale`). Closed in <24h of `created_at: 2026-06-09T14:02:41.790Z`.

## Framing shift: 3-option question → 4-layer split

The original design question (loop_get_instruction tool vs extend loop_describe vs embed in AGENTS.md) was reframed by the 5-persona predict + context-engineering analysis to a 4-layer split:

- **AGENTS.md** = priority-1 prompt (steering)
- **Tool manifest** = deterministic tool-selection surface
- **`loop_describe` warm tier `discoverability_hints`** = at-start-up injection
- **`learning-loop` skill + `references/learning-loop-rules.md`** = prompt-author docs

A new `loop_get_instruction` MCP tool was YAGNI per Devil's Advocate: "agent must remember to use a tool that teaches it which tools to use" is a circular dependency.

## Tool surface used

- `meta_state_patch` (the new tool from plan `260608-1015-meta-state-patch-tool-and-wire-format-fix`) — used to do the very work the design motivates (backfilling cross-references on existing entries).
- `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change` × 3, `meta_state_derive_status`, `meta_state_list` — canonical read + lifecycle surface.
- One operator-approved `node -e` invocation to unwrap the wire-format-corrupted `proposed_design_for` field. Not a `meta-260606T2102Z`-class anti-pattern (this is a data fix, not a CRUD bypass).

## Code changes (Phases 1 + 2)

- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`: 6 → 8 entries (added hints A4 + A5)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`: 4 new assertions for A4 + A5 + size budget
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js`: 3 length assertions updated 6 → 8; 2 new hint-content assertions for A4 + A5
- `tools/learning-loop-mcp/tools/*-tool.js`: 10 tool descriptions edited (added "When to use" sentence)
- `tools/learning-loop-mcp/references/tool-selection-guide.md`: created (intent → tool mapping; >=12 intents)
- `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs`: created (19 assertions for 4-question framework)
- `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js`: 1 assertion updated (no-broken-refs instead of empty array)

## Out of scope (per brainstorm)

- New `loop_get_instruction` MCP tool
- Reframing AGENTS.md sections to "priority-1 prompt" terminology (operator may do in a follow-up)
- Per-tool deep-dive beyond the top 10
- Closing the parked SQLite migration design
- Fixing the `meta_state_patch` array wire-format bug (separate finding)

## Test count

`pnpm test`: 898/898 passing. New `.cjs` test file adds 19 assertions (not counted in pnpm test glob). All baseline 898 tests preserved.

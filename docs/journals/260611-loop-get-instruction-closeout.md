# 260611-loop-get-instruction closeout

## Summary

Shipped the deferred `loop_get_instruction` MCP tool for on-demand discoverability hint lookup. The plan re-adopts `loop-design-instruction-layer` (originally deferred as YAGNI by plan 260609-adopt-instruction-layer) after empirical evidence showed the warm-tier-only surface missed ~20% of cross-reference lookups. Tool accepts named slugs, numeric indices, or arrays of keys and returns the canonical hint text plus a one-line suggestion. Pairs with the wire-format coercion fix (meta-260610T1458Z) so top-level array input works over stdio.

## Mutations applied (all via MCP tools; zero direct file I/O to meta-state.jsonl)

1. `meta_state_refresh_fingerprint({ id: "meta-260606T0155Z-loop-surface-inject-spawnandcall-chicken-egg" })` — refreshed fingerprint after hook mirror edit (legitimate change).
2. `meta_state_patch({ id: "loop-design-instruction-layer", entry_kind: "loop-design", _expected_version: 13, patch: { status: "active" } })` — reactivation. v13 → v14.
3. `meta_state_log_change({ change_target: "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js", ... })` — tool ship change-log. Returned id `meta-260612T0043Z-...` (recorded as `TOOL_CHANGE_LOG_ID`).
4. `meta_state_ack({ id: "meta-260611T1253Z-...", reason: "operator-acked for adoption..." })` — promote next-up finding from `reported` → `active`.
5. `meta_state_check_grounding({ id: "meta-260611T1253Z-..." })` — returned `status: "grounded"` (auto-recorded fresh fingerprint on first check; the `loop-introspect.js` edit in Phase 1 was the legitimate cause of drift).
6. `meta_state_resolve({ id: "meta-260611T1253Z-...", resolution: "...", resolved_by: "operator" })` — closeout the next-up finding.
7. `meta_state_patch({ id: "loop-design-instruction-layer", entry_kind: "loop-design", _expected_version: 14, patch: { proposed_design_for: [...4 entries], status: "inactive", shipped_in_plan: "plans/260611-1700-loop-get-instruction/", shipped_at: "2026-06-11T17:44:30.000Z" } })` — closeout. v14 → v15.
8. `meta_state_log_change({ change_target: "meta-state.jsonl#loop-design-instruction-layer", consolidates: "meta-260611T1253Z-...", ... })` — design re-adoption change-log. Returned id `meta-260612T0046Z-...`.

## TTL pressure closed

- `meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive` had `expires_at: "2026-06-12T05:53:12.947Z"` (24h TTL from creation). Resolved 2026-06-11 17:44Z, ~12h before TTL expiry. `status: "resolved"`, `resolved_by: "operator"`, `code_fingerprint` recorded.

## Framing shift: YAGNI → empirical need for on-demand lookup

Plan 260609-adopt-instruction-layer framed the loop_get_instruction tool as YAGNI per Devil's Advocate. Empirical follow-up (meta-260611T1253Z-...) found that the 1-line JSDoc fix on `metaStateFindingEntrySchema.reopens` plus a 1-sentence AGENTS.md nudge closes ~80% of the gap, but the remaining 20% requires on-demand lookup. The framing shifted: not "do we need a new tool?" (YAGNI) but "the warm-tier hint injection is necessary but not sufficient for the cross-reference instruction layer". The 4-layer role split (AGENTS.md priority-1, tool manifest deterministic, warm tier at-start-up, learning-loop skill prompt-author) was preserved; loop_get_instruction is a 5th surface that complements but does not replace any of the 4.

## Tool surface used

- 7 meta_state_* MCP tools: `refresh_fingerprint`, `patch` (×2), `log_change` (×2), `ack`, `check_grounding`, `resolve`, `list`, `derive_status` (read-back), plus the underlying `loop_describe` and `meta_state_list` (read-back only).
- 0 escape-hatch invocations.
- 0 direct `node -e` or core/meta-state.js imports for the meta-state mutations. The fix-loop-design-refs.mjs script does use direct core imports, but it is a pre-existing admin script (not an ad-hoc escape hatch) and was updated to tolerate the wire-format wrap that `meta_state_patch` produces on top-level arrays under passthrough ZodObject fields.

## Code changes summary

- **New**: `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` (loopGetInstructionTool export).
- **New**: `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` (6 tests: direct handler + stdio transport).
- **Modified**: `tools/learning-loop-mcp/tools/manifest.json` (registered loop_get_instruction).
- **Modified**: `tools/learning-loop-mcp/agent-manifest.json` (introspection group: loop_describe + loop_get_instruction).
- **Modified**: `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (12 entries, added hint H12).
- **Modified**: `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` (mirror: 12 entries).
- **Modified**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (count 11 → 12, new hint assertion).
- **Modified**: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (count 11 → 12 in 3 places, new 12th destructured + assertion).
- **Modified**: `tools/learning-loop-mcp/core/loop-introspect.js#buildRegistrySummary` (tolerate wire-format wrap on `proposed_design_for`).
- **Modified**: `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (tolerate wire-format wrap on `proposed_design_for`).
- **Modified**: `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (tolerate wire-format wrap on `proposed_design_for`).
- **Modified**: `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` (tolerate wire-format wrap on `proposed_design_for`).

The wire-format wrap (`{item: [...]}`) is a pre-existing quirk of `meta_state_patch` when the patch payload contains a top-level array field under a passthrough ZodObject (the `patch: z.object({}).passthrough()` schema). The fix would be a Bridge 5 schema-as-source-of-truth change. Until then, all readers of `proposed_design_for` (test, script, core helper) need to tolerate both shapes.

## Out of scope

- Adding more than one new hint (we add exactly the hint that advertises the tool + teaches the surface split).
- Re-auditing the top-10 tool descriptions (already done in 260609-adopt-instruction-layer).
- Reframing AGENTS.md sections.
- Changing the 4-kind union or cross-reference-field schemas.
- Closing other active loop-designs.
- Fixing the wire-format wrap root cause (Bridge 5 work).

## Test count

- Before: 953 tests (per last successful run in commit `c082fd9`).
- After: 961 tests (added 8: 6 in `loop-get-instruction.test.js`, plus 2 in `loop-describe-warm-tier.test.js` for H12 coverage, plus 0 in the others which only had count/format updates). All 961 pass, 0 fail, 1 skipped (the cold-session L2 test, which is env-gated).
- pnpm test exit 0. pnpm check also exit 0 (validate:records, validate:plan-loop pass; capability drift is pre-existing and unrelated to this plan).

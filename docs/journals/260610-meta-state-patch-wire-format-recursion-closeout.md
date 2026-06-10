# Journal: 260610 meta-state-patch wire-format recursion closeout

## Summary

Shipped the `unwrapItemWrap` helper in `tool-registry.js#coerceParamsToSchema` to fix the wire-format recursion bug where `meta_state_patch` corrupted array values by storing them as `{item: [...]}` when the `patch` object contained both arrays and scalars. The fix is typeName-gated (ZodArray or ZodObject only) with a 3-iteration inline bound. Zero changes to `meta-state-patch-tool.js` (passthrough stays until Bridge 5). `MAX_RECURSION_DEPTH` remains at 2 (no depth bump). 4 regression tests were added in `__tests__/wire-format-patch-recursion.test.js`. Bridge 5 (schema as source of truth) was deferred to a new loop-design entry.

## Mutations applied

1. `meta_state_log_change` — `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem` (hot fix ship + supersedes stale change-log #510)
2. `meta_state_propose_design` — `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (Bridge 5 deferral)
3. `meta_state_patch` — `meta-260610T0115Z-...` (updated `evidence_code_ref` to fix site)
4. `meta_state_ack` — `meta-260610T0115Z-...` (reported → active)
5. `meta_state_refresh_fingerprint` — `meta-260610T0115Z-...` (refreshed after code edit)
6. `meta_state_check_grounding` — `meta-260610T0115Z-...` (verified grounded)
7. `meta_state_resolve` — `meta-260610T0115Z-...` (active → resolved)
8. `meta_state_patch` — `loop-design-meta-state-patch-wire-format-recursion` (active → inactive, shipped_in_plan populated, addresses: [] round-trips flat)

## Test count

902/902 passing (898 baseline + 4 new regression tests).

## Notable deviation from plan

- Test 1.5 used `proposed_design_for: ["a"]` instead of `[]` because the `meta_state_propose_design` schema enforces `.min(1)` on that field. The empty-array edge case was still fully exercised on `addresses: { item: [] }`.
- Tests 3 and 1.5 used in-process `coerceParamsToSchema` calls with the real `metaStateProposeDesignTool.schema` instead of stdio transport, because the MCP SDK validates array types at the stdio layer and rejects `{item: [...]}` objects before they reach the handler.
- Step 2 (Bridge 5 deferral) used `meta_state_propose_design` as planned (Test 1.5 passed, so no `log_change` fallback was needed).

## Pre-existing unrelated issues

- `pnpm generate:capabilities --dry-run` reports drift (capability-tanstack-macro-render vs capability-fastapi-fundamental-rest) — pre-existing, unrelated to this plan.

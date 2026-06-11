# MCP wire-format coercion fix

Date: 2026-06-11
Plan: plans/260611-2230-mcp-wire-format-coercion-fix/plan.md

## What changed

Fixed the MCP stdio wire-format coercion bug that rejected valid top-level array and boolean arguments before they reached the tool handlers.

Code changes:
- `tools/learning-loop-mcp/tool-registry.js` now exports `installWireFormatCoercion(server, root)`. It patches `McpServer.validateToolInput` to run `coerceParamsToSchema` before the MCP SDK's Zod parse. `registerTool` captures the registered tool object and attaches `_coerceSchema = config.schema`.
- `tools/learning-loop-mcp/server.js` calls `installWireFormatCoercion` immediately after creating the `McpServer` instance.
- `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` adds 6 TDD tests: 4 stdio regression tests for `{item: [...]}` array unwrap and `"true"`/`"false"` boolean coercion, 1 `tools/list` schema-preservation test, and 1 unit test confirming the patch guard works.

Meta-state closeout:
- Created change-log `meta-260611T2256Z-tools-learning-loop-mcp-tool-registry-js-installwireformatco`.
- Patched target finding `meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo` evidence_code_ref to the fix site.
- Refreshed fingerprint and verified grounding passes.
- Resolved the target finding.
- Refreshed fingerprint for `meta-260606T0142Z-mcp-connection-missing`, which drifted because the fix touched `server.js`.
- Re-emitted `meta-260610T1457Z` as loop-design `loop-design-id-addressed-meta-state-list` (after correcting `proposed_design_for` to empty array to satisfy the cold-tier no-broken-refs invariant).

## Verification

- `pnpm test`: 954 pass / 0 fail / 1 skipped.
- `pnpm validate:records`: passed (only pre-existing timestamp-format warnings).
- `pnpm validate:plan-loop`: 96 plans checked, 0 violations.

Note: `pnpm check` fails on `generate:capabilities --dry-run` due to pre-existing tanstack/fastapi capability drift unrelated to this plan.

## Key decisions

- Chose instance-level patching of `validateToolInput` over `z.preprocess` to preserve the real JSON schemas advertised by `tools/list`.
- Kept handler-level `coerceParamsToSchema` as a defensive fallback.
- Used an explicit `loop_design_id` for the re-emitted design to avoid title-collision idempotency issues, then patched `proposed_design_for` to empty after discovering the cold-tier invariant rejects code-symbol refs in that field.

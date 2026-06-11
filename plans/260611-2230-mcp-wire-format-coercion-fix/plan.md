---
title: "Fix MCP top-level array/boolean wire-format coercion (meta-260610T1458Z)"
description: "Installs wire-format coercion before MCP SDK validation so top-level arrays and booleans round-trip correctly over stdio. Closes meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo and its reopened parent meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g. 3-phase TDD: red stdio tests, green patch of McpServer.validateToolInput, closeout with fingerprint refresh and finding resolution."
status: pending
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, wire-format, coercion, tdd]
blockedBy: []
blocks: []
created: "2026-06-11T15:28:56.973Z"
createdBy: "ck:plan"
source: skill
related:
  - meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo (active; target finding to resolve)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (resolved; reopened by target finding)
  - meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o (stale; optional re-emission as loop-design after fix)
  - plans/260610-meta-state-patch-wire-format-recursion/plan.md (precedent; shipped unwrapItemWrap helper in tool-registry.js#coerceParamsToSchema)
  - plans/260610-1535-meta-state-reopen-path/plan.md (precedent; cascade resolve semantics)
  - tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema (existing coercion helper; runs too late today)
  - tools/learning-loop-mcp/tool-registry.js#registerTool (where _coerceSchema is attached)
  - tools/learning-loop-mcp/server.js (where McpServer.validateToolInput is patched)
  - tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js (failing tool: top-level arrays)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (failing tool: top-level boolean)
---

# Fix MCP top-level array/boolean wire-format coercion (meta-260610T1458Z)

## Overview

The MCP server's tool input validation rejects valid arguments before they reach our coercion helper.

- `meta_state_propose_design` with `proposed_design_for: ["x"]` or `addresses: ["y"]` fails with "expected array, received object" because the stdio transport delivers the array wrapped as `{item: [...]}` and the MCP SDK validates the schema before calling our handler.
- `meta_state_report` with `mechanism_check: false` fails with "expected boolean, received string" because the boolean is stringified on the wire and the SDK rejects it before our handler can coerce it.

The existing `coerceParamsToSchema` helper in `tool-registry.js` correctly unwraps `{item: [...]}` and coerces `"true"`/`"false"` to booleans, but it runs inside the wrapped handler *after* the SDK has already rejected the input.

This plan moves coercion to the SDK's validation boundary by patching `McpServer.validateToolInput` to run `coerceParamsToSchema` before the original Zod parse. The fix is intentionally minimal and preserves the advertised `tools/list` schemas (unlike a `z.preprocess` wrapper, which collapses the JSON schema to an empty object).

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Pending | ~1h | — |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Pending | ~0.75h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Pending | ~0.75h | Phase 2 |

**Total effort:** ~2.5h

## Phasing Rationale

TDD structure locks the failing behavior first. Phase 1 adds stdio regression tests that reproduce the exact errors from the finding. Phase 2 is the smallest possible code change: a boundary patch in `server.js` plus a `_coerceSchema` attachment in `tool-registry.js#registerTool`. Phase 3 resolves the target finding with the canonical fingerprint sequence and optionally migrates the stale id-addressed-list finding to a proper loop-design entry.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Coercion point | Patch `McpServer.validateToolInput` instance method | The SDK validates before the handler; coercion must run before validation. This is the only single-point fix that covers normal calls and task polling. |
| Schema preservation | Keep real schema registered with SDK; attach raw shape as `_coerceSchema` | `tools/list` continues to advertise accurate JSON schemas. A `z.preprocess` wrapper was evaluated and rejected because it causes `normalizeObjectSchema` to return `undefined`, collapsing the advertised schema to `{}`. |
| Defensive fallback | Keep `coerceParamsToSchema` in `wrappedHandler` | If the SDK method is renamed in a future version, the handler-level coercion still works for passthrough-shaped inputs. |
| Patch scope | Instance-level, not prototype-level | Minimizes blast radius; other `McpServer` instances in the same process are unaffected. |
| Top-level only | Do not recurse into nested objects beyond existing `MAX_RECURSION_DEPTH` | The bug is top-level array/boolean parameters on tool schemas. Nested arrays inside object fields already work. |
| Optional Layer 3 | Re-emit `meta-260610T1457Z` as a loop-design only if stdio test passes | The finding explicitly asks for adoption of adjacent designs, but it is conditional on the fix actually working. |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (~180 lines; 4 stdio regression tests)
- **Modify:**
  - `tools/learning-loop-mcp/server.js` (~10 lines: import `installWireFormatCoercion`, call it after `new McpServer`)
  - `tools/learning-loop-mcp/tool-registry.js` (~25 lines: export `installWireFormatCoercion`, attach `_coerceSchema` in `registerTool`)
  - `meta-state.jsonl` (1 change-log entry + 1 evidence_code_ref patch + 1 fingerprint refresh + 1 check_grounding + 1 resolve)
- **Unchanged (explicit):**
  - `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` (schema stays strict; coercion fixes the wire format)
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (schema stays strict)
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (passthrough schema already works)

## Out of Scope

- **Bridge 5 (schema as source of truth):** deferred; this plan is a hot fix in the registration layer.
- **Implementing the id-addressed list design:** the actual `meta_state_list` id filter is out of scope; only the optional re-filing of the existing design record as a loop-design is in scope.
- **Fixing the MCP SDK itself:** we patch our usage boundary, not the vendor package.
- **Changing individual tool schemas to accept wire-corrupted shapes:** rejected because it pollutes the schema surface.
- **Replacing `coerceParamsToSchema` with `z.preprocess`:** rejected because it breaks `tools/list` JSON schemas.

## Success Criteria (Plan-Level)

- [ ] `meta_state_propose_design` via stdio with `proposed_design_for: {item: ["rule-A"]}` and `addresses: {item: ["finding-C"]}` succeeds and stores flat arrays.
- [ ] `meta_state_propose_design` via stdio with `proposed_design_for: {item: []}` and `addresses: {item: []}` succeeds and stores flat empty arrays.
- [ ] `meta_state_report` via stdio with `mechanism_check: "true"` stores boolean `true`.
- [ ] `meta_state_report` via stdio with `mechanism_check: "false"` stores boolean `false`.
- [ ] Existing `wire-format-coercion-fix.test.js` and `wire-format-patch-recursion.test.js` still pass.
- [ ] `tools/list` still advertises the real input schemas for `meta_state_propose_design` and `meta_state_report`.
- [ ] `meta-260610T1458Z` `evidence_code_ref` updated to the fix site before fingerprint refresh.
- [ ] `meta-260610T1458Z` fingerprint refreshed and grounding check passes.
- [ ] `meta-260610T1458Z` resolved with structural justification.
- [ ] `pnpm test` green.
- [ ] `pnpm validate:records` green.

## Dependencies

No external plan dependencies. This plan depends only on existing primitives (`coerceParamsToSchema`, `registerTool`, `McpServer.validateToolInput`, `meta_state_patch`, `meta_state_refresh_fingerprint`, `meta_state_check_grounding`, `meta_state_resolve`).

## Risks

1. **SDK method renamed or signature change.** `McpServer.validateToolInput` is an instance method. If a future SDK version renames it, the patch silently does nothing and the original handler-level coercion remains as fallback for passthrough schemas. Non-passthrough tools would re-break. **Mitigation:** keep `coerceParamsToSchema` in `wrappedHandler`; add a runtime guard in `installWireFormatCoercion` that asserts `server.validateToolInput` is wrapped and logs/throws if not; add a unit test that creates an `McpServer`, installs coercion, and asserts `server.validateToolInput !== originalValidateToolInput`.
2. **Double coercion logs.** Coercion runs in both `validateToolInput` and `wrappedHandler`. The second pass is a no-op and does not emit `wire_format_coerced` because `coerceParamsToSchema` preserves identity when no field changes. **Mitigation:** verified by existing identity-preservation test; no code change needed.
3. **`tools/list` schema drift.** If the patch accidentally changes the registered schema, clients will see empty schemas. **Mitigation:** the registered schema is unchanged; Phase 1 includes a test that calls `tools/list` and asserts the schema for `meta_state_propose_design` still contains `proposed_design_for` and `addresses` array fields.
4. **Cascade resolve confusion.** The target finding `reopens` its parent, which is already `resolved`. Resolving the child does not need `cascade_from` because the parent is terminal. **Mitigation:** resolve the child normally; do not attempt to cascade-close a terminal parent.
5. **Optional Layer 3 fails.** If the id-addressed-list finding cannot be cleanly re-emitted as a loop-design (e.g., title collision), the optional step is skipped and a note is added to the finding description instead. **Mitigation:** make the step conditional and log the fallback.

## Validation Criteria

- `pnpm test` green (existing 900+ tests + 4 new stdio tests).
- `pnpm validate:records` green.
- Manual: `meta_state_propose_design` via Droid/Claude Code with real arrays succeeds.
- Manual: `tools/list` response for `meta_state_propose_design` still shows array-typed `proposed_design_for` and `addresses`.

## Related Plans

- `plans/260610-meta-state-patch-wire-format-recursion/` — shipped the `unwrapItemWrap` helper that this plan reuses. The prior fix addressed read-side recursion for passthrough objects; this plan fixes the input-side rejection for typed top-level fields.
- `plans/260610-1535-meta-state-reopen-path/` — established cascade-resolve semantics. Not directly used here because the reopened parent is already terminal.
- `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/` — earlier precedent for TDD closeout of meta-state findings with fingerprint refresh before resolve.

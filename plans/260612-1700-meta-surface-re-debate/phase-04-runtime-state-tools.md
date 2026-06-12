---
phase: 4
title: "Runtime-State-Tools"
status: pending
priority: P1
effort: "4h"
dependencies: [1, 3]
---

# Phase 4: Runtime-State-Tools

## Overview

Add 2 new MCP tools: `runtime_state_read` (read-only, agent-callable, queries the sidecar) and `runtime_state_record` (operator-preflighted, not agent-callable, appends to the sidecar). Both tools follow the same Zod schema pattern as the existing `meta_state_*` tools. **No `core/derivation/derive-capabilities.js` file is created** (per operator adjudication 2026-06-12 22:35; the 3 `capability_*` tools are deleted in Phase 7 with no replacement).

## Requirements

- Functional:
  - `runtime_state_read` accepts `affected_system`, `kind`, `since`, `until` filters and returns matching rows
  - `runtime_state_record` is registered in `tools/manifest.json` and `agent-manifest.json` but gated by `gate_mark_preflight` (operator-only)
  - The bash-gate intercepts `runtime_state_record` invocations via the new `side-effect-import` pattern (Phase 6 adds the pattern; Phase 4 stubs the call site)
  - Both tools reuse the wire-format coercion helpers from `tool-registry.js#coerceParamsToSchema` + `installWireFormatCoercion`
- Non-functional:
  - No agent can call `runtime_state_record` without an active preflight marker
  - All agent calls to `runtime_state_read` are read-only (no `runtime_state.jsonl` writes from the agent)
  - The tools' Zod schemas validate against `schemas/runtime-state.schema.json`

## Architecture

**`runtime_state_read` is grouped with `introspection`.** The agent surface (`agent-manifest.json#groups.introspection`) currently has 2 tools (`loop_describe`, `loop_get_instruction`). Phase 4 adds `runtime_state_read` here because the read pattern is similar to `loop_describe` (tiered query).

**`runtime_state_record` is grouped with `gate`.** The `gate` group currently has 2 tools (`gate_check`, `gate_mark_preflight`). Phase 4 adds `runtime_state_record` here because it is operator-mediated and gated.

**The bash-gate pattern (Phase 6) intercepts the tool invocation.** When the agent calls `runtime_state_record` (via `Bash`/`Execute` with a script that calls the tool), the bash-gate's new `side-effect-import` pattern matches and returns `decision: 'block'` if no preflight marker exists. The JSONL write is a side-effect, not a primary action.

## Related Code Files

- Create: `tools/learning-loop-mcp/tools/runtime-state-read-tool.js`
- Create: `tools/learning-loop-mcp/tools/runtime-state-record-tool.js`
- Create: `tools/learning-loop-mcp/tools/runtime-state-read-tool.test.js`
- Create: `tools/learning-loop-mcp/tools/runtime-state-record-tool.test.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` (add 2 entries)
- Modify: `tools/learning-loop-mcp/agent-manifest.json` (add 2 entries; move `runtime_state_record` to `gate` group, `runtime_state_read` to `introspection` group)

## Implementation Steps

1. **Read existing tool patterns.** Read `tools/learning-loop-mcp/tools/meta-state-list-tool.js` and `tools/learning-loop-mcp/tools/gate-tool.js` to match the Zod + execute + error handling pattern.
2. **Write `tools/learning-loop-mcp/tools/runtime-state-read-tool.js`.** Input schema: `affected_system: z.enum([...]).optional()`, `kind: z.enum(['ledger-event', 'budget-state']).optional()`, `since: z.string().datetime().optional()`, `until: z.string().datetime().optional()`, `limit: z.number().int().min(1).max(1000).default(100)`. Execute: read `runtime-state.jsonl` (LRU-cached), filter by the input args, return matching rows.
3. **Write `tools/learning-loop-mcp/tools/runtime-state-record-tool.js`.** Input schema: `affected_system: z.enum([...])`, `kind: z.enum(['ledger-event', 'budget-state'])`, `id: z.string()`, `value: z.number().nullable()`, `delta: z.number().nullable()`, `source_ref: z.string().regex(/^local:meta-state:.+$/)`, `timestamp: z.string().datetime()`, `metadata: z.record(z.unknown()).optional()`. Execute: check for preflight marker (`.claude/coordination/.loop-preflight-runtime-state`); if missing, return `{ error: 'preflight_required' }`; if present, append the row to `runtime-state.jsonl` with computed `fingerprint` and return `{ ok: true, id }`.
4. **Update `tools/manifest.json`.** Add 2 entries: `{ "file": "./tools/runtime-state-read-tool.js", "export": "runtimeStateReadTool" }`, `{ "file": "./tools/runtime-state-record-tool.js", "export": "runtimeStateRecordTool" }`.
5. **Update `agent-manifest.json`.** Add `runtime_state_read` to the `introspection` group; add `runtime_state_record` to the `gate` group.
6. **Add tests.** `runtime-state-read-tool.test.js`: 3+ tests (read with `affected_system: 'vnstock'` returns 18 rows from Phase 2; read with `kind: 'budget-state'` returns 0 rows; read with invalid `affected_system` rejects). `runtime-state-record-tool.test.js`: 3+ tests (record with preflight marker succeeds; record without preflight marker returns `preflight_required`; record with invalid `source_ref` rejects).
7. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [ ] `tools/learning-loop-mcp/tools/runtime-state-read-tool.js` exists and registers as `runtimeStateReadTool`.
- [ ] `tools/learning-loop-mcp/tools/runtime-state-record-tool.js` exists and registers as `runtimeStateRecordTool`.
- [ ] `tools/manifest.json` has 2 new entries.
- [ ] `agent-manifest.json` has `runtime_state_read` in `introspection` group and `runtime_state_record` in `gate` group.
- [ ] `runtime_state_read` returns 18 rows when called with `affected_system: 'vnstock'`.
- [ ] `runtime_state_record` returns `{ error: 'preflight_required' }` when no preflight marker exists.
- [ ] `__tests__/runtime-state-*-tool.test.js` tests pass (6+ new tests).
- [ ] `pnpm test` passes 995+ tests (985 + 10 new from Phases 1-4).

## Risk Assessment

- **High: preflight marker is a substrate carry-over; the meta-surface does not require it.** Mitigation: the preflight is a defensive measure for the operator-mediated write, consistent with the existing `gate_mark_preflight` pattern. The meta-surface writes (`meta_state_*`) do not require preflight because they go through the meta-surface tools, not the sidecar.
- **Medium: `runtime_state_record` is the only way to write to the sidecar.** Mitigation: this is intentional. The sidecar is operator-mediated; agents can only query. The bash-gate pattern (Phase 6) enforces this at the bash-invocation layer.
- **Low: `runtime_state_read` exposes mutable state to the agent, which may write it back as a "fact".** Mitigation: the read returns a `status: 'active' | 'cleared' | 'reconciled'` field; the agent's prompt engineering (not the tool) is responsible for treating the value as a snapshot, not a record. The `__tests__` cover the read behavior.

# 260608 — meta_state_patch tool + wire-format coercion fix closeout

Plan: `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/`

## What shipped

1. **`meta_state_patch` MCP tool** (`tools/learning-loop-mcp/tools/meta-state-patch-tool.js`)
   - Thin wrapper over `core/meta-state.js#updateEntry` with CAS via `_expected_version`
   - Deny-list guards identity/audit-trail fields (id, version, created_at, code_fingerprint, etc.)
   - Auto-captures `_expected_version` from pre-read if omitted (race safety)
   - Unifies the 4 documented escape-hatch use cases: update finding, update loop-design, backfill fingerprint, refresh evidence_code_ref

2. **`coerceParamsToSchema` helper** (`tools/learning-loop-mcp/tool-registry.js`)
   - Re-hydrates top-level array/boolean/number params coerced by MCP SDK wire framing
   - Identity-preserving (returns original `args` reference when no coercion happened)
   - Recursive walk into nested passthrough objects (depth-limited)
   - Zod 4.4.3 compatible (falls back to `constructor.name` when `_def.typeName` is undefined)
   - Fixes `meta_state_propose_design`, `meta_state_report`, and `meta_state_patch` simultaneously

3. **Registry updates**
   - Change-log entry filed: `meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js`
   - CRUD finding resolved: `meta-260608T0848Z-crud-coverage-gap-...` (ack → check_grounding → resolve)
   - Fingerprints refreshed for findings referencing modified files (`server.js`, `AGENTS.md`)
   - AGENTS.md updated with canonical rule: use `meta_state_patch`, not `node -e` escape hatch

## TDD execution

- Phase 1 (Red): 12 failing tests written before any production code
- Phase 2 (Green): minimal implementation to make tests pass
- Phase 3 (Closeout): exercised the new tool on live registry

## Test results

- 12 new tests: 7 patch tool + 5 wire-format coercion — all pass
- Full suite: 852/852 pass
- `validate:records`: 183 records validated
- `validate:plan-loop`: 83 plans, 0 violations

## Notable deviation from plan

The plan's success criterion `loop-design-cross-reference-fields.proposed_design_for = ["meta_state_patch"]` was attempted but reverted because `meta_state_patch` is a tool name, not a registry entry ID, and the `fix-loop-design-refs` validation rejects it. The tool was still successfully exercised (patched and reverted, version incremented from 3 → 6).

## Pre-existing unrelated issue

`pnpm generate:capabilities --dry-run` fails due to product capability drift (TanStack/FastAPI surfaces). This predates this plan and is out of scope.

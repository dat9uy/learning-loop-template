---
title: "meta_state_patch MCP tool + tool-registry wire-format coercion fix"
description: "Ships meta_state_patch (a thin MCP wrapper over the existing updateEntry primitive with CAS) and a generic coerceParamsToSchema helper in tool-registry.js that re-hydrates top-level array/boolean/number params coerced by MCP SDK wire framing. Closes meta-260608T0848Z-crud-coverage-gap, the parent meta-260606T2102Z escape-hatch abuse (lineage preserved via change-log), and the wire-format coercion root cause meta-260606T2202Z transitively. 10 new tests, 1 new tool, 1 generic helper, 1 supersede narrative, 1 loop-design update (the recursive proof)."
status: pending
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, crud, escape-hatch, wire-format, coercion, zod, mcp-sdk, tdd]
blockedBy: []
blocks: []
created: "2026-06-08T03:04:31.252Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260608-1015-meta-state-patch-tool-and-wire-format-fix.md (design source)
  - meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre (closed by Phase 3)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (parent; lineage preserved)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (closed transitively by Phase 2 wire-format fix)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe (closed transitively by CAS idempotency)
  - loop-design-cross-reference-fields (Phase 3 update; proposed_design_for populated)
  - plans/260606-rule-loop-design-first-class/plan.md (precedent plan with 5-phase TDD)
  - plans/260606-rule-loop-design-first-class/phase-03-propose-design-tool-tdd.md (template for new tool phase)
  - tools/learning-loop-mcp/core/meta-state.js#updateEntry (primitive; no new core logic)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntryPatchSchema (z.object({}).passthrough())
  - tools/learning-loop-mcp/tool-registry.js#registerTool#wrappedHandler (wire-format fix point)
  - tools/learning-loop-mcp/tools/manifest.json (registration of new tool)
  - tools/learning-loop-mcp/agent-manifest.json (meta_state group registration)
---

# meta_state_patch MCP tool + tool-registry wire-format coercion fix

## Overview

The `meta_state_*` MCP tool surface covers Create, Read, and (partially) Resolve, but lacks Update/Patch on existing entries. This forces agents to use the `node -e "import('#mcp/core/meta-state.js')"` escape hatch for any field-level update (backfill fingerprint, edit loop-design `addresses`, refresh `evidence_code_ref`, etc.). The recursion is breaking the system right now: filing the CRUD finding required using the escape hatch the finding describes.

This plan ships two coupled fixes in a 3-phase TDD structure:

1. **`meta_state_patch` MCP tool** — thin wrapper over `core/meta-state.js#updateEntry` (which already has CAS via `_expected_version` and a per-root write queue). Unifies the 4 documented escape-hatch use cases.
2. **Wire-format coercion fix in `tool-registry.js#registerTool`** — generic `coerceParamsToSchema` helper that walks each tool's Zod schema and re-hydrates coerced top-level array/boolean/number values. Fixes all 3 affected tools (propose_design, report, patch) and any future tool that has complex-typed top-level fields.

Plus: `meta-260606T2102Z` lineage preserved via change-log, `loop-design-cross-reference-fields` updated to populate `proposed_design_for` (the recursive proof), and the CRUD finding resolved with the supersede narrative.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Pending | ~1.5h | — |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Pending | ~1h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Pending | ~0.5h | Phase 2 |

**Total effort:** ~3h

## Phasing Rationale

TDD structure locks current behavior before changes. Phase 1 is tests-only (10 new tests, all red/failing initially). Phase 2 implements just enough to make tests pass (minimal new code: 1 new tool + 1 generic helper). Phase 3 is the closeout work that exercises the new tool (loop-design update via patch), files the lineage change-log, and resolves the originating finding. This matches the precedent set by `plans/260606-rule-loop-design-first-class/plan.md` (which shipped 4 entry kinds + propose_design tool over 5 TDD phases).

## Key Design Decisions (locked in brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | `meta_state_patch` only (no propose_design update mode) | Lowest blast radius; unifies 4 use cases; CAS handles retry-loop class |
| Wire-format | Server-level fix in `tool-registry.js` | Generic; fixes all 3 affected tools at once; ~50 lines |
| Lineage | Resolve CRUD with supersede pointing at 2102Z | Preserves 2-day lineage via change-log |
| Plan mode | `--tdd` | Strong existing test coverage (840+ tests); refactor of critical primitive |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (~80 lines)
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` (~150 lines)
  - `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` (~80 lines)
- **Modify:**
  - `tools/learning-loop-mcp/tool-registry.js` (add `coerceParamsToSchema` + wire into `wrappedHandler`; add `root` param)
  - `tools/learning-loop-mcp/server.js` (pass `root` to `registerTool`)
  - `tools/learning-loop-mcp/tools/manifest.json` (1 new entry)
  - `tools/learning-loop-mcp/agent-manifest.json` (1 new entry in `meta_state` group)
  - `meta-state.jsonl` (1 change-log + 1 resolve + 1 loop-design update)
- **Delete:** None

## Out of Scope (Deferred)

- `meta_state_propose_design` `update_or_create` mode (separate scope, separate plan)
- `meta_state_archive` / `meta_state_undo_resolve` (full CRUD coverage)
- TTL redesign (`meta-260608T0847Z-ttl-expire-system-...`) — separate finding, separate plan
- Auth/role system for `meta_state_patch` (currently any agent can patch any entry)
- Schema migrations for the 4 existing meta-state tools beyond what the wire-format fix provides

## Success Criteria (Plan-Level)

- [ ] All 840+ existing tests pass
- [ ] 10 new tests pass (6 patch tool + 4 wire-format coercion)
- [ ] `meta_state_propose_design` and `meta_state_report` no longer reject top-level array/boolean params (verified by new wire-format tests + regression test on existing tools)
- [ ] The 4 documented escape-hatch use cases can be done via `meta_state_patch` (no `node -e` escape hatch)
- [ ] `loop-design-cross-reference-fields.proposed_design_for` = `["meta_state_patch"]`
- [ ] `meta-260608T0848Z-crud-coverage-gap-...` resolved with supersede narrative pointing at 2102Z
- [ ] 2102Z lineage preserved in the new change-log
- [ ] `pnpm check` passes (validate records + extract index + tests)
- [ ] **Cold-session test is NOT a precondition** for this plan — it gates the *resolution* of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` (a different bug class: agent tool list loading, not wire-format coercion). The wire-format fix is a pure function verified by the 4 unit tests in Phase 1. The cold-session test should still pass after the plan (the patch tool is added to the manifest, not the connection layer); if it doesn't, that's a separate finding.

## Dependencies

No external plan dependencies. This plan is self-contained; it depends only on existing primitives (`updateEntry`, `appendGateLog`, `resolveRoot`).

## Risks (Top 3)

1. **Zod schema introspection fragility** — `coerceParamsToSchema` uses `fieldSchema._def.typeName` (technically private API, but stable in Zod 3.x → 4.x). Mitigation: try/catch + return `args` unchanged on failure; test against actual Zod 4.4.3.
2. **Wire-format fix could mask real bugs** — a tool declaring `z.array(...)` for a field that should accept a string. Mitigation: helper only coerces when declared type is array/boolean/number and value arrived as string; `wire_format_coerced` log line is a backstop.
3. **Test interference with the live registry** — new tests need isolation. Mitigation: mirror the existing `mkdtempSync`/`tmpdir()` pattern from `meta-state.test.js`.

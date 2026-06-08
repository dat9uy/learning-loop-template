---
title: "meta_state_patch MCP tool + tool-registry wire-format coercion fix"
description: "Ships meta_state_patch (a thin MCP wrapper over the existing updateEntry primitive with CAS) and a generic coerceParamsToSchema helper in tool-registry.js that re-hydrates top-level array/boolean/number params coerced by MCP SDK wire framing. Closes meta-260608T0848Z-crud-coverage-gap (CRUD coverage); addresses the structural gap documented in meta-260606T2102Z (escape-hatch abuse) and meta-260606T2202Z (wire-format coercion root cause) — both of which are already auto-resolved as of 2026-06-08T01:11:42.524Z. 12 new tests, 1 new tool, 1 generic helper, 1 named closeout script, 1 loop-design update (the recursive proof)."
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
  - meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre (resolved by Phase 3, after ack → check_grounding → refresh_fingerprint sequence per F11)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (auto-resolved 2026-06-08T01:11:42.524Z; this plan addresses the STRUCTURAL gap, not the finding itself)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (auto-resolved 2026-06-08T01:11:42.524Z; wire-format coercion root cause fixed transitively by Phase 2 coerceParamsToSchema)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe (auto-resolved 2026-06-08T01:11:42.524Z; this plan does NOT add dedup guards to meta_state_log_change — out of scope; CAS in meta_state_patch addresses the structural duplicate-entry class for updates, not the log_change duplicate-entry class)
  - loop-design-cross-reference-fields (Phase 3 update; proposed_design_for populated to ["meta_state_patch"] — the recursive proof)
  - plans/260606-rule-loop-design-first-class/plan.md (precedent plan with 5-phase TDD)
  - plans/260606-rule-loop-design-first-class/phase-03-propose-design-tool-tdd.md (template for new tool phase)
  - tools/learning-loop-mcp/core/meta-state.js#updateEntry (primitive; no new core logic in updateEntry itself, but the patch tool adds a deny-list and fail-safe on the return value)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntryPatchSchema (z.object({}).passthrough(); patch tool adds handler-level deny-list per F4)
  - tools/learning-loop-mcp/tool-registry.js#registerTool#wrappedHandler (wire-format fix point; helper added with identity-preservation per F1, recursive walk into passthrough per F8, ZodDefault unwrap per F15)
  - tools/learning-loop-mcp/tools/manifest.json (registration of new tool)
  - tools/learning-loop-mcp/agent-manifest.json (meta_state group registration)
---

# meta_state_patch MCP tool + tool-registry wire-format coercion fix

## Overview

The `meta_state_*` MCP tool surface covers Create, Read, and (partially) Resolve, but lacks Update/Patch on existing entries. This forces agents to use the `node -e "import('#mcp/core/meta-state.js')"` escape hatch for any field-level update (backfill fingerprint, edit loop-design `addresses`, refresh `evidence_code_ref`, etc.). The recursion is breaking the system right now: filing the CRUD finding required using the escape hatch the finding describes.

This plan ships two coupled fixes in a 3-phase TDD structure:

1. **`meta_state_patch` MCP tool** — thin wrapper over `core/meta-state.js#updateEntry` (which already has CAS via `_expected_version` and a per-root write queue). Unifies the 4 documented escape-hatch use cases.
2. **Wire-format coercion fix in `tool-registry.js#registerTool`** — generic `coerceParamsToSchema` helper that walks each tool's Zod schema and re-hydrates coerced top-level array/boolean/number values. Fixes all 3 affected tools (propose_design, report, patch) and any future tool that has complex-typed top-level fields.

Plus: 2102Z/2202Z/2106Z lineage referenced in the new change-log (factually: those findings auto-resolved at 2026-06-08T01:11:42.524Z; this plan addresses the structural gap, not the findings themselves), `loop-design-cross-reference-fields` updated to populate `proposed_design_for` (the recursive proof), and the CRUD finding resolved with the resolve narrative (per F12, "Resolved:" not "Superseded by:").

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Pending | ~1.5h | — |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Pending | ~1h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Pending | ~0.5h | Phase 2 |

**Total effort:** ~3h

## Phasing Rationale

TDD structure locks current behavior before changes. Phase 1 is tests-only (12 new tests, all red/failing initially). Phase 2 implements just enough to make tests pass (minimal new code: 1 new tool + 1 generic helper). Phase 3 is the closeout work that exercises the new tool (loop-design update via patch), files the lineage change-log, and resolves the originating finding. This matches the precedent set by `plans/260606-rule-loop-design-first-class/plan.md` (which shipped 4 entry kinds + propose_design tool over 5 TDD phases).

## Key Design Decisions (locked in brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | `meta_state_patch` only (no propose_design update mode) | Lowest blast radius; unifies 4 use cases; CAS handles retry-loop class |
| Wire-format | Server-level fix in `tool-registry.js` | Generic; fixes all 3 affected tools at once; ~50 lines |
| Lineage | Resolve CRUD with "Resolved:" narrative (F12 fix); 2102Z/2202Z/2106Z already auto-resolved | Structural gap closed; lineage referenced in new change-log |
| Plan mode | `--tdd` | Strong existing test coverage (487+ tests); refactor of critical primitive |

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

- [ ] All 487+ existing tests pass
- [ ] 12 new tests pass (7 patch tool + 5 wire-format coercion)
- [ ] `meta_state_propose_design` and `meta_state_report` no longer reject top-level array/boolean params (verified by new wire-format tests + real-schema regression test)
- [ ] The 4 documented escape-hatch use cases can be done via `meta_state_patch` (no `node -e` escape hatch)
- [ ] `loop-design-cross-reference-fields.proposed_design_for` = `["meta_state_patch"]`
- [ ] `meta-260608T0848Z-crud-coverage-gap-...` resolved after explicit ack → check_grounding → refresh_fingerprint sequence (per F11)
- [ ] No `node -e "import('./...')"` escape-hatch usage in any closeout step (per F3; all calls go through canonical tools via the named `tools/scripts/closeout-260608-1015-patch-loop-design.mjs` script)
- [ ] `pnpm check` passes (validate records + extract index + tests)
- [ ] **Cold-session test is NOT a precondition** for this plan — it gates the *resolution* of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` (a different bug class: agent tool list loading, not wire-format coercion). The wire-format fix is a pure function verified by the 5 unit tests in Phase 1 (including the real-schema regression per F7). The cold-session test should still pass after the plan (the patch tool is added to the manifest, not the connection layer); if it doesn't, that's a separate finding.

## Dependencies

No external plan dependencies. This plan is self-contained; it depends only on existing primitives (`updateEntry`, `appendGateLog`, `resolveRoot`).

## Risks (Top 3)

1. **Zod schema introspection fragility** — `coerceParamsToSchema` uses `fieldSchema._def.typeName` (technically private API, but stable in Zod 3.x → 4.x). Mitigation: F7 fix — fall back to `fieldSchema.constructor.name` if `_def` is missing; log `coercion_introspection_failed` event so silent no-op is visible. Real-schema regression test (Phase 1.3 Test 5) covers Zod 4.4.3 specifically.
2. **Wire-format fix could mask real bugs** — a tool declaring `z.array(...)` for a field that should accept a string. Mitigation: helper only coerces when declared type is array/boolean/number and value arrived as string. F6 fix — number coercion uses `parseFloat` + regex `^-?\d+(\.\d+)?$` to reject empty strings (which would otherwise silently become 0 via `Number("")`). F1 fix — helper returns `args` identity when no coercion happened, so `wire_format_coerced` log fires only for true coercions (no log flooding).
3. **Test interference with the live registry** — new tests need isolation. Mitigation: mirror the existing `mkdtempSync`/`tmpdir()` pattern from `meta-state.test.js`. Phase 1.1 documents this in the setup step.

## Red Team Review

### Session — 2026-06-08

**Reviewers:** 3 parallel hostile lenses (Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Verification tier:** Standard (3 phases) — Fact Checker + Contract Verifier
**Findings:** 15 total (4 Critical, 7 High, 4 Medium), all evidence-backed with `file:line` citations
**Disposition:** 15 Accept, 0 Reject, 0 Modified
**Report:** `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/reports/from-code-reviewer-to-planner-red-team-consolidated-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Test 4 (no-op identity) mathematically impossible — Phase 2 will never go green | Critical | Accept | Phase 1.3 Test 4, Phase 2.1 helper |
| F2 | Test 4 (change-log immutability) unreachable via Zod enum | Critical | Accept | Phase 1.2 Test 4, Phase 2.4 schema enum |
| F3 | Phase 3.1 uses `node -e` — the very escape-hatch pattern the plan retires | Critical | Accept | Phase 3.1, 3.2, 3.3 (named closeout script) |
| F4 | `passthrough()` + no auth + no field-level guards = audit-trail rewrite | Critical | Accept | Phase 2.4 handler (deny-list) |
| F5 | `coerceParamsToSchema` is global indiscriminate hammer + log-flood bug | High | Accept | Phase 2.1 (identity preservation), Phase 2.2 (log fire only on true coercion) |
| F6 | `Number("")` silent corruption; "leave as-is" on bad JSON | High | Accept | Phase 2.1 coerceValue (regex + parseFloat) |
| F7 | Tests use mock schemas, not real Zod 4.4.3 | High | Accept | Phase 1.3 Test 5 (real-schema regression), Phase 2.1 (constructor.name fallback) |
| F8 | Wire-format fix doesn't descend into patch tool's nested passthrough | High | Accept | Phase 2.1 (recursive walk with depth limit) |
| F9 | `updateEntry` return-value switch silent fall-through | High | Accept | Phase 2.4 (throw on unknown return) |
| F10 | Optional `_expected_version` is a race footgun | High | Accept | Phase 2.4 (auto-capture from pre-read) |
| F11 | `rule-no-orphaned-evidence` will block Phase 3.3 resolve | High | Accept | Phase 3.3 (ack → check_grounding → refresh → resolve sequence) |
| F12 | Lineage claim FALSE: 2102Z/2202Z/2106Z are already `expired`/`auto-resolved` | Medium | Accept | plan.md `related` frontmatter, Phase 3.3 narrative |
| F13 | Test count "840+" overstated; actual is 487 | Medium | Accept | plan.md (frontmatter + decisions), Phase 2.1 + 2.8 success criteria |
| F14 | Test 1's "version: 0" misleading — only change-log schema has `version` field | Medium | Accept | Phase 1.2 Test 1 (version field note) |
| F15 | `coerceParamsToSchema` doesn't unwrap `ZodDefault` | Medium | Accept | Phase 2.1 unwrapTypeName (ZodDefault, ZodEffects, ZodTransform, ZodLazy) |

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-red-tdd-tests-first.md, phase-02-green-implementation.md, phase-03-refactor-and-closeout.md
- **Decision deltas checked:** 15 (one per accepted finding)
- **Reconciled stale references:**
  - Test count changed from 10 → 12 (6+4 → 7+5): all references in plan.md, phase-01, phase-02, phase-03 updated
  - Test baseline changed from "840+" → "487+": all references in plan.md, phase-01, phase-02, phase-03 updated
  - Schema enum extended to include "change-log": Phase 1.2 Test 4 spec and Phase 2.4 schema both reference this
  - Helper signature now takes `(args, schema, root, depth)`: all call sites in Phase 2.2 wired correctly
  - `_expected_version` is now auto-captured: Phase 3.1 closeout script no longer captures it externally
  - Phase 3.3 resolve narrative uses "Resolved:" not "Superseded by:"
  - Step 3.1, 3.2, 3.3 all use a single named script (`tools/scripts/closeout-260608-1015-patch-loop-design.mjs`); no `node -e` usage
  - `meta_state_ack` is now an explicit prerequisite for `meta_state_resolve` (Step 3.3 sequence)
  - "2102Z lineage preserved via change-log" claim rewritten to factual state: 2102Z/2202Z/2106Z all auto-resolved 2026-06-08T01:11:42.524Z; plan addresses structural gap
- **Unresolved contradictions:** 0

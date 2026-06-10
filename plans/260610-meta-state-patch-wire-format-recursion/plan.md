---
title: "meta_state_patch wire-format recursion hot fix + Bridge 5 deferral"
description: "Closes meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (the meta_state_patch tool corrupts data via {item:[...]} wrapping when patch contains array + scalars, and coerceParamsToSchema does not recurse into passthrough ZodObjects). Ships 1 helper (unwrapItemWrap) in tool-registry.js#coerceParamsToSchema, adds 4 stdio regression tests (3 + 1 pre-validation for empty arrays), and files a separate Bridge 5 loop-design (loop-design-schema-source-of-truth) as pure deferral. Zero changes to meta-state-patch-tool.js — Bridge 5 reads coerceParamsToSchema later and deletes the unwrap branch when schema-derived schemas replace passthrough. Zero constant changes (MAX_RECURSION_DEPTH stays at 2; the 3-iter unwrap bound is inlined)."
status: completed
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, wire-format, recursion, recursion-bug, bridge-5, deferral, tdd, red-team-amended]
red_team_report: plans/reports/red-team-260610-0911-meta-state-patch-wire-format-recursion-report.md
red_team_amendments:
  - "1: Rename new test file .cjs -> .test.js (operator confirmed copy-paste; .cjs files are excluded from pnpm test glob)"
  - "2: Drop MAX_RECURSION_DEPTH 2->3 bump + drop MAX_UNWRAP_ITERATIONS constant (operator confirmed unjustified; YAGNI; 1-place usage)"
  - "3: Add pre-validation for propose_design empty-array shape; if it fails, file Bridge 5 deferral via log_change instead (operator agreed the data-integrity fix pattern is the same anti-pattern)"
  - "4: Add supersedes field to Step 1 change-log to formally correct stale change-log #510 (scouted: meta_state_log_change has supersedes field; canonical pattern)"
  - "5: Step 7 payload includes addresses: [] alongside scalars (Option B: earns the recursive proof framing; empty array exercises unwrap path)"
  - "6: Add a pre-Step-4 evidence_code_ref patch on finding #509 to point to the fix site (file evidence_code_ref is wrong; would hash the wrong file)"
  - "7: Reground Test 1 to patch a loop-design (not a finding); loop-designs have addresses in their schema, findings don't"
blockedBy: []
blocks: []
created: "2026-06-09T19:23:25.371Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md (design source)
  - loop-design-meta-state-patch-wire-format-recursion (closes this active design; status flips active→inactive on ship)
  - meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (closes this reported finding; status flips reported→resolved on ship)
  - meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js (predecessor change-log; meta_state_patch tool shipped 2026-06-08)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (auto-resolved; the structural parent of the wire-format coercion root cause)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (auto-resolved; re-opened briefly during plan 260609-adopt-instruction-layer closeout due to the bug this plan fixes)
  - loop-design-schema-source-of-truth (NEW deferral entry filed by Phase 3)
  - loop-design-cross-reference-fields (shipped; sibling cross-reference design that motivated meta_state_patch)
  - loop-design-instruction-layer (shipped 2026-06-10T01:03:00Z; the design that hit the wire-format bug in Phase 3 and required an operator-approved node -e escape hatch to unwrap the corrupted value)
  - tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema (the fix point; current depth=2, no item-wrap unwrap)
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js#schema (UNCHANGED; passthrough stays until Bridge 5)
  - tools/learning-loop-mcp/core/gate-logic.js (NOT touched; keep fix in registry layer)
  - tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js (precedent test file; new tests mirror this pattern with stdio transport)
  - plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md (precedent TDD plan with 3 phases; 12 tests; F11 lesson on fingerprint refresh before resolve)
  - plans/260609-adopt-instruction-layer/plan.md (the plan that hit the bug in Phase 3 closeout; journal documents the 4 retries producing {item:{item:[...]}} shapes)
  - docs/journals/260609-adopt-instruction-layer-closeout.md (closeout journal; documents the operator-approved node -e escape hatch; documents version 1→13 retries)
  - AGENTS.md Bridge 5 (the deferred scope; this design's loop-design-schema-source-of-truth entry is a 200-char reference to this)
---

# meta_state_patch wire-format recursion hot fix + Bridge 5 deferral

## Overview

The `meta_state_patch` MCP tool corrupts data when called via stdio transport with a combined patch (array + scalars): top-level array values get wrapped as `{item: [...]}` and the wrapper can nest to `{item: {item: [...]}}` over multiple retries. The root cause is in `coerceParamsToSchema` — it does not (a) recurse into `ZodObject` with `.shape` missing (the `passthrough` case), and (b) does not unwrap `{item: X}` envelopes. Plan `260609-adopt-instruction-layer` hit this in Phase 3, produced 13 retries with nested wrapping, and required an operator-approved `node -e` escape hatch to surgically unwrap the value.

This plan ships a hot fix (symptom-level) in 1 file + 1 test file + 1 helper, and files a separate Bridge 5 loop-design as pure deferral. **Zero changes to `meta-state-patch-tool.js`**. Bridge 5 will read `coerceParamsToSchema` later, delete the unwrap branch, and replace `passthrough` with schema-derived schemas — that work is a multi-week scope, explicitly out of this plan.

**Why this is split from Bridge 5 (operator framing):** "the more we patching, the more it's harder to migrate to Bridge 5; we should leave good foundation for that (i.e. the future agent could read the code, understand the intent then translate the intent to Bridge 5 implementation)." Implication: the fix MUST live in `coerceParamsToSchema` (the contract layer), not in `meta-state-patch-tool.js` (the tool layer). When Bridge 5 ships, the future agent reads `coerceParamsToSchema`, sees `unwrapItemWrap` is a wire-format-specific helper, and knows to delete it (not port it).

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Pending | ~1.5h | — |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Pending | ~0.5h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Pending | ~1h | Phase 2 |

**Total effort:** ~3h

## Phasing Rationale

TDD structure locks current behavior before changes. Phase 1 is tests-only (4 new tests: 3 stdio + 1 pre-validation for empty arrays; all red/failing initially). Phase 2 implements just enough to make tests pass (minimal new code: 1 helper + 1 wire-in block; 3-iter bound inlined; 0 constant changes per red-team amendment 2). Phase 3 is the closeout work: 8 registry mutations (1 supersedes change-log + 1 new loop-design + 1 evidence_code_ref patch + 1 lifecycle ack/refresh/resolve + 1 closeout), all in the strict sequence required by F11 from plan `260608-1015` and amendment 6 (Step 2.5 evidence_code_ref patch must precede Step 4 fingerprint refresh). This matches the precedent set by `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md` (which shipped the original `meta_state_patch` tool + `coerceParamsToSchema` helper over 3 TDD phases).

## Key Design Decisions (locked in brainstorm + red-team amendments)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Hot fix only; Bridge 5 deferred to separate loop-design | Operator explicitly chose this split; 2-week scope separation |
| Unwrap scope | `unwrapItemWrap` typeName-gated: only when ZodArray or ZodObject; 3-iter bound inlined | Devil's Advocate consensus: "if you can't see it in the schema, don't touch it"; typeName gating prevents accidental unwrap of legitimate `{item: X}` values |
| Touchpoints | `tool-registry.js#coerceParamsToSchema` only; zero changes to `meta-state-patch-tool.js` | Single source of truth for the contract; Bridge 5 reads and deletes 1 file; future agent sees intent in 1 place |
| Recursion depth | `MAX_RECURSION_DEPTH` stays at 2 (no bump) | Red-team amendment 2: the 2→3 depth bump was unjustified (no workload hits depth 2 currently); the 3-iter bound on `{item: X}` chains is a separate concern, handled by the unwrap |
| Bridge 5 deferral | New loop-design entry `loop-design-schema-source-of-truth` with `proposed_design_for=[]`, `addresses=[]`; filed via `meta_state_propose_design` ONLY if pre-validation Test 1.5 passes (empty arrays round-trip flat); otherwise filed via `meta_state_log_change` | Red-team amendment 3: pre-validation removes the need for a "data-integrity fix" fallback that turns out to be the same meta-260606T2102Z anti-pattern |
| Change-log supersession | Step 1 change-log includes `supersedes: "meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed"` | Red-team amendment 4: formally corrects the stale `change_target` (`core/gate-logic.js` → `tool-registry.js`) via the canonical `meta_state_log_change.supersedes` field |
| evidence_code_ref fix | New Step 2.5: `meta_state_patch` on finding #509 to update `evidence_code_ref` from `meta-state-patch-tool.js#handler` → `tool-registry.js#coerceParamsToSchema` before Step 4 fingerprint refresh | Red-team amendment 6: the fingerprint must hash the actual fix site; without this, `check_grounding` returns `drifted` against the wrong file |
| Step 7 (recursive proof) | Payload includes `addresses: []` alongside the scalars (combined array + scalars) | Red-team amendment 5 (Option B): earns the "recursive proof" framing; empty array exercises the unwrap path (`{item: []}` is the natural edge case) without adding real new fields |
| Plan mode | `--tdd` | Matches user choice + 260608-1015 + 260609-adopt-instruction-layer precedent |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (~200 lines, 4 tests; `.test.js` extension is required for `pnpm test` to pick it up)
- **Modify:**
  - `tools/learning-loop-mcp/tool-registry.js` (add `unwrapItemWrap` helper with 3-iter bound inlined; wire into `coerceParamsToSchema`; NO constant changes; `MAX_RECURSION_DEPTH` stays at 2) (+25 lines)
  - `meta-state.jsonl` (1 change-log with `supersedes` field + 1 new loop-design + 1 evidence_code_ref patch + 1 ack + 1 refresh + 1 check_grounding + 1 resolve + 1 loop-design update) (+8 lines)
- **UNCHANGED (explicit do-NOT-touch list):**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (passthrough stays until Bridge 5)
  - `tools/learning-loop-mcp/core/gate-logic.js` (fix stays in registry layer)
  - `tools/learning-loop-mcp/core/meta-state.js` (no new core logic; the helper is in the registry layer)
  - `tools/learning-loop-mcp/tool-registry.js#MAX_RECURSION_DEPTH` (stays at 2; depth bump dropped per red-team amendment 2)

## Out of Scope (Deferred)

- **Bridge 5 (schema as source of truth):** deferred to `loop-design-schema-source-of-truth` (or `meta_state_log_change` if pre-validation fails). Multi-week scope. 4 hand-maintained field catalogues per record type, 11 drift cells. Bridge 5 will read `coerceParamsToSchema`, delete the unwrap branch, and replace `passthrough` with schema-derived schemas.
- **`meta_state_propose_design` update mode:** separate scope, separate plan (per precedent 260608-1015).
- **`meta_state_archive` / `meta_state_undo_resolve`:** full CRUD coverage, separate scope.
- **TTL redesign:** `meta-260608T0847Z-...` is a separate finding, separate plan.
- **Auth/role system for `meta_state_patch`:** currently any agent can patch any entry; operator-role check is a future plan.
- **Any change to `meta-state-patch-tool.js`:** the patch tool schema stays `passthrough` until Bridge 5. Adding ZodArray fields now would be doing Bridge 5 in miniature.
- **Empty-array edge case in unwrap:** if Test 1.5 (pre-validation) fails, file a new finding (subtype: `wire-format-empty-array-edge-case`) and defer Bridge 5 to a follow-up plan.

## Success Criteria (Plan-Level)

- [x] All 898 existing tests pass (baseline; new test file uses `.test.js` so it's in the persistent suite)
- [x] 4 new tests pass (1 stdio combined-patch + 1 unit test on `coerceParamsToSchema` + 1 stdio `meta_state_propose_design` + 1 pre-validation for empty arrays)
- [x] Single combined `meta_state_patch` call with array + scalars stores a flat array (no `{item: ...}` wrap)
- [x] `meta_state_propose_design` with `proposed_design_for` + scalars round-trips a flat array
- [x] `meta_state_propose_design` with `proposed_design_for: []` + `addresses: []` (empty arrays) round-trips a flat empty array (pre-validation; gates Bridge 5 deferral mechanism)
- [x] `item_wrap_unwrapped` audit log line visible in `gate.log` for the test cases
- [x] Finding #509 (`meta-260610T0115Z-...`) `evidence_code_ref` updated from `meta-state-patch-tool.js#handler` → `tool-registry.js#coerceParamsToSchema` BEFORE fingerprint refresh
- [x] Finding #509 (`meta-260610T0115Z-...`) resolved with "Resolved:" narrative
- [x] Loop-design #508 (`loop-design-meta-state-patch-wire-format-recursion`) status `active` → `inactive`, `shipped_in_plan` populated, **`addresses: []` round-trips flat in the closeout patch** (Option B recursive proof)
- [x] New loop-design `loop-design-schema-source-of-truth` exists with status `active` and 200-char deferral paragraph (only if pre-validation passes; otherwise deferral is filed via `meta_state_log_change`)
- [x] Change-log #510 (`meta-20260609185059Z-...`) formally superseded by the new Step 1 change-log via the `supersedes` field
- [x] `pnpm check` passes (validate records + extract index + tests)
- [x] **Zero changes to `meta-state-patch-tool.js`** (Bridge 5 reads `coerceParamsToSchema` later; the patch tool schema stays `passthrough` until then)
- [x] `core/gate-logic.js` is **UNCHANGED** (fix stays in registry layer)
- [x] `MAX_RECURSION_DEPTH` in `tool-registry.js` is **UNCHANGED** (stays at 2; depth bump dropped per red-team amendment 2)
- [x] Cold-session test (`rule-cold-session-test-must-pass-before-resolution`) passes after the change-log mutation (the cold-session test checks MCP tool availability, not registry content)

## Dependencies

No external plan dependencies. This plan is self-contained; it depends only on existing primitives (`coerceParamsToSchema`, `appendGateLog`, `meta_state_log_change`, `meta_state_propose_design`, `meta_state_patch`, `meta_state_ack`, `meta_state_refresh_fingerprint`, `meta_state_check_grounding`, `meta_state_resolve`).

## Risks (Top 3)

1. **F11 lesson — fingerprint refresh before resolve (extended per amendment 6)** — the `rule-no-orphaned-evidence` consult-gate blocks `meta_state_resolve` if any active finding with `mechanism_check: true` has a stale `code_fingerprint`. Finding #509's `evidence_code_ref` currently points to `meta-state-patch-tool.js#handler` (wrong file; the fix is in `tool-registry.js#coerceParamsToSchema`). Mitigation: Phase 3 closeout Step 2.5 patches `evidence_code_ref` to the fix site BEFORE Step 4 refreshes the fingerprint. Sequence: Step 2.5 (evidence_code_ref patch) → Step 3 (ack) → Step 4 (refresh_fingerprint) → Step 5 (check_grounding) → Step 6 (resolve).
2. **Pre-validation failure (Test 1.5) for empty arrays** — `propose_design` with `proposed_design_for: []` and `addresses: []` may still wrap as `{item: []}`. The hot fix's unwrap handles `{item: [a, b, c]}` but may not handle the empty-array edge case. Mitigation: Test 1.5 pre-validates. If it fails, file a new finding (subtype: `wire-format-empty-array-edge-case`), defer Bridge 5 to a follow-up plan, and file the Bridge 5 deferral entry via `meta_state_log_change` (which doesn't have the array shape issue).
3. **TypeName gating for non-array/non-object fields** — `unwrapItemWrap(value, typeName)` is typeName-gated: only unwraps when `typeName === "ZodArray"` or `typeName === "ZodObject"`. A field declared as `z.string()` (or unwrapped as a primitive) is not affected. Mitigation: the helper signature is `unwrapItemWrap(value, typeName)`, NOT `unwrapItemWrap(value)`. The typeName parameter is the gate. (Per Devil's Advocate consensus: "if you can't see it in the schema, don't touch it.")

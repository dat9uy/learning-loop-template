---
phase: 1
title: "B3+B4 codegen adoption and verification"
status: pending
priority: P1
effort: "5-6h"
dependencies: ["260613-1853-phase-b-bridge-5-core-fix"]
---

# Phase 1: B3+B4 codegen adoption and verification

## Overview

Migrate the genuine codegen candidates (~5-7 entry-creating `meta_state_*` tools) from hand-written Zod to schemas derived from `metaState<Kind>EntrySchema.shape` or partial projections. Closes **LIM-7** (22-of-38 hand-written Zod) for the actual codegen candidates; the remaining tools have tool-specific filter/parameter schemas that are already optimal and stay hand-written. B4 verification runs `pnpm test` after each tool migration + a final full-suite run; the §3.6 byte-for-byte parity test is the gate.

## Context Links

- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` § Phase B (2026-06-14 scoping decision)
- **B2 reference migration:** `plans/260613-1853-phase-b-bridge-5-core-fix/phase-03-b2-1-codegen-build-patch-schema.md` + `phase-04-b2-2-wire-patch-tool-to-derived-schema.md` (the pattern to replicate)
- **B2 TDD pattern:** `__tests__/meta-state-patch-derived-schema.test.js` (4 stdio regression tests; reuse the pattern for B3)
- **Source of truth:** `tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema` (4 per-kind branches)
- **Pattern reference (already migrated):** `tools/learning-loop-mcp/tools/meta-state-report-tool.js:13` (`schema: metaStateFindingEntrySchema.shape` — the simplest pattern, used for `meta_state_report` already)
- **Wire-format helpers (must compose, not be replaced):** `tools/learning-loop-mcp/tool-registry.js:77-134` (`coerceParamsToSchema`), `tools/learning-loop-mcp/tool-registry.js:197-235` (`installWireFormatCoercion`)

## Requirements

- **Functional:** Migrate `meta_state_log_change`, `meta_state_promote_rule`, `meta_state_propose_design`, `meta_state_batch`, and any additional candidate identified in the audit (see Implementation Step 0) from hand-written Zod to schemas derived from the per-kind entry schemas. No new functionality; pure refactor.
- **Non-functional:**
  - Schema behavior is byte-for-byte equivalent to the hand-written schema (the §3.6 byte-for-byte parity test in B2 is the gate).
  - The 864-test baseline (verified 2026-06-13) must not regress at any commit.
  - The wire-format coercion helpers (`coerceParamsToSchema` + `installWireFormatCoercion`) compose with the generated schemas — no regression in stdio round-trips.
  - Per-tool verification: write a failing test, migrate the tool, run the tool's existing test file, run the full suite.

## B3 Audit — Codegen Candidates (commit before migration starts)

The LIM-7 table says "22 of 38 MCP tools still hand-write Zod" but a careful audit shows only ~5-7 are genuine candidates. Audit results from the scout pass (2026-06-14, pre-plan-write):

**Genuine codegen candidates (5-7 tools):**

| Tool | Current schema | Target derivation | Risk |
|------|----------------|-------------------|------|
| `meta_state_log_change` | Hand-written 17-zod-call block (lines 44-71) | `metaStateChangeEntrySchema.shape` (with tool-level fields stripped) | medium — many fields; verify `change_diff` and `applies_to` shapes |
| `meta_state_promote_rule` | Hand-written 9-zod-call block | `metaStateRuleEntrySchema.shape` (with tool-level fields stripped) | medium — `pattern_type`, `pattern` are tool-level |
| `meta_state_propose_design` | Hand-written 7-zod-call block | `metaStateLoopDesignSchema.shape` (with tool-level fields stripped) | medium — `proposed_design_for` is the wire-format recursion case from B2 |
| `meta_state_batch` | Hand-written 17-zod-call block (per-op schemas) | Mix of per-op derived schemas (write/patch/resolve/archive via `buildPatchSchemaFor`) | high — atomic batch has 5 op types with different shapes |
| `meta_state_resolve` | Hand-written 4-zod-call block (id + resolution + resolved_by) | Partial of `metaStateFindingEntrySchema` (resolve-relevant fields only) | low — small schema |
| `meta_state_archive` | Hand-written 4-zod-call block (ids + reason) | Tool-level schema (no entry-shape overlap) | **NOT a candidate** — tool-specific; document and skip |
| `meta_state_supersede` | Hand-written 4-zod-call block (id + consolidated_into) | Partial of `metaStateChangeEntrySchema` (consolidates field) | low — small schema |

**Not candidates (tool-specific filter/parameter schemas; already optimal):**

- `meta_state_ack`, `meta_state_list`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_query_drift`, `meta_state_relationships`, `meta_state_relationship_validate`, `meta_state_re_verify`, `meta_state_refresh_fingerprint`, `meta_state_refresh_tools`, `meta_state_sweep`, `gate_check`, `loop_describe`, `loop_get_instruction`, the 9 `workflow_*` tools.

The 22-of-38 count includes these non-candidates; the actual codegen benefit is the 5-7 above.

**Audit deliverable (commit at start of Phase 1):** a one-page table in `plans/260614-1259-phase-b-codegen-adoption/audit-b3-codegen-candidates.md` with the per-tool decision (migrate / skip / not a candidate) and rationale. This is the §3.6 byte-for-byte parity test's scope document.

## Architecture

**Migration pattern (per tool):**

```javascript
// BEFORE (hand-written):
export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  schema: {
    change_dimension: z.enum([...]).describe(...),
    change_target: z.string().min(1).describe(...),
    change_diff: z.object({...}).describe(...),
    reason: z.string().min(20).describe(...),
    applies_to: z.object({...}).optional().describe(...),
    supersedes: z.string().optional().describe(...),
    consolidates: z.string().optional().describe(...),
    evidence_code_ref: z.string().optional().describe(...),
    evidence_journal: z.string().optional().describe(...),
  },
  handler: ...
};

// AFTER (codegen-derived):
import { metaStateChangeEntrySchema } from "#mcp/core/meta-state.js";

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  schema: metaStateChangeEntrySchema.shape,  // single source of truth
  handler: ...
};
```

**Two patterns to apply:**

1. **Full-shape pattern** (entry-creating tools where the user provides all entry fields): `schema: metaState<Kind>EntrySchema.shape`. Used by `meta_state_report` already.
2. **Partial-strict pattern** (operational tools where the user provides a subset): `schema: buildPatchSchemaFor('<kind>')` for the relevant subset, OR a custom Zod object that picks fields from the entry schema via `.pick(...)`. Used by `meta_state_patch` already.

For `meta_state_batch`, the 5 op types (`write | update | delete | archive`) each have different valid field sets; the migration requires per-op schemas, possibly a small new helper `buildOpSchemaFor(opType)` in `core/meta-state.js` (one new exported function, not a full `schema-to-zod.js` recreation).

## Related Code Files

- **Modify (5-7 files):**
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (target: `schema: metaStateChangeEntrySchema.shape`)
  - `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` (target: `schema: metaStateRuleEntrySchema.shape`)
  - `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` (target: `schema: metaStateLoopDesignSchema.shape`)
  - `tools/learning-loop-mcp/tools/meta-state-batch-tool.js` (target: per-op derived schemas; possibly a new `buildOpSchemaFor` helper in `core/meta-state.js`)
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (target: partial projection; only if it provides codegen benefit)
  - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js` (target: partial projection; only if it provides codegen benefit)
- **Modify (1 new helper, if batch warrants it):**
  - `tools/learning-loop-mcp/core/meta-state.js` (add `buildOpSchemaFor(opType)`; ~10 lines + 1 test)
- **Create (test file per migrated tool, TDD-first):**
  - `__tests__/meta-state-log-change-codegen.test.js`
  - `__tests__/meta-state-promote-rule-codegen.test.js`
  - `__tests__/meta-state-propose-design-codegen.test.js`
  - `__tests__/meta-state-batch-codegen.test.js` (if migrated)
  - Plus the existing tool test files get a parity-test added (regression coverage)
- **Create (audit deliverable):**
  - `plans/260614-1259-phase-b-codegen-adoption/audit-b3-codegen-candidates.md`

## Implementation Steps

**Step 0 — Branch + audit (~15 min)**
1. Branch off main: `git checkout -b 260614-1259-phase-b-codegen-adoption`
2. Commit the audit deliverable (the one-page candidate table).
3. `pnpm test` to lock the 864-test baseline.

**Step 1 — Migrate `meta_state_log_change` (TDD, ~45 min)**
1. RED: write `__tests__/meta-state-log-change-codegen.test.js` asserting the tool's runtime schema is shape-equivalent to `metaStateChangeEntrySchema.shape` (per-field check).
2. GREEN: replace the hand-written schema with `metaStateChangeEntrySchema.shape`. Strip tool-level fields that don't apply (none expected — `meta_state_log_change` accepts all change-log fields).
3. Run the tool's existing test file + the new parity test + the full suite. All 864+ tests pass.
4. Commit: `refactor(mcp): derive meta_state_log_change schema from metaStateChangeEntrySchema`.

**Step 2 — Migrate `meta_state_promote_rule` (TDD, ~30 min)**
1. RED: write parity test asserting runtime schema = `metaStateRuleEntrySchema.shape`.
2. GREEN: replace schema. Strip tool-level fields: `pattern_type`, `pattern` are not on `metaStateRuleEntrySchema` (they're tool-level). Keep them as a `.merge({})` if needed.
3. Tests + commit. Pattern: `refactor(mcp): derive meta_state_promote_rule schema from metaStateRuleEntrySchema`.

**Step 3 — Migrate `meta_state_propose_design` (TDD, ~30 min)**
1. RED: parity test.
2. GREEN: replace schema with `metaStateLoopDesignSchema.shape`. **Watch for the wire-format recursion case** on `proposed_design_for` (per B2 §3.10 — this is the field that triggered the original `unwrapItemWrap` workaround). The derived schema is strict-typed, so the wire-format coercion helper will see the array's typeName and unwrap correctly. No new workaround needed.
3. Tests + commit.

**Step 4 — Migrate `meta_state_batch` (TDD, ~1.5h)**
1. RED: parity test for the 5 op types. `write` ops derive from per-kind full schema (no existing helper — needs a new `buildOpSchemaFor('write', kind)` that returns `metaState<Kind>EntrySchema.shape` minus identity/audit fields). `update` ops use `buildPatchSchemaFor(kind)` (already exists). `delete`/`archive` are tool-level (no entry-shape overlap).
2. GREEN: add `buildOpSchemaFor(opType, kind?)` to `core/meta-state.js` (one new export; ~15 lines + 1 unit test). Wire the 5 op types in `meta-state-batch-tool.js`.
3. Tests + commit.

**Step 5 — Optional: migrate `meta_state_resolve` and `meta_state_supersede` (~20 min each)**
1. RED: parity test using `.pick(...)` projection from the relevant entry schema.
2. GREEN: replace schema.
3. Skip if the projection adds more lines than it removes (YAGNI; document the skip in the audit deliverable).

**Step 6 — Final verification (B4, ~15 min)**
1. Run `pnpm test`. Expect 864+ tests (the new parity tests add 5-8; minus any removed redundant tests).
2. If any test fails: revert the offending tool's migration, file a finding, document the divergence in the audit deliverable.
3. Commit a "B4 verification gate green" change-log entry.

**Step 7 — Stack the PRs (2-3 PRs)**
1. PR #1: Step 1 (log_change) + Step 6 verification. Lowest risk, ships independently.
2. PR #2: Step 2 (promote_rule) + Step 3 (propose_design) + Step 5 (optional resolve/supersede). Bumps risk.
3. PR #3: Step 4 (batch + the new `buildOpSchemaFor` helper). Highest risk; can ship on its own or as a follow-up.

If any PR fails review, the others ship independently (per the master tracker's "stacked PR strategy" + "read-only PR ships independently if writer migration hits a wall" guidance).

## Success Criteria

- [ ] `pnpm test` passes (864+ tests, 0 fail, 0 unexpected skips; the existing 1 skip is preserved).
- [ ] Each migrated tool has a parity test asserting the runtime schema is shape-equivalent to the derived source-of-truth schema.
- [ ] The wire-format coercion helpers (`coerceParamsToSchema`, `installWireFormatCoercion`) compose with the generated schemas (verified by the existing 4 stdio regression tests + the per-tool parity tests).
- [ ] The audit deliverable (`audit-b3-codegen-candidates.md`) is committed, listing per-tool decisions (migrate / skip / not a candidate) with rationale.
- [ ] The new `buildOpSchemaFor` helper (if added in Step 4) has a unit test + the existing batch tool tests pass.
- [ ] B1+B2's 864 baseline is preserved or grew; no regression in the `meta_state_patch` migration (B2's load-bearing surface).
- [ ] 2-3 PRs landed, each independently shippable.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Schema divergence — hand-written schema accepts a field the derived schema rejects (or vice versa) | medium | Per-tool parity test (TDD-first); the §3.6 byte-for-byte parity test from B2 is the pattern. |
| Wire-format coercion regression — the strict-typed derived schema changes how `coerceParamsToSchema` resolves typeName | medium | The B2 stdio regression tests (`__tests__/wire-format-top-level-coercion.test.js`, `__tests__/wire-format-coercion-fix.test.js`, `__tests__/wire-format-patch-recursion.test.js`) are the gate. The derived schemas are STRICTER than the hand-written passthroughs, so coercion has more typeName info to work with, not less. |
| `meta_state_batch` is complex — 5 op types, different shapes per op, plus the atomic batch lock | high | The optional Step 5 boundary lets us defer batch if it hits a wall. The stacked PR strategy means batch ships on its own (or in a follow-up session) without blocking log_change/promote_rule/propose_design. |
| Tool-level fields overlap with entry-schema fields (e.g., `pattern_type` on `meta_state_promote_rule`) | low | Documented in Step 2; merge with `.merge({})` or keep as hand-written subset. |
| SP3 schema instability — `metaStateEntrySchema` is edited mid-migration | low | The 15-commit history since 2026-06-05 suggests SP3 is settling; the parity test catches any divergence immediately. |
| `audit-b3-codegen-candidates.md` doesn't capture the operator's intent (e.g., "we should also migrate the non-candidates") | low | Commit the audit at the START of Phase 1 (Step 0) so the operator can review and amend before any migration begins. |

## Next Steps

- **After Phase 1 ships:** Phase 2 (B5 LIM-2 fix) starts. B5 builds on the codegen baseline — the fix touches `core/meta-state.js#buildPatchSchemaFor` (or `metaStateEntryPatchSchema`), which is the B2 inline function.
- **PR review gate:** PR #1 ships without review from the B2 author (it's an incremental extension of the same pattern); PRs #2 and #3 warrant a second pair of eyes (propose_design + batch are the higher-risk surfaces).
- **Operator checkpoint:** at PR #1 merge, the operator can choose to ship PR #2 + #3 in the same session or defer to a follow-up session.

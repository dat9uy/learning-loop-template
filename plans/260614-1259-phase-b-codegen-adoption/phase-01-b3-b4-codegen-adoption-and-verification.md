---
phase: 1
title: "B3+B4 codegen adoption and verification"
status: pending
priority: P1
effort: "2-3h"
dependencies: ["260613-1853-phase-b-bridge-5-core-fix"]
---

# Phase 1: B3+B4 codegen adoption and verification

## Overview

After red-team review, the codegen surface is much smaller than the original LIM-7 audit suggested. Of the tools flagged as candidates, only `meta_state_log_change` and `meta_state_propose_design` benefit from derived schemas — and both require projections (`.pick()` / `.omit()` / `.merge()`) rather than raw `.shape`. The other candidates (`meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, `meta_state_supersede`) are reclassified as **NOT candidates** because their tool schemas include parameters that do not exist on the entry schemas, or their schemas are intentionally loose handler-validated pre-filters.

This phase migrates the two viable candidates and adds parity tests. B4 verification runs `pnpm test` after each migration + a final full-suite run; the byte-for-byte parity test is the gate.

## Context Links

- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` § Phase B (2026-06-14 scoping decision)
- **B2 reference migration:** `plans/260613-1853-phase-b-bridge-5-core-fix/phase-03-b2-1-codegen-build-patch-schema.md` + `phase-04-b2-2-wire-patch-tool-to-derived-schema.md` (the pattern to replicate)
- **B2 TDD pattern:** `__tests__/meta-state-patch-derived-schema.test.js` (4 stdio regression tests; reuse the pattern)
- **Source of truth:** `tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema` (4 per-kind branches)
- **Wire-format helpers (must compose, not be replaced):** `tools/learning-loop-mcp/tool-registry.js:77-134` (`coerceParamsToSchema`), `tools/learning-loop-mcp/tool-registry.js:197-235` (`installWireFormatCoercion`)
- **Red-team adjudication:** `plans/260614-1259-phase-b-codegen-adoption/reports/from-code-reviewer-to-planner-red-team-adjudication-report.md`

## Requirements

- **Functional:** Migrate only the genuine codegen candidates from hand-written Zod to schemas derived from the per-kind entry schemas:
  - `meta_state_log_change` → `.pick()` projection of `metaStateChangeEntrySchema.shape` for the caller-provided fields.
  - `meta_state_propose_design` → `.pick()` projection of `metaStateLoopDesignSchema.shape` + `.merge({ loop_design_id })` for the tool-level explicit-id parameter.
  - Reclassify `meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, `meta_state_supersede` as NOT candidates; leave their schemas hand-written.
- **Non-functional:**
  - Schema behavior is byte-for-byte equivalent to the hand-written schema (the parity test is the gate).
  - The current baseline (870 pass / 1 skip, 103 suites) must not regress at any commit.
  - The wire-format coercion helpers compose with the generated schemas — no regression in stdio round-trips.
  - Per-tool verification: write a failing test, migrate the tool, run the tool's existing test file, run the full suite.

## B3 Audit — Codegen Candidates (commit before migration starts)

The original LIM-7 table claimed "22 of 38 MCP tools still hand-write Zod," but red-team review showed only two tools are genuine candidates. Audit results:

| Tool | Decision | Rationale |
|------|----------|-----------|
| `meta_state_report` | Already migrated | Uses `metaStateFindingEntrySchema.shape`; handler consumes most entry fields directly. |
| `meta_state_log_change` | **Migrate** (partial) | Hand-written schema is a subset of `metaStateChangeEntrySchema.shape`. Use `.pick()` to expose only caller-provided fields and omit handler-generated fields (`id`, `entry_kind`, `status`, `created_at`, `version`, `expires_at`, `affected_system`, `code_ref`, `ledger_ref`). |
| `meta_state_propose_design` | **Migrate** (partial) | Hand-written schema is a subset of `metaStateLoopDesignSchema.shape`. Use `.pick()` + `.merge({ loop_design_id })`. Tool-level `loop_design_id` is not stored on the entry; the entry stores it as `id`. |
| `meta_state_promote_rule` | **NOT a candidate** | Tool schema includes `id` (source finding id), `preview`, `sample_commands`, `sample_paths` which are not in `metaStateRuleEntrySchema`. Handler constructs a new rule entry internally. |
| `meta_state_batch` | **NOT a candidate / defer to Bridge 7** | `write` op uses `z.record(z.string(), z.unknown())` and `update` op uses `.passthrough()` as intentional pre-filters; validation is deferred to the handler. Replacing with strict per-kind schemas would break existing batch callers and the discriminated-union structure. |
| `meta_state_resolve` | **NOT a candidate** | Tool-level `cascade_from` is not in `metaStateFindingEntrySchema`. Schema is already minimal; migration adds no value. |
| `meta_state_supersede` | **NOT a candidate** | Tool-level `_expected_version` is not in `metaStateFindingEntrySchema`. Schema is already minimal; migration adds no value. |
| `meta_state_archive` | **NOT a candidate** | Tool-specific filter schema with no entry-shape overlap. Correctly identified in the original audit. |

**All other `meta_state_*` tools** have tool-specific filter/parameter schemas that are already optimal and stay hand-written.

**Audit deliverable (commit at start of Phase 1):** a one-page table in `plans/260614-1259-phase-b-codegen-adoption/audit-b3-codegen-candidates.md` with the per-tool decision (migrate / skip / not a candidate) and rationale.

## Architecture

**Two patterns to apply:**

1. **Pick-projection pattern** (entry-constructing tools where the handler generates some fields): use `metaState<Kind>EntrySchema.pick({ field1: true, field2: true, ... })` to expose only the caller-provided subset.
2. **Pick + merge pattern** (entry-constructing tools with one tool-level parameter): use `.pick({ ... }).merge({ toolField: z.string().optional() })`.

`meta_state_report` is the exception that uses raw `.shape`: its handler consumes most entry fields directly and constructs the entry from caller arguments. The other entry-constructing tools generate `id`, `status`, timestamps, etc. internally; raw `.shape` would expose ignored parameters and create a misleading MCP surface.

For `meta_state_log_change`:

```javascript
// BEFORE (hand-written):
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
}

// AFTER (derived projection):
import { metaStateChangeEntrySchema } from "#mcp/core/meta-state.js";

const MIGRATED_FIELDS = {
  change_dimension: true,
  change_target: true,
  change_diff: true,
  reason: true,
  applies_to: true,
  supersedes: true,
  consolidates: true,
  evidence_code_ref: true,
  evidence_journal: true,
};

schema: metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).shape
```

For `meta_state_propose_design`:

```javascript
// AFTER (derived projection + tool-level merge):
import { metaStateLoopDesignSchema } from "#mcp/core/meta-state.js";

const MIGRATED_FIELDS = {
  title: true,
  description: true,
  proposed_design_for: true,
  addresses: true,
  affected_system: true,
  severity_hint: true,
};

schema: metaStateLoopDesignSchema
  .pick(MIGRATED_FIELDS)
  .merge(z.object({
    loop_design_id: z.string().optional()
      .describe("Optional explicit id (loop-design-<slug>). If omitted, the id is auto-generated from the title."),
  }))
  .shape
```

**Note on `affected_system`:** The tool's current enum has 6 values; the entry schema's enum has 15 values. The `.pick()` projection preserves the entry schema's 15-value enum, which widens the tool surface. This is acceptable because the entry schema is the source of truth and the wider enum is forward-compatible. The parity test must assert the widened enum matches the source of truth.

## Related Code Files

- **Modify (2 files):**
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (target: `.pick()` projection)
  - `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` (target: `.pick()` + `.merge({ loop_design_id })`)
- **Create (test file per migrated tool, TDD-first):**
  - `__tests__/meta-state-log-change-codegen.test.js`
  - `__tests__/meta-state-propose-design-codegen.test.js`
  - Plus the existing tool test files get a parity-test added (regression coverage)
- **Create (audit deliverable):**
  - `plans/260614-1259-phase-b-codegen-adoption/audit-b3-codegen-candidates.md`
- **No changes to:**
  - `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-batch-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js`
  - `tools/learning-loop-mcp/core/meta-state.js` (no new helper needed)

## Implementation Steps

**Step 0 — Branch + audit + baseline (~15 min)**
1. Branch off main: `git checkout -b 260614-1259-phase-b-codegen-adoption`
2. Run `pnpm test` and record the exact baseline: 870 pass / 1 skip / 103 suites.
3. Commit the audit deliverable (`audit-b3-codegen-candidates.md`) with the reduced candidate list.

**Step 1 — Migrate `meta_state_log_change` (TDD, ~45 min)**
1. RED: write `__tests__/meta-state-log-change-codegen.test.js` asserting the tool's runtime schema is shape-equivalent to `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS)` (per-field check).
2. GREEN: replace the hand-written schema with the `.pick()` projection.
3. Run the tool's existing test file + the new parity test + the full suite. The 870 pass / 1 skip baseline is preserved.
4. Commit: `refactor(mcp): derive meta_state_log_change schema from metaStateChangeEntrySchema.pick()`.

**Step 2 — Migrate `meta_state_propose_design` (TDD, ~45 min)**
1. RED: parity test asserting runtime schema = `metaStateLoopDesignSchema.pick(MIGRATED_FIELDS).merge({ loop_design_id })`.
2. GREEN: replace schema with the pick + merge projection. Watch for the wire-format recursion case on `proposed_design_for` (per B2 §3.10); the derived schema is strict-typed, so the wire-format coercion helper will see the array's typeName and unwrap correctly. No new workaround needed.
3. Tests + commit: `refactor(mcp): derive meta_state_propose_design schema from metaStateLoopDesignSchema.pick()`.

**Step 3 — Final verification (B4, ~15 min)**
1. Run `pnpm test`. Expect 870 pass / 1 skip (the new parity tests add a small number; total should not regress).
2. If any test fails: revert the offending tool's migration, file a finding, document the divergence in the audit deliverable.
3. Commit a "B4 verification gate green" change-log entry.

**Step 4 — Stack the PRs (1-2 PRs)**
1. PR #1: Step 1 (`meta_state_log_change`) + Step 3 verification. Lowest risk, ships independently.
2. PR #2: Step 2 (`meta_state_propose_design`). Small risk due to the `.merge({ loop_design_id })` requirement.

If PR #1 fails review, PR #2 is deferred.

## Success Criteria

- [ ] `pnpm test` passes (870 pass / 1 skip baseline, 0 fail, 0 unexpected skips).
- [ ] Each migrated tool has a parity test asserting the runtime schema is shape-equivalent to the derived source-of-truth projection.
- [ ] The wire-format coercion helpers (`coerceParamsToSchema`, `installWireFormatCoercion`) compose with the generated schemas (verified by the existing 4 stdio regression tests + the per-tool parity tests).
- [ ] The audit deliverable (`audit-b3-codegen-candidates.md`) is committed, listing per-tool decisions (migrate / skip / not a candidate) with rationale.
- [ ] B1+B2's baseline is preserved or grew; no regression in the `meta_state_patch` migration (B2's load-bearing surface).
- [ ] 1-2 PRs landed, each independently shippable.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Schema divergence — hand-written schema accepts a field the derived schema rejects (or vice versa) | medium | Per-tool parity test (TDD-first); the byte-for-byte parity test from B2 is the pattern. |
| Wire-format coercion regression — the strict-typed derived schema changes how `coerceParamsToSchema` resolves typeName | low | The B2 stdio regression tests are the gate. The derived schemas are strict-typed `ZodObject`s (via `.pick()`), which the coercion pipeline already handles. |
| `meta_state_propose_design` loses `loop_design_id` | low | Explicit `.merge({ loop_design_id })` preserves the tool-level parameter; parity test asserts it. |
| `meta_state_log_change` exposes handler-generated fields | low | `.pick()` projection omits `id`, `entry_kind`, `status`, `created_at`, `version`, `expires_at`, `affected_system`, `code_ref`, `ledger_ref`. Parity test asserts the omitted fields are not in the runtime schema. |
| SP3 schema instability — `metaStateEntrySchema` is edited mid-migration | low | The parity test catches any divergence immediately. |

## Next Steps

- **After Phase 1 ships:** Phase 2 (B5 LIM-2 fix) starts. The fix must not use `z.intersection` (it breaks `coerceParamsToSchema`) and must re-triage the LIM-2 bug against the actual finding entry schema.
- **PR review gate:** PR #1 ships without review from the B2 author (it's an incremental extension of the same pattern); PR #2 warrants a second pair of eyes due to the `.merge()` requirement.
- **Operator checkpoint:** at PR #1 merge, the operator can choose to ship PR #2 in the same session or defer.

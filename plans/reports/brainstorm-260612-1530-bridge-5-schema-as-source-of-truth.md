# Bridge 5 — Schema as Source of Truth (Design Proposal)

**Type:** design proposal
**Date:** 2026-06-12
**Slug:** bridge-5-schema-as-source-of-truth
**Status:** proposed — this report is the proposal text for the existing `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` registry entry
**On operator approval:** run `meta_state_propose_design` (or `meta_state_patch`) to populate the entry's `proposed_design_for` + `addresses`
**Pre-existing evidence:**
- Active loop-design: `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (status: active; `proposed_design_for` empty; `addresses` empty; created 2026-06-10)
- Active next-up finding: `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (status: reported; expires 2026-06-13; cost estimate ~6h)
- Wire-format quirk finding: `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (the latest empirical confirmation that the passthrough ZodObject is the structural blocker)
- Related change-log: `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem` (in-production coercion helpers; this design deletes them)

**Aligned to:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 (operator-approved contract, 2026-06-12 reframe). The Mastra migration's Phase 1 shrinks dramatically with this design in place.

---

## 1. Problem

The `meta_state_patch` MCP tool's input schema is `z.object({}).passthrough()` — a structural passthrough that throws away type information. The wire-format coercion helper in `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` then has to **guess** the typeName of every field at runtime (the `unwrapItemWrap` helper is typeName-gated: ZodArray or ZodObject only, max 3 iterations). For top-level array values under the passthrough ZodObject, the inner field's typeName is never resolved, so the `unwrapItemWrap` branch never fires. The MCP SDK transport then wraps the array as `{item: [...]}` instead of letting it through as a flat array.

**Empirical confirmation (2026-06-11, during plan 260611-1700-loop-get-instruction closeout):** `meta_state_patch` on `loop-design-instruction-layer` with `patch.proposed_design_for: [4 ids]` stored the field as `{item: [4 ids]}` instead of `[4 ids]`. Subsequent readers (`buildRegistrySummary` in `core/loop-introspect.js`, `fix-loop-design-refs.mjs`, `cold-tier-regression.test.js`, `fix-loop-design-refs.test.js`) all had to be patched to tolerate both shapes. Same wrap class as `meta-260610T1504Z-...` deny-list gap and `meta-260610T1458Z-...` wire-format coercion fix that shipped for `meta_state_propose_design` + `meta_state_report` but not `meta_state_patch#proposed_design_for`.

**The structural blocker:** the passthrough ZodObject schema is the root cause. Every new cross-reference field or tool parameter inherits the wire-format coercion risk, and reader code must tolerate both shapes. Estimated cost of continuing the workaround pattern: ~1h of ad-hoc reader patches per new cross-reference field, indefinitely.

**Bigger picture:** Bridge 5 (Approach 3, full codegen for writers + validators) requires the 4 meta-surface kinds' schemas to be the single source of truth. The passthrough ZodObject + `unwrapItemWrap` helper is a workaround for the fact that the patch tool's schema is hand-written instead of derived. Bridge 5 Approach 3 + this proposal together collapse 11 drift cells across experiment + risk + meta-state tool surfaces (per the consistency report + the trajectory doc).

---

## 2. Solution (the proposal)

**Derive the `meta_state_patch` tool's input schema from `core/meta-state.js#metaStateEntrySchema` at startup**, so the patch tool accepts the same shape as the create tool. The `patch` field becomes a strict-typed Zod object derived from the 4-kind union's per-kind shape, with optional fields for each kind. This:

1. **Eliminates the passthrough ZodObject.** The structural blocker is gone.
2. **Lets `unwrapItemWrap` fire correctly.** With per-field typeName resolved at schema-construction time (instead of at runtime via the passthrough's empty `shape`), the existing `unwrapItemWrap` helper in `tool-registry.js#coerceParamsToSchema` can unwrap array fields automatically.
3. **Aligns with Bridge 5 Approach 3's output.** Approach 3 generates writers + validators from JSON Schema; the patch tool's input schema is one of the validators. Deriving the patch tool from `metaStateEntrySchema` is the same derivation, just for the patch surface.
4. **Lets us delete the 4 ad-hoc reader patches.** `buildRegistrySummary`, `fix-loop-design-refs.mjs`, `cold-tier-regression.test.js`, `fix-loop-design-refs.test.js` were patched to tolerate both shapes; with the structural fix, they go back to the strict shape.

**Scope:** meta-surface only. The 4 entry kinds (`finding | change-log | rule | loop-design`). Product-surface schemas (capability, claim, index-entry, resource-budget, observation) are out of scope — they are unbound per the 2026-06-12 reframe.

**What does NOT change:**
- The `coerceParamsToSchema` and `installWireFormatCoercion` helpers in `tool-registry.js` stay (they handle wire-format coercion for stdio clients, which is a load-bearing concern per F7 of the consistency report). Only the `unwrapItemWrap` helper inside `coerceParamsToSchema` becomes unnecessary; the outer coercion still runs.
- The `meta_state_propose_design` and `meta_state_report` tools' schemas stay (they already have per-kind Zod derived from `metaStateEntrySchema`).
- The 4 active rules and the 2 inactive loop-designs stay (no schema migration needed).
- The `gate_check`, `budget_check`, and other meta-surface tools stay (no schema change for the patch surface only).

---

## 3. Acceptance Criteria

- [ ] `meta_state_patch` schema is derived from `core/meta-state.js#metaStateEntrySchema` (no more `z.object({}).passthrough()`)
- [ ] `meta_state_patch({patch: {proposed_design_for: [4 ids]}})` round-trips as a flat array (no `{item: [...]}` wrap)
- [ ] `meta_state_patch({patch: {addresses: [3 ids]}})` round-trips as a flat array
- [ ] `meta_state_patch` schema is shape-compatible with `meta_state_propose_design` for the same kind (so the two tools can share the derivation)
- [ ] `unwrapItemWrap` helper deleted from `tool-registry.js#coerceParamsToSchema` (the workaround is no longer needed)
- [ ] The 4 ad-hoc reader patches reverted: `buildRegistrySummary` (in `core/loop-introspect.js`), `fix-loop-design-refs.mjs`, `cold-tier-regression.test.js`, `fix-loop-design-refs.test.js`
- [ ] All 985 existing tests pass (the `pnpm test` baseline verified 2026-06-12)
- [ ] 4 new TDD tests added: patch with `proposed_design_for: string[]` round-trips flat; patch with `addresses: string[]` round-trips flat; stdio client passes array as JSON string, gets flat array back; stdio client passes object, gets object back
- [ ] `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_relationships`, `meta_state_resolve` are unaffected (read-side tools; schema does not change)
- [ ] `loop_describe({tier: warm})` surfaces the new derived schema in the discoverability hints (or via `meta_state_list` queryability)
- [ ] The `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry is promoted to `status: inactive` with `shipped_in_plan` and `shipped_at` populated

---

## 4. Phases (this proposal's own sub-phases, ~6h estimate)

**Phase 0 — TDD test for derived schema (locks the contract first)**

Write the acceptance test *before* the implementation. The test reads `metaStateEntrySchema`, derives the patch schema, validates a sample `meta_state_patch` call, and asserts the wire-format round-trip is flat. This locks in the contract: any divergence between hand-written and derived behavior fails the test.

- 4 new tests in `__tests__/meta-state-patch-derived-schema.test.js`:
  1. `proposed_design_for: string[]` round-trips flat
  2. `addresses: string[]` round-trips flat
  3. stdio client passes array as JSON string, gets flat array back
  4. stdio client passes object, gets object back

**Phase 1 — Codegen pass — derive Zod from `metaStateEntrySchema` branches**

Add a `buildPatchSchemaFor(kind)` function to `core/schema-to-zod.js` (the existing Approach 2 engine). The function reads the per-kind Zod from `core/meta-state.js#metaStateEntrySchema`'s discriminated union, marks all fields optional, and returns a strict-typed Zod object. The function is the new source of truth for the patch tool's input schema.

- 1 new function in `core/schema-to-zod.js`
- 1 new test in `__tests__/schema-to-zod-patch.test.js` asserting the function output matches the per-kind Zod

**Phase 2 — Wire `meta_state_patch` tool to the derived schema**

Update `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`:
- Replace the hand-written `metaStateEntryPatchSchema = z.object({}).passthrough()` with `buildPatchSchemaFor(kind)` (where `kind` comes from the discriminated union's branch selector)
- Update the handler to call the new derivation
- Add 1 new test in `__tests__/meta-state-patch-derived-wiring.test.js` asserting the tool's runtime schema matches the per-kind Zod

**Phase 3 — Delete `unwrapItemWrap` helper, revert 4 ad-hoc reader patches**

Now that the structural blocker is gone, the workaround is no longer needed. Revert:
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` — delete the `unwrapItemWrap` helper
- `core/loop-introspect.js#buildRegistrySummary` — revert the both-shapes tolerance
- `fix-loop-design-refs.mjs` — revert the both-shapes tolerance
- `__tests__/cold-tier-regression.test.js` — revert the both-shapes tolerance
- `__tests__/fix-loop-design-refs.test.js` — revert the both-shapes tolerance

Each revert gets its own commit with a one-line `reason` pointing at this design's Phase 3.

**Phase 4 — Run full suite, refresh fingerprints, close findings**

- Run `pnpm test` (985 tests; expect all green)
- Run `meta_state_refresh_fingerprint` on the affected findings (4 currently-active next-ups that this design closes)
- Run `meta_state_resolve` on `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (the originating finding)
- Run `meta_state_resolve` on `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (the wire-format quirk finding)
- Promote `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` to `status: inactive` via `meta_state_patch` (populate `proposed_design_for`, `addresses`, `shipped_in_plan`, `shipped_at`)
- File a `meta_state_log_change` entry documenting the design's adoption as a change-log with `change_target: 'loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from'`
- Write the cook journal at `docs/journals/260612-bridge-5-schema-as-source-of-truth.md` following the SP0/SP1/SP2/SP3 cook journal pattern

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| SP3 schema instability — the per-kind Zod in `metaStateEntrySchema` is still being edited, and a mid-implementation schema change would invalidate the derivation | medium | Phase 0's TDD test catches divergence immediately. The derivation is mechanical (Zod passthrough → strict typed), so the cost of regenerating is low. |
| Hand-written `meta_state_patch` behavior divergence — the 16 `meta_state_*` tools in `tools/learning-loop-mcp/tools/meta-state-*-tool.js` have hand-written logic; the derived schema might miss a field that the hand-written schema allowed | low | The 985-test suite is the gate. Any divergence fails the test. The hand-written schema is `z.object({}).passthrough()`, which allows *every* field; the derived schema only allows per-kind fields. This is a strict subset — no field is *added*, only narrowed. |
| The 4 ad-hoc reader patches might have hidden side effects (e.g., a downstream reader might depend on the both-shapes tolerance) | low | Each revert is a separate commit. The 985-test suite catches regressions. The journal entry documents the reverts with links to this design's Phase 3. |
| The `unwrapItemWrap` helper is referenced in tests or external code | low | `grep` the codebase for `unwrapItemWrap` references before deletion. The helper is private to `tool-registry.js#coerceParamsToSchema`; references should only be in the 4 reader patches. |
| The Bridge 5 Approach 3 engine (Phase B) hasn't shipped yet, so the derivation is hand-written | low | The derivation lives in `core/schema-to-zod.js`, which is the existing Approach 2 engine. Approach 3 will refactor it to full codegen; this design's derivation is forward-compatible. |

---

## 6. Estimated Cost

**~6h**, 4 phases, all TDD-first. Phase 0: 1h. Phase 1: 1.5h. Phase 2: 1.5h. Phase 3: 1h. Phase 4: 1h.

**Cost comparison:** the workaround pattern (ad-hoc reader patches per new cross-reference field) costs ~1h per field indefinitely. The next-up finding estimates ~6h for this design, which is the cost of *one field* under the workaround pattern amortized over ~6 future fields. The design pays for itself the first time a new cross-reference field is added.

**Test budget:** +4 new tests (Phase 0) + 1 new test (Phase 1) + 1 new test (Phase 2) = 6 new tests. Total: 985 + 6 = 991 tests.

---

## 7. Cross-References

- **Loop-design entry (this proposal's registry anchor):** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` — active since 2026-06-10; `proposed_design_for` and `addresses` empty. This design populates both.
- **Next-up finding:** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` — active; expires 2026-06-13; this design resolves it.
- **Wire-format quirk finding:** `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` — active; this design closes the underlying structural blocker.
- **Related change-log:** `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem` — documents the original `unwrapItemWrap` fix; this design reverses part of it.
- **Wire-format regression tests:** `__tests__/wire-format-top-level-coercion.test.js`, `__tests__/wire-format-coercion-fix.test.js`, `__tests__/wire-format-patch-recursion.test.js` — the 985-test baseline.
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` — this design is Phase B (sub-phases B2-B6).
- **Mastra research report (contract):** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 (7-step implementation order; Bridge 5 Approach 3 ships before Mastra migration).
- **Consistency report (audit):** `plans/reports/consistency-260612-1300-mastra-research-report.md` F7 (the Q3 caveat that named the helpers as in-production and load-bearing).
- **SP0/SP1/SP2/SP3 cook journals:** `docs/journals/` — pattern reference for the cook journal this design's Phase 4 produces.
- **Schema source:** `tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema` (4-kind discriminated union; the per-kind Zod that the derivation reads).
- **Existing Approach 2 engine:** `tools/learning-loop-mcp/core/schema-to-zod.js` (extended by this design's Phase 1).

---

## 8. Operator decision required

**Approve this proposal?** If yes:

1. Run `meta_state_patch` (or `meta_state_propose_design`) to populate the `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry's `proposed_design_for` and `addresses`. Suggested values:
   - `proposed_design_for: [<this-report-path>, meta-260612T1131Z-..., meta-260612T0058Z-...]` (the design's own path + the two findings it closes)
   - `addresses: [meta-260612T1131Z-..., meta-260612T0058Z-...]` (the two findings it closes)
2. Resolve the two findings (the next-up + the wire-format quirk) once Phase 4 ships.
3. Promote the loop-design to `status: inactive` with `shipped_in_plan` and `shipped_at` populated.

**Reject this proposal?** If the design's premise is wrong (e.g., the passthrough ZodObject is actually the right shape for some reason), record the rejection rationale as a `change-log` entry pointing at this report. The next plan adopting Bridge 5 will need a different design.

**Defer?** If the timing isn't right (e.g., Phase A's re-debate should happen first), promote the loop-design's `addresses` to include this report and mark the design as "deferred pending Phase A." The 5 active next-up findings (this one included) will continue to age; the next plan that picks up Bridge 5 should re-validate the cost estimate.

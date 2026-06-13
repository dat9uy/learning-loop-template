# Phase B — Bridge 5 Core Fix (B1-B2 Scoping)

**Type:** brainstorm (scoping + design adaptation)
**Date:** 2026-06-13
**Slug:** phase-b-bridge-5-core-fix
**Status:** approved — user confirmed B1-B2 scope, report-only (no plan)
**Source:** `plans/reports/productization-260612-1530-master-tracker.md` Phase B
**Design basis:** `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md` (Report 2, adapted)

---

## 1. Problem

`meta_state_patch` MCP tool uses `z.object({}).passthrough()` — a structural passthrough that discards type info. The `unwrapItemWrap` workaround in `tool-registry.js:58` partially compensates but fails for top-level array fields (`proposed_design_for`, `addresses`) under the passthrough. Result: arrays stored as `{item: [...]}` instead of flat arrays.

**Post-Phase A reality (2026-06-13):**
- Test baseline: 862 tests (861 pass, 1 skip, 0 fail) — NOT 985 as Report 2 assumed
- Ad-hoc patches: 6 locations (not 4 as Report 2 assumed)
- 22 tools deleted in Phase A (not 13); manifest reduced 56 → 38
- SP3 schemas NOT stable: 15 commits to `meta-state.js` since 2026-06-05

---

## 2. Decision

| Question | Answer |
|----------|--------|
| Design basis | Adapt Report 2 (update numbers, same core idea) |
| SP3 stability | Proceed anyway — TDD Phase 0 catches divergence |
| schema-to-zod.js | Create fresh per design |
| Scope this session | B1-B2 only (core fix); B3-B6 deferred |
| Wire-format tests | Update to assert flat arrays |

---

## 3. Adapted Design — B1-B2

### B1 — SP3 Stability Check (~5 min)

Mechanical, informational. `git log --since="2026-06-05"` on `meta-state.js`. Document the 15 commits. Not a gate — TDD catches divergence.

### B2 — Core Fix (4 sub-phases, ~3-4h)

**B2-0 — TDD Tests (4 new + 2 updated)**

New: `__tests__/meta-state-patch-derived-schema.test.js`
1. `proposed_design_for: string[]` round-trips flat
2. `addresses: string[]` round-trips flat
3. stdio client passes array as JSON string → flat array back
4. stdio client passes object → object back

Updated: `wire-format-top-level-coercion.test.js`, `wire-format-patch-recursion.test.js` — change `{item: [...]}` assertions to flat arrays.

**B2-1 — Codegen: `buildPatchSchemaFor(kind)`**

Create `core/schema-to-zod.js`:
- Reads per-kind Zod from `metaStateEntrySchema`'s 4 branch schemas (`metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`)
- Marks all fields optional (patches are partial)
- Returns strict-typed Zod object per kind
- `meta_state_patch`'s `patch` field becomes `z.union([findingPatch, changeLogPatch, rulePatch, loopDesignPatch])`

**B2-2 — Wire `meta_state_patch` to Derived Schema**

Update `tools/meta-state-patch-tool.js`:
- Replace `z.object({}).passthrough()` with derived union schema
- Handler selects per-kind schema via `entry_kind` discriminator

**B2-3 — Delete `unwrapItemWrap`, Revert Ad-hoc Patches**

Delete:
- `unwrapItemWrap` helper from `tool-registry.js:58-75`

Revert both-shapes tolerance (6 locations):
1. `core/loop-introspect.js:351-355` — `proposed_design_for.item` unwrap
2. `scripts/fix-loop-design-refs.mjs:37-38` — `proposed_design_for.item` unwrap
3. `__tests__/fix-loop-design-refs.test.js` (lines 19, 44, 54, 101) — `proposed_design_for.item` unwrap
4. `__tests__/cold-tier-regression.test.js:28` — `proposed_design_for.item` unwrap
5. `__tests__/meta-state-list-ref-by-filter.test.js:86-87` — wire-format wrap test → assert flat
6. `tools/meta-state-list-tool.js:58` — `value.item` guard for list filtering

**B2-4 — Run Full Suite, Close Findings**

- `pnpm test` — all 862 pass
- Resolve `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5`
- Resolve `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig`
- File `meta_state_log_change`

---

## 4. Deferred (B3-B6, follow-up sessions)

| Phase | What | Why defer |
|-------|------|-----------|
| B3 | Apply derived schema to all `meta_state_*` tools | B2 fixes the blocker; broader adoption is incremental |
| B4 | Full test suite gate | B2-4 covers patch tool scope |
| B5 | `schema-to-zod.js` as single source for all 4 kinds | B2-1 creates the file; B5 expands it |
| B6 | Promote loop-design to inactive | Depends on B3-B5 shipping |

---

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SP3 schema changes during implementation | medium | TDD Phase 0 catches divergence immediately; regen is mechanical |
| `unwrapItemWrap` deletion breaks stdio coercion | low | Outer `coerceParamsToSchema` stays; only the inner unwrap is removed. Wire-format tests updated to assert new behavior |
| 6 ad-hoc patches have hidden side effects | low | Each revert is separate commit; 862-test suite catches regressions |
| `meta_state_list` value.item guard removal breaks list filtering | medium | Must verify `meta-state-list-tool.js:58` is only hit by passthrough-derived data, not by direct flat arrays |

---

## 6. Unresolved Questions

None — all scoping decisions confirmed by user.

---

## 7. Cross-References

- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` Phase B
- **Bridge 5 design (source):** `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md`
- **Schema source:** `tools/learning-loop-mcp/core/meta-state.js` (4 per-kind schemas + `metaStateEntrySchema` union)
- **Patch tool:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (passthrough ZodObject at line ~20)
- **Coercion helpers:** `tools/learning-loop-mcp/tool-registry.js:58-75` (`unwrapItemWrap`) and `:77-134` (`coerceParamsToSchema`)
- **Wire-format tests:** `__tests__/wire-format-top-level-coercion.test.js`, `__tests__/wire-format-patch-recursion.test.js`
- **Active findings:** `meta-260612T1131Z-...` (next-up), `meta-260612T0058Z-...` (wire-format quirk)
- **Loop-design:** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`

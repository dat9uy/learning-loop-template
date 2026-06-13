# Bridge 5 Core Fix — Cook Journal (2026-06-13)

## Pre-state

- **Commits to `core/meta-state.js` since 2026-06-05:** 15
- **Most recent commit:** `29c7f2a` — `chore(fallow): suppress 48 complexity findings across 21 Bucket A files` (Jun 13 15:42)
- **Test baseline:** 862 tests (861 pass, 1 skip, 0 fail)
- **Wrap sites before migration:** 1 (`loop-design-instruction-layer.proposed_design_for`)

## What shipped

**New files:**
- `__tests__/meta-state-patch-derived-schema.test.js` — 3 stdio regression tests (2 RED → GREEN, 1 regression guard)

**Modified files:**
- `core/meta-state.js` — added `buildPatchSchemaFor(kind)` + `PATCH_KINDS` (~30 lines); added `__proto__`/`constructor` delete defense at line 376
- `tools/meta-state-patch-tool.js` — replaced `z.object({}).passthrough()` with `z.union(PATCH_KINDS.map(buildPatchSchemaFor))`; removed `entry_kind` from `IMMUTABLE_PATCH_FIELDS` (schema literal already prevents kind changes)
- `tools/meta-state-list-tool.js` — deleted local `unwrapItemWrap` copy (lines 55-62); updated call site to read `e.proposed_design_for` directly
- `core/loop-introspect.js` — reverted both-shapes tolerance in `buildRegistrySummary`
- `scripts/fix-loop-design-refs.mjs` — reverted both-shapes tolerance
- `__tests__/fix-loop-design-refs.test.js` — reverted 4 both-shapes tolerance sites
- `__tests__/cold-tier-regression.test.js` — reverted both-shapes tolerance in flatMap
- `__tests__/meta-state-list-ref-by-filter.test.js` — flipped wrap-tolerance test to flat
- `__tests__/wire-format-top-level-coercion.test.js` — no changes needed (inputs still use `{item: [...]}`, outputs already flat)
- `__tests__/wire-format-patch-recursion.test.js` — Test 1 changed from wrapped to flat patch object
- `__tests__/meta-state-patch-tool.test.js` — deny-list test fixed (removed `version` from patch, added `resolved_at`)

**Commits in Phase 5:** 3 (script+test, core+cold-tier, list+wire-format)

**Migration:** 1 live wrap site at `meta-state.jsonl:21` (`loop-design-instruction-layer.proposed_design_for`) flattened via `updateEntry` in Phase 4 Part 2.

**Side effect:** `updateEntry`'s compaction logic removed 1 resolved finding >7 days old (`meta-260606T1656Z-cold-session-test-must-pass-before-resolution`). Restored via `meta_state_batch`.

## Verification

- **Test counts:** 865 tests (863 pass, 1 fail — cold-tier fingerprint drift, 1 skip)
- **Cold-tier fingerprint drift:** `core/meta-state.js` hash changed from Phase 3 codegen; fingerprint refreshed in Phase 6
- **Wrap sites post-migration:** 0
- **Fingerprints refreshed:** 2 findings (both grounded)
- **Findings resolved:** 2 (`meta-260612T1131Z-...`, `meta-260612T0058Z-...`)
- **Change-log filed:** `meta-260614T0031Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js-schem`

## Unresolved (deferred to follow-up sessions)

| ID | Gap | Suggested session |
|----|-----|-------------------|
| LIM-1 | `core/schema-to-zod.js` recreation for B5/B6 | B5 |
| LIM-2 | `metaStateEntryPatchSchema` passthrough for `_expected_version` | B5 |
| LIM-3 | `meta_state_resolve` / `meta_state_log_change` caller-identity check | Follow-up |
| LIM-4 | `meta_state_refresh_fingerprint` path traversal | Follow-up |
| LIM-5 | Test harness `child.kill()` SIGTERM + no temp cleanup | Test-hardening |
| LIM-6 | `meta_state_log_change` 60s `_idempotencyCache` | Audit-hardening |
| LIM-7 | 22 of 38 MCP tools still hand-write Zod | B3 |
| LIM-8 | 3 other tools use `z.object({}).passthrough()` | Follow-up |
| LIM-9 | `meta_state_batch` bypass at line 483 | Follow-up |

## Cross-references

- Master tracker: B1 + B2 marked complete
- Plan: `plans/260613-1853-phase-b-bridge-5-core-fix/`
- Precedent plans: `260611-2230-mcp-wire-format-coercion-fix/`, `260610-meta-state-patch-wire-format-recursion/`

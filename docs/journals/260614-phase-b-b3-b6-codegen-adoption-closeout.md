# Phase B (B3-B6) Closeout — Codegen Adoption, LIM-2 Fix, Loop-Design Flip

**Date**: 2026-06-14 18:04
**Severity**: Low
**Component**: meta_state MCP tools, Bridge 5 codegen, LIM-2 passthrough, loop-design registry
**Status**: Resolved

## What Happened

Phase B (B3-B6) shipped in a single session on branch `260614-1259-phase-b-codegen-adoption`. Three atomic deliverables:

1. **B3+B4 — Codegen adoption for 2 tools** (not 6). Red-team review narrowed the candidate list from 6 to 2. `meta_state_log_change` migrated to `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS)`. `meta_state_propose_design` migrated to `metaStateLoopDesignSchema.pick(MIGRATED_FIELDS).merge({ loop_design_id })`. Both got parity tests (TDD-first, RED-GREEN). Four tools (`promote_rule`, `batch`, `resolve`, `supersede`) reclassified as NOT candidates — their schemas have tool-level parameters or intentionally loose handler-validated pre-filters that do not benefit from codegen.

2. **B5 — LIM-2 script-caller passthrough fix.** The original plan proposed `z.intersection` in `buildPatchSchemaFor`; red-team review proved `ZodIntersection` has no `.shape` and would break `coerceParamsToSchema` wire-format coercion for ALL patch fields. Replaced with tool-level optional fields (`mechanism_check`, `code_fingerprint`) in the patch tool schema, forwarded into `patch` only for `entry_kind: "finding"`. `code_fingerprint` remains immutable (already in `IMMUTABLE_PATCH_FIELDS`). Added 6 LIM-2 regression tests.

3. **B6 — Loop-design flip.** One `meta_state_patch` call flipped `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` from `status: active` to `inactive`, populated `shipped_in_plan` and `shipped_at`. No code changes. Audit-trail `meta_state_log_change` filed. Master tracker updated: B1-B6 all closed, LIM-2 and LIM-7 resolved.

## The Brutal Truth

This was supposed to be a 6-tool migration. It became a 2-tool migration + 1 bug fix + 1 metadata flip. The red-team review saved us from shipping a `z.intersection` regression that would have silently broken stdio round-trips for every patch field. That is the real win — not the migration count. The frustration is that the original LIM-7 audit claimed "22 of 38 MCP tools still hand-write Zod" and the Bridge 5 proposal implied a broad codegen surface, but when you actually trace each tool's schema against the entry source of truth, most tools have tool-level parameters or loose pre-filters that make raw `.shape` swaps dangerous. The red-team caught this before code was written. The lesson: audit the candidate list BEFORE writing the migration, not after.

## Technical Details

- **Test baseline**: 886 pass / 1 skip / 0 fail (up from 870 pass at start — the 16 new tests are the 2 parity tests + 6 LIM-2 regression tests + other incidental additions from the session). No regressions.
- **B3 migration**: `meta_state_log_change` schema now uses `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).shape` where `MIGRATED_FIELDS` omits handler-generated fields (`id`, `entry_kind`, `status`, `created_at`, `version`, `expires_at`, `affected_system`, `code_ref`, `ledger_ref`).
- **B4 migration**: `meta_state_propose_design` schema now uses `metaStateLoopDesignSchema.pick(MIGRATED_FIELDS).merge(z.object({ loop_design_id: z.string().optional() })).shape`. The `affected_system` enum widened from 6 to 15 values (source-of-truth enum); parity test asserts this.
- **B5 fix**: `meta_state_patch` tool schema gained `mechanism_check: z.boolean().optional()` and `code_fingerprint: z.string().optional()` at the top level. Handler forwards them into `patch` for finding entries only. `buildPatchSchemaFor` unchanged — still returns a plain `ZodObject`.
- **B6 flip**: `meta_state_patch` on `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` with `patch: { status: "inactive", shipped_in_plan: "plans/260614-1259-phase-b-codegen-adoption", shipped_at: "2026-06-14T..." }`. Auto-capture CAS used (no `_expected_version` race).

## What We Tried

- **Original B3 plan**: migrate 6 tools (`log_change`, `propose_design`, `promote_rule`, `batch`, `resolve`, `supersede`) using raw `.shape`. Red-team review rejected 4 of 6 as not genuine candidates.
- **Original B5 plan**: use `z.intersection` in `buildPatchSchemaFor` to add script-caller fields. Red-team review proved `ZodIntersection` breaks `coerceParamsToSchema` (no `.shape`, not handled by `unwrapTypeName`). Replaced with tool-level passthrough fields.
- **B6 plan**: initially considered backfilling `proposed_design_for` and `addresses` on the loop-design entry. YAGNI — the design's motivation is captured in the proposal report; the entry's shipped state is the relevant fact.

## Root Cause Analysis

The original LIM-7 audit and Bridge 5 proposal overestimated the codegen surface. They counted "hand-written Zod" as a uniform problem, but did not distinguish between:
1. Entry-constructing tools whose schemas are subsets of entry schemas (genuine candidates — 2 tools).
2. Tools with tool-level parameters not on the entry schema (NOT candidates — 4 tools).
3. Tools with intentionally loose handler-validated pre-filters (NOT candidates — `batch`).

The red-team review added this distinction. Without it, we would have shipped `.shape` swaps that either exposed ignored handler-generated fields or dropped tool-level parameters, and a `z.intersection` that regressed stdio wire-format coercion.

## Lessons Learned

1. **Audit the candidate list before writing migration code.** The red-team review on the PLAN (not the code) caught 4 of 6 mis-scoped migrations and a critical `z.intersection` regression. Cost: 30 minutes of review. Benefit: avoided 4 bad migrations + 1 stdio regression.
2. **`z.intersection` is a trap in this codebase.** `coerceParamsToSchema` expects `ZodObject` with `.shape`. Any intersection or union that loses `.shape` breaks stdio round-trips. Document this as a hard rule in `tool-registry.js` or `core/schema-to-zod.js`.
3. **The parity test is the real gate.** The byte-for-byte schema equivalence test (B2 pattern) caught the `affected_system` enum widening and the `loop_design_id` merge requirement before the migration shipped. TDD-first per-tool is the right rhythm.
4. **The "22 of 38 hand-written" metric is noise without per-tool analysis.** Future audits should categorize tools by schema type (entry-subset, tool-level params, loose pre-filter) before proposing migrations.
5. **Auto-capture CAS is safer than explicit `_expected_version` for registry flips.** The B6 flip used auto-capture to avoid a list→patch race. The retry loop in the plan was over-engineering; auto-capture handled it.

## Next Steps

1. **Phase C — Mastra migration** (unblocked by B6). Phase C-F depend on the Bridge 5 engine being adopted and the loop-design flip being complete. Both are now true. Master tracker blocks field flips from "blocked" to "unblocked".
2. **Hardening audit** (LIM-3, 4, 5, 6, 8, 9). Confirmed "next-up" per operator 2026-06-14. Not blocking Phase C, but should be scheduled before Phase C ships to production. LIM-4 (path traversal) is security priority.
3. **LIM-1** (full `core/schema-to-zod.js` recreation) — parked as `loop-design` entry behind Bridge 7. YAGNI for current meta-surface scope.
4. **Branch cleanup**: `260614-1259-phase-b-codegen-adoption` pushed to origin. PR review and merge to main.

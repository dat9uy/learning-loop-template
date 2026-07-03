---
phase: 1
title: "Rec 8 Collapse — stale-ref to derived view"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Rec 8 Collapse — stale-ref to derived view

## Overview
Stop the `stale-ref` producer (sweep), remove `stale-ref` from the category enum at all **three** sites, extend `meta_state_relationships` to surface the same information as a derived view (including the "superseded target" arm), migrate **all 30** existing stale-ref entries (16 `stale` + 14 `reported`) to `superseded` via 30× `meta_state_supersede` (non-atomic, with pre-flight id capture + partial-failure reconciliation), and re-tighten the cap test with 2 headroom.

## Requirements
- Functional: `stale-ref` is no longer a recorded finding kind; it is a query output. Sweep never emits a `stale-ref` follow-up. All 30 stale-ref entries (16 stale + 14 reported) are `superseded` with audit lineage (one change-log `consolidates` all 30). The derived view surfaces findings whose `ref_by`/`reopens` target is stale, missing, **or superseded**.
- Non-functional: registry single-writer; migration runs in the main worktree (serial); the migration is **non-atomic** (30 separate `meta_state_supersede` calls — `consolidated_into` is in `IMMUTABLE_PATCH_FIELDS` so `meta_state_batch` cannot set it; `metaStateBatch` has no `supersede` op); pre-flight captures all 30 ids + a partial-failure reconciliation procedure is documented.

## Architecture
`stale-ref` is a recorded category emitted by `meta_state_sweep` as a follow-up to each newly-stale entry (`meta-state-sweep-tool.js:94-108`, `category:"stale-ref"`, `mechanism_check:false`, `reopens:[t.id]`). The `mechanism_check:false` is intentional (comment `:86-88`) so the follow-up never counts in the cap. The same recursion makes 16 of 28 stale entries self-referential drift. Collapse = stop the producer + remove the category + replace its informational output with a derived query over the relationship graph.

**Migration scope (scout + red-team correction):** the registry has **30** stale-ref entries — 16 `stale` + 14 `reported` (verified against `meta-state.jsonl`). The 14 `reported` have `mc:false` + a 24h `expires_at`; if left, they age to `stale` carrying the removed category, breaking the "clean queue" goal and the stale-count criterion. **All 30** must be migrated. `meta_state_supersede` accepts any finding regardless of status (it only checks `entry_kind === "finding"` + that `consolidated_into` is a real change-log — `meta-state-supersede-tool.js:29-40`), so the 14 `reported` supersede directly.

**Migration mechanism (red-team C1 correction):** `consolidated_into` is in `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:280`); `metaStateBatch` enforces the deny-list (`:708-712`, throws `immutable_field`) and has no `supersede` op (`BATCH_OP_TYPES` `:659` = `write|update|delete|archive`). So `meta_state_batch` of `supersede` ops is **impossible**. The real path is **30× `meta_state_supersede`** — non-atomic. `meta_state_supersede` exists precisely to bypass the deny-list (it uses `updateEntry`, not the batch path). Pre-flight captures the ids; partial-failure reconciliation retries the failed ids.

The category enum lives at **three** sites (scout found the third): `core/meta-state.js:63` (exported `META_STATE_FINDING_CATEGORIES`), `:77` (schema `category` z.enum), and `docs/schemas.md:35` (doc). `core/loop-introspect.js:4,88-92` imports and spreads the exported const, so removing it there propagates automatically.

## Related Code Files
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` — remove the stale-ref follow-up emission block at `:94-108` (the `metaStateReportTool.handler({category:"stale-ref",...})` call); keep the transition itself. **Also update the stale `description` string at `:40`** (still claims "auto-resolve for entries whose watched file was modified after creation" — a path the handler lacks; red-team L1).
- Modify: `tools/learning-loop-mastra/core/meta-state.js` — remove `"stale-ref"` from `META_STATE_FINDING_CATEGORIES` at `:63` AND the schema `category` z.enum at `:77`.
- Modify: `tools/learning-loop-mastra/docs/schemas.md:35` — remove `stale-ref` from the documented category enum row.
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js` — **host of the derived view** (red-team/validation P1-W1: `meta_state_query_drift` → `core/query-drift.js` is code-context drift, the wrong tool; the relationships tool already walks `reopens`/`consolidates`/`supersedes` via `buildInverseIndexes`). Add a predicate/output that surfaces findings whose `ref_by`/`reopens` target is stale, missing, **or superseded**.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:66-79` — re-tighten threshold 25 → **12** (10 post-migration + 2 headroom for organic drift; red-team M1); update the `:66-72` TODO to reference this plan.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-stale-transition.test.js:168` — was pinning a sweep-produced stale-ref follow-up; now asserts no follow-up is produced.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-integration.test.js:88`, `meta-state-session-id-roundtrip.test.js:157-160` — used stale-ref as input/filter; retarget to a surviving category.
- Modify: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js:22` — fixture `category:"stale-ref"`; retarget.
- Create: a regression test asserting `meta_state_sweep({apply:true})` emits zero stale-ref follow-ups.

## Implementation Steps (TDD — tests first)
1. **Test first (red):** add a regression test that `meta_state_sweep({apply:true})` produces no `stale-ref` follow-up. Run; fails (sweep still emits at `:94-108`).
2. **Stop the producer:** in `meta-state-sweep-tool.js`, remove the `metaStateReportTool.handler({category:"stale-ref",...})` block (`:94-108`) — the operator prompt it carried is replaced by the derived view + Rec 10 surfacing (Phase 3). **Update the stale `description` at `:40`** to match the actual handler (only `checkExpiry` + `checkStaleness`). Re-run the regression test → green.
3. **Test first (red):** add a test that `META_STATE_FINDING_CATEGORIES` and the schema enum no longer include `stale-ref`, and that `meta_state_report({category:"stale-ref"})` is rejected. Run; fails.
4. **Remove the enum:** delete `"stale-ref"` from `core/meta-state.js:63` (exported const) AND `:77` (schema z.enum) AND `docs/schemas.md:35`. Run the test → green. Grep `stale-ref` in `tools/` + `docs/` → only test/fixture retargets remain.
5. **Test first (red):** add a test that the derived view (`meta_state_relationships` in `meta-state-relationships-tool.js`) surfaces findings whose `ref_by`/`reopens` target is stale, missing, **or superseded**. Run; fails (the "superseded" arm is missing).
6. **Extend the derived view:** in `meta-state-relationships-tool.js`, add the "superseded target" arm so migrating the 30 to `superseded` does not re-trigger the view via inbound refs. Run → green.
7. **Retarget test pins:** update `meta-state-sweep-stale-transition.test.js:168`, `meta-state-integration.test.js:88`, `meta-state-session-id-roundtrip.test.js:157-160`, `phase-e-foundation/fixtures/meta-state-fixtures.js:22` to use a surviving category (e.g. `loop-anti-pattern` or `schema-drift`). Run affected suites → green.
8. **Pre-flight (capture all 30 ids):** run `meta_state_list({category:"stale-ref"})` (or a registry grep) and capture all 30 ids — assert the count is 30 (16 stale + 14 reported). Record the id list in the migration's gate-log. This is the verification step the migration depends on; without it the count is a guess (red-team P1-W7).
9. **Create the change-log:** `meta_state_log_change({change_dimension:"surface", change_target:"meta-state-finding-categories", change_diff:{removed:["stale-ref"]}, reason:"stale-ref category migrated to derived view; recursion collapsed across all 30 entries", consolidates:"<id1>,...,<id30>"})` → captures the change-log id.
10. **Migrate all 30 (serial, in the main worktree):** call `meta_state_supersede({id, consolidated_into:"<change-log-id>"})` 30 times (one per id, in the pre-flight id list). `meta_state_supersede` is operator-gated (`OPERATOR_MODE=1`), accepts any finding status, and uses `updateEntry` (bypasses the `IMMUTABLE_PATCH_FIELDS` deny-list). This is **non-atomic** — see Rollback/Reconciliation.
11. **Reconcile partial failure:** after the 30 calls, run `meta_state_list({category:"stale-ref"})` again — assert 0 remain. If any failed (e.g. `version_mismatch`), retry those ids. Document the final count in the gate-log.
12. **Re-tighten the cap test:** in `cold-tier-regression.test.js:77`, lower the threshold from 25 to **12** (post-migration count 10 + 2 headroom for organic drift; red-team M1). Update the `:66-72` TODO to reference this plan. Run the cap test → green (count 10 ≤ 12).
13. **Verify:** `pnpm test` green; `grep -rn "stale-ref" tools/ docs/` returns no production sites; `meta_state_list({status:"stale"})` total = 12 (the 10 `mc=true|null` real underlying + 2 other `mc=false` stale that survive — verify the actual post-migration count and adjust the criterion if it differs).

## Success Criteria
- [ ] Pre-flight: `meta_state_list({category:"stale-ref"})` returns 30 ids (16 stale + 14 reported); recorded in the gate-log.
- [ ] Regression test: `meta_state_sweep({apply:true})` emits zero stale-ref follow-ups (green; fails on pre-fix sweep).
- [ ] `stale-ref` absent from `core/meta-state.js:63`, `:77`, AND `docs/schemas.md:35`.
- [ ] `meta_state_report({category:"stale-ref"})` rejected by schema.
- [ ] Derived view (`meta_state_relationships`) surfaces stale/missing/superseded ref targets (the "superseded" arm tested).
- [ ] All 30 stale-ref entries migrated to `superseded` under one change-log (30× `meta_state_supersede`); post-migration `meta_state_list({category:"stale-ref"})` = 0; `meta_state_list({status:"stale"})` total ≈ 12 (verify actual count; the 14 reported no longer age to stale).
- [ ] Cap-test count = 10; threshold re-tightened 25 → 12 (10 + 2 headroom); cap test green.
- [ ] Sweep tool `description` at `:40` updated to match the actual handler.
- [ ] `pnpm test` green; `pre-commit` hook (`pnpm test && pnpm fallow:gate`) passes.

## Risk Assessment
- **Critical — sweep emits stale-ref at `:94-108`; removing the enum first breaks sweep at runtime** (schema validation failure on the follow-up report — `writeEntry` throws `InvalidEntryError`, caught by the try-catch at `:111`, logged; graceful degradation, not a crash, but the follow-up is lost). Mitigation: stop the producer (step 2) BEFORE removing the enum (step 4). The regression test (step 1) gates this order.
- **Critical — `meta_state_batch` of `supersede` ops is impossible** (`consolidated_into` in `IMMUTABLE_PATCH_FIELDS` `:280`; `metaStateBatch` enforces the deny-list `:708-712`; no `supersede` op in `BATCH_OP_TYPES` `:659`). Mitigation: use 30× `meta_state_supersede` (uses `updateEntry`, bypasses the deny-list). **Non-atomic** — partial-failure reconciliation in step 11.
- **Critical — 30 stale-ref entries, not 16** (14 `reported` with a 24h TTL age to stale carrying the removed category). Mitigation: migrate all 30 (step 8 pre-flight asserts the count; step 10 migrates the full set).
- **High — `stale-ref` lives at THREE sites, not two:** `core/meta-state.js:63` + `:77` + `docs/schemas.md:35`. Remove from all three or `schemas.md` drifts.
- **Medium — test pins break.** `meta-state-sweep-stale-transition.test.js:168` pins a sweep-produced stale-ref (changes with step 2); three others use stale-ref as input/filter. Step 7 retargets all four.
- **Medium — cap-test threshold of 10 has zero headroom** (any new stale `mc=true|null` finding fails CI). Mitigation: re-tighten to 12 (10 + 2 headroom); exceeding 12 requires a threshold bump or finding resolution (red-team M1).
- **Low — cap-test re-tighten to 3 (the original) fails** because 10 real underlying issues remain. This plan re-tightens to 12; re-tightening to 3 is a follow-up (resolving the 10 real issues), not this plan.

## Rollback / Reconciliation
- **Pre-flight (step 8):** run against a throwaway worktree/registry copy first — `meta_state_batch` has no `apply`/`dry` flag (validation P1-W7), so the migration is not previewable. Copy `meta-state.jsonl` + `runtime-state.jsonl` to a temp location, point the MCP server at it, run steps 9-11 there, then run against the live registry.
- **Partial failure (step 11):** if some `meta_state_supersede` calls fail, the change-log's `consolidates` list (all 30) disagrees with reality. Reconciliation: `meta_state_list({category:"stale-ref"})` returns the un-migrated ids; retry those. A superseded entry's `consolidated_into` is harmless on a non-superseded entry, so a failed call leaves no damage — only the absence of the transition.
- **Full rollback (if the whole phase needs undoing):** the change-log is immutable (cannot delete); to "undo," patch each superseded finding back to its prior status (`meta_state_patch({id, status:"stale"})` for the 16, `status:"reported"` for the 14 — `status` is patchable, not in `IMMUTABLE_PATCH_FIELDS`) and restore the enum at all three sites. The change-log stays as an audit record of the attempt.
- **24h TTL window:** run steps 8-11 within the same session if possible; if the 14 `reported` entries age to `stale` mid-migration, they are still `category:"stale-ref"` and migrate the same way (the migration is status-agnostic).

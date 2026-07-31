---
phase: 3
title: "Migrate Consumers + Preserve reopens Symmetry"
status: completed
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Migrate Consumers + Preserve reopens Symmetry

## Overview

Migrate every consumer of the 3 forward + 2 inverse implementations to `core/entry/relationship-graph.js`, **one consumer at a time behind the Phase 1 characterization oracle** — the highest-blast-radius phase. Order: (1) the 4 factories' `outboundRefs`/`inboundRefs` → graph; (2) `loop-introspect.buildInverseIndexes` → graph (preserve 6-map shape, collapse the dual-source to canonical `rule.origin`, add the forward `reopens` the index layer lacked); (3) the relationships tool (KEEP the dual-field fallback but replace its per-query `buildInverseIndexes` rebuild with a targeted `inverseRefs` lookup — red-team R1; the wire shape + `computeDanglingRefs` STAY in the tool — red-team R10); (4) the CI validator (fix the `loop-design` kind-`"meta"` bug + omitted rule edges); (5) fold the two leaf helpers into the graph + keep them as thin re-exports (rollback-safe — red-team R10). Each migration has its own regression gate. The bug #1 regression-prevention test must stay green throughout — forward `reopens` + inverse `reopened_by` from one source. Update `build-inverse-indexes.test.js:67` (2→1 ref) + the `computeTopReferences`/`top_references` characterization + the cold-tier cache-version bump **in the same change** as the `loop-introspect` rewiring (red-team R5/R6).

## Requirements

- Functional: `core/entry/{finding,rule,change-log,loop-design}.js` `outboundRefs`/`inboundRefs` delegate to the graph; drop bespoke extractors + `rule.js:64-82` `seenPromotedFrom` dual-field block. Keep the factory shell + non-relationship methods (`isOpen`, `isStaleView`, `isBlocking`, `matches`, `appliesTo`, `checkResolutionEvidence`, `supersedes()`) + the frozen-output contract.
- Functional: `core/loop-introspect.js#buildInverseIndexes` (`:613-624`) + `indexX` (`:658-723`) delegate to the graph's `buildInverseIndexes`; the 6-map export shape is preserved; `indexOrigin`/`indexPromotedToRule` (`:672-691`) collapse to canonical `rule.origin` (1 ref). `buildColdTierCache` (`:588-598`) + `computeTopReferences` (`:795-814`) call the graph. The cache (`core/loop-introspect-cache.js`) is SHA-based on 3 file content hashes — centralization does NOT change cache keys (verify).
- Functional: `tools/handlers/meta-state-relationships-tool.js` **KEEPS** the dual-field `resolveOutboundRefs` fallback (`:195-209`) but replaces the per-query `buildInverseIndexes` O(N) rebuild (`:200`) with a **targeted `inverseRefs(findingId, entries)` lookup** — so a legacy finding without `promoted_to_rule` still resolves `outbound.promoted_to_rule` from `rule.origin` (the snapshot test `meta-state-relationships-snapshot.test.js:73-78` stays green — red-team R1; the fallback PERSISTS, only its cost drops). `groupOutbound`/`groupInbound`/`INBOUND_KEY_MAP` + `computeDanglingRefs` STAY in the tool (presentation + needs `stale-view` — red-team R10; the graph is pure, so they cannot move). `outbound.reopens` populated AND `inbound.reopened_by` populated — bug #1 test green.
- Functional: `scripts/validate-registry-refs.js` `OUTBOUND_EXTRACTORS` (`:107-130`) replaced by the graph's `forwardRefs` — fixes `loop-design` kind `"meta"`→`"finding"` (`:126`) and emits rule `supersedes`/`applies_to_resolution` (currently omitted, `:121-123`). Stays decoupled (no `stale-view` import — the graph is pure).
- Functional: update `__tests__/legacy-mcp/build-inverse-indexes.test.js:67` from `length === 2` → `length === 1` (canonical `rule.origin`) **in the same commit** as the `loop-introspect` rewiring; the test now asserts the correct 1-ref semantic + that the legacy `finding.promoted_to_rule` is no longer double-counted (a stronger assertion). Update the relationships-snapshot fallback test (`__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js:63-83`) if the fallback's output shape changes.
- Functional: delete `core/entry/consolidates-refs.js` + `core/entry/inbound-from-loop-design.js` **after** all their consumers (change-log.js, validate-registry-refs.js, finding.js, rule.js) repoint to the graph's re-exports; run import-chain analysis (rule hint 7) before each deletion.
- Non-functional: no `reopens`/`cascade_from` public-contract change (preserved unchanged); legacy `finding.promoted_to_rule` data preserved on disk.

## Architecture

```
Consumer migration order (each gated):

1. core/entry/finding.js, rule.js, change-log.js, loop-design.js   ← MODIFY
   outboundRefs/inboundRefs → import { forwardRefs, inverseRefs } from "./relationship-graph.js"
   drop: finding.js inline inboundFromChangeLog re-derivation (:14-27), local inboundFromRule/inboundFromFinding,
         rule.js seenPromotedFrom dual-field block (:66-82), change-log.js direct parseConsolidates import,
         loop-design.js bespoke kindForId (:11-17) — graph owns it
   keep: factory shell, isOpen/isStaleView/isBlocking, rule matches/appliesTo/checkResolutionEvidence/supersedes()

2. core/loop-introspect.js   ← MODIFY
   buildInverseIndexes (:613-624) → import { buildInverseIndexes } from "./entry/relationship-graph.js"
     (re-export under the same name, or thin wrapper) — PRESERVE the 6-map export shape
   delete indexX (:658-723), indexOrigin/indexPromotedToRule (:672-691)
   buildColdTierCache (:588-598), computeTopReferences (:795-814) → call the graph
   ⚠️ the graph now ALSO provides forward reopens (the index layer's gap) — consumed where forward reads happen

3. tools/handlers/meta-state-relationships-tool.js   ← MODIFY
   resolveOutboundRefs (:195-209): KEEP the fallback but REPLACE the per-query buildInverseIndexes O(N) rebuild (:200)
     with a targeted inverseRefs(findingId, entries) lookup → legacy findings without promoted_to_rule keep
     outbound.promoted_to_rule (snapshot test :73-78 stays green — red-team R1; the fallback PERSISTS, cheaper)
   groupOutbound/groupInbound/INBOUND_KEY_MAP (:14-58): STAY here (presentation logic — red-team R10)
   computeDanglingRefs (:101-128): STAYS here (needs stale-view; cannot move into the pure graph — red-team R10)

4. scripts/validate-registry-refs.js   ← MODIFY
   OUTBOUND_EXTRACTORS (:107-130): REPLACE with import { forwardRefs } from "../core/entry/relationship-graph.js"
     → FIXES loop-design kind "meta"→"finding" (:126) + emits rule supersedes/applies_to_resolution (:121-123)
   keep native isStaleViewLike/isTerminalSource (:67-100) — do NOT couple to stale-view (graph stays pure)

5. core/entry/consolidates-refs.js, inbound-from-loop-design.js   ← KEEP as thin re-exports (rollback-safe — red-team R10)
   fold parseConsolidates/inboundFromLoopDesign bodies into relationship-graph.js; keep the two files as
   `export { parseConsolidates } from "./relationship-graph.js"` re-exports so reverting an earlier factory-migration
   commit does NOT break imports (the bespoke factory code imported these by path). A hard delete creates a rollback
   hole; defer the actual file deletion to a separate stable PR once the migration is confirmed, or keep re-exports indefinitely
```

### ⚠️ Cache bust: bump a cache-version constant (red-team R5, validation-chosen)

`core/loop-introspect-cache.js` invalidates on 3 file-content SHAs; centralization is a CODE-only change that does NOT
mutate the registry → the SHAs are unchanged → the on-disk cache (`records/meta/.cache/loop-describe-cold.json`,
gitignored at `.gitignore:21`, ~876KB present) HITs and serves the OLD 2-ref `promoted_to_rule_inverse` + stale
`top_references` until the next registry write. Tests use fresh temp registries (cache miss → rebuild) so they never
hit this. **Step (same PR as the `loop-introspect` rewiring, validation-confirmed):** bump a cache-version constant
embedded in the cache payload (`core/loop-introspect-cache.js`) so the first read after deploy rebuilds with the
graph's logic. The constant is durable — it survives a stale cache file left by an earlier deploy (a file-delete step
would not). Without this, warm and cold `loop_describe` tiers disagree after a code-only deploy.

### Why the order matters

The factories feed the relationships tool; `buildInverseIndexes` feeds `loop-describe` + `meta_state_list`. Migrating the factories first (step 1) and `buildInverseIndexes` second (step 2) means the graph is the source before the tools (step 3) + validator (step 4) repoint — so each tool migration proves against a graph already exercised by the factories. The dual-field test update (step 2) is co-located with the `loop-introspect` rewiring because the test locks the exact behavior the rewiring changes — updating it in a separate commit would leave a transient red. The two leaf-helper deletions (step 5) come last so every consumer has already repointed; import-chain analysis (not keyword-grep) confirms zero importers before `rm`.

### Why the fallback gets cheaper (not deleted — red-team R1)

The relationships tool's dual-field fallback (`:195-209`) patches `outbound.promoted_to_rule` from `origin_inverse` for a legacy finding lacking the field. **It must PERSIST** — deleting it regresses `outbound.promoted_to_rule` for ~33 live findings (only 2 findings carry `promoted_to_rule`; 35 rules carry `origin`), and the snapshot test (`meta-state-relationships-snapshot.test.js:73-78`) explicitly locks the patched value for a finding WITHOUT the field. The outbound path calls `factory.outboundRefs` (= `forwardRefs(entry)`), which reads the finding's OWN field — it does NOT call `inverseRefs`, so "the inverse is available directly" was wrong. What changes: the fallback's **cost** drops — the per-query `buildInverseIndexes(entries)` O(N) rebuild (`:200`) becomes a targeted `inverseRefs(findingId, entries)` lookup (find rules whose `origin === findingId`). The fallback PERSISTS; only its O(N)-per-query cost is removed.

## Related Code Files

- Modify: `core/entry/finding.js`, `rule.js`, `change-log.js`, `loop-design.js`, `index.js`, `core/loop-introspect.js`, `tools/handlers/meta-state-relationships-tool.js`, `tools/handlers/meta-state-relationship-validate-tool.js` (optional richer lint), `scripts/validate-registry-refs.js`
- Modify (test): `__tests__/legacy-mcp/build-inverse-indexes.test.js` (`:67` 2→1), `__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js` (fallback PERSISTS — assert :73-78 still green after the targeted-`inverseRefs` swap; `computeTopReferences`/`top_references` characterization updated per red-team R6)
- Keep as re-exports (rollback-safe — red-team R10): `core/entry/consolidates-refs.js`, `core/entry/inbound-from-loop-design.js`
- Modify (cache-bust — red-team R5): `core/loop-introspect-cache.js` (bump a cache-version constant) OR a deploy step deleting `records/meta/.cache/loop-describe-cold.json`
- Read (verify cache): `core/loop-introspect-cache.js`; (verify consumers) `tools/handlers/loop-describe-tool.js` (`:184,232,238`), `tools/handlers/meta-state-list-tool.js` (`:24,36,118`)

## Implementation Steps (TDD — migrate one consumer per step, gate each)

### Tests Before (oracle already locked by Phase 1)

1. Re-run Phase 1 characterization + the 39 existing relationship/introspect tests — green baseline. These are the oracle each migration must preserve (except the deliberately-changed 2→1 dedup, gated in step 4).

### Implementation (one consumer per step)

2. **Factories (step 1):** rewrite each factory's `outboundRefs`/`inboundRefs` to delegate to `forwardRefs`/`inverseRefs`. Run `finding.test.js`, `rule.test.js`, `change-log.test.js`, `loop-design.test.js`, `index.test.js` → green. Run Phase 1 characterization → green (factory edges unchanged). Commit.
3. **`buildInverseIndexes` (step 2):** make `core/loop-introspect.js#buildInverseIndexes` delegate to the graph's `buildInverseIndexes` (preserve the 6-map export shape); delete the `indexX`/`indexOrigin`/`indexPromotedToRule` bodies. **In the same commit**, update `build-inverse-indexes.test.js:67` to `length === 1` + assert the legacy `finding.promoted_to_rule` is not double-counted; AND update the Phase 1 `computeTopReferences`/`top_references` characterization to the new 1-ref counts (red-team R6 — the 2→1 halves a dual-field rule's citation count; `loop_describe` warm `registry_summary.top_references` changes silently). **In the same commit**, bump the cold-tier cache-version constant in `core/loop-introspect-cache.js` (validation-chosen — red-team R5) so the first read after deploy rebuilds with the graph. Run `loop-introspect.test.js` + `build-inverse-indexes.test.js` → green. Run Phase 1 characterization → the 2-ref assertion now expects 1 (update with a "Phase 3 intended change" comment). Commit.
4. **Relationships tool (step 3):** KEEP the `resolveOutboundRefs` fallback but replace the per-query `buildInverseIndexes` O(N) rebuild (`:200`) with a targeted `inverseRefs(findingId, entries)` lookup (red-team R1 — the fallback PERSISTS so legacy findings keep `outbound.promoted_to_rule`). `groupOutbound`/`groupInbound`/`INBOUND_KEY_MAP` + `computeDanglingRefs` STAY in the tool (red-team R10). Run `meta-state-relationships-snapshot.test.js` (`:73-78` legacy-finding fallback assertion stays GREEN — the targeted lookup preserves it) + the 6 legacy relationship tests + the **bug #1 `reopens-symmetry.test.js`** → green (forward `reopens` + inverse `reopened_by` populated). Commit.
5. **CI validator (step 4):** replace `OUTBOUND_EXTRACTORS` with `forwardRefs`. Run `__tests__/legacy-mcp/validate-registry-refs.test.js` → the characterization assertions for the `loop-design` kind-`"meta"` bug + omitted rule edges now flip to the FIXED behavior (update those characterization assertions to the correct behavior, comment "Phase 3 fix"). Run the post-merge validator script against the live registry → no new dangling refs (the kind fix may surface previously-misclassified edges; record them). Commit.
6. **Leaf-helper fold + re-export (step 5 — red-team R10):** fold `parseConsolidates` + `inboundFromLoopDesign` bodies into `relationship-graph.js`; keep `consolidates-refs.js` + `inbound-from-loop-design.js` as THIN RE-EXPORTS (`export { ... } from "./relationship-graph.js"`) — do NOT hard-delete (a revert of an earlier factory-migration commit would break imports otherwise). Run import-chain analysis (`grep -rl "consolidates-refs\|inbound-from-loop-design"`) to confirm only the graph + re-exports reference the bodies; defer the actual file deletion to a separate stable PR. Run the full relationship suite → green.

### Verification

7. Run the entire relationship/introspect suite (Phase 1 + Phase 2 + the 39 existing) → green.
8. Run the bug #1 `reopens-symmetry.test.js` → green (forward + inverse from one source). Spot-check `meta_state_relationships({id: <child-with-reopens>, direction:"outbound"})` returns `outbound.reopens` populated (CLI: `node bin/loop.mjs meta_state_relationships '{...}'`).
9. Spot-check the 4 existing live `reopens` edges still read fine (none re-appended; RI is Phase 4, not yet live).

## Success Criteria

- [x] All 4 factories delegate `outboundRefs`/`inboundRefs` to the graph; bespoke extractors + the rule.js dual-field block dropped; non-relationship factory methods preserved
- [x] `loop-introspect.buildInverseIndexes` delegates to the graph; 6-map export shape preserved; `indexX`/`indexOrigin`/`indexPromotedToRule` deleted; `build-inverse-indexes.test.js:67` updated to 1 ref + the `computeTopReferences`/`top_references` characterization updated (red-team R6) + the cold-tier cache-version bumped/deploy-step added (red-team R5) — **all in the same commit** as the rewiring
- [x] Relationships tool: dual-field fallback PERSISTS but the per-query O(N) rebuild is replaced with a targeted `inverseRefs` lookup (red-team R1); wire shape + `computeDanglingRefs` stay in the tool (red-team R10); `outbound.reopens` + `inbound.reopened_by` both populated (bug #1 test green); the legacy-finding `promoted_to_rule` snapshot assertion (`:73-78`) stays green
- [x] CI validator: `OUTBOUND_EXTRACTORS` → `forwardRefs`; `loop-design` kind now `"finding"`; rule `supersedes`/`applies_to_resolution` emitted; stays decoupled (no `stale-view` import)
- [x] `consolidates-refs.js` + `inbound-from-loop-design.js` kept as thin re-exports (rollback-safe — red-team R10); actual file deletion deferred to a separate stable PR
- [x] No `reopens`/`cascade_from` public-contract change; legacy `finding.promoted_to_rule` data preserved on disk; warm + cold `loop_describe` tiers agree after deploy (cache busted)
- [x] Phase 1 + Phase 2 + the 39 existing relationship/introspect tests all green; the characterization divergences updated to reflect the intended fixes (2→1 dedup, kind fix, omitted edges, top_references counts)

## Risk Assessment

**Highest — blast-radius phase.** Five consumers migrate; the dual-field test locks behavior the rewiring changes; the CI validator has a kind bug whose fix may surface previously-hidden dangling edges. Mitigations:
- **One consumer per commit + per-commit regression gate** (steps 2-6) — a regression localizes to the last migration, not the whole phase. The Phase 1 characterization oracle is the equivalence check; intended changes (2→1 dedup, kind fix, omitted edges) are explicit assertion updates with comments, not silent passes.
- **The 2→1 dedup test update must be co-located with the `loop-introspect` rewiring** — splitting them leaves a transient red. The updated assertion is *stronger* (asserts the legacy field is no longer double-counted), so it reads as a fix, not a weakening.
- **The CI validator kind fix** (`"meta"`→`"finding"`) may reclassify existing edges — run the validator against the live registry after step 5 and record any newly-surfaced dangling edges; they are pre-existing data, not regressions (Phase 4 RI is not yet live, so no write is blocked).
- **The bug #1 test must stay green at every step** — it is the regression gate for the forward `reopens` symmetry. If a migration drops it, the test fails immediately; the fix is the graph's forward `reopens` resolution, not a tool-layer patch.
- **Cache-key safety:** `loop-introspect-cache.js` invalidates on 3 file-content SHAs — centralization changes no file SHA logic; verify `buildColdTierCache` still calls `buildInverseIndexes` (now the graph's) and the cache round-trips. If the graph's `buildInverseIndexes` returns maps with different value-array identity (not shape), the cold-tier snapshot may differ — the test `loop-introspect.test.js` / `build-inverse-indexes.test.js` catches it.
- **Import-cycle guard:** after folding the two leaf helpers, `grep -r "from.*meta-state\|require.*meta-state"` on `relationship-graph.js` must return zero (the module stays pure); a cycle would surface as a test-time import error.

---
title: "Relationship Model — Centralize Source of Truth, Defer reopens/cascade_from Drop"
description: "Resolve meta-260623T1126Z + meta-260715T2237Z + meta-260717T1004Z via Approach C: centralize the inter-entry relationship model into one declarative pure module (core/entry/relationship-graph.js) owning cross-ref fields per kind, forward+inverse resolution, and write-time structural RI (id-existence) — consumed by the 4 kind-factories, loop-introspect's buildInverseIndexes, the relationships tool, the validate tool, and the CI validator. The retrieval wire shape stays in the tool. Collapses the 3 parallel forward-ref + 2 divergent inverse implementations; the dual-field promoted_to_rule/origin fallback persists but cheaper (targeted inverseRefs, not an O(N) rebuild) so legacy findings keep outbound.promoted_to_rule. Fixes the validator's pre-existing kind-divergence bugs. Adds assertinvariant-wrapped write-time RI (target-id-exists; new-appends-only; update-changed-only; applies_to_resolution exempt; kind-match + liveness out of scope) at writeEntry/updateEntry/metaStateBatch; tryClaimSessionId gets a defensive comment (test-only, bypasses writeEntry). Preserves forward reopens symmetry — the index layer (buildInverseIndexes) builds only inverse reopens_inverse, so centralization must not regress the factory's forward read; the dual-field 2→1 canonical rule.origin dedup updates build-inverse-indexes.test.js + computeTopReferences/top_references in the same change. Cold-tier cache (gitignored, SHA-keyed) gets a deploy-step bust so a code-only deploy doesn't serve stale 2-ref indexes. Documents the three-mechanism boundary (file-index = findings-on-a-file; typed edges = lifecycle lineage; cascade = closure policy) in meta-state-lifecycle.md + architecture.md + a docs note; no related_to field. reopens/cascade_from KEPT — drop explicitly deferred under #3's YAGNI gate. TDD-structured, one consumer migrated at a time behind existing tests."
status: pending
priority: P1
effort: "2.5d"
tags: [meta-state, relationship-model, refactor, tdd, assertinvariant, runtime-agnostic, drf]
created: 2026-07-30
---

# Relationship Model — Centralize Source of Truth, Defer reopens/cascade_from Drop

## Overview

Three open findings converge on one defect: the inter-entry relationship model grew across decentralized sites and conflates three distinct mechanisms. Under the shipped append-first (`meta-state.jsonl` versioned-append, `max_by(.version)`, no in-place mutation, no hard delete) + CLI-first (reads + writes ride `bin/loop.mjs`; the 2 wired runtimes — `.factory`, `.mastracode` — both set `LOOP_RECORDS_VIA_CLI=1`) architecture, this is both more visible and more consequential — a structural cross-ref written today is a *permanent versioned audit line*, so write-time referential-integrity validation is strictly more valuable, and fewer structural fields = fewer dangling-ref risks carried across versions.

- `meta-260623T1126Z` — relationships graph is unidirectional on `reopens` (outbound null on child).
- `meta-260715T2237Z` — relationships implemented/validated/retrieved across 4+ decentralized sites with dual-field + fallback logic; the validate tool only lints description-string id refs, not structural cross-ref fields.
- `meta-260717T1004Z` — the model conflates three mechanisms: file-grounding, lifecycle lineage, and cascade closure policy.

### What the scouts proved (current state, verified line-by-line)

The per-phase scouts confirmed the decentralization is worse than finding #2's audit and corrected one premise of finding #1:

- **Three forward-ref implementations** (not two): (1) the 4 kind-factories' `outboundRefs` (`core/entry/{finding,rule,change-log,loop-design}.js`); (2) `buildInverseIndexes`' per-kind `indexX` functions (`core/loop-introspect.js:658-723`); (3) `scripts/validate-registry-refs.js` `OUTBOUND_EXTRACTORS` (`:107-130`, deliberately standalone so the post-merge CI validator stays decoupled from runtime drift logic).
- **Two inverse implementations with divergent dedup**: `core/entry/rule.js:64-89` dedups `origin` vs `promoted_to_rule` via a `seenPromotedFrom` Set (1 ref); `core/loop-introspect.js:672-691` feeds `promoted_to_rule_inverse` from **both** `rule.origin` (`indexOrigin`, `pushUnique` — deduped) **and** `finding.promoted_to_rule` (`indexPromotedToRule`, `pushToIndex` — **not** deduped), so a dual-field entry yields **2 refs**, locked by `__tests__/legacy-mcp/build-inverse-indexes.test.js:67` (`assert.equal(ptrIds.length, 2, "dual-field unification populates from both sides")`).
- **The dual-field fallback patch** lives at `tools/handlers/meta-state-relationships-tool.js:195-209` (`resolveOutboundRefs`): for a finding whose `outboundRefs()` lacks `promoted_to_rule`, it calls `buildInverseIndexes(entries)` **per query** (line 200 — a full O(N) rebuild on every outbound read) and patches a synthetic ref from `origin_inverse.get(id)[0]`.
- **Validator pre-existing bugs centralization fixes**: `OUTBOUND_EXTRACTORS.rule` (`:121-123`) emits only `origin`, omitting `supersedes`/`applies_to_resolution`; `OUTBOUND_EXTRACTORS["loop-design"]` (`:126`) classifies non-rule targets as kind `"meta"` — the factory's `kindForId` (`loop-design.js:16`) returns `"finding"` (the canonical finding prefix is `meta-` but the *kind* is `finding`). Findings are misclassified as kind `"meta"` in the CI validator today.
- **Existing centralization is only 2 narrow leaf helpers**: `core/entry/consolidates-refs.js` (`parseConsolidates`, 1 field) and `core/entry/inbound-from-loop-design.js` (`inboundFromLoopDesign`, 1 inbound edge). The proposed module is genuinely additive, not duplicative.
- **Write-time structural RI does not exist**: `entryIdRefsRefine` (`core/meta-state.js:285-298`) over `ENTRY_ID_REF_PREFIXES = ["meta-","rule-","loop-design-"]` (`:268`) validates id **format/prefix only** — never target existence or kind. The only structural write-time check is `validateCascadeChildren` in `meta-state-resolve-tool.js:198-221` (reopens-only, cascade-only). The closest general check is the CI `computeDanglingRefs` (`validate-registry-refs.js:219-237`) wired in `.github/workflows/meta-state-refs-check.yml` — which triggers on BOTH `push: [main]` AND `pull_request:` (lines 52-55), so **within-PR dangling refs ARE caught pre-merge**; only cross-PR orphans (a ref in PR A to an entry in PR B) are caught post-merge (workflow comments lines 7-10: pre-merge cross-PR detection was down-tiered). So write-time RI's marginal benefit over the CI gate is **immediate agent feedback at write time + cross-PR orphan detection** — NOT "CI catches nothing." Append-first still makes a cross-PR orphan a permanent audit line, so write-time RI is the right enforcement point for that case; the honest scope is id-existence only (kind-match and liveness are out of scope — see R3/R8 in the Red Team Review).
- **`cascade_from` is NOT persisted**: it is a transient input to `meta_state_resolve` (`meta-state-resolve-tool.js:23`), consumed by the cascade branch (`:127-150`) and `validateCascadeChildren` (`:205-251`). The persisted reopen/cascade lineage is `reopens` on the child finding. So write-time RI covers `reopens`, not `cascade_from`.

### Bug #1 reframe (scout-verified — load-bearing correction)

The literal claim — "`meta_state_relationships({id, direction:"outbound"})` on a child with `reopens` returns `outbound.reopens` null" — **does not reproduce in the current factory-based tool**. A direct repro shows `outbound.reopens` IS populated; `inbound.reopened_by` IS populated; all 39 relationship/introspect tests pass; the snapshot test (`__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js:47`) locks the *correct* behavior. The factory (`finding.js:54-58`) already reads `entry.reopens` forward.

The real "unidirectional" asymmetry is one layer down: `buildInverseIndexes` → `indexReopens` (`loop-introspect.js:693-701`) builds **only** `reopens_inverse` (keyed by the stale parent = inbound direction) with **no forward `reopens` index**. The forward direction is only available by reading `entry.reopens` directly — which the factory does but `buildInverseIndexes` does not. **Therefore any centralized module that naively mirrors `buildInverseIndexes` (inverse-only) would reintroduce `outbound.reopens = null`.** The fix is a regression-prevention invariant: the new module must provide forward `reopens` from `entry.reopens` (factory behavior) AND inverse `reopened_by` from one source. Finding #1 resolves with the note that the tool-layer symptom was already fixed; centralization closes the inverse-index-layer asymmetry that would have reintroduced it.

### Resolution (Approach C — centralize now, defer the drop)

Land one declarative pure module — `core/entry/relationship-graph.js` — that owns (a) the cross-ref field table per kind, (b) forward + inverse resolution, and (c) write-time structural RI validation (**id-existence only** — kind-match and liveness are out of scope per red-team R3/R8). The retrieval wire shape stays in the relationships tool (presentation logic, per red-team R10). Migrate the four factories, `loop-introspect.buildInverseIndexes`, the relationships tool, the validate tool, and the CI validator to consume it — one consumer at a time behind existing tests. Collapse the 3 parallel forward / 2 inverse implementations. Add `assertinvariant`-wrapped write-time RI at the mutation boundary (id-existence; `applies_to_resolution` exempt per red-team R4 — it's `z.string()`, not an entry-id ref). Document the three-mechanism boundary. Resolve the three findings with lineage. **`reopens`/`cascade_from` are KEPT** — the structural drop is explicitly deferred under finding #3's YAGNI gate (a real >2 recurrence cluster); the 2 hint slugs (`reopens`, `reopens-script` in `core/hint-registry.js`) and 4 live `reopens` edges stay (all 4 edges are terminal — 3 resolved, 1 superseded; none open).

**Trade-off accepted (dual-field dedup unification):** canonicalize on `rule.origin` as the forward promotion ref; derive `promoted_to_rule_inverse` from `rule.origin` alone (deduped → 1 ref). The legacy `finding.promoted_to_rule` field is **preserved on disk** (no migration, no data loss) but stops being an inverse-index source. This changes the dual-field 2-ref artifact to 1 ref — a deliberate fix of a dedup bug (2 refs double-counted one relationship), not a regression. `build-inverse-indexes.test.js:67` + the relationships-snapshot fallback test + the `computeTopReferences`/`top_references` characterization (red-team R6) are updated in the same change. The `reopens`/`cascade_from` contract is preserved unchanged.

**Deployment caveat (red-team R5):** the cold-tier cache (`records/meta/.cache/loop-describe-cold.json`, gitignored at `.gitignore:21`, ~876KB) is SHA-keyed on 3 file-content hashes — a code-only centralization deploy does NOT mutate the registry, so the cache HITs and serves the OLD 2-ref `promoted_to_rule_inverse` + stale `top_references` until the next registry write. Tests use fresh temp registries (cache miss → rebuild) so they never exercise the stale-cache-hit path. Phase 3 must add a deploy step (delete the cache file, or bump a cache-version constant in the cache payload) so the first read after deploy rebuilds with the graph's logic.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | One declarative pure module (`core/entry/relationship-graph.js`) is the single source for cross-ref fields per kind, forward+inverse resolution, and write-time structural RI (id-existence) — consumed by factories, `buildInverseIndexes`, relationships tool, validate tool, CI validator. The retrieval wire shape stays in the relationships tool (presentation logic, not a model concern) | P1 |
| 2 | Remove the 3 parallel forward-ref implementations + 2 divergent inverse implementations + the per-query `buildInverseIndexes` rebuild in the fallback; fix the validator's `loop-design` kind-`"meta"` bug + omitted rule `supersedes`/`applies_to_resolution`. The dual-field fallback PERSISTS (cheaper — a targeted `inverseRefs` lookup, not an O(N) rebuild) so legacy findings without `promoted_to_rule` keep `outbound.promoted_to_rule` | P1 |
| 3 | Write-time rejects structural cross-ref fields whose target id is **never-existent** before append, `assertinvariant`-wrapped at `writeEntry`/`updateEntry`/`metaStateBatch` (new-appends-only; update-changed-only; id-existence only — tombstones count as present, kind-match + liveness out of scope). `applies_to_resolution` exempt (not an entry-id ref). `tryClaimSessionId` gets a defensive comment, not RI (test-only path, bypasses `writeEntry`). Historical entries still read fine | P1 |
| 4 | Preserve forward `reopens` symmetry: the centralized module + relationships tool return `outbound.reopens` populated AND `inbound.reopened_by` populated (regression-prevention for the index layer's missing forward `reopens` index) | P1 |
| 5 | Document the three-mechanism boundary in `docs/meta-state-lifecycle.md` + `docs/architecture.md` + a docs note (not a session-start hint); no `related_to` field; correct stale tool descriptions | P2 |
| 6 | Resolve/supersede `meta-260623T1126Z` + `meta-260715T2237Z` + `meta-260717T1004Z` with `reopens`/`source_refs` lineage (resolution note precise: tool-layer symptom was fixed out-of-band after #1's last re-verify; centralization closes the index-layer asymmetry); record the `reopens`/`cascade_from` drop as an observable YAGNI deferral; log a change-log. Writes ride `bin/loop.mjs` (the 2 wired runtimes — `.factory`, `.mastracode` — both set `LOOP_RECORDS_VIA_CLI=1`; verify exact runtime count) | P2 |

## Phases

| # | Phase | Status | Priority | Effort | Deps |
|---|-------|--------|----------|--------|------|
| 1 | [Characterization tests + bug red-tests](./phase-01-start.md) | Pending | P1 | 2h | — |
| 2 | [Core relationship-graph module](./phase-02-relationship-graph-module.md) | Pending | P1 | 3h | 1 |
| 3 | [Migrate consumers + preserve reopens symmetry](./phase-03-migrate-consumers-reopens-symmetry.md) | Pending | P1 | 4.5h | 2 |
| 4 | [Write-time structural RI validation](./phase-04-write-time-structural-ri.md) | Pending | P1 | 3h | 2,3 |
| 5 | [Document three-mechanism boundary](./phase-05-document-three-mechanism-boundary.md) | Pending | P2 | 1.5h | 3 |
| 6 | [Resolve findings + YAGNI deferral record](./phase-06-resolve-findings-yagni-deferral.md) | Pending | P2 | 1h | 3,4,5 |
| 7 | [Verify + runtime-agnostic audit](./phase-07-verify-runtime-agnostic-audit.md) | Pending | P2 | 1h | 3,4,5,6 |

## Architecture

```
core/entry/relationship-graph.js   ← NEW, pure (no gate-logic, no stale-view, no meta-state.js imports)
  // declarative cross-ref-per-kind table as DATA (not by importing schemas):
  //   finding:    reopens→finding, consolidated_into→change-log, promoted_to_rule→rule (legacy)
  //   change-log: supersedes→change-log, consolidates→finding
  //   rule:       origin→finding (canonical), supersedes→rule, applies_to_resolution→finding (forward-only; "*" skip; RI-EXEMPT — not an entry-id ref)
  //   loop-design: proposed_design_for→rule|finding, addresses→finding
  //   (cascade_from NOT declared — not persisted)
  forwardRefs(entry)            → [{kind, id, field}]            (replaces 4 factories' outboundRefs + OUTBOUND_EXTRACTORS)
  inverseRefs(targetId, entries)→ [{kind, id, field}]            (replaces rule.js dedup + buildInverseIndexes)
  buildInverseIndexes(entries) → {6 named Maps}                  (preserve export shape; one canonical source rule.origin)
  resolveStructuralRI(entry, existenceSet /* Set<string> */) → {ok, dangling:[{field, id}]}   (ID-EXISTENCE ONLY — no kind-match; "*" + applies_to_resolution exempt)
  parseConsolidates (folded from consolidates-refs.js)
  inboundFromLoopDesign (folded from inbound-from-loop-design.js)
  ⚠️ wire shape (groupOutbound/groupInbound/INBOUND_KEY_MAP) + computeDanglingRefs STAY in the relationships tool
     (presentation logic + computeDanglingRefs needs stale-view; moving them into a pure graph would break purity)

core/entry/finding.js, rule.js, change-log.js, loop-design.js   ← MODIFY
  outboundRefs/inboundRefs delegate to relationship-graph; drop bespoke extractors + the rule.js seenPromoteFrom dual-field block

core/entry/consolidates-refs.js, inbound-from-loop-design.js   ← KEEP as thin re-exports (rollback-safe) after the graph folds them in
  (R10: a hard delete creates a rollback hole if an earlier factory-migration commit is reverted; keep re-exports, delete the files in a separate stable PR if at all)
core/entry/index.js   ← MODIFY (validateCrossRefs/outboundRefsAll consume the graph; factoryFor stays)

core/loop-introspect.js   ← MODIFY
  buildInverseIndexes (:613-624) + indexX (:658-723) delegate to the graph; indexOrigin (:672-685) +
    indexPromotedToRule (:687-691) collapse to one canonical source (rule.origin); buildColdTierCache (:588-598)
    and computeTopReferences (:795-814) call the graph. ⚠️ ADD a forward reopens resolution (index layer lacks it today)
  ⚠️ cold-tier cache (records/meta/.cache/loop-describe-cold.json, gitignored) is SHA-keyed — code-only deploy does NOT bust it;
     Phase 3 adds a deploy step (delete the cache file OR bump a cache-version constant) so the first read rebuilds with the graph

tools/handlers/meta-state-relationships-tool.js   ← MODIFY
  resolveOutboundRefs dual-field fallback (:195-209): KEEP but replace the per-query buildInverseIndexes O(N) rebuild (:200)
    with a targeted inverseRefs(findingId, entries) lookup — legacy findings without promoted_to_rule keep outbound.promoted_to_rule
  groupOutbound/groupInbound/INBOUND_KEY_MAP (:14-58) STAY here (presentation); computeDanglingRefs (:101-128) STAYS here (needs stale-view)

tools/handlers/meta-state-relationship-validate-tool.js   ← MODIFY (optional): consume graph RI for a richer lint;
  stays a description-string early-warning read (NOT the enforcement point)

scripts/validate-registry-refs.js   ← MODIFY: OUTBOUND_EXTRACTORS (:107-130) replaced by graph forwardRefs
  → FIXES loop-design kind "meta"→"finding" (:126) + omitted rule supersedes/applies_to_resolution (:121-123);
  stays decoupled (no stale-view import — graph is pure)

core/meta-state.js   ← MODIFY (write-time RI): writeEntry (:1115) / updateEntry (:1189) / metaStateBatch (:1507)
  wrap structural RI in assertinvariant before the append; existence set = readRegistry(root) inside withRegistryLock
  (in-memory entries[] for batch). ⚠️ ID-EXISTENCE ONLY (tombstones count as present — narrowed from "dangling"); updateEntry
  returns a new string code "dangling_structural_ref" (NOT the assertinvariant object) so applyUpdateAndCheck/handlers recognize it;
  applies_to_resolution EXEMPT (z.string(), not an entry-id ref — would break determinism-checklist promotion);
  updateEntry validates CHANGED cross-refs only; archive/delete/ship exempt; tryClaimSessionId (:1889) gets a defensive
  comment (test-only, bypasses writeEntry via appendRegistryEntryAtomic, no cross-process lock) — NO RI added there
core/operation-invariant.js   (assertinvariant primitive — caller holds withRegistryLock; wrapper does NOT lock)

core/hint-registry.js   (reopens L94, reopens-script L130) — KEPT; referenced by the deferral note
tools/handlers/meta-state-promote-rule-tool.js (:15-16) + meta-state-touch-tool.js (:91-92)   ← stale descriptions/comments corrected

docs/meta-state-lifecycle.md + docs/architecture.md   ← MODIFY: three-mechanism boundary section + a docs note (NOT a session-start hint); no related_to
```

### Why `rule.origin` is canonical (and the 2→1 inverse dedup)

`rule.origin` (`meta-state.js:493`, `z.string()` required) is the canonical promotion ref — a rule records the finding it was promoted from. `finding.promoted_to_rule` (`:355`, `z.string().nullable()` — legacy, removed from the patch deny-list at `:636`) is the dual-field other half. The inverse `promoted_to_rule_inverse` is therefore derived from `rule.origin` alone (deduped → 1 ref per finding). The current 2-ref artifact (`indexOrigin` `pushUnique` + `indexPromotedToRule` `pushToIndex`) double-counts one relationship; the legacy field is preserved on disk (no migration, no data loss) but stops being an inverse source. `build-inverse-indexes.test.js:67` + the `computeTopReferences`/`top_references` characterization are updated to expect 1 ref in the same change. This is the dedup fix the centralization was meant to deliver; it is NOT a `reopens`/`cascade_from` contract change (those are preserved unchanged).

### Why forward `reopens` must be preserved (bug #1 reframe)

`buildInverseIndexes.indexReopens` (`loop-introspect.js:693-701`) builds only `reopens_inverse` (inbound). A centralized module that mirrored it (inverse-only) would regress the factory's forward `outbound.reopens` read. The graph's `forwardRefs` reads `entry.reopens` directly (factory behavior) and `inverseRefs` derives `reopened_by`; a regression test (Phase 3) locks both directions from one source. This is regression prevention, not a live-bug fix — the tool already populates `outbound.reopens`.

### Why id-existence-only RI (red-team R3/R4/R8)

The honest scope is **id-existence**: `resolveStructuralRI(entry, Set<string>)` checks `!existenceSet.has(id)` — it CANNOT kind-match (a `Set<string>` carries no kind) and does NOT exclude tombstones (a deleted/archived id remains in the `max_by(.version)` projection). So a ref to a *never-existent* id is rejected; a ref to a *deleted* or *wrong-kind* target passes. Kind-match and liveness would need a `Map<id, entry_kind>` + a tombstone filter — a larger scope deferred. `applies_to_resolution` is RI-exempt (it's `z.string()`, not an entry-id ref; its real contract is "finding id OR a determinism-checklist pattern" — `test-session-123` is valid, not dangling). The Success Criteria states this honestly: "rejects refs to never-existent ids."

### Why new-appends-only + update-changed-only RI

Append-first makes a never-existent-target ref permanent audit, so RI rejects at append time (new value). But historical entries with legacy dangling refs must still **read** fine — the entire read/projection path (`readRegistry`, `loop-introspect`, `meta_state_relationships`, `meta_state_list`) runs no RI. For `updateEntry`, validating inherited unchanged cross-refs would make a historical dangling `reopens` un-editable (a description edit would block on the unrelated stale ref) — so update validates only cross-refs the patch **changes or introduces**, and returns the string code `"dangling_structural_ref"` (matching `updateEntry`'s `true`/`null`/`"version_mismatch"`/… return contract, not the `assertinvariant` object — red-team R7) so `applyUpdateAndCheck` + handlers surface an actionable rejection. `consolidated_into` is on the immutable patch deny-list (`:648`) → only set at write, never re-validated. `archiveEntry`/`deleteEntry`/`shipLoopDesign` spread the existing entry + add only status/timestamps → no new cross-refs → RI no-op (exempt).

## Success Criteria

- [ ] One core module (`core/entry/relationship-graph.js`) is the single source for (a) cross-ref fields per kind, (b) forward+inverse resolution, (c) write-time structural RI (id-existence) — consumed by the factories, `loop-introspect`, the relationships tool, the validate tool, and the CI validator (no bespoke per-kind `outboundRefs`/`inboundRefs` duplication). The wire shape + `computeDanglingRefs` stay in the relationships tool (presentation + needs `stale-view`)
- [ ] The 3 forward + 2 inverse implementations collapse to one; the validator's `loop-design` kind-`"meta"` bug and omitted rule `supersedes`/`applies_to_resolution` are fixed; `consolidates-refs.js` + `inbound-from-loop-design.js` kept as thin re-exports (rollback-safe)
- [ ] Write-time rejects structural cross-ref fields whose target id is **never-existent** before append, `assertinvariant`-wrapped at `writeEntry`/`updateEntry`/`metaStateBatch` (id-existence only — tombstones count as present; kind-match + liveness deferred; `applies_to_resolution` exempt); `updateEntry` returns `"dangling_structural_ref"` (string code, not the assertinvariant object); covered by a test; new-appends-only + update-changed-only; `tryClaimSessionId` gets a defensive comment (no RI); historical entries read fine
- [ ] `meta_state_relationships({id, direction:"outbound"})` on a child with `reopens` returns `outbound.reopens` populated AND `inbound.reopened_by` populated (regression-prevention test); legacy findings without `promoted_to_rule` keep `outbound.promoted_to_rule` via the targeted `inverseRefs` fallback (snapshot test :77-78 preserved); the 4 existing `reopens` edges still read fine
- [ ] The dual-field `promoted_to_rule_inverse` is 1 ref (canonical `rule.origin`); `build-inverse-indexes.test.js:67` + the relationships-snapshot fallback test + the `computeTopReferences`/`top_references` characterization updated in the same change; legacy `finding.promoted_to_rule` data preserved on disk
- [ ] The cold-tier cache gets a deploy-step bust (delete the cache file OR bump a cache-version constant) so a code-only deploy doesn't serve stale 2-ref indexes; `top_references` warm/cold tiers agree after deploy
- [ ] Boundary documented in `docs/meta-state-lifecycle.md` + `docs/architecture.md` + a docs note (not a session-start hint); no `related_to` field; stale tool descriptions corrected
- [ ] `check_runtime_agnostic` passes on the new module; focused tests green; no `reopens`/`cascade_from` public-contract regression
- [ ] `meta-260623T1126Z` + `meta-260715T2237Z` + `meta-260717T1004Z` resolved/superseded with `reopens`/`source_refs` lineage (resolution note precise about the tool-layer-fixed-out-of-band nuance); the `reopens`/`cascade_from` drop recorded as an observable YAGNI deferral; change-log logged; writes ride `bin/loop.mjs` (the 2 wired runtimes both set `LOOP_RECORDS_VIA_CLI=1`)

## Risk Assessment

- **Risk (highest — blast radius): the centralization touches the 4 factories + `loop-introspect` + 2 tools + the CI validator at once.** Mitigation: land the declarative module additively (Phase 2, no consumers), then migrate one consumer at a time behind the characterization tests (Phase 3), each with its own regression gate — mirroring plan `260716-1101` Phase B discipline. Tests-first locks current behavior before any consumer moves.
- **Risk (validator decoupling): `scripts/validate-registry-refs.js` deliberately avoids importing `gate-logic`/`stale-view` to stay CI-light.** Mitigation: `relationship-graph.js` is pure (no `gate-logic`/`stale-view`/`meta-state.js` imports — also avoids an import cycle with the schema owner), so the validator consumes it without re-coupling. The declarative table lives as data, not by importing schemas.
- **Risk (6-map export shape locked by tests): `buildInverseIndexes`' 6 named maps are a public contract consumed by `loop-describe` + `meta_state_list`.** Mitigation: the graph's `buildInverseIndexes` preserves the 6-map export shape; only the *population* of `promoted_to_rule_inverse` changes (2→1, deliberate). Coverage today: `__tests__/legacy-mcp/build-inverse-indexes.test.js` covers 5 of 6 maps (origin/promoted_to_rule/addresses/supersedes/reopens), `core/loop-introspect.test.js` covers `consolidated_into_inverse` — Phase 1 adds a `computeTopReferences`/`top_references` characterization before the 2→1 change (red-team R6).
- **Risk (dual-field test update reads as a weakening): updating `build-inverse-indexes.test.js:67` from 2→1 could look like weakening a lock.** Mitigation: the new test asserts the *correct* canonical semantic (1 ref, sourced from `rule.origin`) and that the legacy `finding.promoted_to_rule` is no longer double-counted — a stronger, not weaker, assertion. The change is documented in the phase + the PR.
- **Risk (cold-tier cache serves stale indexes after code-only deploy — red-team R5):** the cache (`records/meta/.cache/loop-describe-cold.json`, gitignored, ~876KB, present on disk) is SHA-keyed on 3 file-content hashes; a code-only centralization deploy does NOT mutate the registry, so the cache HITs and serves the OLD 2-ref `promoted_to_rule_inverse` + stale `top_references` until the next registry write. Tests use fresh temp registries (cache miss → rebuild) so they never hit this. Mitigation: Phase 3 adds a deploy step (delete the cache file OR bump a cache-version constant in the cache payload) so the first read after deploy rebuilds with the graph's logic.
- **Risk (write-time RI rejects historical entries): the 4 existing `reopens` edges + any legacy dangling structural refs must pass.** Mitigation: RI applies only to *new appends* (writeEntry brand-new, updateEntry changed-only), never to read/projection; historical edges are never re-appended, so RI never sees them. If one is re-appended via update, only the changed cross-ref is validated; an unchanged historical `reopens` passes. Pinned in Phase 4 tests.
- **Risk (`tryClaimSessionId` bypasses writeEntry — red-team R9):** it appends via `appendRegistryEntryAtomic` directly (`meta-state.js:1910`), NOT `writeEntry`, and uses `enqueue` (per-process) without `withRegistryLock`; it has zero production callers (test-only). Mitigation: add NO RI there (over-investing in a test-only path); add a defensive comment that this direct-append path bypasses write-time RI and must not be wired to a production handler without routing through `writeEntry`.
- **Risk (`applies_to_resolution` RI would break determinism-checklist promotion — red-team R4):** the field is `z.string().optional()` (not `entryIdRefArray`); the promote-rule test uses `pattern: "test-session-123"` (a session id, not a registry entry). Mitigation: `applies_to_resolution` is RI-EXEMPT (its real contract is "finding id OR a determinism-checklist pattern"); `forwardRefs` emits it for the relationships tool but `resolveStructuralRI` skips it. `wildcardOk`/`forwardOnly` CROSS_REFS flags dropped (redundant with the generic `"*"` skip + the fixed 6-map set — red-team R10).
- **Risk (kind-match + liveness overpromised — red-team R3/R8):** `resolveStructuralRI(entry, Set<string>)` can check id-existence only — it cannot kind-match (no kind in a `Set<string>`) and does not exclude tombstones (a deleted id remains in the projection). Mitigation: state the honest scope — "rejects refs to never-existent ids" — and defer kind-match (needs `Map<id, entry_kind>`) + liveness (needs a tombstone filter) as larger scope. A ref to a deleted or wrong-kind target passes; the derived `dangling_refs` view still flags it post-hoc.
- **Risk (updateEntry return contract — red-team R7):** `assertinvariant` returns `{ok:false,...}` (does NOT throw); `updateEntry` uses a string-code return contract (`true`/`null`/`"version_mismatch"`/…). Mitigation: `updateEntry` returns the new string code `"dangling_structural_ref"` (not the assertinvariant object) so `applyUpdateAndCheck` + handlers surface an actionable rejection; mirror `writeEntry`'s throw-on-fail split deliberately.
- **Risk (bug #1 premise wrong): the plan's source claimed a live `outbound.reopens` null that does not reproduce.** Mitigation: scout-verified reframe — the tool already populates `outbound.reopens` (the cold-tier path finding #1 cited at `loop-introspect.js:285` was the inverse-only index layer; the tool-layer forward read was fixed out-of-band after #1's 2026-07-24 re-verify, but #1 was never re-verified to catch it). The fix is a regression-prevention invariant + closing the index-layer asymmetry; finding #1's resolution records this nuance precisely. Validated before implementation.

## Related Plans

- `260716-1101-tier2-versioned-append-mutable-stream` — shipped the append-first substrate (`max_by(.version)`, no in-place mutation, no-op short-circuit, no hard delete) this plan builds on; Phase B tests-first discipline mirrored here.
- `260721-1933-cli-transport-phase1-read-only-slice`, `260722-1103-mcp-read-opt-out-to-cli-r-write-capable-cli-w-prep`, `260722-1343-write-capable-cli-w-complete-the-cli-record-transport`, `260725-1439-portable-six-workflow-tools-rehome-mcp-to-cli` — shipped CLI-first read+write transport; both relationship tools ride `bin/loop.mjs` via the same handlers (`core/cli-tools.js:43,55`), so centralizing the handler module covers MCP + CLI.
- `260712-0724-assertinvariant-universal-primitive` — shipped the `assertinvariant` primitive this plan wraps write-time RI in.
- `260728-2323-unify-observation-staleness-mechanism` — the immediate predecessor; same plan/phase convention and "centralize a decentralized mechanism behind TDD" shape.
- `260609-adopt-cross-reference-fields`, `260610-2100-meta-state-relationship-modeling` — adopted the cross-ref fields this model centralizes.

## Open Questions

None remaining. Validation interview (2026-07-30) resolved all three:
1. **Cold-tier cache-bust mechanism (red-team R5):** → **bump a cache-version constant** in the cache payload (durable, survives a stale file left by an earlier deploy). Phase 3 implements this in `core/loop-introspect-cache.js`.
2. **Finding #3 disposition (Phase 6):** → **leave `meta-260717T1004Z` open with a deferral note** + `reopens`/`source_refs` lineage + a `last_verified_at` stamp via `meta_state_re_verify` (the lifecycle model has no "partial" status; resolving would falsely close the YAGNI gate in the projection). Resolve only #1 and #2.
3. **`computeTopReferences` change (red-team R6):** → **accept the 2→1 citation-count change as a deliberate fix** (the 2-ref artifact double-counted one relationship). Updated in the same change as the `loop-introspect` rewiring + a Phase 1 `top_references` characterization.

## Validation Log

### Session 1 — 2026-07-30
**Trigger:** Post-red-team validation gate (deep mode Step 7).
**Verification pass:** Full tier (5+ phases → 4 roles). The red-team reviewers (Security/Failure-Mode/Scope) verified ~40 claims with file:line evidence; my independent source verification confirmed the load-bearing line claims (`assertinvariant:90`, `writeEntry:1115`, `buildInverseIndexes:613`, `build-inverse-indexes.test.js:67`, validator `:126`, cache file present + gitignored, finding #1's `evidence_code_ref` at `loop-introspect.js:285`). 0 FAILED claims remained after the red-team apply (the 11 findings were the FAILED claims, now reconciled into the plan).
**Questions asked:** 3.

#### Questions & Answers

1. **[Risks]** Cold-tier cache-bust mechanism (red-team R5)?
   - Options: Bump cache-version constant | Delete cache file on deploy | Add code-hash to cache key
   - **Answer:** Bump cache-version constant
   - **Rationale:** Durable — survives a stale cache file left by an earlier deploy; no deploy-script dependency; smallest change to `loop-introspect-cache.js`.
2. **[Scope]** Finding #3 disposition (Phase 6)?
   - Options: Leave open with deferral note | Resolve with explicit partial note
   - **Answer:** Leave open with deferral note
   - **Rationale:** The lifecycle model has no "partial" status; resolving would close the `reopens`/`cascade_from` YAGNI gate in the `max_by(.version)` projection, making the deferral unobservable. #1 and #2 resolve (done); #3 stays queryable as open.
3. **[Tradeoffs]** `computeTopReferences` 2→1 count change (red-team R6)?
   - Options: Accept 2→1 as a deliberate fix | Preserve 2-ref (keep the dedup bug)
   - **Answer:** Accept 2→1 as a deliberate fix
   - **Rationale:** The 2-ref artifact double-counted one relationship; 1 ref (canonical `rule.origin`) is correct. Updated in the same change as the `loop-introspect` rewiring + a Phase 1 characterization so the `top_references` change is explicit, not silent.

#### Confirmed Decisions
- Cache-bust: bump a cache-version constant in `core/loop-introspect-cache.js` (Phase 3)
- Finding #3: leave open + deferral note + lineage + `last_verified_at` (Phase 6); resolve only #1 + #2
- `top_references`: 2→1 accepted; characterized in Phase 1, updated in Phase 3

#### Impact on Phases
- Phase 3: implement the cache-version bump (not the file-delete deploy step) + the `top_references` characterization update
- Phase 6: leave `meta-260717T1004Z` open (do NOT resolve); stamp `last_verified_at`; resolve only #1 + #2

## Red Team Review

### Session — 2026-07-30
**Findings:** 11 (11 accepted, 0 rejected) — 2 reviewers (Assumption Destroyer) failed on provider errors; their lens was synthesized from scout data + direct source verification. All findings carry `file:line` evidence; none rejected for missing evidence.
**Severity breakdown:** 5 High, 4 Medium, 2 Low.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| R1 | Fallback deletion regresses `outbound.promoted_to_rule` for ~33 legacy findings — outbound calls `forwardRefs` not `inverseRefs`; "no replacement needed" wrong (2 reviewers) | High | Accept | Phase 3 |
| R2 | Write-time RI justified by false premise — CI validator runs pre-merge on PRs (`meta-state-refs-check.yml:52-55`); real benefit = immediate feedback + cross-PR orphans | High | Accept | plan.md, Phase 4 |
| R3 | `resolveStructuralRI` claims kind-match but `Set<string>` can't do it | High | Accept | Phase 2, Phase 4 |
| R4 | `applies_to_resolution` RI breaks determinism-checklist promotion (`test-session-123`, `z.string()` not `entryIdRefArray`) | High | Accept | Phase 2, Phase 4 |
| R5 | Cold-tier cache serves stale 2-ref indexes after code-only deploy (gitignored, SHA-keyed, ~876KB present) (2 reviewers) | High | Accept | Phase 3 |
| R6 | `computeTopReferences` citation counts change silently; plan named only 2 tests | Medium | Accept | Phase 1, Phase 3 |
| R7 | `updateEntry` RI failure doesn't map to its string-code return contract; `assertinvariant` returns an object | Medium | Accept | Phase 4 |
| R8 | RI is existence-based not liveness-based; refs to deleted/archived tombstones pass; success criteria overpromise | Medium | Accept | plan.md, Phase 4 |
| R9 | `tryClaimSessionId` bypasses `writeEntry` (direct append, no cross-process lock); test-only; over-investing RI there wastes effort | Medium | Accept | Phase 4 |
| R10 | Wire-shape + `computeDanglingRefs` are presentation/`stale-view` logic (stay in tool); `applies_to_resolution` flags over-modeled; Phase 5 hint→docs note; leaf-helper deletion rollback hole | Medium/Low | Accept | Phase 2, 3, 5 |
| R11 | `loop-introspect.test.js` "covers only 1 of 6" imprecise (`build-inverse-indexes.test.js` covers 5/6); "all three runtimes" only 2 `mcp.json`; effort 2d→2.5d | Low | Accept | Phase 1, plan.md, Phase 6 |

Key applied changes: RI scope narrowed to id-existence (kind-match + liveness deferred); `applies_to_resolution` RI-exempt; the dual-field fallback PERSISTS (cheaper targeted `inverseRefs` lookup, not deleted) so legacy findings keep `outbound.promoted_to_rule`; cold-tier cache gets a deploy-step bust; `updateEntry` returns `"dangling_structural_ref"` string code; `tryClaimSessionId` gets a defensive comment (no RI); wire-shape + `computeDanglingRefs` stay in the tool; leaf helpers kept as thin re-exports (rollback-safe); Phase 5 uses a docs note not a hint; `computeTopReferences`/`top_references` characterized in Phase 1; effort 2.5d.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..07 (all updated)
- Decision deltas checked: 11 (R1-R11)
- Reconciled stale references: plan.md Overview/Goals/Architecture/Success Criteria/Risk/Open Questions; phase-01 (R6 top_references + R11 coverage), phase-02 (R3 id-existence + R4 applies_to_resolution exempt + R10 wire-shape stays/flags dropped), phase-03 (R1 fallback persists + R5 cache-bust + R6 top_references + R10 re-exports), phase-04 (R3/R4/R7/R8/R9), phase-05 (R10 docs note), phase-06 (R11 bug-#1 nuance + runtime count), phase-07 (R1/R10 verification grep updates). Final sweep: zero active stale claims (kind-match, fallback-deleted, wire-shape-moved, leaf-helpers-deleted, all-three-runtimes, covers-only-1-of-6, effort-2d) outside the Red Team table that quotes them by design.
- Unresolved contradictions: 0

<!-- slug: relationship-model-centralize-defer-drop -->

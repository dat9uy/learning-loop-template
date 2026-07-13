---
phase: 1
title: "Phase 0: Test-tree hygiene prune"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Phase 0: Test-tree hygiene prune

## Overview

Remove scout-confirmed dead/redundant tests *before* the vitest codemod so the migration diff touches fewer files and reviewers see a clean framework swap rather than framework-swap-plus-cleanup. This phase is independent of vitest — it runs under the existing `node:test` runner. Ships as hygiene, not surface-reduction (the scout proved pruning is ~17%, not a halving).

## Requirements

- Functional: delete 23 dead/scaffold/skipped test files, fold 5 redundant files into their anchors, consolidate 9 fragmented meta-state variants into ~6 anchors; drop the over-broad `__tests__/legacy-mcp/**` fallow ignore.
- Non-functional: `pnpm test` stays green; `fallow:gate` stays green; no load-bearing coverage lost.

## Architecture

Prune list is the **scout-confirmed set** (from the two parallel evaluators this session), not a speculative cut. Three classes:

- **PRUNE (23 files):** one-time migration-scaffold + skipped. Root: `legacy-cleanup.test.cjs`, `server-name-rename.test.cjs`. legacy-mcp: `fix-loop-design-refs`, `lifecycle-migration-finalize` *(also deletes its 3 `t.skip(REASON)` call sites — red-team M1 — so only `storage-parity:162` needs the `t.skip`→`t.skip(true,REASON)` fix in Phase 2)*, `g8-subcommand-class-entry`, `no-stale-ref-category-enum`, `sp0-change-log-self-log`, `sp1-derive-status-acceptance`, `sp2-check-grounding-acceptance`, `tool-deletion-coverage`, `schema-deletion-coverage`. phase-e-foundation (4): `agents-section-1-layers`, `fcis-invariant`, `no-core-legacy-refs`, `schema-doc-exists`. phase-e-shell-restructure (6): all. interface: `interface-dir-exists`. debug: `agent-e2e-integration.test.cjs` (whole-suite skip w/o KIMI_API_KEY).
- **FOLD (5 files):** `legacy-mcp/mcp-protocol-e2e.test.cjs` → root `mcp-protocol-e2e.test.cjs`; `zod-coerce-boolean-string` / `zod-union-envelope` / `boolean-semantic-guards` → `coerce-correctness.test.js`; `build-inverse-indexes` → `core/loop-introspect.test.js`.
- **CONSOLIDATE (sweep + patch clusters):** merge `sweep-{summary,stale-transition,no-stale-ref-followup}` into `sweep.test.js`; merge `patch-{derived-schema,entry-kind-invariant,immutable-fields}` into `patch-tool.test.js`; fold `schema-{extension,stale-only}` into `schema.test.js` and drop 2-3 mislabeled status titles. Fix the brittle live-registry fixture in `meta-state-relationships.test.js` (hardcoded `rule-project-skill-boundary` / `resolveRoot()`) → temp-dir setup.

**Two confirmation diffs required before delete** (scout open questions):
1. `legacy-mcp/mcp-protocol-e2e.test.cjs` vs root `mcp-protocol-e2e.test.cjs` — bodies differ; diff to confirm which is canonical before folding.
2. `tool-deletion-coverage` / `schema-deletion-coverage` assert a manifest count ("32") — confirm stale vs load-bearing before deleting.

## Related Code Files

- Delete: the 23 PRUNE files above.
- Modify: `coerce-correctness.test.js` (absorb 3 folds), `core/loop-introspect.test.js` (absorb 1 fold), root `mcp-protocol-e2e.test.cjs` (absorb 1 fold after diff), `meta-state-sweep.test.js` (anchor for 3), `meta-state-patch-tool.test.js` (anchor for 3), `meta-state-schema.test.js` (anchor for 2 + drop mislabeled titles), `meta-state-relationships.test.js` (fix live-registry fixture).
- Modify: `tools/learning-loop-mastra/.fallowrc.json` — remove `"__tests__/legacy-mcp/**"` from `ignorePatterns` (shields only 2 trivial files; removing changes nothing per the empirical 212-flood test). **Keep** `**/*.test.*` / `**/*.spec.*` until Phase 3.

## Implementation Steps

1. **[TEST-FIRST]** Add a hygiene-gate test `__tests__/freshness/prune-coverage-parity.test.js` that: (a) records the current full-suite pass-count from `pnpm test`, (b) asserts the post-prune pass-count equals `pre - <pruned-failing-tests>` (most pruned files pass, so delta ≈ 0; any non-zero delta must be exactly the count of tests in pruned files), (c) asserts `fallow:gate` exit 0. This test is the regression net for the whole phase.
2. Run the two confirmation diffs (`mcp-protocol-e2e` canonical; "32" manifest count). Record decisions; adjust PRUNE/FOLD lists if a file turns out load-bearing.
3. Delete the 23 PRUNE files in one commit.
4. Fold the 5 redundant files: move unique assertions into anchors, delete the source files. One commit.
5. Consolidate sweep + patch + schema clusters; fix the `relationships.test.js` live-registry fixture. One commit per cluster (3 commits) for rollback independence.
6. Remove `"__tests__/legacy-mcp/**"` from `.fallowrc.json` `ignorePatterns`. One commit.
7. Run `pnpm test` + `fallow:gate`; the hygiene-gate test must pass.

## Success Criteria

- [ ] Hygiene-gate test `prune-coverage-parity.test.js` added and passing (pass-count delta exactly accounted for by pruned tests).
- [ ] 23 PRUNE files deleted (post-confirmation-diff).
- [ ] 5 redundant files folded into anchors; no unique assertion lost (gate test proves it).
- [ ] sweep/patch/schema clusters consolidated; `relationships.test.js` no longer uses a live-registry fixture.
- [ ] `__tests__/legacy-mcp/**` removed from `.fallowrc.json`; `fallow:gate` still exit 0.
- [ ] `pnpm test` green; `fallow:gate` green.

## Risk Assessment

- **R7 (drop load-bearing test):** mitigated by the TEST-FIRST hygiene gate + confirmation diffs. The prune set is scout-confirmed, not speculative.
- **`mcp-protocol-e2e` fold risk:** the two bodies differ — folding the wrong one drops e2e coverage. Mitigated by the diff in Step 2; if non-canonical, KEEP both and skip this fold (it's 1 file, not load-bearing for the migration).
- **`tool-deletion-coverage` "32" count:** if live (manifest count is an active invariant), KEEP it and drop from PRUNE. The count being stale is the likely case (manifest has grown), but confirm before delete.
- **Rollback:** each class is a separate commit (prune / fold / per-cluster consolidate / fallowrc). A bad consolidate reverts in isolation without unwinding the prune.
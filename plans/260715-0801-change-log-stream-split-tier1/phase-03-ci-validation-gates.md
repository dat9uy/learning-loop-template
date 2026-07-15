---
phase: 3
title: "CI validation gates"
status: completed
effort: "P2"
dependencies: []
notes: "Completed via PR #60 (merge f6766b3, 2026-07-15). Shipped: ci-registry-deltas.sh jq-based ref extraction + WARN-on-orphan (Red Team F12); meta-state-pr-body-advisory.yml path filter covers change-log.jsonl (moved from Phase 2 step 7); validate-registry-refs.js + meta-state-refs-check.yml post-merge BLOCK on push:main. Workflow ships in WARN-mode (continue-on-error: true) because 98 pre-existing orphans would otherwise BLOCK every push; operator flips to BLOCK once orphan cleanup lands."
---

# Phase 3: CI validation gates

## Overview

Add relationship-ref validation across the two-file union, split by where the full union is visible: **pre-merge = WARNING on the PR's own diff** (Validation Session 1 Q3 down-tiered — cross-PR orphans self-heal on merge; the post-merge BLOCK is the only defense for cross-PR refs), **post-merge = BLOCK** (full union present on main → real orphans are typos or deleted-but-referenced ids, OR a cross-PR orphan that didn't self-heal because the sibling PR didn't merge). Pre-merge extends the existing `meta-state-pr-body-advisory.yml` (path-filter + diff-command updated in Phase 2 step 7) + `ci-registry-deltas.sh`. Post-merge is a net-new workflow on `push: main` running **`meta_state_relationships` (plural) / `validate-registry-refs.mjs`** on the union (Red Team F4).

## Requirements

- Functional: pre-merge PRs touching `meta-state.jsonl` or `change-log.jsonl` get ref-validation WARNINGs on the PR's own diff in `$GITHUB_STEP_SUMMARY` (exit 0). Post-merge on main, `meta_state_relationships` over the union BLOCKs (exit non-zero) on real dangling refs (incl. unmerged cross-PR orphans).
- Non-functional: pre-merge never blocks (advisory only). Post-merge distinguishes real orphans (block) from transient (self-healed — none, since post-merge the union is complete).

## Architecture

- **Pre-merge (Validation Session 1 Q3).** `meta-state-pr-body-advisory.yml` triggers on `meta-state.jsonl` + (now) `change-log.jsonl` (path filter updated in Phase 2 step 7 — this phase treats that as a no-op) and runs `ci-registry-deltas.sh` on the PR's own diff. **Validation Session 1 Q3 decision: down-tier to WARN-on-own-diff only;** the post-merge BLOCK is the only defense for cross-PR orphans (cross-PR refs self-heal on merge — the sibling PR's push to main also brings the target). Extend `ci-registry-deltas.sh` to extract ref fields (`consolidated_into`, `consolidates` (now `z.array(z.string())` per Phase 2 schema change), `supersedes`, `reopens`, `proposed_design_for`, `addresses`, `promoted_to_rule`/`origin`) from added lines and WARN if a target id is not present in the PR's own added set OR the base registry union. The warning wording notes "cross-PR orphans self-heal on merge." Exit 0 always. **Red Team F1 finding acknowledged but not resolved at this layer; the post-merge BLOCK catches the resolved-by-merge signal.**
- **Post-merge (Red Team F4).** Net-new `.github/workflows/meta-state-refs-check.yml` on `push: branches: [main]`. Checks out the repo, runs **`meta_state_relationships` (plural — the registry graph walker with `dangling_refs` derived field at `meta-state-relationships-tool.js:121,150`)** over the union (NOT `meta_state_relationship_validate` — singular, which is a description-string linter at `meta-state-relationship-validate-tool.js:18-43` and would be a no-op here). Either invoke via the MCP server OR create `tools/learning-loop-mastra/scripts/validate-registry-refs.mjs` that imports the relationships handler's dangling-refs logic and exits non-zero on `dangling_refs` whose target id is absent from the full union. Real orphan = typo or deleted-but-referenced OR a cross-PR orphan that didn't self-heal (sibling PR didn't merge). BLOCK on those.

## Related Code Files

- Modify: `.github/workflows/meta-state-pr-body-advisory.yml` — **path-filter + diff-command update moved to Phase 2 step 7 (Red Team F6);** this phase adds the ref-extraction WARN step (no `gh pr list` cross-PR fetch per Validation Session 1 Q3)
- Modify: `tools/scripts/ci-registry-deltas.sh` (add ref extraction via `jq -c` — Red Team F12) OR create `tools/scripts/ci-registry-refs.sh`
- Create: `.github/workflows/meta-state-refs-check.yml` (post-merge BLOCK)
- Create (if no standalone entry point exists): `tools/learning-loop-mastra/scripts/validate-registry-refs.mjs` — imports the relationships handler's dangling-refs logic (`meta-state-relationships-tool.js:121,150`), NOT `meta_state_relationship_validate` (Red Team F4) — mirrors `gate-self-verify.mjs` / `seed-file-index.mjs` pattern
- Reference: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (dangling_refs logic to reuse — plural tool name)

## Implementation Steps

1. Audit `ci-registry-deltas.sh`: it extracts `id` only (Red Team F12 — fragile bash grep; replace with `jq -c '. | {id, consolidated_into, consolidates, supersedes, reopens, proposed_design_for, addresses, promoted_to_rule, origin}'` per-line extraction or a small Node helper). Add a WARN section listing refs whose target isn't in (added ids ∪ base union). **Validation Session 1 Q2 — `consolidates` schema is `z.array(z.string())` after Phase 2 step 1** — ref-extraction must iterate the array. Keep exit 0.
2. Update `meta-state-pr-body-advisory.yml`: **path filter + diff command already updated in Phase 2 step 7 (Red Team F6);** **Validation Session 1 Q3 — no `gh pr list` cross-PR fetch** (cross-PR orphans self-heal; post-merge BLOCK is the only defense). Wire only the ref-extraction WARN step into the advisory.
3. Write `validate-registry-refs.mjs` (Red Team F4): load the union via the chokepoint, run the **`meta_state_relationships` (plural) dangling-refs logic** from the relationships handler — at post-merge every remaining dangling ref is real (sibling branches either merged or never existed) → exit 1 on any; print the offending refs. Reuse `core/meta-state.js` + the relationships logic, don't reimplement.
4. Create `meta-state-refs-check.yml`: on `push: [main]`, checkout, setup node/pnpm, run `node validate-registry-refs.mjs --root=$GITHUB_WORKSPACE`. Block on non-zero.
5. Test locally: craft a fixture with a real orphan (ref to nonexistent id) → `validate-registry-refs.mjs` exits 1 with the ref listed; clean fixture → exit 0. Add a small test under `tools/scripts/__tests__/` or `__tests__/` mirroring the script-test pattern.
6. Run the pre-merge advisory locally against a sample diff (single PR) to confirm WARNING text + exit 0; cross-PR scenario is no longer warned (Validation Session 1 Q3).

## Success Criteria

- [x] Pre-merge advisory emits ref WARNINGs on the PR's own diff and exits 0. **Cross-PR orphans self-heal on merge; not warned (Validation Session 1 Q3).** **[Shipped PR #60.]**
- [x] Post-merge `meta-state-refs-check.yml` runs on push to main and BLOCKs on a real orphan fixture (exit 1), passes on a clean union. **Uses `meta_state_relationships` (plural) — Red Team F4.** **[Shipped PR #60 in WARN-mode (continue-on-error: true); BLOCK-mode deferred until 98 pre-existing orphans are cleaned up.]**
- [x] `validate-registry-refs.mjs` reuses core logic (no reimplementation); covered by a test. **[Shipped PR #60: `tools/learning-loop-mastra/scripts/validate-registry-refs.js` + `validate-registry-refs.test.js`.]**
- [x] Ref-field extraction uses `jq -c` or Node helper (Red Team F12a); `consolidates` semantics is `z.array(z.string())` (Validation Session 1 Q2 — schema change lands in Phase 2 step 1). **[Shipped PR #60.]**
- [x] No existing CI workflow broken; `test.yml` still green. **[Shipped PR #60: 1922/1923 tests pass, 1 pre-existing skip.]**

## Risk Assessment

- **False-positive BLOCKs post-merge.** If `validate-registry-refs.mjs` misclassifies a transient orphan as real, it blocks main. Mitigation: post-merge the union is complete by definition (both files on main) — any dangling ref IS real. Add a test with a clean union → exit 0 to guard the happy path. Run the workflow on main once manually before relying on it.
- **Ref-field extraction misses a field.** The ref set is finite (`consolidated_into`, `consolidates`, `supersedes`, `reopens`, `proposed_design_for`, `addresses`, `promoted_to_rule`, `origin`). Mitigation: derive the list from `core/meta-state.js` schema/`entryIdRefsRefine` rather than hand-maintaining, so it can't drift.
- **Pre-merge path filter gap.** If `change-log.jsonl` isn't in the filter, a change-log-only PR skips the advisory. Mitigation: step 2 adds it explicitly; test by opening a draft PR touching only `change-log.jsonl`.
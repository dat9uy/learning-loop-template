---
phase: 3
title: "CI validation gates"
status: pending
effort: "P2"
dependencies: []
---

# Phase 3: CI validation gates

## Overview

Add relationship-ref validation across the two-file union, split by where the full union is visible: **pre-merge = WARNING** (can't resolve transient cross-file orphans — a change-log on the PR branch referencing a finding on an un-merged sibling branch), **post-merge = BLOCK** (full union present on main → real orphans are typos or deleted-but-referenced ids only). Pre-merge extends the existing `meta-state-pr-body-advisory.yml` + `ci-registry-deltas.sh` (already id-aware, advisory-only). Post-merge is a net-new workflow on `push: main` running `meta_state_relationship_validate` on the union.

## Requirements

- Functional: pre-merge PRs touching `meta-state.jsonl` or `change-log.jsonl` get ref-validation WARNINGs in `$GITHUB_STEP_SUMMARY` (exit 0). Post-merge on main, `meta_state_relationship_validate` over the union BLOCKs (exit non-zero) on real dangling refs.
- Non-functional: pre-merge never blocks (transient-orphan-friendly). Post-merge distinguishes real orphans (block) from transient (self-healed — none, since post-merge the union is complete).

## Architecture

- **Pre-merge.** `meta-state-pr-body-advisory.yml` already triggers on `meta-state.jsonl` and runs `ci-registry-deltas.sh` on the diff. Extend: (a) trigger also on `change-log.jsonl`; (b) extend `ci-registry-deltas.sh` (or a sibling `ci-registry-refs.sh`) to extract ref fields (`consolidated_into`, `consolidates`, `supersedes`, `reopens`, `proposed_design_for`, `addresses`, `promoted_to_rule`/`origin`) from added lines and WARN if a target id is not present in the PR's own added set OR the base registry union. Transient orphans (target on un-merged branch) are expected → WARNING wording says "if this ref targets an entry on a sibling PR, this self-heals on merge." Exit 0 always.
- **Post-merge.** Net-new `.github/workflows/meta-state-refs-check.yml` on `push: branches: [main]`. Checks out the repo, runs the MCP server's relationship validator over the union (or a standalone node script that imports `core/meta-state.js` + `meta_state_relationship_validate` logic and exits non-zero on `dangling_refs` that are real — i.e. target id absent from the full union). Real orphan = typo or deleted-but-referenced. BLOCK on those.

## Related Code Files

- Modify: `.github/workflows/meta-state-pr-body-advisory.yml` (add `change-log.jsonl` to path filter; add ref-WARN step)
- Modify: `tools/scripts/ci-registry-deltas.sh` (add ref extraction + WARN) OR create `tools/scripts/ci-registry-refs.sh`
- Create: `.github/workflows/meta-state-refs-check.yml` (post-merge BLOCK)
- Create (if no standalone entry point exists): `tools/learning-loop-mastra/scripts/validate-registry-refs.mjs` (imports core validation, exits non-zero on real dangling refs) — mirrors `gate-self-verify.mjs` / `seed-file-index.mjs` pattern
- Reference: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (dangling_refs logic to reuse)

## Implementation Steps

1. Audit `ci-registry-deltas.sh`: it already extracts ids from +/- diff lines. Add ref extraction (grep the ref fields) and a WARN section listing refs whose target isn't in (added ids ∪ base union). Keep exit 0.
2. Update `meta-state-pr-body-advisory.yml` path filter to include `change-log.jsonl`; wire the new WARN step.
3. Write `validate-registry-refs.mjs`: load the union via the chokepoint, run the existing dangling-ref logic, classify — at post-merge every dangling ref is real (no sibling branches) → exit 1 on any; print the offending refs. Reuse `core/meta-state.js` + the relationships logic, don't reimplement.
4. Create `meta-state-refs-check.yml`: on `push: [main]`, checkout, setup node/pnpm, run `node validate-registry-refs.mjs --root=$GITHUB_WORKSPACE`. Block on non-zero.
5. Test locally: craft a fixture with a real orphan (ref to nonexistent id) → `validate-registry-refs.mjs` exits 1 with the ref listed; clean fixture → exit 0. Add a small test under `tools/scripts/__tests__/` or `__tests__/` mirroring the script-test pattern.
6. Run the pre-merge advisory locally against a sample diff; confirm WARNING text + exit 0.

## Success Criteria

- [ ] Pre-merge advisory emits ref WARNINGs (including cross-file refs) and exits 0 on a PR touching either file.
- [ ] Post-merge `meta-state-refs-check.yml` runs on push to main and BLOCKs on a real orphan fixture (exit 1), passes on a clean union.
- [ ] `validate-registry-refs.mjs` reuses core logic (no reimplementation); covered by a test.
- [ ] No existing CI workflow broken; `test.yml` still green.

## Risk Assessment

- **False-positive BLOCKs post-merge.** If `validate-registry-refs.mjs` misclassifies a transient orphan as real, it blocks main. Mitigation: post-merge the union is complete by definition (both files on main) — any dangling ref IS real. Add a test with a clean union → exit 0 to guard the happy path. Run the workflow on main once manually before relying on it.
- **Ref-field extraction misses a field.** The ref set is finite (`consolidated_into`, `consolidates`, `supersedes`, `reopens`, `proposed_design_for`, `addresses`, `promoted_to_rule`, `origin`). Mitigation: derive the list from `core/meta-state.js` schema/`entryIdRefsRefine` rather than hand-maintaining, so it can't drift.
- **Pre-merge path filter gap.** If `change-log.jsonl` isn't in the filter, a change-log-only PR skips the advisory. Mitigation: step 2 adds it explicitly; test by opening a draft PR touching only `change-log.jsonl`.
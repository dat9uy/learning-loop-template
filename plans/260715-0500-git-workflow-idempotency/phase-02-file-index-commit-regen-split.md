---
phase: 2
title: "File-Index Commit/Regen Split"
status: pending
priority: P2
effort: "low"
dependencies: [1]
---

# Phase 2: File-Index Commit/Regen Split

## Overview

Treat `file-index.jsonl` as the pure regen artifact it is: gitignore it and stop tracking it. The seed (already wired into `pnpm test` by PR #58) regenerates it locally at pre-commit and in CI. This removes the tracked-dirty-tree problem at the root and ends the `chore(loop): refresh fingerprint index` churn commits. The one concrete risk — `pnpm test:cold-session` runs in CI before the seed — is fixed by hoisting a standalone seed step ahead of it.

Phase 1's no-op is what makes this safe for the cold-tier cache: a regenerated index with stable hashes keeps the cache warm; without the no-op, every CI seed would churn the SHA and miss the cache every run.

## Requirements

- **Functional:** `file-index.jsonl` is untracked; `git status` never reports it. A fresh clone with no `file-index.jsonl` produces a full, valid 47-row index after `pnpm test` (or the standalone seed step). `pnpm test:cold-session` runs against a seeded index in CI (not an empty one).
- **Non-functional:** no new script. CI seed reuses the existing `seed-file-index.mjs`. Local workflow unchanged (pretest seed in `pnpm test` already covers pre-commit).

## Architecture

Two git/config edits + one CI ordering fix:

1. **`.gitignore`** — add `file-index.jsonl` with a comment explaining it is a regen artifact rebuilt at test/pre-commit time (parallels the existing `docs/registry-summary.md` "Auto-generated ... never edited by humans" entry).
2. **`git rm --cached file-index.jsonl`** — untrack without deleting the local file. One commit.
3. **`.github/workflows/test.yml`** — add a `Seed file-index` step that runs `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` **before** the existing `Run cold-session probe tests` step (currently at ~line 74, before `pnpm test` at ~line 77). This guarantees cold-session tests see a populated index on a fresh checkout. The subsequent `pnpm test` step re-seeds (no-op if nothing changed) — harmless and consistent with local behavior.

## Related Code Files

- **Modify:** `.gitignore` (add `file-index.jsonl` entry)
- **Modify:** `.github/workflows/test.yml` (add `Seed file-index` step before cold-session)
- **Git:** `git rm --cached file-index.jsonl` (untrack)
- **No code change** — `seed-file-index.mjs`, `upsertFileIndexEntry`, and the `test` script are untouched (Phase 1 already made the seed idempotent).

## Implementation Steps

1. Add to `.gitignore` (near the `docs/registry-summary.md` entry for thematic consistency):
   ```
   # Regenerated fingerprint sidecar (seed-file-index.mjs at test/pre-commit/CI).
   # Never edited by humans; recomputable from the tree. Tracked-dirty-tree churn
   # removed by plan 260715-0500 (true no-op + commit/regen split).
   file-index.jsonl
   ```
2. `git rm --cached file-index.jsonl` (keeps the working file; removes from index).
3. In `.github/workflows/test.yml`, insert a new step **immediately before** `- name: Run cold-session probe tests`:
   ```yaml
   - name: Seed file-index (regen artifact; untracked per plan 260715-0500)
     run: node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs
   ```
   Leave `pnpm test` (line ~77) as-is — it re-seeds (no-op via Phase 1 when nothing changed).
4. Verify the cold-tier-regression + cold-session tests pass against the freshly-seeded index: `pnpm test:cold-session && pnpm test` locally (the local `test:cold-session` does not seed first — see Risk 2 — so run the seed manually before it for this verification, mirroring the new CI order).

## Success Criteria

- [ ] `git status` does not report `file-index.jsonl` after `pnpm test`.
- [ ] `git ls-files file-index.jsonl` returns empty (untracked).
- [ ] Fresh-clone simulation: `rm file-index.jsonl && pnpm test` regenerates a 47-row index and all tests pass.
- [ ] CI `test.yml` seeds before cold-session; `pnpm test:cold-session` passes in CI against a seeded index.
- [ ] No `chore(loop): refresh fingerprint index` commits are needed on no-op runs (Phase 1 + Phase 2 together).

## Risk Assessment

- **RISK 1 (load-bearing) — cold-session runs before the seed.** `.github/workflows/test.yml` runs `pnpm test:cold-session` (~line 74) before `pnpm test` (~line 77). With `file-index.jsonl` gitignored, a fresh CI checkout has no index → cold-session tests hit an empty index → grounding fails-open / test may regress. **Mitigation:** the new `Seed file-index` CI step (step 3) runs *before* cold-session. This is the concrete M2-fresh-clone-gap the split opens, closed by the CI step.
- **RISK 2 — local `test:cold-session` does not seed.** `package.json` `test:cold-session` = bare `vitest run .../cold-session-discoverability.test.cjs` (no seed prefix, unlike `test`). Locally running `pnpm test:cold-session` directly after a fresh clone hits the same empty-index issue. **Mitigation:** document in the seed hint (Phase 3) that local cold-session runs should precede `pnpm test` (or the seed) — OR optionally add the seed prefix to `test:cold-session` too. Decide in Phase 3; the CI step is the required fix for this phase, the local convenience is secondary.
- **RISK 3 — losing the committed baseline.** The committed `file-index.jsonl` served as a baseline snapshot. After untracking, the baseline is regenerated at test time. This is the intended behavior (drift is recomputed against the live tree, not a stale commit). The cold-tier cache is already local/gitignored, so no loss there. Grounding coverage denominator is recomputed by the seed. Acceptable.
- **RISK 4 — `SKIP_PRESEED=1` in CI.** The escape hatch (PR #58) skips the seed. If `SKIP_PRESEED=1` were set in CI with `file-index.jsonl` gitignored, CI would have no index. The new standalone `Seed file-index` CI step (step 3) is a direct `node` invocation that does **not** honor `SKIP_PRESEED` — it always seeds. `SKIP_PRESEED` only affects the `pnpm test`-embedded seed. So CI always seeds once. Document that `SKIP_PRESEED=1` is an operator-local escape only.
# Brainstorm — Git-Workflow Idempotency for Loop-Generated Artifacts

**Date:** 2026-07-15
**Status:** APPROVED (consensus reached)
**Revision 2026-07-15:** Finding 1 disposition changed from "accept / keep manual workaround" → **reframe (patch the finding to surface the two-target mismatch, keep OPEN)**. The finding was patched to v2 in the registry this session; this report is updated to match.
**Scope:** `meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c` + `meta-260715T0349Z-pretest-seed-dirtying-a-tracked-regen-artifact-on-every-pnpm`
**Related:** `meta-260708T0355Z-m2-single-writer-gate-...` (M2 commit/regen split), plan `260714-2012-meta-state-refresh-cache-and-pretest` (PR #58, shipped)

## Problem statement

Two open findings are one problem at two layers: **loop-generated artifacts committed to git fight the loop's own regeneration under async writers.**

1. **`meta-260709T1017Z` (EOF merge conflict).** Parallel PRs that each commit `meta-state.jsonl` change-logs in-PR (the "clean git revert" practice) conflict at EOF when merged sequentially — git cannot auto-merge two same-position appends. Observed PR #44 / PR #45. Manual `git merge-file --union` workaround exists.
2. **`meta-260715T0349Z` (dirty tree on no-op re-seed).** `upsertFileIndexEntry` (`core/meta-state.js:679-710`) re-stamps `updated_at: new Date().toISOString()` on **every** row of a full rewrite, even when no `code_fingerprint` changed. PR #58 prepended `seed-file-index.mjs` to the `test` script, so every `pnpm test` / pre-commit rewrites all 47 rows → `git status` shows a dirty `file-index.jsonl` → "5 of the last 7 commits are `chore(loop): refresh fingerprint index`."

**User constraint:** code may change **async** (parallel PRs / parallel agents / worktrees). Idempotency must hold under concurrent/async mutation, not just serial re-runs.

## Verified facts (scout)

- `runtime-state.jsonl` = **true append-only** (`appendFileSync` only — `appendLedgerEvent`, `gate-override.js:appendOverrideAudit`). `merge=union` is **safe**.
- `meta-state.jsonl` = **full rewrite on every write** (`meta-state.js:71`, `:1288` — even appends read all entries and rewrite the whole file). It has in-place **mutations** for status flips (`resolve`/`patch`/`batch` update+archive). `merge=union` is **unsafe** → would keep both stale and mutated versions of a mutated entry id → duplicate ids → **registry corruption**.
- `file-index.jsonl` = **pure regen artifact** (recomputable from the tree via `seed-file-index.mjs`). 47 rows, tracked. Async-write safety already fine: `enqueue` per-root queue + atomic tmp+rename (`meta-state.js:688-708`) serialize concurrent upserts. The defect is timestamp churn, not corruption.
- `findings_regrounded` (`meta-state-refresh-file-index-tool.js:79-83`) is computed **from the registry before the upsert** — it is the count of `mechanism_check:true` findings anchored to the path. It does **not** depend on whether a write happened. **The true no-op does not shift this semantic** (finding 2 overstated this).
- The `cache_hit: false` comment ("a real file edit now always triggers an upsert") stays accurate under a true no-op — the no-op suppresses only the *no-edit* case; real edits still upsert.
- Cold-tier cache key now includes `file-index.jsonl` SHA (PR #58). So timestamp-churn re-seeds **invalidate the cold-tier cache every run** — the no-op is what makes that cache-key fix actually work.
- CI already runs `pnpm test` (`.github/workflows/test.yml:77`), which prepends the seed (PR #58). Regeneration guarantee is mostly in place.
- All three artifacts are currently **tracked** (M2's gitignore rule is not in effect on main).

## Decisions (user-confirmed)

| Question | Decision | Rationale |
|---|---|---|
| Scope | Targeted fixes + architectural split | Fix finding 2 fully; take on the M2 commit/regen split |
| Seed no-op contract | **True no-op** | Skip rewrite when `map.get(key) === hash`; update the "always stamp" JSDoc contract |
| merge order | Union, indeterminate order | (Applied to `runtime-state.jsonl` only — see correction below) |
| meta-state.jsonl merge | **Reframe — patch + keep OPEN** | In-PR change-log commits are a *desired* property (operator raises findings in a branch so a later session picks them up); the only safe parallel-PR fix (post-merge logging) contradicts that. So the finding is reframed to name the two-target mismatch and kept OPEN, not accepted-as-fixed |

## Correction to the merge answer

`merge=union` is **unsafe for `meta-state.jsonl`** (full-rewrite + in-place mutations). It is safe **only for `runtime-state.jsonl`** (true append-only). Finding 1's EOF conflict is therefore **not fixed** — instead the finding is **reframed** (description patched to v2, kept OPEN) to surface the two-target mismatch. The operator's cross-session-finding-handoff workflow depends on in-PR `meta-state.jsonl` commits.

## Final recommended solution

Two code/config changes, both scoped to finding 2. Finding 1 = reframe (registry patch, no code).

### Change 1 — True no-op in `upsertFileIndexEntry` (load-bearing idempotency fix)

`core/meta-state.js:679-711`: inside the `enqueue` callback, after building `map`, compare `map.get(key)` to the incoming `hash`. If equal, skip the rewrite entirely (return `true` without touching disk).

- Re-seed with zero code change → **zero `git diff`** → no dirty tree, no churn commits.
- `file-index.jsonl` SHA stable across no-op re-seeds → **cold-tier cache stays warm** (PR #58's cache-key fix works as intended).
- Async-safe: the no-op check runs inside the per-root `enqueue` callback, so concurrent upserts of the same key remain serialized; identical-hash concurrent upserts both no-op; different-hash concurrent upserts are last-writer-wins (same as today).
- Contract updates: JSDoc `meta-state.js:676-677` "always stamp `updated_at`" → "stamped only when the entry is new or its hash changed." `findings_regrounded` semantics do **not** change (registry-derived). Optionally refine `meta_state_refresh_file_index`'s return to `status: "no-op"` / `cache_hit: true` on an unchanged path — refinement, not required.

### Change 2 — Architectural commit/regen split for `file-index.jsonl`

- `.gitignore`: add `file-index.jsonl` (pure regen artifact).
- `git rm --cached file-index.jsonl` (stop tracking; keep local file).
- CI regen guarantee: `pnpm test` already prepends the seed and CI already runs `pnpm test` (`test.yml:77`) → fresh clones regenerate the index. Closes M2 risk B (consumers silently disabled on fresh clones) as long as the seed precedes every consumer (see Risk 1).
- Eliminates `file-index.jsonl` from git history churn entirely. The committed baseline is given up (regenerated at test/CI time instead).

### Optional — `merge=union` for `runtime-state.jsonl` (safe, low-stakes)

`.gitattributes`: `runtime-state.jsonl merge=union`. True append-only → safe. Low value (runtime-state is rarely committed in parallel PRs — it is session/TTL state) but free and matches the file's semantics. Include or defer per plan's taste (YAGNI says defer unless a real parallel-append conflict is observed).

### Change 3 — Reframe finding 1 (registry patch, no code)

Patch `meta-260709T1017Z`'s description (→ v2) to name the **two-target mismatch** and keep it OPEN — not accepted-as-fixed, not resolved:

- **Target A — human-in-the-loop cross-session handoff:** operator commits findings/change-logs in-PR so a later session picks them up → *requires in-PR writes*.
- **Target B — parallel-PR/async flow:** two async branches appending conflict at EOF → the only safe fix (post-merge logging) *contradicts* Target A.
- `merge=union` is verified unsafe (full-rewrite + mutations → duplicate entry ids → registry corruption), so the only code-free parallel-PR mitigation that preserved in-PR commits is ruled out → the tension is irreducible on one file under the current write model.

Operating compromise recorded in the finding: keep in-PR commits (Target A wins) + manual `git merge-file --union` for the rare parallel-append case (Target B friction). True resolution = a deferred architectural split (a separate true-append-only change-log file where Target B's fix is safe). The finding stays OPEN as the live tension; a change-log records the reframe decision. This is more honest than "accepted as fixed."

## Approaches evaluated (rejected)

- **Post-merge logging on main for `meta-state.jsonl`** — would fix the EOF conflict cleanly but breaks the operator's in-PR cross-session finding handoff. Rejected per user as the live disposition (kept as the deferred true-resolution path for the reframed finding).
- **Split change-log into a separate append-only file** (`meta-state-changelog.jsonl` union-safe + `meta-state.jsonl` mutable) — correct and is the deferred true-resolution for the reframed finding 1, but a large refactor touching `readRegistry` and all 4-kind write paths. YAGNI for this round; revisited when the operator wants to close the reframed finding.
- **Partial no-op (bump only the changed row's `updated_at`)** — reduces churn but is not a true no-op; a real edit still rewrites the file and the cold-tier cache still churns on no-op re-seeds. Rejected in favor of true no-op.
- **Process discipline only (sequence PRs)** — does not survive the async constraint. Rejected.
- **`merge=union` on `meta-state.jsonl`** — **unsafe**, registry corruption on the first parallel mutation. Rejected after verifying the full-rewrite write profile.

## Implementation considerations & risks

1. **RISK 1 — `test:cold-session` runs before the seed.** `.github/workflows/test.yml:74` runs `pnpm test:cold-session` *before* `pnpm test` (line 77, which seeds). If `file-index.jsonl` is gitignored, cold-session tests run against an empty index → grounding fails-open / test may regress. **Plan must** either move the seed before `test:cold-session` (a standalone `node .../seed-file-index.mjs` step at the top of CI) or have `test:cold-session` seed itself. This is the concrete M2-fresh-clone-gap the architectural split opens.
2. **RISK 2 — `SKIP_PRESEED=1` interaction.** The escape hatch (PR #58) skips the seed. With `file-index.jsonl` gitignored, a `SKIP_PRESEED=1` CI run would have no index at all. The escape hatch is operator-opt-in for local "cold" runs; CI must never set it. Document this.
3. **Contract drift — `meta_state_refresh_file_index` return.** After the no-op, the tool returns `status: "refreshed"` + `cache_hit: false` even on an unchanged path. Slightly misleading; refine to `status: "no-op"` (optional). Any consumer asserting `status === "refreshed"` must be checked.
4. **TDD path.** Change 1 is a behavior-preserving refinement with a clear invariant to lock first: "re-upsert of an unchanged hash produces zero file change." Test in `meta-state*.test` — seed into a temp root, hash the file, re-upsert the same hash, assert byte-identical. Then implement the early-return.
5. **No new MCP tools, no new scripts** (matches PR #58 convention). Change 1 is a ~3-line edit + JSDoc. Change 2 is `.gitignore` + `git rm --cached` + (possibly) a CI seed step ordering fix.

## Success metrics & validation

- `pnpm test` run twice in a row with zero code change → `git diff --stat` empty (Change 1).
- A code edit to one cited file → `file-index.jsonl` diff contains only that one row, not all 47 (Change 1).
- After Change 2: `git status` never reports `file-index.jsonl`; fresh clone + `pnpm test` regenerates a 47-row index; cold-session tests pass (Risk 1 handled).
- `meta_state_refresh_file_index` on an unchanged path returns no-op (if refinement shipped).
- No regression in cold-tier-regression, grounding, or gate tests.
- Finding 1 (`meta-260709T1017Z`): description patched to v2 with the `[reframe 2026-07-15] TWO-TARGET MISMATCH` block; status stays **OPEN** (not resolved, not accepted-as-fixed); a change-log records the architectural-tension decision. Applied this session — verify in Phase 3.

## Next steps & dependencies

- Finding 1 (`meta-260709T1017Z`): **reframed** (patched to v2, kept OPEN) — verify the reframe landed and record the architectural-tension decision as a change-log. Optional `runtime-state.jsonl merge=union` add-on (YAGNI).
- Finding 2 (`meta-260715T0349Z`): resolve via Change 1 + Change 2.
- M2 (`meta-260708T0355Z`): the architectural split here partially addresses M2 risk B (per-file treatment of `file-index.jsonl`), but M2's per-file debate for `meta-state.jsonl` / `runtime-state.jsonl` remains open — explicitly out of scope for this round.
- Hand off to `/ck:plan` for phased implementation (TDD recommended — Change 1 refactors existing write behavior with a clear invariant to lock).
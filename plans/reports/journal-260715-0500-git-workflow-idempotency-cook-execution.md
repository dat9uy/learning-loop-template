# Journal — git-workflow-idempotency cook execution

**Date:** 2026-07-15
**Branch:** plan/260715-0500-git-workflow-idempotency
**Plan:** plans/260715-0500-git-workflow-idempotency/plan.md
**Commits:** 3 (single PR, Phase 1 → 2 → 3 order)

## What landed

`upsertFileIndexEntry` now early-returns true when `map.get(key) === hash`, so re-seeding with zero code change produces zero byte diff. `file-index.jsonl` is now an UNTRACKED regen artifact (gitignored; `git rm --cached`). CI seeds via `env -u SKIP_PRESEED node .../seed-file-index.mjs --root=$GITHUB_WORKSPACE` before cold-session probe tests. `meta_state_refresh_file_index` returns `status: "no-op"` on an unchanged path (`cache_hit: false` contract preserved). PROCESS_HINTS row 8 patched (NOT appended) at 3 storage sites; mirror stays byte-identical. `meta-260715T0349Z` resolved; `meta-260709T1017Z` reframe verified open at v2 (NOT resolved). `.gitattributes` ships `runtime-state.jsonl merge=union` as defense in depth.

## What was non-obvious

The plan said "every test that asserts `status === "refreshed"` is a first-call refresh" — verified by grep: 7 hits, all first-call. The new no-op detection therefore doesn't break any existing test, but the plan also mandated adding a test for the no-op branch. The reviewer caught this gap post-execution; added `assert.strictEqual(p2.status, "no-op")` to the existing same-content refresh test (8/8 still green).

The plan said the new `meta_state_refresh_file_index` no-op status "is misleading but not incorrect; refine in Phase 3." Implementation was straightforward until I forgot to import `readFileIndex` — the tool returns `{error: "ReferenceError"}` rather than silently failing. Direct Node test caught this immediately; MCP-issued calls had been going through the running server's cached module so they reported the wrong (refreshed) status without throwing. Fix is one-line.

The `meta-260715T0349Z` consult-gate preflight (`rule-no-orphaned-evidence`) iterates every open mechanism_check finding. The first `meta_state_resolve` attempt would have failed if any fingerprint was stale. Solution: run the seed (which refreshes every mechanism_check:true cited path in one pass) before calling `meta_state_refresh_file_index` for the specific Phase 1-edit path. Total preflight: `seed-file-index.mjs` + 1 targeted refresh. The resolve succeeded first try.

## What I'd do differently next time

The plan's `Phase 3 Implementation Step 4` said "Add/adjust a test in the sibling test file for the no-op path" — I deferred that to "verify nothing breaks" rather than adding the assertion upfront. Should have added it as part of the Phase 3C1 edit, not after the reviewer flagged it.

## Reusable patterns

- **Plan-execution checklist for `meta_state_resolve` on a finding with `evidence_code_ref`:** run `seed-file-index.mjs` → `meta_state_refresh_file_index` on the cited path → `meta_state_resolve`. The seed covers all mechanism_check:true paths; the targeted refresh records a gate-log entry (audit trail).
- **TDD on a "no-op" optimization:** the failing-test asserts byte-identity (not just cache invariant), so a partial-no-op (e.g., "still touches mtime") also fails. Catch more bugs upfront.
- **PROCESS_HINTS row patch vs append:** always check `length === N` assertions in test files first. The plan's Red-team #2 caught the append-vs-patch trap; the byte-identical mirror check (`diff exit 0`) catches drift between canonical and `.factory/hooks/loop-surface-inject.cjs`.

## Final state

- 1897 tests pass (1 new no-op assertion), 0 fail
- 3 commits on `plan/260715-0500-git-workflow-idempotency`, working tree clean
- `file-index.jsonl` gitignored + untracked + 17 entries after seed (mechanism_check:true paths only)
- `meta-260715T0503Z` + `meta-260715T0504Z` change-logs recorded
- `meta-260715T0349Z` resolved (fixed); `meta-260709T1017Z` kept open at v2 with reframe block
- No push, no PR (user reviews + pushes when ready)
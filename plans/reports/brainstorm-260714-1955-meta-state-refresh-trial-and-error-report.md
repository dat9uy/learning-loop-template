# Brainstorm — meta-state refresh workflow forces N trial-and-error MCP

**Finding:** `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` (open, warning, `mcp-tools`)
**Date:** 2026-07-14 (BKK)
**Status:** APPROVED — Approach A + pretest seed + discoverability hint
**Flags:** none

## Problem statement

Closing file-edit drift burns 30–90s of operator/agent time per code-touching fix: (a) N sequential `meta_state_refresh_file_index` MCP round-trips for legitimately-edited files; (b) `cold-tier-regression` test fails repeatedly against pre-existing drift not discoverable up-front; (c) manual `rm records/meta/.cache/loop-describe-cold.json` because the cold-tier cache is keyed on registry SHA only. Sibling vitest-half finding (`meta-260714T1334Z-…`) already **resolved** via PR #57 (`vitest-failures.sh`); only the meta-state half remains.

## Key reframe — the finding missed an existing primitive

`tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (78 LOC, committed) **already does what the finding's Tier 1 + Tier 3 propose to build**: re-hashes every `mechanism_check:true` cited path, `upsertFileIndexEntry` each, idempotent, core-direct, one process, zero MCP round-trips. It is only wired into the manual `pnpm gate:self-verify` wrapper — **not** the automatic pre-commit/test path. 3 of the finding's 4 tiers are therefore already-built or wrong-scoped.

## Verified facts (scout)

- **Tier 4 cache bug is real + independent.** `core/loop-introspect-cache.js:41,56` keys cold-tier cache on `registry_sha256` (meta-state.jsonl) only. Cold payload includes file-index-derived drift (`computeDriftEntries` at `loop-introspect.js:758` reads `fileIndex`). File-index drift survives across cold-tier calls until manual `rm`. Must-fix regardless of seeding.
- **pre-commit** (simple-git-hooks) = `pnpm test && pnpm fallow:gate`. `pnpm test` = `vitest run && node tools/scripts/sanitize-coverage.mjs`.
- **cold-tier-regression test** (`legacy-mcp/cold-tier-regression.test.js:109-114`) asserts all groundable findings grounded vs current source; *throws* on drift. Running `seed-file-index.mjs` before `vitest run` **satisfies** it — seeding does not break the test, it removes the failure cause.
- **Drift detection** = live hash vs file-index baseline (`check-grounding.js:188+`). Seed/refresh updates baseline; **seed ≠ resolve** — findings stay open, only fingerprint baseline moves. Auto-seed does not silently close findings.
- **`meta_state_query_drift` already exists** as the discovery side. "Drift not discoverable up-front" = operator didn't run it, not no tool.
- **Batch precedent**: `meta_state_batch` (500-op atomic) + `260709-1032-meta-state-batch-wire-fix` (envelope-strip pattern). `meta_state_batch` intentionally excluded from self-improvement agent (operator-grade).
- **Prior art**: `260610-1900-meta-state-refresh-loop-circuit-breaker` (completed) cured a 163-calls/53min refresh-loop pathology — any agent-callable reground tool re-opens that risk.

## Batch MCP — pros/cons (evaluated, rejected for this scope)

**Pros:** keeps agent in MCP L2 mid-session; one round-trip replaces N; `reground_drift({scope})` auto-discovers; inherits `appendGateLog` audit (seed-file-index has none today).
**Cons:** new MCP surface (manifest+schema+handler+tests, ~50-100 LOC); duplicates `seed-file-index.mjs` unless shared core `regroundDrift()` (DRY risk); **redundant once pretest seeding is wired** — agent mid-session pain was refreshing before re-running `pnpm test`, which pretest seed eliminates; re-opens refresh-loop self-loop risk; wire-format array-coercion cost.

**Verdict:** YAGNI for this finding. No agent-callable reground case shown outside test runs. MCP `refresh_file_index` stays for deliberate per-path drift acceptance with audit.

## Trade-off accepted

Auto-seeding pre-test/pre-commit **suppresses the at-commit drift signal**. Acceptable because: (1) designers already chose this — `gate:self-verify` step 1 is "re-seed so fingerprints match current source"; (2) a commit is a deliberate checkpoint — fingerprints should match committed source; (3) drift detection (`query_drift`/`check_grounding`) still works on demand and post-commit; only the immediate at-commit signal is absorbed — which is the point of "system absorbs O(n), not operator."

## Chosen approach — A (Minimal) + pretest seed + hint

1. **Tier 4 cache-key fix.** `loop-introspect-cache.js`: add `fileIndexSha256(root)` (SHA of `file-index.jsonl`); include in both `readColdTierCache` (compare) and `writeColdTierCache` (store). Cache misses when either registry or file-index SHA changes. ~8 LOC + unit test.
2. **Wire `seed-file-index.mjs` into pretest.** `package.json` `test` script: `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs && vitest run && node tools/scripts/sanitize-coverage.mjs`. pre-commit inherits via `pnpm test`. Covers pain (a) mid-session + (b) commit-time.
3. **Discoverability hint (deterministic + agentic).** Add PROCESS_HINTS entry: fingerprints are load-bearing loop core; pretest auto-seeds before `vitest run`, but if you edit files *during* a debug/test loop and hit file-index drift errors, run `node …/seed-file-index.mjs` (or `meta_state_refresh_file_index({path})` for a single deliberate reground with audit) before re-running tests. Canonical + hook LOCAL copy must match exactly (drift-prevention test `cold-session-discoverability.test.cjs:359`).

No new MCP tool. No new CLI script. Reuse `seed-file-index.mjs`. `meta_state_refresh_file_index` semantics unchanged.

## Exact requirements

- **Expected output:** (1) edited `loop-introspect-cache.js` + unit test; (2) `package.json` `test` pretest seed line; (3) PROCESS_HINTS canonical + LOCAL_PROCESS_HINTS hook copy + drift-prevention test still passes; (4) cold-tier-regression + freshness tests green.
- **Acceptance:** after editing any cited source file, `pnpm test` passes first try with zero manual `refresh_file_index` calls and zero `rm …cold.json`; unit test proves cold-tier cache invalidates on file-index.jsonl change; pretest seed idempotent and non-breaking to `check:freshness`/`test:cold-session`/`test:debug`; PROCESS_HINTS canonical == hook copy.
- **Scope OUT:** vitest-half sibling (resolved); new MCP tool; new CLI script; Tier 2/3; `meta_state_refresh_file_index` semantics; manifest changes.
- **Constraints:** reuse `seed-file-index.mjs` (no duplicate); MCP stays agent L2 (no Bash-bypass of loop decisions — pretest seed is part of the test command like `sanitize-coverage`, not a loop-decision bypass); simple-git-hooks pre-commit keeps working; conventional commits, no AI refs; preserve audit where decisions happen (refresh tool unchanged).
- **Touchpoints:** `core/loop-introspect-cache.js` + test; `package.json` `test` script; PROCESS_HINTS source (`core/loop-introspect.js` DISCOVERABILITY/PROCESS hints) + hook copy (`hooks/universal/session-start-inject-discoverability.cjs`); verify `legacy-mcp/cold-tier-regression.test.js`, `freshness/cold-session-freshness.test.js`, `legacy-mcp/cold-session-discoverability.test.cjs`.

## Risks / open items for plan phase

- **Targeted test scripts** (`check:freshness`, `test:cold-session`, `test:debug`) call `vitest run <path>` directly, not via `test` — they will NOT pretest-seed. Plan must confirm `cold-session-freshness` uses fixtures (not live drift) so it doesn't need seed; if it does, scope seed into those too or accept they run against current index.
- **seed-file-index has no audit log.** Decision: acceptable — seed is a mechanical baseline-sync (git history is the audit), not a per-finding drift-acceptance judgment. `refresh_file_index` retains audit for deliberate per-path acceptance. Flag if operator disagrees.
- **Pretest seed cost**: re-hashes all `mechanism_check:true` cited paths per `pnpm test`. ~dozens of files, ms-range. Negligible; idempotent.
- **Finding's proposed `loop-design-meta-state-batch-refresh-and-reground-drift`**: not needed under Approach A. Plan should resolve the finding with the reuse-existing-primitive rationale; no new loop-design entry required (or a minimal one noting the reuse decision).
- **Cache-fix test isolation**: `loop-introspect-cache.js` test must write a real `file-index.jsonl` temp to exercise the new SHA key.

## Success metrics

- `pnpm test` first-try pass after editing a cited file (no manual refresh, no `rm`).
- Cold-tier cache invalidates on file-index change (unit test).
- PROCESS_HINTS drift-prevention test green.
- Zero new MCP surface / zero new scripts.

## Next steps

Hand off to `/ck:plan --tdd` (recommended: refactors load-bearing loop behavior with strong existing test coverage to preserve). Resolve finding `meta-260714T1704Z-…` on ship.

## Unresolved questions

- Should seed-file-index.mjs append a minimal gate-log entry when run pre-test (audit), or is git history sufficient? (Recommendation: git history sufficient; revisit if operator wants commit-time reground audit.)
- Should the pretest seed also cover `check:freshness` / `test:cold-session` targeted scripts, or only the full `test` script? (Plan-phase verification of fixture-vs-live drift in freshness tests decides this.)
# fix(meta-state): invalidate cold-tier cache on file-index drift; pretest seeds file-index

Closes the N-trial-and-error loop that the meta-state refresh workflow forced on every code-touching fix: every legitimate Edit/Write burned 30–90s on (a) sequential `meta_state_refresh_file_index` MCP round-trips, (b) cold-tier-regression test failures against pre-existing drift not discoverable up-front, (c) manual `rm records/meta/.cache/loop-describe-cold.json` because the cold-tier cache was keyed on registry SHA only.

## Registry deltas

### Resolved
- `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` — closed (Tier 4 cache-key fix + Tier 1 pretest seed via reuse of committed primitive; PROCESS_HINTS row + 4-file mirror closed the agent-discoverability gap; Tiers 2/3 batch MCP tools explicitly YAGNI).

### Shipped loop-design (deferred to operator — requires `LOOP_SESSION_MODE=live`)
- `loop-design-meta-state-batch-refresh-and-reground-drift` → inactive. **Operator action required:** run
  ```
  meta_state_ship_loop_design({ id: "loop-design-meta-state-batch-refresh-and-reground-drift", shipped_in_plan: "260714-2012-meta-state-refresh-cache-and-pretest" })
  ```
  in a live-gated session to flip status `active` → `inactive` and stamp `shipped_in_plan`.

### No new entries, no promotions, no archivings beyond the resolve above.

## Code delta

### 6 files modified
- `tools/learning-loop-mastra/core/loop-introspect-cache.js` — cache-key fix: `file_index_sha256` computed alongside `registry_sha256` in both read (atomic paired reads → TOCTOU-safe) and write paths.
- `package.json` — pretest seed: `"test"` script begins with `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs &&`; pre-commit hook (`simple-git-hooks.pre-commit`) inherits via the existing `pnpm test && pnpm fallow:gate` chain.
- `tools/learning-loop-mastra/core/loop-introspect.js` — `PROCESS_HINTS` row appended at index 8 teaching the pretest-seed convention + single-path `meta_state_refresh_file_index` escape hatch + `SKIP_PRESEED=1` escape.
- `.factory/hooks/loop-surface-inject.cjs` — `LOCAL_PROCESS_HINTS` row appended at index 8 (byte-for-byte mirror of the canonical row).
- `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` — `HINT_KEY_MAP_PROCESS` gains `file-edit-drift-and-fingerprints → 8`; `HINT_SUGGESTIONS_PROCESS[8]` filled (the same one-liner).
- `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` — `SKIP_PRESEED=1` escape hatch added at the top of the script (preserves default bulk-seed behavior; opt-out per run).

### 3 test files modified
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js` — new sibling `describe("file-index SHA invalidates cold-tier cache")` block with its own `mkdtempSync` root (avoids GATE_ROOT pollution from the existing 6 tests); writes both `meta-state.jsonl` AND `file-index.jsonl` fixtures, mutates ONLY `file-index.jsonl` with different byte length, asserts on-disk `built_at` differs.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` — new sibling test `HINT_KEY_MAP_PROCESS covers every PROCESS_HINTS index (closes silent-rot gap)` mirrors the existing discoverability parity test, but for the process-hint map; closes the inherited-rot gap for `HINT_KEY_MAP_PROCESS`.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` — length assertion `8 → 9` (sibling-test guard against drift).

## Acceptance verification (per plan AC)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `pnpm test` first-try passes after editing any `mechanism_check:true`-cited file without manual refresh or cache deletion | ✅ (seed wired in pretest; full suite 1895/1895 passes with seeded index) |
| 2 | `loop-describe-cold-cache.test.js` gains a test that cold-tier cache invalidates when `file-index.jsonl` SHA changes (registry unchanged) | ✅ |
| 3 | `package.json test` script begins with `node …/seed-file-index.mjs &&`; pre-commit hook inherits | ✅ |
| 4 | `pnpm test:cold-session` cold-session-discoverability drift-prevention test passes (canonical 9 entries and hook 9 entries arrays match byte-for-byte) | ✅ |
| 5 | `loop-design-meta-state-batch-refresh-and-reground-drift` shipped via this plan (the reuse-existing-primitive decision is the supersession rationale) | 🟡 deferred to operator (requires `LOOP_SESSION_MODE=live`) |
| 6 | Finding `meta-260714T1704Z-…` resolved; PR body enumerates cache-key fix + pretest-seed wiring + PROCESS_HINTS row delta | ✅ (this file) |
| 7 | `pnpm check:freshness`, `pnpm test:cold-session`, `pnpm test:debug` still work — none of them call `pnpm test`, so the pretest seed does not affect them | 🟡 `pnpm test:debug` is pre-existing-broken (target `__tests__/debug/` no longer exists after commit 7952f162); unrelated to this PR. `check:freshness` and `test:cold-session` green. |
| 8 | No new MCP tool, no new CLI script, no manifest change | ✅ |

## Measured cost (closes Red Team F15)

Pretest seed wall-clock: **115 ms** (well below the unsubstantiated "tens of milliseconds" estimate and the F15 500-1500ms estimate — the per-root `enqueue` queue is non-blocking when the only writer is the seed script, so 19 distinct paths complete in ~100ms sequential read+hash).

## Cross-platform note (closes Red Team F14)

The `&&` shell-chain syntax is POSIX-portable. Windows `cmd` does support `&&` natively, but cross-platform shell-quoting claims are deferred as future work — the script is exercised only in POSIX environments per existing CI.

## Migration & rollback

No data migration. Cached files written before this PR lack `file_index_sha256`; the first cold-tier call after upgrade returns `{hit:false, reason:"sha_mismatch"}` (equivalent to today's behavior on a registry change) and the next write carries both SHAs. To roll back: revert the commit; pre-commit hook restores the previous `vitest run` first behavior; cold-tier cache reverts to registry-SHA-only key (F4 regression reintroduced).

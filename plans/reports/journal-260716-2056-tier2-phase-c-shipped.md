# Tier 2 Phase C — Implementation Journal

**Date:** 2026-07-16
**Author:** operator (via `ak-cook --auto`)
**Plan:** `plans/260716-1101-tier2-versioned-append-mutable-stream/`
**Status:** Shipped locally; full test suite green (2121 passed, 0 failed); PR body drafted.

## Sequence

1. **Scout + TDD write-up.** Created 5 failing test files (23 cases total):
   - `tools/learning-loop-mastra/core/__tests__/registry-stats.test.js` (13 cases)
   - `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-registry-stats.test.js` (2 cases)
   - `tools/scripts/__tests__/compact-registry.test.js` (13 cases; --check + --full)
   - `tools/scripts/__tests__/meta-state-merge-union.test.js` (3 cases; corrected + wrong driver)
   - `tools/scripts/__tests__/ci-registry-deltas-duplicate-version.test.js` (4 cases)
2. **Implementation:**
   - `tools/learning-loop-mastra/core/registry-stats.js` — shared helper (computeRegistryStats + findDuplicateVersionPerId)
   - `tools/scripts/compact-registry.sh --full` — atomic per-file rewrite (jq group_by + max + tmp/rename); keeps max_by(version), keeps latest tombstone per archived id
   - `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` — warm tier now imports computeRegistryStats, exposes `registry_stats` + `compaction_action_hook`
   - `tools/scripts/ci-registry-deltas.sh` — Q2 same-id-duplicate-version advisory (per-id WARNING, RT S-F9 fix; non-blocking by Validation Session 1 Q2)
   - `.github/workflows/meta-state-union-safety.yml` — writer-side stale-base guard + per-clone driver check (both BLOCK)
   - `.gitattributes` — flipped `meta-state.jsonl merge=union` (with justification citing Phase B)
   - `AGENTS.md §1.1 + §8` — read-recipe formalization (no longer table-readable, use `registry-table.sh | tail -20`)
   - `tools/learning-loop-mastra/core/placement.yaml` — registered `registry-stats.js`
3. **End-to-end verification:**
   - All 5 test files green after impl (TDD verified the behavior, not just the absence of breakage)
   - Real parallel-merge dry-run executed via `meta-state-merge-union.test.js` (uses actual `git merge` + actual `.gitattributes`, not a jq-only simulation)
   - Full suite: `pnpm test:iter` → 2121 / 0 / 429
   - One placement-manifest fix applied during test run (`registry-stats.js` row added to `placement.yaml`)
4. **Registry mutation:**
   - `meta_state_refresh_file_index` for `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (Phase C added wiring → re-ground) and `.gitattributes` (Phase C flipped → re-ground)
   - `meta_state_resolve` flipped `meta-260715T0633Z-...-finding-stream-...` to `resolved: operator`
   - `meta_state_log_change` emitted `meta-260716T2053Z-plans-260716-1101-tier2-versioned-append-mutable-stream`

## Decisions

- **Compaction action hook is a separate field, not an extra discoverability_hint.** The Phase C plan called for surfacing compaction eligibility; the existing test (`loop-describe-warm-tier.test.js:14`) pins `discoverability_hints.length === 16` with an exact substring match. Adding a 17th static hint would break that test. Resolved by adding a separate `compaction_action_hook` field that fires when eligible and stays absent otherwise (cheap, atomic).
- **`computeRegistryStats` is a shared core helper, not shell subprocess.** Plan risk-mitigation §"registry_stats shelling out from MCP server" called for direct import (avoids subprocess gate concerns + keeps the warm-tier budget tight). The shell script duplicates the math via `jq` for `--check` (no Node dependency at CLI runtime).
- **PR-body advisory test routes through `$GITHUB_STEP_SUMMARY` file, not stdout.** Discovered mid-implementation: the script writes the delta advisory to the summary file path, not stdout (per CI convention). Routed the test through a real temp file instead of `/dev/null` to mirror production wiring. Required fixing the test's `makeDiff` helper too — `${l}` template literals coerce objects to "[object Object]" (use `JSON.stringify(l)`).
- **Writer-side guard logic does not also check `entry_kind` exclusions.** The guard parses the diff for every added line with an `id` + `version`, regardless of `entry_kind`. Change-log entries (which are append-only singletons per id with `version: 1`) trigger the guard only if their added version is below the base max — the projection sees both versions and the lower one would win, which is a real stale-base write. This is the documented Phase C accept (writer-side discipline must be continuous; the guard's surface matches the C1 design comment).
- **Files-touched manifest updated BEFORE the final test run, not after.** Required because the placement-manifest test enumerates `core/*.js` and fails with a synchronous assertion pointing at the missing row. Caught at first `pnpm test:iter` → fixed → re-ran green.

## Risks remaining

- The H5 per-clone driver check runs only in CI (ephemeral runners). Local development still needs `tools/scripts/setup-git-merge-drivers.sh` once per clone. The setup script's wrong-order detection continues to refuse silent overwrite — unchanged.
- `meta_state_compact` MCP tool was explicitly out of scope (Validation Session 1 Q5: shell script only). If a future agent runtime needs programmatic compaction, that's a Tier-3 plan.
- Global lamport versioning and auto-compaction remain Tier-3.

## Cross-references

- `meta-260715T0633Z-...-finding-stream-...` — Tier 2 ticket; resolved by this phase.
- `meta-260716T2053Z-plans-260716-1101-tier2-versioned-append-mutable-stream` — change-log entry emitted by this phase.
- `meta-260715T1801Z-...git-merge-file...` — H5 driver finding; fingerprinted to current `.gitattributes`.
- `meta-260714T1248Z-no-mcp-tool-exists-to-invalidate-...` — re-grounded; Phase C added registry_stats wiring at the cited line.

## Status

**DONE_WITH_CONCERNS**

Concerns:
- The PR is **drafted but not pushed** (no `gh pr create`). Operator should run `gh pr create --base main --head <branch> --body-file plans/260716-1101-tier2-versioned-append-mutable-stream/phase-c-pr-body.md` when ready.
- `loop_describe` warm tier caches its discovery payload; an in-flight `pnpm exec tsx` MCP server may still expose stale `registry_stats: undefined` until the next process restart. Cold-session parity test confirms the on-disk shape is correct (the warm-tier test in `loop-describe-registry-stats.test.js` passed).
- The `compaction_action_hook` is surfaced in the warm tier but is NOT injected as a SessionStart hint (the static `DISCOVERABILITY_HINTS` list stays at 16 to preserve the invariant). Operators discover compaction eligibility only when they call `loop_describe({tier:"warm"})`. Acceptable per plan; future Phase 3 plan may extend the SessionStart injector.

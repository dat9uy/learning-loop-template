# Tier 2 Phase C: gitattributes Flip + CI Advisory + Compaction Signal

> Plan: [260716-1101-tier2-versioned-append-mutable-stream](../260716-1101-tier2-versioned-append-mutable-stream/plan.md)
> Phase: 3 of 3 (Phase A ✅; Phase B ✅ via PR #65; this PR ships Phase C)

This is the load-bearing mechanical fix that **removes the operator's parallel-resolve speed limiter**. With Phase B's versioned-append write path on main, the mutable registry (meta-state.jsonl) is now safe for `merge=union`: parallel PRs that each mutate the same finding id auto-merge instead of conflicting, both version lines are retained in the raw file, and the read projection (`_readAndParseRegistry` + `registry-table.sh`) dedupes to last-wins-by-max-version per id.

## What this PR ships

- **`meta-state.jsonl merge=union` flip** in `.gitattributes` (with justification citing Phase B's write-path rewrite). The driver command stays per-clone (canonical: `git merge-file --union %A %O %B`); see `tools/scripts/setup-git-merge-drivers.sh`.
- **Q2 same-id-concurrent-mutation CI advisory** — extension of `tools/scripts/ci-registry-deltas.sh`: when the PR's added set contains the same id on more than one line, the advisory emits **one WARNING per affected id** (replaces Red Team S-F9's collapsed-to-boolean expression). Pre-merge, non-blocking (Validation Session 1 Q2).
- **Writer-side union-safety guard** — new `.github/workflows/meta-state-union-safety.yml` step. The guard computes the max version per id in the base union and **BLOCKS** the PR if any added line's `version` is strictly less than the base max for that id. A stale-base write would survive the merge, producing a duplicate-version-per-id pair where the lower-version line wins the projection (wrong outcome). Irreversible flip deserves continuous discipline (Red Team C1).
- **Per-clone driver check** — same workflow. **BLOCKS** the PR if `merge.union.driver` is missing or has the wrong arg order. A fresh-clone contributor with the wrong-arg-order workaround (`git merge-file --union %O %A %B`) silently drops "theirs" — the exact data-loss `merge=union` exists to prevent (Red Team H5).
- **`compact-registry.sh --full`** — full compaction primitive (the `--check` half shipped in Phase B). Atomic per-file rewrite via tmp+rename. Keeps `max_by(.version)` per id (last-wins). Keeps the latest tombstone per archived id for audit completeness. Drops superseded non-winning versions.
- **`computeRegistryStats(root)` helper** at `tools/learning-loop-mastra/core/registry-stats.js`. Shared by the `loop_describe` warm tier (imported directly — NO shell subprocess from the MCP server) and the compaction script. Returns the 4-key shape: `{ raw_lines, deduped_ids, dead_version_lines, compaction_eligible }`.
- **Warm-tier `registry_stats` block** — `loop_describe({tier:"warm"})` now includes the stats. When `compaction_eligible=true`, a separate `compaction_action_hook` field fires pointing at `pnpm exec compact-registry.sh --full` (Validation Session 1 Q5: shell script only, no `meta_state_compact` MCP tool).
- **Read-recipe formalization** — AGENTS.md §1.1 + §8 note the post-Tier-2 reality (raw file is no longer table-readable because one id spans N versioned lines). Inbound gate instruction is now `tools/scripts/registry-table.sh | tail -20` (already in CLAUDE.md + SessionStart hint).
- **Tier 2 ticket resolved** — `meta-260715T0633Z-...-finding-stream-...` flipped to `resolved: operator`. The operator's self-limiter is removed.

## Verification

- 5 new test files (`registry-stats.test.js`, `loop-describe-registry-stats.test.js`, `compact-registry.test.js`, `meta-state-merge-union.test.js`, `ci-registry-deltas-duplicate-version.test.js`) covering 23 new test cases.
- **Full test suite: 2121 passed, 0 failed, 429 suites.** (`pnpm test:iter`)
- **End-to-end parallel-merge dry-run verified**: two branches from a shared base each append a versioned line for the same id at EOF; corrected `merge.union.driver` auto-merges; both lines retained; projection dedupes to last-wins-by-max-version. Regression-tested with the wrong-arg-order driver (verifies the silent data-loss bug still fires when the per-clone check is bypassed).
- **Files-touched manifest** updated in `tools/learning-loop-mastra/core/placement.yaml`.

## Out of scope

- Real DB / event store (Tier 3)
- Auto-compaction (Tier 3)
- Global lamport versioning (Tier 3)
- Post-merge BLOCK for same-id mutations (Phase C keeps pre-merge WARNING only per Q2)

## Registry deltas (per `rule-pr-body-registry-deltas`)

### Resolved entries

- `meta-260715T0633Z-...-finding-stream-...` — Tier 2 ticket. Phase B rewrote the write path to versioned-append (no in-place mutation, no full-rewrite); Phase C flipped `.gitattributes` (meta-state.jsonl merge=union), added the Q2 advisory, shipped the writer-side guard + per-clone driver CI BLOCK, shipped the compaction signal (compact-registry.sh --check + --full, registry_stats), formalized the read recipe as `registry-table.sh | tail -20`, and proved end-to-end via parallel-merge dry-run. Operator self-limiter is removed.

### New entries

(none)

### Promoted rules

(none)

### Superseded entries

(none)

### Swept entries

(none)

### Archived entries

(none)

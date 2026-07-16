# PM Status: tier2-versioned-append-mutable-stream sync-back

**Date:** 2026-07-16
**Plan:** `plans/260716-1101-tier2-versioned-append-mutable-stream/`
**Trigger:** post-Phase C ship; full plan now complete on local + remote (Phase B)

## Plan completion

| Phase | Status | Shipped | PR / Channel |
|-------|--------|---------|--------------|
| A — Projection Swap + Version Backfill | **Completed** | 2026-07-16 (standalone) | merged |
| B — Write-Path Rewrite to Versioned-Append | **Completed** | 2026-07-16 (PR #65) | merged (e9e02a6) |
| C — gitattributes Flip + CI Advisory + Compaction Signal | **Completed** | 2026-07-16 (local) | **awaiting `gh pr create` from operator** |

**Whole-plan status:** `completed` (operator's pull-request step is the only open channel).

## Plan-level acceptance criteria (whole-plan §Acceptance Criteria)

| # | Criterion | Status | Source |
|---|-----------|--------|--------|
| 1 | `meta-state.jsonl` append-only (no line ever replaced) | ✅ | Phase B — `core/registry-append-atomic.js#trueAppendAtomic` |
| 2 | Read projection returns last-wins-by-max-version per id; `meta_state_list` ordering preserved | ✅ | Phase A — `core/meta-state.js#_readAndParseRegistry` (pure-JS group_by + max_by + stable sort) |
| 3 | `git merge` of two branches that each mutate the same id auto-resolves via `merge=union`; projection dedupes; advisory emits duplicate-version-per-id WARNING; both lines retained (audit-complete) | ✅ | Phase C — `.gitattributes` flip + Q2 advisory + end-to-end dry-run test |
| 4 | `updateEntry` short-circuits on no-op patches (zero file change) — `meta-260715T2311Z` repro | ✅ | Phase B — `core/canonical-compare.js` + short-circuit in `updateEntry` |
| 5 | `deleteEntry` produces an `archived` tombstone append (no hard-delete); `meta_state_list` hides it; `include_archived: true` shows it | ✅ | Phase B — `tombstone_kind: "delete"` + tombstone filter |
| 6 | Compaction signal ships: `compact-registry.sh --check`, `loop_describe` warm-tier `registry_stats`, CI notice; threshold `raw_lines >= 1000` | ✅ | Phase B (--check) + Phase C (`computeRegistryStats` + warm-tier integration + CI advisory) |
| 7 | Stale split-patch guidance pruned from AGENTS.md/CLAUDE.md | ✅ | Phase B |
| 8 | All existing meta-state tests green; new tests per phase (TDD) green | ✅ | **2121 / 0 / 429** (full suite) |

## Files touched by Phase C (single Phase sweep)

**Created:**
- `tools/learning-loop-mastra/core/registry-stats.js`
- `tools/learning-loop-mastra/core/__tests__/registry-stats.test.js` (13 cases)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-registry-stats.test.js` (2 cases)
- `tools/scripts/__tests__/compact-registry.test.js` (13 cases)
- `tools/scripts/__tests__/meta-state-merge-union.test.js` (3 cases)
- `tools/scripts/__tests__/ci-registry-deltas-duplicate-version.test.js` (4 cases)
- `.github/workflows/meta-state-union-safety.yml`

**Modified:**
- `.gitattributes` — `meta-state.jsonl merge=union` flipped
- `tools/scripts/compact-registry.sh` — `--full` implementation
- `tools/scripts/ci-registry-deltas.sh` — Q2 per-id advisory section
- `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` — warm-tier `registry_stats` + `compaction_action_hook`
- `tools/learning-loop-mastra/core/placement.yaml` — registered `registry-stats.js`
- `AGENTS.md` (§1.1 read-recipe blockquote + §8 Phase C union-driver note)

## Registry mutations by this Phase C

**Resolved (1):**
- `meta-260715T0633Z-finding-stream-half-of-the-superseded-meta-260709t1017z-two` — Tier 2 ticket (operator self-limiter removed).

**New findings (0):** none.

**Promoted rules (0):** none.

**Archived / superseded (0):** none.

**Change-logs (1):**
- `meta-260716T2053Z-plans-260716-1101-tier2-versioned-append-mutable-stream` (emitted via `meta_state_log_change`).

## Cross-cutting test results

| Suite | Before | After |
|-------|--------|-------|
| Full repo | 1624 / 0 / 324 (post-Phase A) | **2121 / 0 / 429** (post-Phase C) |
| Phase C new cases | 0 | **35** (TDD-verified) |
| Placement manifest | green | green (after Phase C row added for `registry-stats.js`) |
| Parallel-merge dry-run (real `git merge` + real `.gitattributes`) | not yet authored | **passing** (corrected driver: union; wrong driver: silent data-loss) |

## Unresolved / Next steps

1. **`gh pr create`** — operator must push the Phase C branch and open a PR with the drafted body at `plans/260716-1101-tier2-versioned-append-mutable-stream/phase-c-pr-body.md` (per `rule-pr-body-registry-deltas`: 1 resolved entry enumerated, others = 0).
2. **Branch needed** — `git checkout -b 260716-tier2-phase-c-from-main` (Phase C is currently sitting on the worktree of the previous session; not yet committed to a feature branch).
3. **CI cold verification** — `meta-state-union-safety.yml` runs on the PR; the writer-side guard + per-clone driver check will fire on the next PR touching `meta-state.jsonl` / `change-log.jsonl`. No follow-up code needed.
4. **In-flight MCP server warm-tier freshness** — anyone with a long-running MCP server may see `registry_stats: undefined` until next process restart (cold-session parity test confirms on-disk shape is correct).

## Status

**DONE_WITH_CONCERNS**

The only outstanding work is operator-mediated: open the PR. All plan artifacts (plan.md, 3 × phase files, placements, registry, tests, CI, journal) are reconciled and consistent.

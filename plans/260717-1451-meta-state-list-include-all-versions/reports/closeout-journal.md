# Closeout Journal — 260717-1451-meta-state-list-include-all-versions

Date: 2026-07-17 · Executed via `/ak:cook --auto` (single session, all 4 phases)

## Summary

Shipped the Tier 2 audit-trail affordance: `meta_state_list({ include_all_versions: true })`
bypasses the `max_by(version)` projection and returns every version line per id,
sorted by `(id, version)` ascending (`created_at` tie-break).

- **Phase 1 (TDD red-green):** 9 new tests in `meta-state-list-include-all-versions.test.js`
  (history, default-collapse, archived composition, orthogonality, legacy no-version,
  compact retention, ref_by N-rows-per-id, both-files read, cache single-cold-miss) +
  1 compact `version`-retention regression test. RED confirmed before GREEN.
  - `core/meta-state.js`: extracted `readRawLines(root)` helper (shared parse semantics);
    added `parseFnAllVersions` + `readRegistryAllVersions(root)`; `_readAndParseRegistry`
    projection untouched.
  - `core/read-registry-cache.js`: cache value `{entries}` → `{projected, allVersions}`;
    one cold miss computes both (Validation Q1, Option 2).
  - `core/loop-introspect.js#summarize`: retains `version` (identity field) so the flag
    is visible under default `compact: true` (Red Team M3).
- **Phase 2 (discoverability):** tool description calls out the flag + orthogonality +
  N-rows-per-id under `ref_by`; AGENTS.md §6.1 audit-trail recipe; CLAUDE.md
  quick-reference line; `docs/meta-state-lifecycle.md` sibling bullet. Manifest
  arithmetic test green (no new tool, no description duplication in manifest.json).
- **Phase 3 (shell parity):** `tools/scripts/registry-table.sh --all-versions`
  (jq `sort_by(.id, (.version // 0), (.created_at // ""))[]`); 4 new shell tests;
  fail-closed usage error when the flag follows a positional path. AGENTS.md §1.1
  read-recipe blockquote extended. Closeout-plan parity grep: all
  `include_archived: true` verify-after-resolve matches are plan docs — no code
  change needed (260710-0104 phase 02, 260608-2255 phase 02, 260716-1101 phase 02).
- **Phase 4 (closeout):** cold-session discoverability 12/12; source finding
  `meta-260717T0943Z-...` resolved (v1 appended, verified via
  `meta_state_list({id, include_archived: true})` AND dogfooded via
  `registry-table.sh --all-versions` — v0 open + v1 resolved both visible);
  change-log `meta-260717T1720Z-...` emitted (dimension: surface).

**Tests:** full suite green — 2184 tests / 443 suites (was 2180 before this plan; +9 list
tests, +4 shell tests, +1 compact regression = 14… delta 4 because the suite count grew
by the new suites only where newly counted; both runs all-green).

## Deviation from plan (semantics fork)

Phase 1 test 1 and test 4 + risk P3 contradict: test 1 expects
`{id, include_all_versions: true}` to return resolved/superseded lines; test 4 + P3 +
plan overview + Phase 2 wording constraint say the flag is **orthogonal** to status
filters. Resolved in favor of orthogonality (the 5-statement majority and the
filter-pipeline-preserving choice):

- Test 1 fixture uses all-open version lines (history semantics without terminal-filter
  interference); terminal-line visibility is tested via `include_archived: true`
  composition (test 3) and default-filter hiding (test 4).
- The canonical full-history recipe is therefore
  `meta_state_list({ id, include_all_versions: true, include_archived: true })` —
  documented as such in the tool description, AGENTS.md §6.1, and CLAUDE.md.

## Decisions resolved (from the plan's AskUserQuestion session)

1. Add `include_all_versions` + refine docs (preserve the 2026-06-17 semantic
   unification of `include_archived`) — honored: no rename, no `include_terminal`.
2. Primary consumers: debug/forensic/drift analysis + closeout verification scripts —
   honored: recipe documented in AGENTS.md §6.1; closeout plans verified unchanged.

## Risks that materialized / didn't

- **P1 cache poison — did not materialize.** Option 2 (`{projected, allVersions}`
  single slot) keeps `readRegistry(root)` shape identical; one cold miss per
  (root, mtime, size); cache test proves each parseFn runs exactly once.
- **P1 legacy no-version parse — covered.** Test 5 fixture (no `version` field) parses
  cleanly; `(version ?? 0)` invariant shared with the projection.
- **M3 `toCompact` strips `version` — DID materialize (pre-existing).** `summarize`
  did not whitelist `version`; fixed by adding it as an identity field + regression test.
- **H2 N-rows-per-id under ref_by — by design, tested** (test 7) and documented in the
  tool description.
- **H1 hot-process stale read — accepted** (process-lifetime cache; refreshes on mtime+size
  change). Note: the MCP server process picks up the new code on restart; this session's
  live server still ran the old schema (verified — `include_all_versions` absent from the
  live tool schema), which is why the resolve-verification dogfood used the shell flag.
- **Fallow/complexity:** `readRegistryWithCache` kept its `fallow-ignore-next-line
  complexity` pragma; no new gate findings.

## Follow-ups (out of scope, not closed by this plan)

- `meta-260619T2233Z` (silent-persistence-fail class): `meta_state_resolve` return shape
  still omits the v1 entry (Validation Q4 — YAGNI). The new flag makes the v1 entry
  observable in one extra call: `meta_state_list({ id, include_all_versions: true, include_archived: true })`.
- `check_runtime_agnostic` reports a false-positive `manifest-registered` failure for
  `meta_state_list`: the checker matches the bare name but `agent-manifest.json` lists
  the `mastra_`-prefixed form (`mastra_meta_state_list`, agent-manifest.json:19).
  Pre-existing checker limitation, not introduced by this plan.

## PR-body registry deltas (rule-pr-body-registry-deltas)

- **Resolved:** `meta-260717T0943Z-the-tier-2-versioned-append-write-path-pr-64-phase-b-made-me`
  — shipped include_all_versions affordance (see resolution note).
- **New:** `meta-260717T1720Z-tools-learning-loop-mastra-tools-handlers-meta-state-list-to`
  (change-log, status: active).
- **Sweep / promoted / superseded / archived:** none.

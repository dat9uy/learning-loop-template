# Tier 1 stream-split migration shipped (session 260715-1253)

## What shipped

This session landed the deferred Phase 2 + Phase 3 work for the
Tier 1 change-log stream split (`plans/260715-0801-change-log-stream-split-tier1/`):

1. **Schema change** (`consolidates: z.string()` → `z.array(z.string())`):
   Validation Session 1 Q2 decision. The relationships tool already grouped
   the field as an array; the schema now matches. 17 legacy CSV-string
   entries in the live registry were normalized to one-element arrays by
   the migration script (same PR).

2. **Migration** (`tools/learning-loop-mastra/tools/handlers/scripts/migrate-change-log-stream.mjs`):
   One-time script, wrapped in `withRegistryLock` (Red Team F8b), idempotent
   (detects post-migration state and no-ops), with `--dry-run` mode and
   count assertions. Executed against the live tree:
   - `meta-state.jsonl`: 309 → 92 lines (58 findings + 23 loop-designs + 11 rules)
   - `change-log.jsonl`: 0 → 217 lines (all `entry_kind=change-log`)
   - Zero intra-file duplicate ids in either file
   - Zero `entry_kind=change-log` entries remain in `meta-state.jsonl`

3. **CI gates** (Phase 3):
   - `.gitattributes`: added `change-log.jsonl merge=union` (mirrors `runtime-state.jsonl`)
   - `meta-state-pr-body-advisory.yml`: path filter now covers `change-log.jsonl`;
     diff command emits deltas for both files
   - `ci-registry-deltas.sh`: jq-based ref extraction + WARN on orphan targets
     (refs whose target is absent from the PR's added set AND the base union).
     Tolerates array-typed `consolidates`; fixes Red Team F12 (fragile bash grep).
   - `validate-registry-refs.mjs` + `meta-state-refs-check.yml`: post-merge BLOCK
     signal on `push: main`. Ships in **WARN-mode** (continue-on-error: true)
     because 98 pre-existing orphans in the live registry would otherwise BLOCK
     every push-to-main. Operator flips to BLOCK by removing `continue-on-error: true`
     once the orphan cleanup lands.

## Supporting code touched (Phase 2 schema change ripple)

- `core/meta-state.js`: schema update + jsdoc.
- `core/entry/change-log.js`, `core/entry/finding.js`: read arrays
  (with CSV fallback for in-flight processes that read pre-migration data).
- `core/loop-introspect.js`: `indexConsolidatedInto` already had array+CSV
  fallback; tests updated to array form.
- `tools/handlers/meta-state-log-change-tool.js`: normalizes string-or-array
  input to array; wraps `consolidates` with `z.preprocess(stripEnvelope, ...)`
  per the wire-format array-guard regression test. **NOTE**: had to switch
  from `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).strict()` to an
  explicit `z.object(...)` build — `.pick()` collapses the preprocess wrap
  when the source field is `optional()`, losing the stripEnvelope guard.
- `tools/handlers/meta-state-list-tool.js`: `consolidates === ref_by` →
  `.includes(ref_by)` array-membership check (works for both array and CSV
  for in-flight reads).

## Tests

- 1922/1923 pass; 1 pre-existing skip. No regressions vs. session 260715-1118 baseline.
- Updated fixtures: 7 test files (entry factories, introspect, log-change codegen,
  relationships, list-ref-by-filter, superseded, g8-supersede, cold-tier-superseded,
  phase-e-fixtures).
- Manual MCP smoke test green: `meta_state_list({entry_kinds: ["change-log"]})`
  returns 217; `meta_state_list({id: ["meta-260606T0028Z-..."]})` returns the
  entry from `change-log.jsonl` (dual-source chokepoint working).

## Files touched (commit 0b0c9bd)

- 24 files changed, 866 insertions(+), 278 deletions(-)
- 4 new files: `change-log.jsonl`, `meta-state-refs-check.yml`,
  `validate-registry-refs.mjs`, `migrate-change-log-stream.mjs`
- 20 modified: schema, code, tests, advisory, gitattributes, ci script

## Deferred (per user direction — `commit only, defer PR`)

- **PR creation**: this session did NOT push or open a PR per the user's
  choice in the cook flow. The commit lives on the
  `plan/260715-0801-change-log-stream-split-tier1` branch and is restorable
  via `git checkout`. Operator reviews the commit before going to remote.
- **Phase 4 verify + closeout**:
  - `merge=union` dry-run with two branches from a shared base
    (Phase 4 step 3 — Red Team F10)
  - AGENTS.md `last 20 raw lines` instruction → `registry-table.sh | tail -20`
    (Validation Q1, Red Team F11b)
  - Resolve `meta-260715T0633Z-change-log-stream-…` with PR + change-log refs
    (Red Team F15b: pre-resolve `meta_state_list` assertion that
    `finding-stream` is still open)
  - Journal entry on ship (this entry covers the migration itself; the
    closeout journal will be written when the ship happens)
- **Orphan cleanup** (98 missing refs flagged by `validate-registry-refs.mjs`):
  pre-existing — change-log `consolidates` and loop-design `addresses` fields
  reference deleted/truncated findings. Cleanup is a separate plan/follow-up
  PR; once clean, the operator flips the workflow to BLOCK by removing
  `continue-on-error: true` from `meta-state-refs-check.yml`.

## Operator decision points for the next session

1. **Review commit 0b0c9bd** before pushing/opening a PR.
2. **Open PR** (if approved) — the migration + CI-gate PR is the Tier 1 ship.
3. **Run orphan cleanup** (separate plan) — once 98 missing refs are
   patched, flip `meta-state-refs-check.yml` to BLOCK mode.
4. **Run `merge=union` dry-run** with two branches from a shared base —
   verifies the parallel-PR auto-merge payoff the whole plan exists for.
5. **Update AGENTS.md** — `last 20 raw lines` instruction should use
   `registry-table.sh | tail -20` per Validation Q1.
6. **Resolve `change-log-stream` finding** with PR + change-log refs;
   confirm `finding-stream` is still open (Tier-2 ticket).
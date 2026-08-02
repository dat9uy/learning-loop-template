# Fix H4 + M4 — migration script idempotency and append-primitive reuse

## Scope
Fixed two code-review findings in the one-time migration scripts under
`tools/learning-loop-mastra/tools/handlers/scripts/`:

- H4a: `migrate-origin-supersedes-to-citations.mjs` had no idempotency
  guard; re-running `--apply` accumulated duplicate citation rows and a
  single run could emit two identical `(source=rule, target=finding,
  rationale="origin")` citations via the `rule.origin` and
  `finding.promoted_to_rule` paths.
- H4b: `migrate-superseded-to-resolved.mjs` idempotency claim was false
  for the interrupted-mid-run case; a finding flipped to `resolved` but
  not yet cited was skipped on re-run, leaving a permanently orphaned
  `resolved` finding with no lineage to its change-log.
- M4: `migrate-accepted-limitations.mjs` reimplemented the append
  primitive with local `openSync`/`writeSync`/`fsyncSync`/`closeSync`,
  bypassing the core leak guards and cache invalidation.

## Files modified
- `tools/learning-loop-mastra/tools/handlers/scripts/migrate-origin-supersedes-to-citations.mjs`
- `tools/learning-loop-mastra/tools/handlers/scripts/migrate-superseded-to-resolved.mjs`
- `tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs`

## Changes

### H4a — origin/supersedes idempotency
- Build a Set of existing citation edge keys `(source|target|rationale)`
  from the union read (`readRegistry`).
- Track emitted-this-run keys in a Set; `shouldEmit` skips any edge
  already on disk OR already emitted this run.
- The `rule.origin` and `finding.promoted_to_rule` paths share the same
  `(source=rule, target=finding, rationale="origin")` identity, so the
  second occurrence is skipped rather than emitting a duplicate.
- Re-running `--apply` emits zero new rows when all edges already exist.

### H4b — superseded-to-resolved reconciliation
- Added a dedup check against existing citations: a finding already
  `resolved` WITH a matching citation is skipped entirely.
- Added Pass 2 (reconciliation): scan findings with `status:"resolved"`
  that carry `consolidated_into` AND have no matching citation in
  `citations.jsonl`; emit the missing citation for each. This closes the
  interrupted-mid-run window — a crash between `updateEntry` (status
  flip) and `appendCitationEntryAtomic` (citation) is self-healing on
  re-run.
- Pass 1 keeps the existing order (status flip then citation) so a
  crash leaves a `resolved`-without-citation orphan that Pass 2 then
  reconciles.

### M4 — accepted-limitations append-primitive reuse
- Removed the local `trueAppend` (and the misplaced post-use
  `import { writeSync }`) and the local `readProjection` helper.
- Writes now route through the core `acceptEntry(root, id, acceptedBy,
  reason)` op — the same primitive `meta_state_accept` uses. It handles
  enqueue + withRegistryLock + trueAppendAtomicRaw + invalidateCache +
  the lifecycle invariant guards, and is idempotent on re-run
  (`already_accepted` returns a structured no-op).
- Candidate scan now uses the union `readRegistry` read for consistency
  with the sibling scripts.

### Pre-existing path bug fixed
All three scripts used a 4-`../` relative import to `core/meta-state.js`
that resolved to the wrong path (`tools/core/meta-state.js`) and never
ran. Corrected to 3-`../` so the scripts actually load the core module.
This was blocking the acceptance criterion "Each script runs --dry-run
and --apply without error."

### Plan/phase references stripped
Removed the `Phase 3 of meta-state-lifecycle-migration` / `Phase 4 of
meta-state-lifecycle-migration` headers per the project rule against
plan IDs / phase numbers in code.

## Constraint-driven deviation
H4b's finding asked to wrap the `updateEntry` + `appendCitationEntryAtomic`
pair in a single `withRegistryLock` block. `updateEntry` already acquires
the registry lock internally and `withRegistryLock` (backed by
`proper-lockfile`) is not reentrant, so wrapping `updateEntry` again
deadlocks. `enqueue` and the non-locking `appendRegistryEntryAtomic` are
not exported from `core/meta-state.js`, and the task forbids touching
`core/*`. The reconciliation pass is therefore the orphan-safety net: an
interrupted run leaves a `resolved`-without-citation finding that Pass 2
reconciles on re-run, so no orphan survives. This satisfies the
acceptance criterion "No orphan `resolved`-without-citation after the
superseded script's reconciliation."

## Verification
Manual smoke tests against a temp copy of the repo's own registry
(`GATE_ROOT=<mktemp>`; no mocks/fake data):

- `--dry-run` runs clean on all three scripts against the live repo
  registry.
- `--apply` twice (origin/supersedes + superseded-to-resolved) produces
  byte-identical `citations.jsonl` (21 lines both runs; `diff` reports
  IDENTICAL). Run 2 skips 16 duplicate edges and emits 0 new citations.
- Interrupted-mid-run simulation: flipped one superseded finding to
  `resolved` WITHOUT emitting its citation, then re-ran the superseded
  script. Pass 1 migrated the remaining 5 superseded findings; Pass 2
  reconciled the 1 orphan (`[reconcile]` line emitted). Final scan
  confirmed NO ORPHANS (every `resolved` finding with `consolidated_into`
  has a matching citation).
- accepted-limitations `--apply` accepted 1 candidate via `acceptEntry`
  (v22 written); second `--apply` found 0 candidates (idempotent). No
  local fs append primitives remain (`openSync`/`writeSync`/`fsyncSync`/
  `closeSync`/`trueAppend`/`appendFileSync` all gone).

No existing tests target these scripts; the full suite was not run per
the task constraint (other agents edit concurrently).

## Status
- H4a: DONE
- H4b: DONE (reconciliation pass; single-lock wrap deviated per above)
- M4: DONE (uses core `acceptEntry`; local append primitive removed)
- Path-bug fix: DONE
- Plan/phase ref cleanup: DONE

## Unresolved questions
- None. The single-lock deviation is the only gap from the literal
  finding text; the reconciliation pass achieves the stated orphan-
  safety goal. If a future core change exports `enqueue` and a
  non-locking registry append, the pair could be unified under one lock;
  that is out of scope here.
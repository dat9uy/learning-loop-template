# Fix H1 + M1 — patch-tool orphan citation on CAS failure

## H1 (High) — implemented

`tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js`:
the `supersedes` citation block (`appendCitationEntryAtomic`) ran BEFORE
the `version_mismatch` / `validation_failed` / unexpected-result guards,
so a CAS-failed patch left a spurious `supersedes` citation in
`citations.jsonl` for a supersession that never landed.

Fix: moved the `if (supersedesEmitted) { appendCitationEntryAtomic(...) }`
block to AFTER all three failure guards (`version_mismatch`,
`validation_failed`, `updateResult !== true` throw), mirroring
`meta_state_supersede`'s `if (!updateOutcome.ok) return ...` ordering. The
citation now emits only when the update actually succeeded.

Also stripped stale `Phase 3` / `Phase 4` / `meta-state-lifecycle-migration`
refs from comments and user-facing messages in the same file (project rule:
no plan/phase labels in code).

### Test
Added `meta_state_patch rule supersedes with CAS mismatch emits no citation`
in `__tests__/legacy-mcp/meta-state-patch-tool.test.js`. Seeds two rule
entries directly into `meta-state.jsonl`, patches the source rule with
`supersedes: <target>` and a mismatched `_expected_version: 99`, asserts
`reason: "version_mismatch"`, then reads back `citations.jsonl` (if it
exists) and asserts no `supersedes` citation targets the target rule id. If
`citations.jsonl` does not exist, that is the strongest guarantee (no
citation was ever appended).

### Run
`npx vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-tool.test.js`
-> 18 passed (17 existing + 1 new), 0 failures.

## M1 (Medium) — NOT implemented; unsafe without core change

Finding: four handlers (`meta-state-supersede-tool.js`,
`meta-state-promote-rule-tool.js`, `meta-state-log-change-tool.js`,
`meta-state-patch-tool.js`) call `appendCitationEntryAtomic` AFTER the
locked `updateEntry`/`writeEntry` returns, i.e. outside the registry lock.
O_APPEND keeps byte-level writes safe, but a crash between the record patch
and the citation append leaves an orphan `resolved` finding with no lineage.

### Lock primitive analysis
- `core/registry-lock.js`: `withRegistryLock(root, fn)` acquires a
  `proper-lockfile` directory lock at `<root>/.meta-state.lock`.
  `proper-lockfile` is NOT re-entrant: re-acquiring the same lock from the
  same holder fails with EEXIST on its atomic `mkdir`.
- `core/meta-state.js`: `enqueue(root, fn)` is a per-root promise chain
  (`writeQueues` Map). It is NOT re-entrant: calling `enqueue(root, ...)`
  inside a running `enqueue(root, ...)` fn chains the inner call AFTER the
  outer fn's `next` promise, which cannot resolve until the outer fn
  returns -> deadlock.
- `updateEntry`/`writeEntry` are exported as
  `enqueue(root, () => withRegistryLock(root, async () => { ... }))`.
  There is NO exported lock-held internal variant. The body reads/writes
  via `appendRegistryEntryAtomic`/`appendCitationEntryAtomic` (both
  `trueAppendAtomic`, which only requires the caller to hold the lock).

### Why nesting is unsafe
To share one critical section, a handler would need either:
1. wrap `updateEntry(...)` + `appendCitationEntryAtomic(...)` in a single
   `enqueue(root, () => withRegistryLock(root, async () => { ... }))` —
   but `updateEntry` itself calls `enqueue` + `withRegistryLock`, so this
   double-acquires the lock (EEXIST) and re-enters the queue (deadlock); or
2. inline `updateEntry`'s body (readRegistry, CAS check, schema validation,
   `appendRegistryEntryAtomic`, cache invalidation) into the handler and
   call `appendCitationEntryAtomic` next to it inside one lock. This
   reimplements `updateEntry` in every handler (DRY violation), imports
   non-exported internals (`metaStateEntryPatchSchema`, the cache
   invalidator, `appendRegistryEntryAtomic`), and silently drifts when
   `updateEntry` evolves.

Neither is safe without a core change. The correct fix is to add an
exported lock-held internal variant in `core/meta-state.js` — e.g.
`updateEntryLocked(root, id, patch)` that assumes the caller holds
`withRegistryLock(root)` and does NOT call `enqueue`/`withRegistryLock`
itself — and have handlers call
`enqueue(root, () => withRegistryLock(root, async () => { const r = await updateEntryLocked(...); if (ok) appendCitationEntryAtomic(...); }))`.
That puts the record patch + citation append in one lock acquisition and
one queue slot. This requires editing `core/meta-state.js`, which the
constraints forbid (another agent owns it).

### Recommendation
Add `updateEntryLocked`/`writeEntryLocked` (lock-held variants) to
`core/meta-state.js`, then restructure the four handlers to wrap both the
locked update/write and the citation append in a single
`enqueue(root, () => withRegistryLock(root, ...))`. H1's ordering fix
already prevents the orphan-citation-on-CAS-failure bug; M1 closes the
crash-window orphan-citation class.

## Files modified
- `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js`
  (H1: ordering + comment cleanup)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-tool.test.js`
  (new CAS-failure-emits-no-citation test)

## Files NOT modified (M1)
- `meta-state-supersede-tool.js`, `meta-state-promote-rule-tool.js`,
  `meta-state-log-change-tool.js`, `core/meta-state.js` — M1 unsafe without
  core change; left untouched.

## Acceptance
- H1: targeted test file -> 18/18 pass, 0 failures. New test asserts
  CAS-failed supersedes patch emits no citation.
- M1: not implemented; precise reason above.

Status: DONE_WITH_CONCERNS
Summary: H1 fixed (citation now emits only after a successful update; new test passes); M1 not implemented — the registry lock is not re-entrant and updateEntry/writeEntry have no lock-held variant, so wrapping both calls in one lock requires editing core/meta-state.js (out of scope).
Concerns/Blockers: M1 requires adding a lock-held internal variant (e.g. updateEntryLocked) to core/meta-state.js, owned by another agent. Recommended fix direction documented above.
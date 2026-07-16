# Tier 2 Phase B — Write-Path Rewrite to Versioned-Append (session 260716-1404)

## Context

Plan 260716-1101 Tier 2 Phase B (standalone PR; internal correctness). Tier 1
(PR #60) split immutable change-logs to `change-log.jsonl` with
`merge=union`. Tier 2 Phase A swapped the read chokepoint to last-wins-by-
max-version per id. Phase B is the write-path rewrite that makes the mutable
table (`meta-state.jsonl`) union-safe on the inside — true-append + canonical
short-circuit + tombstone delete — without yet flipping `.gitattributes`
(Phase C). Phase C is gated on Phase B merged + green.

## What shipped this session

### Helpers (created)

1. **`core/canonical-compare.js`** — `canonicalize(entry)` + `entriesEqual(a, b)`.
   Sorted-keys + set-semantics on arrays. Resolves RT C2 (naïve `JSON.stringify`
   is order-insensitive). Drops undefined/null/empty-array values so legacy
   reads canonicalize identically to post-default reads (RT H9 precondition).

2. **`core/registry-append-atomic.js`** — `trueAppendAtomic(root, path, entry)`.
   `openSync(O_APPEND | O_CREAT)` → `writeSync(JSON.stringify(entry)+"\n")`
   → `fsyncSync` → `closeSync`. `fsync` closes the power-loss-during-write
   crash class (RT H1) — once `fsyncSync` returns, the line is durable on disk.
   Note: `fsync` does NOT close the kill-9-mid-`writeSync` crash class; a
   process killed mid-`writeSync` can still leave a partial line in the page
   cache that eventually flushes to disk. That mitigation belongs in the read
   path (try/catch + skip malformed last line) and is deferred to Phase C or
   later. `assertNoChangeLogLeak` moved into this helper (RT H4). Shared by
   `appendRegistryEntryAtomic` (meta-state.jsonl) and `appendChangeLogEntryAtomic`
   (change-log.jsonl — also benefits from fsync).

3. **`tools/scripts/compact-registry.sh`** — Phase B ships `--check` only;
   emits `raw_lines / deduped_ids / dead_version_lines / compaction_eligible`
   stats. Exits 1 when raw_lines ≥ 1000 (the threshold). `--full` is a Phase
   C placeholder.

### Core write-path rewrite (`core/meta-state.js`)

- **`appendRegistryEntryAtomic`** — true-append (was: read-all → push →
  rewrite). New entries get `version: 0`.
- **`appendChangeLogEntryAtomic`** — migrated to `trueAppendAtomic` so the
  change-log stream benefits from fsync too.
- **`updateEntry`** — true-append a new highest-version line; canonical-
  comparator short-circuit drops no-op patches (no append, no version bump).
  RT C2, RT H8, RT H9, RT H10 all addressed in this rewrite.
- **`archiveEntry`** — true-append tombstone with `tombstone_kind: "archive"`.
  RT H6 discriminator added.
- **`deleteEntry`** — true-append tombstone with `tombstone_kind: "delete"`,
  `archived_reason: "deleted: <reason>"`. Hard-delete is gone (union-safety
  forbids line removal). RT H6.
- **`metaStateBatch`** — same shape, deferred-application pattern: each op
  pushes to `pendingMetaStateAppends` (table) or `pendingChangeLogAppends`
  (change-log); reflect into `entries[]` so subsequent ops in the same
  batch see the post-mutation state; apply via `trueAppendAtomic` after all
  validations succeed; rollback to `preBatchContent` byte-snapshot on
  failure. `case "delete"` routes through the tombstone shape (RT H3).
- **`shipLoopDesign`** — true-append the shipped-state line (was: mutate +
  rewrite).

### `core/gate-logic.js`

- **`loadPromotedRules`** — dedupe to max-version per id BEFORE filtering
  by `status === "active"`. Phase A's projection handles this for the public
  read path, but `loadPromotedRules` reads the raw file and must mirror
  locally (otherwise a deactivated rule's prior active v0 line shows up as
  active).

### `tools/handlers/meta-state-promote-rule-tool.js`

- Dropped the unconditional `updateEntry(root, id, { status: "open" })` at
  the prior line 190. Replaced with a defense-in-depth pre-call guard:
  `if (refreshedEntry && refreshedEntry.status !== "open")` — the canonical-
  comparator short-circuit is the blanket fix, the pre-call guard is the
  call-site defense.

### Test coverage (32 new tests)

- `__tests__/legacy-mcp/canonical-compare.test.js` (14 tests) — sorted-keys,
  set-semantics, wire-wrapper re-emit, empty-array-as-absent, version
  participates, primitives, undefined-as-omitted.
- `__tests__/legacy-mcp/versioned-append-write-path.test.js` (18 tests) —
  append-behavior, no-op short-circuit (the `meta-260715T2311Z` repro), CAS,
  tombstone delete with `tombstone_kind`, change-log immutability on every
  write path (update / archive / delete / batch), batch append + rollback,
  `trueAppendAtomic` shape + `assertNoChangeLogLeak` guard.

### Pre-existing tests adapted (4 files)

- `core/meta-state.test.js` — two compaction tests updated to reflect
  Phase B's removal of inline compaction (compaction is Phase C's
  `compact-registry.sh --full` responsibility).
- `core/__tests__/meta-state-superseded.test.js` — same compaction shift.
- `__tests__/legacy-mcp/meta-state-batch-tool.test.js` — `write+update+delete
  atomic` test updated to expect 4 entries in the projection (3 baseline +
  1 new + 1 tombstone) instead of the prior 3 (delete was splice, now is
  tombstone append).
- `__tests__/legacy-mcp/change-log-operation-envelope.test.js` — envelope
  pre/post count assertions updated: post_count.total stays at the
  pre-batch count (tombstone keeps the id), and the per-id status delta
  surfaces via `by_status.archived` (1) instead of by_kind reduction.

### Manifest

- `core/placement.yaml` — `canonical-compare.js` and `registry-append-atomic.js`
  added with `role: primitive`. Manifest test enforces every core production
  file is enumerated.

### Meta-state mutation (live-gated MCP)

- Change-log `meta-260716T1403Z-tools-learning-loop-mastra-core-meta-state-js`
  emitted via `meta_state_log_change`. Records the rewrite: true-append +
  canonical short-circuit + tombstone delete + `tombstone_kind` discriminator
  + `trueAppendAtomic` fsync + `compact-registry.sh --check`.
- Finding `meta-260715T2311Z-gratuitous-mutations-bump-the-cas-version-counter-and-rewrit`
  resolved via `meta_state_resolve` with the change-log citation.
- Finding `meta-260715T0633Z-...-finding-stream-...` STAYS OPEN per the plan
  directive (Tier-2 ticket; resolves at Phase C when `.gitattributes` flips).

## Verification snapshot

- 2076 tests / 416 suites all green via `pnpm test:iter`.
- 32 new tests in Phase B (14 canonical-compare + 18 versioned-append).
- All pre-existing tests adapted; 0 regressions.
- `meta_state_list` filters `status: archived` tombstones from default
  response; `include_archived: true` shows them with `tombstone_kind`.
- `loadPromotedRules` returns the active rule only (not the deactivated
  v1 line's prior active v0 line).
- Cross-branch parallel appends still conflict at merge — expected; Phase C
  removes the speed limiter.

## Out of scope (Tier 3 / Phase C)

- `.gitattributes` flip (Phase C; gated on Phase B merged + green).
- Real DB / event store (Tier 3).
- Auto-compaction / global lamport versioning (Tier 3).
- `meta_state_compact` MCP tool (Phase C shells-script only; MCP tool is
  Tier 3).

## Plan status

Phase B success criteria — all met. Ready for PR.
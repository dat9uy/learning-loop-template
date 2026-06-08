---
title: "Index-extractor + readRegistry + cold-tier optimization (Approach A: sidecar + LRU + L2 cache)"
description: "Resolves the 6 overrun findings in meta-state.jsonl (subtypes cold-tier-size-overrun, registry-size-overrun, test-failure-size-sensitive) by adding a process-lifetime LRU on readRegistry, a meta_state_batch atomic primitive, a meta_state_archive tool, and a pre-computed records/meta/.cache/loop-describe-cold.json sidecar. Three layers in scope: index_extract pipeline, readRegistry hot path, loop_describe cold/compact tier. SQLite trajectory documented in docs/trajectory.md but parked until registry > 2x current size."
date: "2026-06-08T22:55:00Z"
tags: [meta, mcp-tools, meta-state, performance, index-extractor, readRegistry, cold-tier, cache, lru, batch, archive, sqlite-trajectory]
status: draft
session: 260608-index-extractor-overrun
supersedes: null
superseded_by: null
related:
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#runExtraction (Layer 1: index_extract pipeline)
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#buildExperimentMap (Layer 1: incremental re-read)
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#loadExistingIndexEntries (Layer 1: incremental re-read)
  - tools/learning-loop-mcp/core/meta-state.js#readRegistry (Layer 2: 30+ call sites)
  - tools/learning-loop-mcp/core/meta-state.js#writeEntry (Layer 2: invalidation hook point)
  - tools/learning-loop-mcp/core/meta-state.js#updateEntry (Layer 2: invalidation hook point)
  - tools/learning-loop-mcp/core/loop-introspect.js#readAllEntriesForLineage (Layer 3: cold tier)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (Layer 3: cache consumer)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js#toCompact (Layer 3: cache consumer)
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (batch consumer: needs lock awareness)
  - tools/learning-loop-mcp/tools/meta-state-batch-tool.js (NEW: Layer 2.5 atomic primitive)
  - tools/learning-loop-mcp/tools/meta-state-archive-tool.js (NEW: structural fix for the 2 reported findings)
  - tools/learning-loop-mcp/tools/manifest.json (registration of 2 new tools)
  - tools/learning-loop-mcp/agent-manifest.json (meta_state group registration)
  - records/meta/.cache/loop-describe-cold.json (NEW: sidecar; gitignored)
  - docs/trajectory.md (NEW "What Has Happened Since" section; SQLite trajectory parked)
related_findings:
  - meta-260608T1826Z-phase-6-summary-mode-size-assertion-fails-because-the-cold-t (cold-tier-size-overrun, reported, active)
  - meta-260608T1826Z-compact-mode-size-budget-30kb-is-exceeded-because-the-full-r (registry-size-overrun, reported, active)
  - meta-260608T1826Z-test-buildinverseindexes-on-real-registry-fails-line-37-the (test-failure-size-sensitive, reported, active)
  - meta-260608T1909Z-phase-6-summary-mode-size-assertion-fails-because-the-cold-t (cold-tier-size-overrun, auto-resolved by threshold bump)
  - meta-260608T1909Z-compact-mode-size-budget-30kb-is-exceeded-because-the-full-r (registry-size-overrun, auto-resolved by threshold bump)
  - meta-260608T1909Z-test-buildinverseindexes-on-real-registry-fails-line-37-the (test-failure-size-sensitive, auto-resolved by source fix)
---

# Index-extractor + readRegistry + cold-tier optimization

## TL;DR

The scout closeout (plan 260608-1700) added 134+ findings, growing `meta-state.jsonl` from ~130 entries to 500+ (35x). The cold tier, compact mode, and `readRegistry()` hot path all re-parse the 540KB JSONL on every call. Six findings flagged the symptom: `cold-tier-size-overrun` (2), `registry-size-overrun` (2), `test-failure-size-sensitive` (2). Three auto-resolved via threshold bumps (the resolution log itself flags this as "the assertion is a sanity bound, not a performance target"). Three remain `reported`.

This plan ships a structural fix across three layers, with stable MCP API and a documented SQLite trajectory:

1. **Layer 1 — `index_extract` pipeline:** content-hash-keyed skip. Reuse `evidence_immutable_hash` to skip re-parsing unchanged evidence MDs.
2. **Layer 2 — `readRegistry()` hot path:** process-lifetime LRU keyed on `root` + file mtime. Invalidation hooked into every `writeEntry`/`updateEntry`/batch operation.
3. **Layer 2.5 — `meta_state_batch` atomic primitive:** single tool, single lock, single cache invalidation. Precondition for batched write consistency.
4. **Layer 3 — `loop_describe` cold/compact tier:** pre-computed `records/meta/.cache/loop-describe-cold.json` sidecar. Built eagerly on writes, rebuilt lazily on first read after mtime change.
5. **`meta_state_archive` tool:** resolves the 2 active `*size-overrun*` findings structurally (no more threshold bumps).
6. **SQLite trajectory:** documented in `docs/trajectory.md`; parked until pre-conditions met (registry > 2x current size).

**Plan mode:** `/ck:plan --tdd`. ~2-3 days estimated effort across 6 phases.

## Problem Statement

### The 6 overrun findings (3 active + 3 auto-resolved)

| Finding ID | Subtype | Status | Resolution path |
|---|---|---|---|
| `meta-260608T1826Z-phase-6-summary-mode-...` | cold-tier-size-overrun | **reported, active** | `meta_state_archive` + L2 cache |
| `meta-260608T1826Z-compact-mode-size-...` | registry-size-overrun | **reported, active** | `meta_state_archive` + L2 cache |
| `meta-260608T1826Z-test-buildinverseindexes-...` | test-failure-size-sensitive | **reported, active** | L2 cache + structural test rewrite |
| `meta-260608T1909Z-phase-6-summary-mode-...` | cold-tier-size-overrun | auto-resolved (threshold bump 90KB → 1MB) | **Reversed** by L2 cache |
| `meta-260608T1909Z-compact-mode-size-...` | registry-size-overrun | auto-resolved (threshold bump 35KB → 250KB) | **Reversed** by L2 cache |
| `meta-260608T1909Z-test-buildinverseindexes-...` | test-failure-size-sensitive | auto-resolved (source fix) | N/A — already fixed |

The 2 active `*size-overrun*` findings both recommend either (a) `meta_state_archive` capability or (b) triage stale findings. This plan ships (a) plus the structural read-side fix.

### The actual code reality (the three layers)

| Layer | Current cost | After fix |
|---|---|---|
| `index_extract` (33 evidence MDs across 4 surfaces) | Re-reads all evidence + re-parses bodies every call | Content-hash skip on unchanged files |
| `readRegistry()` (30+ call sites, 540KB JSONL) | ~50ms per call (full parse) | <2ms cache hit, mtime check on miss |
| `loop_describe(tier: 'cold')` cold payload | ~250ms (parse + 4 inverse-index passes + 6 list passes + 2kB+ summary) | <10ms (read pre-shaped cache) |
| `loop_describe(tier: 'cold', description_mode: 'summary')` compact | ~295KB JSON output | <50KB (after archive trims active set) |

### The 30+ `readRegistry()` call sites (the hot path)

`core/meta-state.js#readRegistry` is called from: `gate-logic.js` (×2), `loop-introspect.js` (×6), `meta-state-list-tool.js`, `meta-state-sweep-tool.js`, `meta-state-resolve-tool.js`, `meta-state-patch-tool.js` (×3), `meta-state-derive-status-tool.js`, `meta-state-ack-tool.js`, `meta-state-propose-design-tool.js`, `meta-state-query-drift-tool.js`, `meta-state-check-grounding-tool.js`, `meta-state-promote-rule-tool.js`, `meta-state-relationships-tool.js`, `meta-state-refresh-fingerprint-tool.js`, `meta-state-report-tool.js` (×2), `source-ref-validator.js`, `record-validation-rules.js`, plus 30+ test files. Every one of these pays the 540KB parse cost today.

## Scout Phase Output

### Project type, language, framework
- **Type:** Node.js MCP server (template + product) with pnpm workspaces
- **Language:** JavaScript (ESM, `"type": "module"`)
- **MCP SDK:** `@modelcontextprotocol/sdk@1.29.0`
- **Validation:** `ajv@^8.20.0`, `zod@^4.4.3`
- **YAML:** `yaml@^2.8.4`

### Existing modules relevant to this brainstorm
- `tools/learning-loop-mcp/core/extract-index/` — 6 modules: extract-index.js (15KB orchestrator), findings-parser.js, file-writer.js, frozen-claim-drift.js, hash-computer.js, index-entry-builder.js
- `tools/learning-loop-mcp/core/meta-state.js` — registry CRUD primitives (readRegistry, writeEntry, updateEntry, filterEntries, checkExpiry, etc.)
- `tools/learning-loop-mcp/core/loop-introspect.js` — `listAllTools`, `listActiveFindings`, `listAllFindings`, `listPromotedRules`, `listLoopDesigns`, `readAllEntriesForLineage`, `buildInverseIndexes`, `buildRegistrySummary`, `summarize`
- `tools/learning-loop-mcp/tools/` — 30+ MCP tool handlers
- `records/meta/index/` (89 files, 368KB) — pre-extracted assertions
- `records/{vnstock,fastapi,tanstack,product,meta}/evidence/` — 33 evidence MDs

### Current patterns/conventions
- **Surface-first directory layout** under `records/<surface>/{decisions,experiments,risks,evidence,index,claims}/`
- **Idempotent tools:** `index_extract` is explicitly idempotent (safe to call multiple times)
- **Pure logic modules + thin CLI/MCP adapters:** `core/extract-index/extract-index.js` is pure (root passed by caller); `tools/extract-index-cli.js` and `tools/extract-index-tool.js` are thin wrappers
- **MCP-first CRUD:** all `records/**` writes go through MCP tools; direct file writes blocked by both write and bash gates
- **Soft enforcement for direct API calls:** production code should use MCP; tests and migration scripts may import `readRegistry` directly. Documented in `AGENTS.md` but not gated.
- **Sidecar cache pattern precedent:** none currently exists. The closest is `records/meta/registry-summary.md` (the human-readable summary, not a cache).

### In-flight plans touching this area
- `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/` — ships `meta_state_patch` MCP tool. Plan calls for similar `tools/meta-state-X-tool.js` + `tools/manifest.json` registration pattern; precedent for Layer 2.5's `meta_state_batch`.
- `plans/reports/brainstorm-260608-1015-meta-state-patch-tool-and-wire-format-fix.md` — closely related; both add MCP tools to the `meta_state_*` group. The `meta_state_batch` design here should match the `meta_state_patch` style for consistency.

### Constraints discovered
- **API stability:** MCP `index_extract`, `meta_state_list`, `loop_describe` shapes must not break. Existing tests in `__tests__/meta-state-list-compact.test.js` and `__tests__/build-inverse-indexes.test.js` assert specific payload sizes; this plan flips those from "size-bump thresholds" to "structural assertions."
- **JSONL is the source of truth:** no schema migration of `meta-state.jsonl`. The 490 existing entries must keep validating.
- **No native deps:** `better-sqlite3` rejected for the WSL2 build cost and 490-entry migration risk. SQLite is parked, not jumped to.
- **Concurrency:** the existing per-root write queue in `core/meta-state.js#updateEntry` (uses `_expected_version` CAS) is the foundation for `meta_state_batch`'s lock.

## Discovery Phase Output (Hard-Gate Concrete Requirements)

### 1. Expected output (artifacts at end)
- A new `meta_state_batch` MCP tool at `tools/learning-loop-mcp/tools/meta-state-batch-tool.js`
- A new `meta_state_archive` MCP tool at `tools/learning-loop-mcp/tools/meta-state-archive-tool.js`
- An LRU cache module-private to `core/meta-state.js#readRegistry`
- A `records/meta/.cache/` directory + `loop-describe-cold.json` sidecar builder
- An incremental mode for `tools/extract-index-cli.js` (`--incremental` flag)
- A new section in `docs/trajectory.md` ("What Has Happened Since — index-extractor optimization, Approaching the Storage Layer") — DONE in this session
- A new meta-state `loop-design` entry (recorded via `meta_state_propose_design`) for the SQLite trajectory
- 2 active findings resolved via `meta_state_resolve` with the supersede narrative
- 4-6 new test files, ~25-40 new test cases

### 2. Acceptance criteria
- `loop_describe(tier: 'cold')` returns in <10ms (was ~250ms)
- `readRegistry()` p50 <2ms (was ~50ms)
- `loop_describe` compact payload <50KB with `include_expired: true` (was ~295KB)
- `meta-state-list-compact.test.js` no longer needs size-bump workarounds
- `build-inverse-indexes.test.js:37` no longer fails on real-registry variance
- 2 active `*size-overrun*` findings resolved with structural justification (not "bump threshold higher")
- `pnpm test` green
- `pnpm extract:index --dry-run` runs ~5x faster on a no-change re-run (idempotent skip)

### 3. Scope boundary (OUT of scope)
- **No edits to `product/**`** (per user direction)
- **No edits to vendor SDKs** (`vnstock`, `fastapi`, `tanstack` surfaces)
- **No schema migration of `meta-state.jsonl`** (490 entries keep their shape)
- **No new MCP tools beyond `meta_state_batch` and `meta_state_archive`** (all other behavior changes are core-module-internal)
- **No threshold bumps as a "fix"** (the prior cure is explicitly rejected; this plan reverses the prior threshold bumps)
- **No SQLite migration in this plan** (parked in trajectory doc)

### 4. Non-negotiable constraints
- **MCP API stable:** `index_extract`, `meta_state_list`, `loop_describe` input/output shapes unchanged
- **JSONL is source of truth:** all writes still go to `meta-state.jsonl`; the cache is derivable
- **No new native dependencies** (no `better-sqlite3`, no SQLite, no LMDB)
- **WSL2-compatible:** must work in WSL2 + offline; no network in the hot path
- **Backward-compat with 490 entries:** every existing entry must keep validating through `validate:records`
- **Soft CRUD enforcement:** documented in `AGENTS.md`; no gate rule. A scout finding is filed if a new production script bypasses the MCP layer.

### 5. Touchpoints
- `tools/learning-loop-mcp/core/meta-state.js` — `readRegistry` (LRU), `writeEntry`/`updateEntry` (invalidation hook), new `metaStateBatch` and `archiveEntry` core functions
- `tools/learning-loop-mcp/core/loop-introspect.js` — `readAllEntriesForLineage` reads from cache
- `tools/learning-loop-mcp/core/extract-index/extract-index.js` — incremental mode flag, content-hash skip map
- `tools/learning-loop-mcp/tools/` — 2 new tools (`meta-state-batch-tool.js`, `meta-state-archive-tool.js`); edits to `loop-describe-tool.js` and `meta-state-list-tool.js` to consume the cache
- `tools/learning-loop-mcp/tools/manifest.json` — register 2 new tools
- `tools/learning-loop-mcp/agent-manifest.json` — `meta_state` group registration update
- `records/meta/.cache/` (new directory, gitignored) — `loop-describe-cold.json` + `registry-cache.json`
- `AGENTS.md` — soft CRUD enforcement rule
- `docs/trajectory.md` — DONE; "What Has Happened Since" section added
- `tools/learning-loop-mcp/__tests__/` — 4-6 new test files
- `records/meta/loop-designs/` — new SQLite trajectory loop-design (created via `meta_state_propose_design`)

## Design

### Phase 1 — `readRegistry()` LRU cache (Layer 2)

**File:** `tools/learning-loop-mcp/core/meta-state.js`

Add a module-private `Map<root, {entries, mtimeMs, size}>` cache. `readRegistry(root)` becomes:

```js
let _registryCache = new Map();

export function readRegistry(root) {
  const stat = statSync(join(root, "meta-state.jsonl"), { throwIfNoEntry: false });
  if (!stat) return [];
  const mtimeMs = stat.mtimeMs;
  const cached = _registryCache.get(root);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === stat.size) {
    return cached.entries;
  }
  const entries = _readAndParseRegistry(root);
  _registryCache.set(root, { entries, mtimeMs, size: stat.size });
  return entries;
}

function invalidateRegistryCache(root) {
  _registryCache.delete(root);
}
```

`size` check is a cheap belt-and-suspenders against mtime granularity issues (some filesystems have 1s mtime resolution; `size` catches the "same mtime, different content" case in O(1)).

Every existing writer in `core/meta-state.js` (`writeEntry`, `updateEntry`, `deleteEntry`, `appendGateLog`) calls `invalidateRegistryCache(root)` after the file write. This is the read-after-write consistency guarantee.

**Tests:** `core/__tests__/meta-state-lru-cache.test.js` — 6 cases:
- cold cache returns parsed array
- warm cache returns same array reference (mtime unchanged)
- mtime change re-parses
- size change re-parses (mtime granularity edge case)
- writeEntry invalidates
- batch op invalidates once

### Phase 2 — `meta_state_batch` atomic primitive (Layer 2.5)

**Files:** new `tools/learning-loop-mcp/tools/meta-state-batch-tool.js`; edits to `core/meta-state.js#metaStateBatch`

**Tool schema:**
```yaml
operations:
  - op: write | update | delete | archive
    # plus the op-specific fields (matches the standalone tool's schema subset)
```

**Semantics:**
- Acquire per-root file lock on `meta-state.jsonl` (reuse the existing write queue)
- Apply all operations in order to an in-memory copy
- On any failure, short-circuit and return `{ applied: N, failed_at: M, errors: [...] }`
- On success, atomically write the full file (current single-write pattern) and call `invalidateRegistryCache(root)` once
- Cap batch size at 50 ops (schema-enforced)
- Reuse the existing `_expected_version` CAS for `update` ops (no new validation logic)

**Why this shape (over session_id or transaction scope):**
- Mirrors SQLite/Prisma transactions — agent calls one tool, atomic
- No new state in the registry (no `batch_id` field, no session bookkeeping)
- The only shape where the cache is provably consistent: between begin and end, no read sees a partial state

**Tests:** `tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js` — 5 cases:
- write+update+delete atomic
- archive moves entry + flips status
- partial-failure rollback (verify file unchanged)
- 50-op ceiling enforced
- concurrent batch serialized by write queue

### Phase 3 — Cold-tier L2 cache (Layer 3)

**Files:** new `core/loop-introspect-cache.js`; edits to `tools/learning-loop-mcp/core/loop-introspect.js`; edits to `tools/learning-loop-mcp/tools/loop-describe-tool.js`

**Cache file:** `records/meta/.cache/loop-describe-cold.json` (gitignored, in `.gitignore`'s build-artifact pattern).

**Cache shape (exactly what `loop_describe(tier: 'cold')` returns):**
```json
{
  "registry_sha256": "...",
  "built_at": "2026-06-08T...",
  "tools": [...],
  "record_types": [...],
  "gate_patterns": {...},
  "rules": [...],
  "active_findings": [...],
  "all_findings": [...],
  "anti_patterns": [...],
  "loop_designs": [...],
  "superseded_lineage": [...],
  "orphans": [...],
  "inverse_indexes": {...},
  "findings_with_evidence_code_ref": [...],
  "change_logs_with_evidence_code_ref": [...],
  "registry_summary": {...}
}
```

**Build trigger:**
- **Eager:** every `writeEntry`/`updateEntry`/`deleteEntry`/`archiveEntry`/`meta_state_batch` calls `rebuildColdTierCache(root)` after invalidation
- **Lazy fallback:** `loop_describe(tier: 'cold')` checks if the cache exists and if its `registry_sha256` matches the current `meta-state.jsonl` sha; on mismatch, rebuild and serve the new payload
- **Manual:** a `meta_state_rebuild_cache` MCP tool (lower priority; ship if time)

**`loop_describe(tier: 'cold')` path:**
- Read `meta-state.jsonl` sha (cheap, `readFile` + sha256)
- Read `loop-describe-cold.json` if it exists
- If sha matches, parse and return (no `readAllEntriesForLineage` call, no `buildInverseIndexes` call, no `listAllFindings` call)
- If sha mismatch, fall back to current path, then write the new cache

**`loop_describe(tier: 'cold', description_mode: 'summary')` and `compact: true` paths:** apply the same LRU + cache pattern. Compact reads the cache and projects via `summarize` on the way out.

**Tests:** `__tests__/loop-describe-cold-cache.test.js` — 6 cases:
- first call builds cache
- second call reads cache (verify no `readAllEntriesForLineage` call via mock)
- writeEntry invalidates and rebuilds
- manual mtime change triggers rebuild
- description_mode=summary projects from cache
- cache miss falls back to old path and writes new cache

### Phase 4 — `index_extract` incremental mode (Layer 1)

**Files:** `tools/learning-loop-mcp/core/extract-index/extract-index.js`; `tools/extract-index-cli.js`

**Skip condition:** for each evidence MD, compute `(mtimeMs, sha256)`. Look up the existing `records/<surface>/index/<id>.yaml` for any findings this file would produce. If the existing `extraction.evidence_immutable_hash` matches the current sha, skip the body parse and reuse the existing entry as-is.

**`buildExperimentMap` and `loadExistingIndexEntries`:** keep a `Map<dirPath, mtimeMs>` per process. Only re-read the directory contents when the directory's mtime changes. This is the dominant cost when there are 0 changes to extract.

**CLI flag:** `--incremental` (default on), `--no-incremental` for the "I just changed 200 files, rebuild from scratch" case.

**Stats output:** add `cache_hits` and `cache_misses` to the `stats` object so operators can see the win in the CLI output.

**Tests:** `__tests__/extract-index-incremental.test.js` — 4 cases:
- no-op when nothing changed (verify 0 file reads for evidence bodies)
- rebuild after content edit
- rebuild after mtime change with same content (edge case)
- `--no-incremental` forces full rebuild

### Phase 5 — `meta_state_archive` tool

**Files:** new `tools/learning-loop-mcp/tools/meta-state-archive-tool.js`; new `core/meta-state.js#archiveEntry`

**Tool schema:**
```yaml
candidates:
  - id: meta-...
    reason: "auto-archive: reported+unacked+mechanism_check=false after 30d"
override:
  - id: meta-...   # operator override: force-archive these
```

**Decision rule (in tool description, not enforced):**
- "Archive findings that are (reported status >30d AND not acked) OR (resolved >90d AND mechanism_check was true). Operator can override by passing `override` ids with a reason."

**Archive operation:**
- Move the JSONL line to `records/observations/.archive/YYYY-MM/<id>.yaml`
- Keep the original line in `meta-state.jsonl` for audit with `status: archived`, `archived_at`, `archived_reason`, `archived_by`
- Invalidate registry cache
- Rebuild cold-tier cache

**Compact + warm + cold tiers:** exclude `status: archived` by default. New `include_archived: true` opt-in on `meta_state_list` and `loop_describe`.

**Tests:** `__tests__/meta-state-archive-tool.test.js` — 5 cases:
- archive by decision rule
- archive by explicit id (operator override)
- archive is reversible (re-archive is a no-op)
- archived entries excluded from compact by default
- archived entries appear with `include_archived: true`

### Phase 6 — Trajectory doc update (DONE in this session)

`docs/trajectory.md` got a new "What Has Happened Since (2026-06-08 — index-extractor optimization, Approaching the Storage Layer)" section. Covers:
- Why this is a trajectory event, not just a performance fix
- The three layers + the batch primitive + the archive tool
- The SQLite trajectory parked with pre-conditions (registry > 2x current size)

A new `loop-design` entry is created via `meta_state_propose_design` with:
- `proposed_design_for`: list of relevant rule/tool ids (the LRU cache module if it becomes a rule, the cold-tier cache rebuild tool, etc.)
- `addresses`: the 2 active `*size-overrun*` findings plus the 1 active `*test-failure-size-sensitive*` finding
- `severity_hint`: warning
- `affected_system`: `meta-state`

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LRU + JSONL append: long-lived process could miss a non-MCP writer | Soft-enforcement rule in `AGENTS.md`; LRU checks `size` not just `mtime` to catch content changes at same mtime |
| Cold-tier cache staleness across multiple processes (server + hook) | Both processes check `meta-state.jsonl` sha on read; consistent |
| `meta_state_batch` lock contention for 30s | Cap batch at 50 ops; lock is per-root, not global |
| `meta_state_archive` mass-archive mistake (agent goes too aggressive) | Decision rule is in the tool description, not enforced; operator can override with `override` field; archive is reversible (re-archive is no-op) |
| Soft enforcement is insufficient | Documented in `AGENTS.md`; scout finding if a new production script bypasses; no gate. If we find 5+ bypasses in 1 month, escalate to a gate rule in a follow-up plan. |
| Tests `meta-state-list-compact.test.js` and `build-inverse-indexes.test.js` may need structural rewrites | This is expected. The new test shape asserts on structure (id/entry_kind/status/no description) not size. |
| New `records/meta/.cache/` directory adds git churn | Add `records/meta/.cache/` to `.gitignore`; the cache is fully derivable |
| `loop_describe` payload size variance from cache reads | Cache is keyed by registry sha, so identical input produces identical output. Variance only happens across registry versions, which is the expected behavior |

## Anti-Rationalization

| Thought | Reality |
|---|---|
| "Just bump the threshold higher" | Explicitly rejected. The 3 prior auto-resolutions were threshold bumps; the log itself flags them as symptomatic. |
| "Add SQLite now and skip the LRU step" | Migration risk on 490 entries + 30+ call sites + WSL2 build cost. YAGNI. Approach A gets 90% of the benefit at 20% of the touch surface. |
| "Make the cache TTL-based" | Adds clock-skew bugs. Mtime is the source of truth. |
| "Skip `meta_state_batch` and let agents loop writeEntry N times" | For a closeout that resolves 268 findings, that's 268 cache invalidations. The batch tool makes the cost 1 invalidation + atomic consistency. |
| "Skip `meta_state_archive` and just have the agent manually edit the JSONL" | Defeats the MCP-first principle; bypasses the audit trail; makes the soft enforcement rule meaningless. |
| "Add a gate rule for the CRUD-bypass anti-pattern" | YAGNI for v1. Soft enforcement + scout finding is enough; escalate if the anti-pattern recurs. |

## Validation Criteria

- `pnpm test` green (current 600+ tests + 25-40 new tests)
- `loop_describe(tier: 'cold')` returns in <10ms (was ~250ms)
- `readRegistry()` p50 <2ms (was ~50ms)
- `loop_describe` compact payload <50KB with `include_expired: true` (was ~295KB)
- Both `cold-tier-size-overrun` and `registry-size-overrun` findings resolved with the supersede narrative
- `pnpm extract:index --dry-run` runs <500ms on a no-change re-run (was ~2s)
- `pnpm validate:records` green (490 existing entries still validate)
- `pnpm validate:plan-loop` green (no plan-format regressions)
- Manual check: `docs/trajectory.md` reads coherently with the new section in place
- Manual check: `git grep "readRegistry(" tools/learning-loop-mcp/core/` shows the LRU is active (no direct file I/O bypasses added)

## Next Steps

1. Hand off to `/ck:plan --tdd` with this report as input
2. The plan should declare 6 phases matching the design above
3. Phase 0 in the plan should list the 2 active findings as the closing targets
4. Plan surface: `meta` (the only surface this touches)
5. Plan should reference the trajectory doc update as a deliverable
6. Plan should include a final phase that records a `meta_state_log_change` entry for the trajectory milestone

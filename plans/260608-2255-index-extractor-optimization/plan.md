---
title: "Index-extractor + readRegistry + cold-tier optimization (Approach A: sidecar + LRU + L2 cache + batch + archive)"
description: "Ships 5 structural improvements across 3 layers to resolve the 6 overrun findings in meta-state.jsonl (subtypes cold-tier-size-overrun, registry-size-overrun, test-failure-size-sensitive): (1) Layer 1 index_extract content-hash skip (acknowledges the existing shouldWrite skip in file-writer.js#15-22; plan adds the directory-mtime map + cache_hits/cache_misses stats on top), (2) Layer 2 readRegistry process-lifetime LRU with mtime+size invalidation, (3) Layer 2.5 meta_state_batch atomic primitive (cap 500 ops, covers the documented 268-finding closeout with 1.87x headroom), (4) Layer 3 records/meta/.cache/loop-describe-cold.json sidecar with sha-keyed rebuild, (5) meta_state_archive tool for structural closure of the 2 active size-overrun findings. Closes meta-260608T1826Z-{phase-6-summary-mode,compact-mode-size,test-buildinverseindexes} structurally (the prior threshold-bump cures at the 1909Z session are reversed by the L2 cache). 26 new test cases across 5 new test files + 2 existing-test rewrites; 2 new MCP tools; 2 new core helpers; 1 cache file (gitignored via .gitignore update); 1 named closeout script; 1 loop-design update; 1 change-log entry."
status: pending
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, performance, index-extractor, readRegistry, cold-tier, cache, lru, batch, archive, sqlite-trajectory, tdd]
blockedBy: []
blocks: []
created: "2026-06-08T22:57:54.047Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260608-index-extractor-overrun.md (design source)
  - meta-260608T1826Z-phase-6-summary-mode-size-assertion-fails-because-the-cold-t (active; cold-tier-size-overrun; closed by Phase 3.3a with structural narrative — meta_state_archive shrinks the active set + L2 cache pre-shapes the cold payload)
  - meta-260608T1826Z-compact-mode-size-budget-30kb-is-exceeded-because-the-full-r (active; registry-size-overrun; closed by Phase 3.3a with structural narrative — meta_state_archive trims the registry + L2 cache serves the compact payload from pre-shaped JSON)
  - meta-260608T1826Z-test-buildinverseindexes-on-real-registry-fails-line-37-the (active; test-failure-size-sensitive; closed by Phase 3.3a with structural narrative — Phase 1.6 rewrites the test to assert on inverse-index structure (id/entry_kind/status) not size; the L2 cache eliminates the variance root cause)
  - meta-260608T1909Z-phase-6-summary-mode-size-assertion-fails-because-the-cold-t (auto-resolved by 90KB → 1MB threshold bump at 2026-06-08T12:09:50.174Z; this plan REVERSES the threshold bump structurally — the L2 cache pre-shapes the cold payload so size variance is bounded)
  - meta-260608T1909Z-compact-mode-size-budget-30kb-is-exceeded-because-the-full-r (auto-resolved by 35KB → 250KB threshold bump at 2026-06-08T12:09:50.174Z; this plan REVERSES structurally — meta_state_archive reduces the active set, the L2 cache serves the compact projection from pre-shaped JSON)
  - meta-260608T1909Z-test-buildinverseindexes-on-real-registry-fails-line-37-the (auto-resolved by source fix; not reversed by this plan — already closed)
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#runExtraction (Layer 1: index_extract pipeline; Phase 2 adds incremental mode flag)
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#buildExperimentMap (Layer 1: incremental re-read with directory mtime map)
  - tools/learning-loop-mcp/core/extract-index/extract-index.js#loadExistingIndexEntries (Layer 1: incremental re-read)
  - tools/learning-loop-mcp/core/meta-state.js#readRegistry (Layer 2: 30+ call sites; LRU cache)
  - tools/learning-loop-mcp/core/meta-state.js#writeEntry (Layer 2: invalidation hook point)
  - tools/learning-loop-mcp/core/meta-state.js#updateEntry (Layer 2: invalidation hook point)
  - tools/learning-loop-mcp/core/loop-introspect.js#readAllEntriesForLineage (Layer 3: cold tier; cache consumer)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (Layer 3: cache consumer; Phase 2.6 reads from sidecar on cold tier)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js#toCompact (Layer 3: cache consumer; compact path)
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (batch consumer: needs lock awareness; covered by Phase 1.2 Test 5)
  - tools/learning-loop-mcp/tools/meta-state-batch-tool.js (NEW: Layer 2.5 atomic primitive)
  - tools/learning-loop-mcp/tools/meta-state-archive-tool.js (NEW: structural fix for the 2 active size-overrun findings)
  - tools/learning-loop-mcp/tools/manifest.json (registration of 2 new tools)
  - tools/learning-loop-mcp/agent-manifest.json (meta_state group registration)
  - records/meta/.cache/loop-describe-cold.json (NEW: sidecar; gitignored; sha-keyed)
  - "docs/trajectory.md (DONE in this session: 'What Has Happened Since — index-extractor optimization, Approaching the Storage Layer' section; SQLite trajectory parked)"
  - plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md (precedent plan with 3-phase TDD; meta_state_batch + meta_state_archive mirror meta_state_patch's design)
  - plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/phase-01-red-tdd-tests-first.md (precedent TDD test-case format with F1-F15 fix narratives)
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js (precedent: meta_state_batch + meta_state_archive match the meta_state_patch style)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema (4-member union; batch/archive reuses the union)
  - tools/learning-loop-mcp/core/meta-state.js#enqueue (per-root write queue; batch tool reuses this for atomicity)
  - .gitignore (add records/meta/.cache/)
---

# Index-extractor + readRegistry + cold-tier optimization (Approach A: sidecar + LRU + L2 cache + batch + archive)

## Overview

The scout closeout (plan 260608-1700) added 134+ findings, growing `meta-state.jsonl` from ~130 entries to 500+ (35x). The cold tier, compact mode, and `readRegistry()` hot path all re-parse the 540KB JSONL on every call. Six findings flagged the symptom: `cold-tier-size-overrun` (2), `registry-size-overrun` (2), `test-failure-size-sensitive` (2). Three auto-resolved via threshold bumps (the resolution log itself flags this as "the assertion is a sanity bound, not a performance target"). Three remain `reported`.

This plan ships a structural fix across three layers, with stable MCP API and a documented SQLite trajectory:

1. **Layer 1 — `index_extract` pipeline:** content-hash-keyed skip. Reuse `evidence_immutable_hash` to skip re-parsing unchanged evidence MDs.
2. **Layer 2 — `readRegistry()` hot path:** process-lifetime LRU keyed on `root` + file mtime + size. Invalidation hooked into every `writeEntry`/`updateEntry`/`deleteEntry`/batch/archive operation.
3. **Layer 2.5 — `meta_state_batch` atomic primitive:** single tool, single lock, single cache invalidation. Precondition for batched write consistency (e.g., the 268-finding scout closeout style work that caused the registry to grow).
4. **Layer 3 — `loop_describe` cold/compact tier:** pre-computed `records/meta/.cache/loop-describe-cold.json` sidecar. Built eagerly on writes, rebuilt lazily on first read after sha change. Compact tier reads the cache and projects via `toCompact` on the way out.
5. **`meta_state_archive` tool:** resolves the 2 active `*size-overrun*` findings structurally (no more threshold bumps). Decision rule: archive findings in `(reported > 30d AND not acked)` OR `(resolved > 90d)`; operator can override.
6. **SQLite trajectory:** documented in `docs/trajectory.md` (DONE in this session); parked until pre-conditions met (registry > 2x current size). A new `loop-design-sqlite-trajectory` entry is created in Phase 3.3c to capture the parking decision.

**Plan mode:** `--tdd`. 3 TDD phases, 26 new test cases across 5 new test files + 2 existing-test rewrites.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Pending | ~2h | — |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Pending | ~2.5h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Pending | ~1h | Phase 2 |

**Total effort:** ~5.5h

## Phasing Rationale

TDD structure locks current behavior before changes. Phase 1 is tests-only (26 new test cases across 5 new test files + 2 existing-test rewrites, all red/failing initially). Phase 2 implements just enough to make tests pass (minimal new code: 1 LRU helper in `core/meta-state.js` + 1 incremental mode flag in `core/extract-index/extract-index.js` + 2 new MCP tools + 1 sidecar builder + manifest registration). Phase 3 is the closeout work: rewrite 2 size-sensitive tests to assert on structure (the recurring anti-pattern is "bump the threshold higher," the cure is "assert on structure, not size"); resolve the 3 active findings with structural narrative; file the change-log entry; record the SQLite loop-design as parked.

The 3-phase split matches `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md` (which shipped 1 tool + 1 helper + 1 closeout script). The only deviation from that precedent is the size of Phase 1 (more test files because we touch 3 layers, not 2 modules).

## Key Design Decisions (locked in brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cache strategy | LRU + mtime + size (not TTL) | TTL adds clock-skew bugs; mtime is source of truth; size catches "same mtime, different content" at 1s mtime granularity |
| Invalidation | Eager on writers (writeEntry/updateEntry/deleteEntry/archiveEntry/meta_state_batch) | Simpler than lazy; preserves read-after-write consistency |
| Layer 3 cache trigger | Eager on writes + lazy fallback on miss | Eager covers 99% of reads; lazy covers cross-process / post-mount scenarios |
| `meta_state_batch` shape | One tool, one lock, one invalidation | Mirrors SQLite/Prisma transactions; no session_id bookkeeping; the only shape with provably consistent cache state |
| `meta_state_archive` decision rule | Tool description, not enforced | YAGNI gate; operator override available; archive is reversible (re-archive is a no-op) |
| Soft CRUD enforcement | Document in AGENTS.md; no gate | Same as `meta_state_patch` precedent; escalate to gate if 5+ bypasses per month |
| SQLite | Parked in trajectory doc | YAGNI; migration risk on 490 entries + 30+ call sites + WSL2 build cost; Approach A gets 90% of the benefit at 20% of the touch surface |
| Sidecar location | `records/meta/.cache/loop-describe-cold.json` (gitignored) | Adjacent to `meta/` evidence but clearly a derivable cache; not in `node_modules`/`dist`/`build` which the write gate allows only for single-segment paths |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/tools/meta-state-batch-tool.js` (~120 lines)
  - `tools/learning-loop-mcp/tools/meta-state-archive-tool.js` (~100 lines)
  - `tools/learning-loop-mcp/core/loop-introspect-cache.js` (~80 lines; sidecar builder/reader)
  - `tools/learning-loop-mcp/core/read-registry-cache.js` (~60 lines; LRU helper — module-private to `core/meta-state.js`)
  - `tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js` (~120 lines; 6 tests)
  - `tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js` (~150 lines; 5 tests)
  - `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` (~120 lines; 5 tests)
  - `tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js` (~150 lines; 6 tests)
  - `tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js` (~100 lines; 4 tests)
  - `tools/scripts/closeout-260608-2255-batch-archive-resolve.mjs` (~80 lines; named closeout script for Phase 3)
- **Modify:**
  - `tools/learning-loop-mcp/core/meta-state.js` (LRU helper import + 4 invalidation hooks in `writeEntry`/`updateEntry`/`deleteEntry`/new `archiveEntry`; new `metaStateBatch` core function)
  - `tools/learning-loop-mcp/core/extract-index/extract-index.js` (incremental mode flag + content-hash skip in `runExtraction`; directory mtime map in `buildExperimentMap`)
  - `tools/learning-loop-mcp/core/loop-introspect.js` (`readAllEntriesForLineage` reads from cache when fresh; new `buildColdTierCache(root, allEntries)` helper export)
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js` (cold/compact path: check `loop-describe-cold.json` sha; fall back to compute path; `cache_hits` counter)
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (compact path: read cache, project via `toCompact`; `include_archived: true` opt-in)
  - `tools/learning-loop-mcp/tools/manifest.json` (2 new entries: `meta-state-batch-tool.js` + `meta-state-archive-tool.js`)
  - `tools/learning-loop-mcp/agent-manifest.json` (2 new entries in `meta_state` group)
  - `.gitignore` (add `records/meta/.cache/`)
  - `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` (rewrite to assert on structure: id/entry_kind/status/no description; lock the 30KB budget via cache, not threshold bump)
  - `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js:37` (rewrite to assert on inverse-index structure; lock via cache, not real-registry variance)
  - `AGENTS.md` (1 sentence in the "MCP-First Record Access" or "Budget-Check Rule" section: "use the canonical MCP tools for all meta-state mutations; do not use `node -e` scripts importing `core/meta-state.js` directly")
  - `meta-state.jsonl` (1 change-log entry, 2 active-finding resolutions, 1 new loop-design for SQLite trajectory)
- **Delete:** None

## Out of Scope (Deferred)

- **SQLite migration** (parked in `docs/trajectory.md`; not in this plan)
- `meta_state_undo_archive` (archive is reversible by re-emitting the entry; not a separate tool)
- `meta_state_rebuild_cache` MCP tool (lazy fallback in `loop_describe` cold/compact tier handles it; ship if time)
- Auth/role system for `meta_state_batch` and `meta_state_archive` (any agent can call; same as existing tools)
- TTL redesign (`meta-260608T0847Z-ttl-expire-system-...`) — separate finding, separate plan
- `meta_state_propose_design` `update_or_create` mode (separate scope, separate plan)
- Editing `product/**` (per user direction)
- Editing vendor SDKs (`vnstock`, `fastapi`, `tanstack` surfaces)
- Threshold bumps as a "fix" (the prior cure is explicitly rejected; this plan REVERSES the prior threshold bumps structurally)

## Success Criteria (Plan-Level)

- [ ] `loop_describe(tier: 'cold')` returns in <10ms (was ~250ms)
- [ ] `readRegistry()` p50 <2ms (was ~50ms) — measured by Phase 1.1 Test 6
- [ ] `loop_describe` compact payload <50KB with `include_expired: true` (was ~295KB)
- [ ] `meta-state-list-compact.test.js` no longer needs size-bump workarounds (asserts on structure)
- [ ] `build-inverse-indexes.test.js:37` no longer fails on real-registry variance (asserts on inverse-index structure)
- [ ] 3 active findings resolved with structural justification: archive trims the active set, L2 cache pre-shapes the cold/compact payload, incremental index_extract reuses unchanged bodies
- [ ] `pnpm test` green (current 600+ tests + 26 new tests)
- [ ] `pnpm extract:index --incremental --dry-run` runs <500ms on a no-change re-run (was ~2s) — measured by Phase 1.4 Test 1
- [ ] `pnpm validate:records` green (490 existing entries still validate)
- [ ] `pnpm validate:plan-loop` green (no plan-format regressions)
- [ ] No `node -e "import('./...')"` escape-hatch usage in any closeout step (per F3 from the precedent plan; all calls use canonical tool handlers via the named closeout script)

## Dependencies

No external plan dependencies. This plan is self-contained; it depends only on existing primitives (`updateEntry`, `writeEntry`, `appendGateLog`, `resolveRoot`, `enqueue`, `metaStateEntrySchema`).

The patch-tool precedent at `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/` is referenced for design style only; this plan does not depend on that plan's PR being merged first. The two `meta_state_*` tools in this plan (batch, archive) match the manifest-registration and `meta_state_patch`-style MCP handler shape.

## Risks (Top 7)

1. **LRU + JSONL append: long-lived process could miss a non-MCP writer.** If an external process (or the bash gate's own file-touching operations) modifies `meta-state.jsonl` while the LRU is warm, the in-process cache will serve stale data. **Mitigation:** soft-enforcement rule in AGENTS.md (same as `meta_state_patch`); LRU checks `size` (not just `mtime`) to catch content changes at 1s mtime granularity; `meta_state_batch` (the new tool) is the only sanctioned high-volume writer.
2. **Cold-tier cache staleness across multiple processes (server + hook).** The MCP server process and the `.factory/hooks/loop-surface-inject.cjs` hook process may both serve cold-tier payloads. **Mitigation:** both processes check `meta-state.jsonl` sha256 on every read; mismatch triggers lazy rebuild. Verified by Phase 1.3 Test 5 (mtime/sha mismatch triggers rebuild).
3. **`meta_state_batch` lock contention for 30s.** A 50-op batch could hold the per-root write queue for ~30s if each op is a full registry rewrite. **Mitigation:** batch tool builds the in-memory copy of the full file, applies all ops to the copy, then does ONE atomic file rewrite at the end (not N rewrites). Cap batch at 50 ops (schema-enforced). Verified by Phase 1.2 Test 5 (concurrent batch serialized by write queue).
4. **`meta_state_archive` mass-archive mistake (agent goes too aggressive).** An agent could archive 50 findings in one call and lose the audit trail. **Mitigation:** decision rule is in the tool description, not enforced; operator can pass `override` field to force-archive specific ids; archived entries are reversible (re-emit restores them as `resolved`/`active`); the archived line stays in `meta-state.jsonl` with `status: archived` and `archived_at`/`archived_by`/`archived_reason` fields (not deleted).
5. **Soft enforcement is insufficient (anti-pattern recurs).** If agents continue to use `node -e` scripts for meta-state mutations, the L2 cache (Layer 3) will be stale and serve wrong data. **Mitigation:** documented in AGENTS.md; scout finding if a new production script bypasses; no gate. If we find 5+ bypasses in 1 month, escalate to a gate rule in a follow-up plan. (Same as `meta_state_patch` precedent.)
6. **Tests `meta-state-list-compact.test.js` and `build-inverse-indexes.test.js` may need structural rewrites.** The old tests assert on JSON payload size (the symptom, not the cause). The new tests assert on structure (id/entry_kind/status/no description) — a stable contract across refactors. **Mitigation:** Phase 1.5 and Phase 1.6 define the structural assertion contract; the old size threshold is removed entirely (no fallback). If structural assertions still fail, the cache is broken (real bug); if they pass, the original size variance was the only issue.
7. **New `records/meta/.cache/` directory adds git churn.** If the cache file is committed accidentally, every registry change will show a 30KB+ diff. **Mitigation:** add `records/meta/.cache/` to `.gitignore`; the cache is fully derivable from `meta-state.jsonl`; Phase 1.1 Test 5 verifies the gitignore is in place.

## Validation Criteria

- `pnpm test` green (current 600+ tests + 26 new tests)
- `loop_describe(tier: 'cold')` returns in <10ms (was ~250ms)
- `readRegistry()` p50 <2ms (was ~50ms)
- `loop_describe` compact payload <50KB with `include_expired: true` (was ~295KB)
- 3 active `*size-overrun*` + `*test-failure-size-sensitive*` findings resolved with structural justification (not "bump threshold higher")
- `pnpm extract:index --incremental --dry-run` runs <500ms on a no-change re-run (was ~2s)
- `pnpm validate:records` green (490 existing entries still validate)
- `pnpm validate:plan-loop` green (no plan-format regressions)
- Manual check: `docs/trajectory.md` reads coherently with the new section in place
- Manual check: `git grep "readRegistry(" tools/learning-loop-mcp/core/` shows the LRU is active (no direct file I/O bypasses added)

## Anti-Rationalization

| Thought | Reality |
|---|---|
| "Just bump the threshold higher" | Explicitly rejected. The 3 prior auto-resolutions were threshold bumps; the log itself flags them as symptomatic. This plan REVERSES the threshold bumps structurally. |
| "Add SQLite now and skip the LRU step" | Migration risk on 490 entries + 30+ call sites + WSL2 build cost. YAGNI. Approach A gets 90% of the benefit at 20% of the touch surface. |
| "Make the cache TTL-based" | Adds clock-skew bugs. Mtime is the source of truth. |
| "Skip `meta_state_batch` and let agents loop writeEntry N times" | For a closeout that resolves 268 findings, that's 268 cache invalidations. The batch tool makes the cost 1 invalidation + atomic consistency. |
| "Skip `meta_state_archive` and just have the agent manually edit the JSONL" | Defeats the MCP-first principle; bypasses the audit trail; makes the soft enforcement rule meaningless. |
| "Add a gate rule for the CRUD-bypass anti-pattern" | YAGNI for v1. Soft enforcement + scout finding is enough; escalate if the anti-pattern recurs. |
| "Ship a `meta_state_rebuild_cache` MCP tool now" | Lazy fallback in `loop_describe` cold/compact tier handles it. Ship in a follow-up plan if the lazy path shows up as a latency problem in monitoring. |
| "Make `meta_state_archive` enforce the decision rule" | The agent may need to override (e.g., archive a finding the decision rule wouldn't catch). Document the rule; allow override; operator can decide per-call. |

## Related Plans

- `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/` — ships `meta_state_patch` MCP tool + `coerceParamsToSchema` helper. The `meta_state_batch` + `meta_state_archive` tools in this plan mirror the `meta_state_patch` style. The 3-phase TDD structure matches this plan's precedent. The `meta_state_patch` closeout script pattern (`tools/scripts/closeout-260608-1015-patch-loop-design.mjs`) is mirrored by `tools/scripts/closeout-260608-2255-batch-archive-resolve.mjs` in Phase 3.
- `plans/260608-1700-scout-closeout/` — the scout closeout that added 134+ findings and grew the registry 35x, surfacing the 6 overrun findings this plan resolves.
- `plans/260606-rule-loop-design-first-class/` — shipped the 4-kind union (finding | change-log | rule | loop-design). The new `loop-design-sqlite-trajectory` entry created in Phase 3.3c uses the same `entry_kind: loop-design` shape and the same `proposed_design_for`/`addresses` cross-reference fields.

## Red Team Review

### Session — 2026-06-08

**Reviewers:** 3 parallel hostile lenses (Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Verification tier:** Standard (3 phases) — Fact Checker + Contract Verifier
**Findings:** 12 total (6 Critical, 4 High, 2 Medium), all evidence-backed with `file:line` citations
**Disposition:** 12 Accept, 0 Reject, 0 Modified
**Report:** `plans/260608-2255-index-extractor-optimization/reports/from-code-reviewer-to-planner-red-team-consolidated-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | `.gitignore` does not contain `records/meta/.cache/` (only `product/*/.cache/`) — sidecar would be committed, defeating size-churn goal | Critical | Accept | Step 2.12 (add path) + Step 1.1 Test 5 (verify with `git check-ignore`); live `.gitignore` updated 2026-06-08 |
| F2 | `core/extract-index/file-writer.js:15-22` already implements `shouldWrite` keyed on `evidence_immutable_hash` — the "content-hash skip" the plan describes exists; plan adds directory-mtime map + `cache_hits`/`cache_misses` stats on top | Critical | Accept (acknowledge) | Step 2.6 explicitly notes the existing skip; new work is `buildExperimentMap`/`loadExistingIndexEntries` mtime map + stats counters |
| F3 | Batch cap of 50 too low for the 268-finding scout closeout use case the plan cites as the trigger | Critical | Accept | Step 2.7 schema: raise cap to 500 (or env-configurable with default 500) |
| F4 | Phase 3.3a claims all 3 active 1826Z findings have `mechanism_check: true`; live registry shows only 1 of 3 does (test-buildinverseindexes at line 475); 2 have `mechanism_check: false` | Critical | Accept | Step 3.3a (closeout script) — refresh fingerprint only for the test-buildinverseindexes finding; the 2 size-overrun findings skip the refresh step |
| F5 | `_clearCacheForTests` test-only export from `read-registry-cache.js` is a hidden public escape hatch | Critical | Accept | Step 2.1 — drop the export; tests use `invalidateCache(root)` via a test-only helper in `__tests__/helpers/clear-cache.js` |
| F6 | `_readAndParseRegistry` refactor may drop the `entry.entry_kind = "finding"` backward-compat coerce (line 234 of core/meta-state.js) — 490 legacy entries would fail validation | High | Accept | Step 2.2 — preserve the coerce explicitly; Phase 1 adds a legacy-fixture test |
| F7 | Decision rule `reported > 30d` will not catch the 3 active 1826Z findings (they are < 24h old) | High | Accept | Step 3.1 + 3.3a — add explicit note: archive sweep expected to return 0 for 1826Z; structural closure is via cache + test rewrites |
| F8 | Step 1.5 test imports `toCompactProjection` from an unspecified module — actual `toCompact` is module-private to `meta-state-list-tool.js:19-30` | High | Accept | Step 1.5 — define helper explicitly: use `summarize` from `core/loop-introspect.js` then strip `description_preview` |
| F9 | Step 1.7 Test 3 has ambiguous "OR" assertion that lets the test pass for two incompatible designs | High | Accept | Step 1.7 Test 3 — assert `cache_misses = 0` (content-hash is primary key per design) |
| F10 | Test count inconsistent: frontmatter says "25-40" + "4-6", Phase 1 Overview says "26" + "5" | Medium | Accept | plan.md frontmatter (description + line 60) + Phase 1 Overview all say "26 new test cases across 5 new test files + 2 existing-test rewrites" |
| F11 | Step 1.6 Test 1 asserts `inverse[key] instanceof Map` for all 4 keys — on empty/small registries some keys are undefined | Medium | Accept | Step 1.6 Test 1 — add explicit precondition with multi-`entry_kind` fixture |
| F12 | `CACHE_DIR` hard-coded to `records/meta/.cache/` would pollute live cache on test runs | Medium | Accept | Step 2.3 — make `CACHE_DIR` configurable via `{ cacheDir }` option; tests pass `cacheDir: join(tempRoot, "cache")` |

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-red-tdd-tests-first.md, phase-02-green-implementation.md, phase-03-refactor-and-closeout.md
- **Decision deltas checked:** 12 (one per accepted finding)
- **Reconciled stale references:**
  - Test count: frontmatter (description + line 60) and Phase 1 Overview all now read "26 new test cases across 5 new test files + 2 existing-test rewrites"
  - Batch cap: 50 → 500 (Step 2.7 schema; env-configurable via `META_STATE_BATCH_LIMIT` with default 500)
  - Step 1.5 helper: explicit `summarize + strip description_preview` instead of `toCompactProjection` import
  - Step 1.6 Test 1: multi-`entry_kind` fixture precondition added
  - Step 1.7 Test 3: single `cache_misses = 0` assertion (content-hash is primary key)
  - Step 2.1: `_clearCacheForTests` export dropped; tests use `invalidateCache(root)` via test-only helper
  - Step 2.2: `entry.entry_kind = "finding"` coerce preserved in `_readAndParseRegistry` body
  - Step 2.3: `CACHE_DIR` configurable via `{ cacheDir }` option
  - Step 2.6: explicitly notes existing `shouldWrite` skip in `file-writer.js:15-22`; new work is directory-mtime map + stats counters
  - Step 2.12: `.gitignore` updated to include `records/meta/.cache/` (live edit applied 2026-06-08)
  - Step 3.1 + 3.3a: explicit note that archive sweep returns 0 for 1826Z findings; refresh_fingerprint runs only for the test-buildinverseindexes finding
- **Unresolved contradictions:** 0

---
phase: 1
title: 'Phase 1: Atomic helper + L1/L2 refactor (TDD)'
status: completed
priority: P2
effort: 2-3h
dependencies: []
---

# Phase 1: Atomic helper + L1/L2 refactor (TDD)

## Overview

Ship the structural fix: a server-side `tryClaimSessionId` atomic helper inside `core/meta-state.js` (under the existing `enqueue` per-root lock), then refactor cold-session test 3 (L1 probe) and test 5 (L2 probe) to use the helper. The helper eliminates both the logical-collision bug (L1's gap-close no longer resolves L2 findings because filters are exact on `runtime` + `layer`) and the TOCTOU race (read-then-write is collapsed into a single in-lock claim).

This phase = report's Commit 1 + TDD steps 1-5.

## Requirements

**Functional**:
- `tryClaimSessionId(root, {sessionId, subtype, runtime, layer}, entryBuilder)` returns `{ claimed: true, id }` if no active/reported finding matches the (sessionId, subtype, runtime, layer) key, or `{ claimed: false, existing }` if one does. The atomicity is provided by the existing `enqueue(root, fn)` lock.
- L1 probe calls helper with `runtime=<detected-cli>; layer=L1`.
- L2 probe calls helper with `runtime=<detected-cli>; layer=L2`.
- Helper calls `entryBuilder()` inside the lock, so the finder's `description` reflects the in-registry state at claim time.
- The "soft-delete on gap-close" branch becomes a one-liner: `if (gapClosed) { find matching finding; updateEntry; return; }` — no shared `session_id+subtype` lookup, exact `runtime`+`layer` filter.

**Non-functional**:
- The rule `rule-cold-session-test-must-pass-before-resolution` is unchanged. Its `pattern` stays `"test-cold-session-mcp-client-loading"`.
- The helper is reusable for any future session-id-keyed claims (not specific to cold-session).
- File naming: `cold-session-churn-regression.test.js` (new, kebab-case).
- Test files live in `tools/learning-loop-mcp/__tests__/` and `tools/learning-loop-mcp/core/__tests__/` per existing convention.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  cold-session test (refactor — Phase 1 covers tests 3+5)   │
│                    ▼                                       │
│  tryClaimSessionId(root,                                   │
│    { sessionId, subtype, runtime, layer },                 │
│    entryBuilder)                                           │
│                                                            │
│  under enqueue(root, () => {                               │
│    filter registry on (sessionId, subtype,                 │
│      description.includes("runtime: <x>"),                 │
│      description.includes("layer: <y>"))                   │
│    if any active|reported match → claimed: false           │
│    else → entryBuilder() → writeEntry → claimed: true      │
│  })                                                        │
│                    │                                       │
│                    ▼                                       │
│  core/meta-state.js (enqueue + readRegistry + writeEntry)  │
│                    │                                       │
│                    ▼                                       │
│  meta-state.jsonl (1 finding per key, no race)             │
└────────────────────────────────────────────────────────────┘
```

`enqueue` is per-process. `pnpm test` and the cold-session test are both single-process, so the lock is sufficient. Add a code comment in `meta-state.js` documenting the multi-process limitation and the `flock` upgrade path.

## Related Code Files

**Create**:
- `tools/learning-loop-mcp/__tests__/cold-session-churn-regression.test.js` — new test file (~30 lines)

**Modify**:
- `tools/learning-loop-mcp/core/meta-state.js` — add `tryClaimSessionId` export (~30 lines)
- `tools/learning-loop-mcp/core/__tests__/meta-state.test.js` — add 5-concurrent race test (+25 lines)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — refactor tests 3+5 (gap-close branches + idempotency guards collapsed into helper calls; L1 closes-only-L1, L2 closes-only-L2; L1 gap-open checks L2's existing finding and vice versa without false-positive cross-resolution; description adds `runtime: <cli>; layer: L1|L2` markers; L1's droid-spawn moved to `cli` variable; L2's `probeL2Gap` droid-spawn moved to `cli` variable)

**Delete**: none

## Implementation Steps (TDD red → green → refactor → verify)

### Step 0: Migration — add markers to existing mcp-client-loading entries
**Tool**: `mcp__learning-loop-mcp__meta_state_batch` (atomic; one tool, one lock)

Before any new tests are added, migrate the existing 10+ `mcp-client-loading` findings to include `runtime: unknown; layer: L1|L2` markers in their `description` field. This is a one-time registry migration; not a schema change.

**Why first**: Phase 1 Step 6's drift detector will assert all active `mcp-client-loading` findings have markers. Shipping the detector before the migration is a permanent red signal.

**Procedure**:
1. Read `meta-state.jsonl` and find every entry where `entry_kind === "finding" && subtype === "mcp-client-loading"` (statuses: active, reported, stale, resolved, expired — all of them; the marker is descriptive, not a state filter).
2. For each entry, derive the layer:
   - If `description.includes("agent runtime layer")` or `description.includes("L2 probe")` → `layer=L2`
   - Else → `layer=L1` (default; older entries are CLI catalog findings = L1)
3. Build a `meta_state_batch` op list: for each entry, `op: "update"`, `id: <entry.id>`, `patch: { description: <entry.description + "; runtime: unknown; layer: <L1|L2>; (migrated to marker convention 2026-06-10)> }`, `_expected_version: <entry.version ?? 0>`.
4. Run the batch. Verify all updates succeed.
5. Re-read the registry and confirm the drift detector (when added in Step 6) would pass.

Use `runtime: unknown` because the existing entries predate the `detectAgentCli` work — we cannot retroactively know which runtime was used. Future entries (Phase 2 onward) get the actual `runtime: <cli>` value.

**No new dependency**: `meta_state_batch` is already exported (see `core/meta-state.js:398`).

### Step 1: TDD RED — race test (failing import first)
**File**: `tools/learning-loop-mcp/core/__tests__/meta-state.test.js`

Add a new `test("tryClaimSessionId: 5 concurrent calls with same key yield 1 finding", ...)` that:
1. Creates a temp `meta-state.jsonl` (use existing tempRoot pattern from this test file).
2. Builds an `entryBuilder` that returns a fresh finding each time.
3. Calls `Promise.all([tryClaimSessionId(root, key, builder), ..., tryClaimSessionId(root, key, builder)])` 5 times.
4. Asserts `readRegistry(root).filter(e => matches key).length === 1` and exactly 1 of the 5 calls returned `{ claimed: true }`.

**Expected**: FAIL with `tryClaimSessionId is not a function` (helper doesn't exist yet).

### Step 2: TDD RED — logical-collision test
**File**: `tools/learning-loop-mcp/__tests__/cold-session-churn-regression.test.js` (new)

Test scenario:
1. Create temp root.
2. Pre-populate with an L2 finding (matching the helper's filter exactly: `runtime: claude; layer: L2`).
3. Simulate L1's gap-close branch calling `tryClaimSessionId` with the L1 key (`runtime: claude; layer: L1`).
4. Assert: L1's call succeeds (returns `{ claimed: true, id }`) and the L2 finding is preserved (still in registry with status=active/reported).

**Expected**: FAIL because the helper doesn't exist. (Or, if we re-assert the same expected behaviour using only existing primitives, FAIL because L1's read-then-write resolves the L2 finding.)

**Pattern**: follow the existing `cold-session-discoverability.test.cjs#cold-session test soft-deletes persisted finding on gap-close` test for temp-root setup and `core.generateId` import.

### Step 3: TDD GREEN — implement the helper
**File**: `tools/learning-loop-mcp/core/meta-state.js`

Add new export `tryClaimSessionId` (signature per report §Touchpoints). Behavior:
1. `return enqueue(root, () => { ... })` — claim atomicity.
2. Inside the lock: read registry, find any entry with `entry_kind === "finding"` AND `session_id === key.sessionId` AND `subtype === key.subtype` AND `status ∈ {active, reported}` AND `description.includes(\`runtime: ${key.runtime}\`)` AND `description.includes(\`layer: ${key.layer}\`)`.
3. If a match exists: return `{ claimed: false, existing: match }`.
4. Else: invoke `entryBuilder()`, validate via `metaStateEntrySchema`, append to registry (using the existing `lines.push` + `writeFileSync(tmpPath, ...) + renameSync(tmpPath, path)` pattern from `writeEntry`), invalidate cache, return `{ claimed: true, id: entry.id }`.

Code comment documenting the per-process lock scope + future `flock` upgrade path.

### Step 4: TDD GREEN — refactor tests 3+5
**File**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`

For **test 3 (L1 probe)**:
- Replace the read-then-write at lines 618-632 (idempotency guard) and the gap-close branch at lines 582-606 (soft-delete) with calls to `tryClaimSessionId` and a `find` using the L1 key only.
- The droid spawn at line 553 becomes `spawn(cli, ...)` where `cli` is set later by `detectAgentCli()` (Phase 2 wires this in; for Phase 1, hardcode `"droid"` to keep Phase 1 PR focused).
- Description must include `runtime: droid; layer: L1;` marker (in addition to existing prose).

For **test 5 (L2 probe)**:
- Replace the read-then-write at lines 817-831 (idempotency guard) and the gap-close branch at lines 786-812 (soft-delete) with the same helper pattern.
- `probeL2Gap` line 99 `spawn("droid", ...)` becomes `spawn(cli, ...)` where `cli = "droid"` (placeholder for Phase 2).
- Description must include `runtime: droid; layer: L2;` marker.

The shared `session_id` (`test-cold-session-mcp-client-loading`) and `subtype` (`mcp-client-loading`) stay — the rule's exact-match contract depends on this. Runtime/layer go in `description` markers per the report's Q2-E decision.

### Step 5: Verify rule intact
**File**: `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` (read-only)

Run `pnpm test` and confirm `gate-resolution-evidence.test.js` still passes. The rule's `pattern` is unchanged; the test should pass without edits.

Also run `cold-session-churn-regression.test.js` (Step 2) and confirm it now passes.

### Step 6: Update assertion test for description markers
**File**: `tools/learning-loop-mcp/core/__tests__/meta-state.test.js` (extend)

Add `test("every active mcp-client-loading finding has runtime: and layer: markers", ...)` that:
1. Reads the real `meta-state.jsonl` (use a snapshot or skip on missing).
2. Filters to `entry_kind === "finding" && subtype === "mcp-client-loading" && status ∈ {active, reported}`.
3. Asserts every match has `description.includes("runtime:")` AND `description.includes("layer:")`.

This is the SP1/SP2-style drift detector for description markers (report Risk 2).

## Success Criteria

- [ ] Step 0 migration completes; all 10+ existing mcp-client-loading entries have `runtime: unknown; layer: L1|L2` markers
- [ ] Step 1 race test passes
- [ ] Step 2 L1-resolves-L2 regression test passes
- [ ] Step 3 helper implemented under `enqueue` lock
- [ ] Step 4 tests 3+5 refactored to use helper; L1 closes only L1, L2 closes only L2
- [ ] Step 5 `gate-resolution-evidence.test.js` passes unchanged
- [ ] Step 6 description-marker drift test passes (post-migration)
- [ ] `pnpm test` shows 0 regressions
- [ ] No `chore` or `docs` commit prefixes (per CLAUDE.md §Git)
- [ ] `Rule-cold-session-test-must-pass-before-resolution.pattern` is unchanged (read `meta-state.jsonl` to verify)

## Risk Assessment

- **Import ordering**: `tryClaimSessionId` is added to `core/meta-state.js` exports; tests use dynamic `import(pathToFileURL(corePath).href)` — verify the export name matches the dynamic import (no typos).
- **Lock scope**: `enqueue` is per-process. `node --test` runs top-level tests concurrently within one process — within the same `enqueue` chain. Confirmed safe for the cold-session test by reading the existing `concurrent writes do not corrupt JSONL` test (line 174).
- **Backward compat**: tests 3+5 currently write entries directly. After the refactor, the test file still has access to `writeEntry`/`updateEntry` for the soft-delete branch. No new test-only primitives needed.

## Security Considerations

- The helper takes a `description` from `entryBuilder()`. If a future caller passes an unescaped string into the L1/L2 markers, the description filter could cross-match. **Mitigation**: the marker convention is exact-string-includes (`runtime: claude; layer: L1;`), and Step 6's drift test would fail. Document the convention in the helper's JSDoc.

## Next Steps

After Phase 1 ships and CI passes, proceed to Phase 2 (freshness sentinel + cross-compat `detectAgentCli()`). Phase 2 reads from the `tryClaimSessionId` helper built here.

---
phase: 2
title: "Wire consumers + update consumer tests"
status: pending
priority: P1
dependencies: [1]
---

# Phase 02: Wire consumers + update consumer tests

<!-- RT: M7 — loop-introspect.js#buildStaleDispatchHints:224 also calls isStaleView(e) without opts; added to modify list -->
<!-- RT: M10 — clarified relationship-validate fixtures don't have evidence_code_ref, so behavior unchanged for current tests; new fixtures must be added to exercise drift branch -->
<!-- RT: M22 — removed fabricated "5 test files need expectation updates" claim; only build-stale-dispatch-hints.test.js needs real changes -->
<!-- RT: M23 — resolveDanglingRefs caller at meta-state-relationships-tool.js:206-210 must be updated to thread signals through -->

## Overview

Four call sites currently invoke `isStaleView`/`derivedStaleSet` without injecting `codeHashes`:
- `tools/learning-loop-mastra/tools/handlers/meta-state-sweep-tool.js` — uses `derivedStaleSet` with `fileIndex` only
- `tools/learning-loop-mastra/tools/handlers/meta-state-relationship-validate-tool.js` — uses `isStaleView` with no opts
- `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` — uses `isStaleView` with no opts (in `computeDanglingRefs`)
- `tools/learning-loop-mastra/core/loop-introspect.js` — `buildStaleDispatchHints` calls `isStaleView(e)` at line 224 with no opts (RT: M7)

Upgrade each to build both `fileIndex` and `codeHashes` via the new helper, and pass both to the stale-view predicate. Update the test files that pin current (over-broad) expectations.

## Requirements

### Functional
- All four consumers compute `codeHashes` once per handler invocation via `computeCurrentHashes(entries, root)` from Phase 01.
- `meta-state-sweep-tool.js` passes both `fileIndex` and `codeHashes` to `derivedStaleSet`.
- `meta-state-relationship-validate-tool.js` passes both to `isStaleView(target)` inside `isOrphanStatus`.
- `meta-state-relationships-tool.js` passes both to `isStaleView(target)` inside `computeDanglingRefs` — and `resolveDanglingRefs` (the caller at `meta-state-relationships-tool.js:206-210`) threads `signals` through to `computeDanglingRefs`. (RT: M23)
- `core/loop-introspect.js#buildStaleDispatchHints` passes both to `isStaleView(e)` at line 224. (RT: M7)
- Each consumer logs `skipped` paths (filtering `reason: "missing"` for high-frequency; logging `reason` starting with `containment_violation:` or `fs_error:` as gate-log breadcrumbs). (RT: M20 carry-over from Phase 01)

### Non-functional
- Each consumer's handler should still resolve `root` exactly once. Reuse the existing `resolveRoot()` call; compute `fileIndex` and `codeHashes` after `readRegistry`.
- No regression on existing tests that already pass for the correct reasons. Note: tests that create fixtures WITHOUT `evidence_code_ref` are unaffected by this change — drift branch is unreachable. Only tests with `evidence_code_ref` exercise the drift branch. (RT: M10)

## Architecture

```js
// meta-state-sweep-tool.js — handler body
const root = resolveRoot();
const entries = readRegistry(root);
const fileIndex = readFileIndex(root);
const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);  // RT: M20 — destructure { ok, skipped }
// RT: M20 — log non-missing skipped paths
for (const s of skipped) {
  if (s.reason !== "missing") {
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_sweep", action: "compute_current_hash_skipped", canonical: s.canonical, reason: s.reason });
  }
}
const now = Date.now();
const staleSet = derivedStaleSet(entries, { now, fileIndex, codeHashes });  // UPDATED
```

```js
// meta-state-relationship-validate-tool.js
// Build a memoized (fileIndex, codeHashes) per handler invocation.

function buildStaleSignals(entries, root) {
  const fileIndex = readFileIndex(root);
  const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);
  // RT: M20 — log non-missing skipped paths
  for (const s of skipped) {
    if (s.reason !== "missing") {
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_relationship_validate", action: "compute_current_hash_skipped", canonical: s.canonical, reason: s.reason });
    }
  }
  return { fileIndex, codeHashes };
}
// handler:
const { fileIndex, codeHashes } = buildStaleSignals(entries, root);
// pass through classifyReferences → isOrphanStatus → isStaleView(target, { fileIndex, codeHashes })
```

```js
// meta-state-relationships-tool.js — same pattern. RT: M23 — caller must thread signals.
function resolveDanglingRefs(root, id, direction, signals) {  // RT: M23 — new signals param
  // ...
  const danglingRefs = computeDanglingRefs(refs, entries, signals);  // RT: M23 — pass signals
  // ...
}

function computeDanglingRefs(refs, entries, signals) {
  // RT: M23 — accept signals; pass through to isStaleView
  // RT: M20 — log non-missing skipped paths
  for (const s of computeCurrentHashes(entries, root).skipped) {
    if (s.reason !== "missing") {
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_relationships", action: "compute_current_hash_skipped", canonical: s.canonical, reason: s.reason });
    }
  }
  // ...
}
```

```js
// core/loop-introspect.js — RT: M7 — buildStaleDispatchHints now injects codeHashes
function buildStaleDispatchHints(entries, fileIndex, codeHashes, opts = {}) {  // RT: M7 — new params
  // ...
  .filter((e) => isStaleView(e, { fileIndex, codeHashes, now: opts.now }))  // RT: M7 — pass signals
  // ...
}
```

## Related Code Files
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-sweep-tool.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationship-validate-tool.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (RT: M23 — update both `resolveDanglingRefs` and `computeDanglingRefs`)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (RT: M7 — `buildStaleDispatchHints`)
- Modify (test expectations): `tools/learning-loop-mastra/__tests__/legacy-mcp/build-stale-dispatch-hints.test.js`
- Add test coverage (NOT modify existing assertions): `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep.test.js` (add unit test for codeHashes-driven drift)
- Add test coverage: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationship-validate-tool.test.js` (add fixture WITH `evidence_code_ref` to exercise drift branch) (RT: M10)
- Add test coverage: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationships-dangling-refs.test.js` (add fixture WITH `evidence_code_ref`)
- Add test coverage: `tools/learning-loop-mastra/__tests__/legacy-mcp/compute-current-hashes-integration.test.js` (NEW — covers EACCES, traversal, missing file paths via real filesystem ops; chmod-based permission test)

## Implementation Steps

### Step 2.1 — `meta-state-sweep-tool.js`
- Add `import { computeCurrentHashes } from "../../core/stale-view.js";`
- After `const fileIndex = readFileIndex(root);`, add `const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);`
- Loop over `skipped`, gate-log non-`"missing"` entries.
- Pass `codeHashes` to `derivedStaleSet`.
- Existing sweep tests pass without modification (drift branch was broken pre-fix; post-fix the count may legitimately change — verify post-test-run).

### Step 2.2 — `meta-state-relationship-validate-tool.js`
- Add `import { computeCurrentHashes } from "../../core/stale-view.js";` and `import { readFileIndex } from "../../core/meta-state.js";` (readFileIndex may already be imported)
- Refactor `isOrphanStatus` to accept `(entry, signals)`:
  ```js
  function isOrphanStatus(entry, signals) {
    return isStaleView(entry, signals);
  }
  ```
- In `classifyReferences`, thread `signals` through:
  ```js
  function classifyReferences(referenced, entryById, claimed, signals) { ... }
  ```
- Handler builds `signals = buildStaleSignals(entries, root)` and passes to `classifyReferences`. Log non-`"missing"` skipped paths.
- Existing tests at `meta-state-relationship-validate-tool.test.js:13-35` use `writeFixture` without `evidence_code_ref` → drift branch unreachable → behavior unchanged. No existing assertions need modification. (RT: M10)

### Step 2.3 — `meta-state-relationships-tool.js` (RT: M23)
- Same wiring pattern as Step 2.2.
- **`resolveDanglingRefs(root, id, direction, signals)`** — new `signals` parameter (RT: M23 — caller signature change; without this, `computeDanglingRefs`'s new 3rd arg is unreachable).
- **`computeDanglingRefs(refs, entries, signals)`** — accepts signals; passes to `isStaleView(target, signals)`.
- Existing `meta-state-relationships-dangling-refs.test.js` fixtures: verify whether they include `evidence_code_ref`. If not, behavior unchanged → no assertions to flip; add new fixtures with refs to exercise drift branch.

### Step 2.4 — `core/loop-introspect.js#buildStaleDispatchHints` (RT: M7)
- Add `import { computeCurrentHashes } from "./stale-view.js";` and `import { readFileIndex } from "./meta-state.js";`
- Change signature: `buildStaleDispatchHints(entries, fileIndex, codeHashes, opts = {})` — accept `fileIndex` + `codeHashes` as injected params.
- Update internal `isStaleView(e)` to `isStaleView(e, { fileIndex, codeHashes, now: opts.now })`.
- Find every caller of `buildStaleDispatchHints` and update to pass `fileIndex` and `codeHashes`. Document the new threading in a JSDoc note.

### Step 2.5 — Test expectation updates (RT: M10, M22)
**Existing tests with `evidence_code_ref` fixtures (will exercise drift branch):**
- `build-stale-dispatch-hints.test.js` — already includes fixtures with `evidence_code_ref: "tools/x.js:1"`; post-fix drift count may change from N to 0 (post-seed normalizes). Update assertions accordingly.

**Existing tests WITHOUT `evidence_code_ref` fixtures (drift branch unreachable):**
- `meta-state-sweep.test.js` — verify whether fixtures use `evidence_code_ref`; if not, behavior unchanged.
- `meta-state-relationship-validate-tool.test.js` — `writeFixture` at lines 13-35 does NOT set `evidence_code_ref`. Drift branch unreachable. **No assertion modifications needed.** (RT: M10)
- `meta-state-relationships-dangling-refs.test.js` — verify; if fixtures lack `evidence_code_ref`, no changes.
- `meta-state-sweep-stale-transition.test.js` — verify; if fixtures lack `evidence_code_ref`, no changes.

**NEW tests to add:**
- `compute-current-hashes-integration.test.js` — covers EACCES, traversal, missing file paths via real filesystem ops. (RT: M20)
- Add 1 sub-test to `meta-state-relationship-validate-tool.test.js`: create a fixture WITH `evidence_code_ref` to exercise drift branch. (RT: M10)
- Add 1 sub-test to `meta-state-sweep.test.js`: in-memory registry with mismatched `codeHashes` to verify drift branch end-to-end.

For each modified test, add a short comment explaining the post-fix expectation.

## Success Criteria

- [ ] All four consumers build `{ fileIndex, codeHashes }` and pass them through. (RT: M7 — `buildStaleDispatchHints` added)
- [ ] `resolveDanglingRefs` signature updated to accept `signals`; `computeDanglingRefs` 3rd arg reachable. (RT: M23)
- [ ] No handler invocation has more than one `readFileIndex(root)` call (caching).
- [ ] All consumer tests pass; existing assertions unchanged unless a fixture exercises the drift branch.
- [ ] `build-stale-dispatch-hints.test.js` assertions updated post-fix to reflect narrower drift semantics. (RT: M7)
- [ ] `compute-current-hashes-integration.test.js` covers EACCES / traversal / missing. (RT: M20)
- [ ] `meta-state-relationship-validate-tool.test.js` adds a fixture WITH `evidence_code_ref` to exercise drift branch. (RT: M10)
- [ ] `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep*.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationship*.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/build-stale-dispatch-hints.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/compute-current-hashes-integration.test.js` → all green.

## Risk Assessment

- **Test brittleness:** a few existing tests may pin stale-view counts via the bug. **Mitigation:** verify each test's fixtures individually before modifying assertions. Most fixtures lack `evidence_code_ref` → behavior unchanged. (RT: M22 — corrected the over-broad risk claim)
- **Performance:** each handler now does N `readFileSync` calls (one per unique cited path). For 268 findings with ~80 distinct paths, this is ~80 reads per sweep. Acceptable for an MCP tool (not in hot path). Document in code comment.
- **`isOrphanStatus` signature change:** the test for `meta-state-relationship-validate-tool.test.js` likely calls `isOrphanStatus` directly. Confirm before changing the public signature; if it's tested, export the new shape or keep backward-compat by accepting `(entry, signals = {})` with signals optional.
- **Registry size growth:** as the registry grows, `computeCurrentHashes` cost grows linearly. Acceptable; documented.
- **`buildStaleDispatchHints` callers** — every caller needs the new `fileIndex` + `codeHashes` args. `grep -rn buildStaleDispatchHints tools/` to enumerate; some may be in tests that also need updating. (RT: M7)
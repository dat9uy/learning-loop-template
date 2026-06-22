---
phase: 1
title: "runner-script"
status: pending
priority: P1
dependencies: []
effort: "M"
---

# Phase 1: runner-script

## Overview

Create `tools/scripts/run-pnpm-test-namespaced.mjs` — a Node ESM wrapper that invokes `node --test` once per glob, emits `[ns] ==> start|pass|FAIL` lines to stdout, mirrors each glob's output to `.test-logs/<ns>.log`, and preserves the 12.87s baseline via `Promise.all` parallelism.

## Requirements

- **Functional:**
  - Emit `[<ns>] ==> start` before each glob runs
  - Emit `[<ns>] ==> pass` or `[<ns>] ==> FAIL <N>` after each glob
  - Mirror per-glob stdout+stderr to `.test-logs/<ns>.log`
  - Run all globs in parallel via `Promise.all`
  - Exit with non-zero status if any glob fails
  - Pass through `--test-timeout=30000` to each `node --test` invocation
- **Non-functional:**
  - Node built-ins only; no new `package.json:21-31` deps
  - Total wall-clock stays ≤ 30s on this dev machine
  - Skip dead globs (Phase 3 dependency)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ pnpm test                                                 │
│  └─> node tools/scripts/run-pnpm-test-namespaced.mjs     │
│       └─> Promise.all(globs.map(runGlob))                 │
│             ├─> glob 1: node --test '<ns1>'              │
│             │     ├─> stdout: [ns1] ==> start             │
│             │     ├─> mirror to .test-logs/ns1.log       │
│             │     └─> stdout: [ns1] ==> pass             │
│             ├─> glob 2: ...                              │
│             └─> glob N: ...                              │
│  exit: 0 if all pass, 1 if any FAIL                      │
└──────────────────────────────────────────────────────────┘
```

## Related Code Files

- **Create:** `tools/scripts/run-pnpm-test-namespaced.mjs`
- **Modify:** `package.json:17` — `pnpm test` script

## Implementation Steps

1. **Create the runner script** with these responsibilities:
   - Read glob list from CLI args OR hardcode (hardcode is simpler; see step 4)
   - For each glob: emit `[<ns>] ==> start`, spawn `node --test --test-timeout=30000 '<glob>'`, capture output, emit `[<ns>] ==> pass|FAIL <code>`, write to `.test-logs/<ns>.log`
   - Use `child_process.spawn` (not `exec` — need to stream)
   - Use `Promise.all` to run all globs in parallel
   - Track failures in an array; exit with non-zero if any glob returned non-zero
   - Emit `[suite] ==> start` at beginning, `[suite] ==> pass (N globs, M tests)` or `[suite] ==> FAIL (<N> globs failed)` at end
2. **Define the 9 active globs** (Phase 3 drops the 2 dead ones):
   ```js
   const GLOBS = [
     { ns: 'mcp-tests',       pattern: 'tools/learning-loop-mcp/__tests__/*.test.js' },
     { ns: 'mcp-core-tests',  pattern: 'tools/learning-loop-mcp/core/__tests__/*.test.js' },
     { ns: 'mcp-core',        pattern: 'tools/learning-loop-mcp/core/*.test.js' },
     { ns: 'mcp-lib',         pattern: 'tools/learning-loop-mcp/lib/*.test.js' },
     { ns: 'mcp-tools',       pattern: 'tools/learning-loop-mcp/tools/*.test.js' },
     { ns: 'mastra-js',       pattern: 'tools/learning-loop-mastra/__tests__/*.test.js' },
     { ns: 'mastra-cjs',      pattern: 'tools/learning-loop-mastra/__tests__/*.test.cjs' },
     { ns: 'claude-coord-cjs', pattern: '.claude/coordination/__tests__/*.test.cjs' },
     { ns: 'factory-cjs',     pattern: '.factory/hooks/__tests__/*.test.cjs' },
   ];
   ```
3. ~~**Add the `test:cold-session` carve-out:**~~ **REMOVED per Red Team C1.** The cold-session-discoverability test is at `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (`.cjs` extension). Glob 1's pattern is `*.test.js` and does NOT match `.cjs` files. The carve-out was solving a non-problem. **No skip list needed.** (If a future `*.test.cjs` file lands in glob 1, address it then.)
4. **Update `package.json:17`:**
   ```json
   "test": "node tools/scripts/run-pnpm-test-namespaced.mjs",
   "test:cold-session": "node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs"
   ```
   `test:cold-session` is unchanged in behavior; the only change is that `test` now invokes the runner.
5. **Test the runner** by running it directly: `node tools/scripts/run-pnpm-test-namespaced.mjs`. Expect 9 globs, 12-15s wall-clock, all `[<ns>] ==> pass`.
6. ~~**Add a unit test** `tools/learning-loop-mcp/__tests__/run-pnpm-test-namespaced.test.js`...~~ **REMOVED per Red Team H7 (YAGNI).** Phase 6 step 1 (end-to-end `pnpm test` + assert `[<ns>] ==> pass` lines) is the integration signal. A 200-LOC mock-based unit test duplicates the integration signal and would go stale. The runner is small; smoke-test it directly.
7. **Sanitize `<ns>` per Red Team M28:** before joining `<ns>` to `.test-logs/<ns>.log`, validate against `^[a-z0-9-]+$`. Reject anything else with a clear error. Prevents path-traversal even if a glob entry is poisoned.

## Success Criteria

- [ ] `tools/scripts/run-pnpm-test-namespaced.mjs` exists and is < 200 LOC
- [ ] `node tools/scripts/run-pnpm-test-namespaced.mjs` completes in ≤ 30s
- [ ] All 9 globs emit `[<ns>] ==> pass` (or `==> FAIL <N>` if regression)
- [ ] `.test-logs/<ns>.log` is written for each glob
- [ ] `package.json:17` invokes the runner
- [ ] Pre-commit hook (`simple-git-hooks.pre-commit: pnpm test`) continues to pass
- [ ] No new `package.json:21-31` dependencies
- [ ] `ns` is sanitized against `^[a-z0-9-]+$` before path joining (path-traversal guard)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Parallel `node --test` causes port/socket conflicts in cold-tier-regression | Low | Medium | Cold tests are `.cjs`, glob 1 is `*.test.js` — no collision (per C1) |
| `Promise.all` parallelism causes memory/disk pressure on 9 concurrent `node --test` processes | Low | Medium | 9 processes × ~150MB ≈ 1.4GB; well within dev machine limits |
| Spawning `node` per glob adds 100-200ms overhead per glob | High | Low | 9 globs × 200ms = 1.8s; acceptable given 12.87s baseline |
| `child_process.spawn` output capture misses lines if buffer fills | Low | Medium | Use stream (`data` event) not buffer; pipe directly to log file |
| Glob pattern `*.test.js` matches test fixture files (R1 finding: scout glob matches 7 fixture files but 0 live tests) | Confirmed | Low | Dead globs are dropped in Phase 3 |
| Wall-clock exceeds budget on slow CI or cold-cache machines | Medium | Low | Acceptance criterion is ≤ 30s (relaxed from 15s per H19); cross-machine variance is not in scope for this plan |
| Two concurrent `pnpm test` invocations interleave writes to `.test-logs/<ns>.log` | Low | Low | Documented limitation per H10; `tail -f` becomes ambiguous; not solved in this plan (YAGNI) |

---
phase: 1
title: "Cross-process file lock on writeEntry"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Cross-process file lock on writeEntry

## Overview

Add a cross-process file lock around `writeEntry` in `core/meta-state.js` to kill the H7 hypothesis (cross-process file race on `meta-state.jsonl`). The lock lives in L1 (core) so any transport (MCP+hooks today, library-import tomorrow) gets it for free. Lock scope is the registry file only; release immediately after the atomic rename.

## Requirements

- **Functional**: Two independent Node processes firing parallel `meta_state_log_change` calls must result in 0 lost entries. The existing per-process `enqueue` Map serializes within process but not across — this phase closes that gap.
- **Non-functional**: Lock acquisition must complete in <100ms under typical load; total write throughput must remain ≥10 writes/sec under 4 concurrent processes.

## Architecture

`tools/learning-loop-mastra/core/registry-lock.js` (new, ~40 lines):
- Wraps `proper-lockfile` (npm pkg, `fs.openSync(O_EXCL)` retries, cross-platform)
- Exports `withRegistryLock(root, fn)` that acquires an exclusive lock on `<root>/.claude/coordination/.registry.lock`, runs `fn`, releases the lock.
- 10s default timeout (matches `proper-lockfile` default); 3s retry interval.

`tools/learning-loop-mastra/core/meta-state.js:535–551` (writeEntry):
- Wrap the existing `enqueue(root, () => { ... })` body in `withRegistryLock(root, ...)`.
- Inner `enqueue` stays (per-process serialization is still useful within a single process to avoid lock acquisition churn).
- Lock is held for ~5ms (file read + write + rename); release happens before the `enqueue` Promise resolves.

`tools/learning-loop-mastra/core/meta-state.js:560–621` (updateEntry):
- Same wrap: `withRegistryLock` around the `enqueue` body.
- updateEntry is the read-modify-write that the H7 race actually exploits; locking it is non-negotiable.

`tools/learning-loop-mastra/core/meta-state.js:617–768` (archiveEntry, deleteEntry, metaStateBatch):
- Same wrap pattern. All file mutations get the lock.

### Why `proper-lockfile` not raw `flock(2)`?

- `proper-lockfile` is the standard Node cross-platform file-lock library (used by `npm` itself).
- Wraps `fs.openSync(O_EXCL)` on Linux/Mac and `OpenFileW` + `LockFileEx` on Windows.
- WSL2-safe (uses `link(2)` which works in WSL2's 9P filesystem).
- `proper-lockfile` is already used in similar tools in the broader Node ecosystem; smallest dependency footprint.

### Lock path: `<root>/.meta-state.lock` (single-writer root, NOT `.claude/coordination/`)

**Red-team Finding 4 (Security Adversary F2):** The lock must NOT live under `.claude/coordination/` because that directory is multi-writer (`writeToAllSurfaces` iterates 3 surfaces). An attacker who can write to that directory can pre-create `.registry.lock` as a symlink to a target file; `fs.openSync(O_EXCL)` follows symlinks per POSIX, so the lock "file" actually creates/opens the target. Inside the locked critical section, `renameSync(tmpPath, path)` could then overwrite arbitrary files within the project root.

**Mitigation:** Pin the lock to `<root>/.meta-state.lock` — a single-writer location at the project root that no MCP-tool path writes to. Combined with `mkdirSync(dirname(lockPath), { recursive: true })` (Finding 10) on first lock, the lock file is owned by the same user as the project, in a path that no attacker-controlled surface can pre-poison.

### `GATE_ROOT` validation (Finding 5 — TOCTOU on `resolveRoot()`)

`tools/lib/resolve-root.js:13-22` allows `GATE_ROOT` env var to point to any path with validation skip. This widens attack surface: an attacker who can set `GATE_ROOT=/tmp/victim-dir` can flood writes to that directory with no idempotency cache (Phase 2 removes it).

**Mitigation:** Restrict `GATE_ROOT` to a canonical test directory (e.g., only paths matching `<tmpdir>/registry-lock-test-*` or `</test/root>` are accepted). For production, `DEFAULT_ROOT` only. This change touches `resolve-root.js` and adds a test for the restricted set.

### Lock staleness (Finding 12 — `stale: 5000` steals lock from slow batches)

`metaStateBatch` accepts up to 500 ops. On slow disks (network FS, AV scan), lock-hold can exceed 5s. A concurrent process sees >5s-old lock, steals it, and races.

**Mitigation:** Two-pronged:
1. **Raise `stale` to 30s** with `realpath: true` (resolves symlinks; combined with the lock-path fix, prevents the symlink-stealing attack).
2. **Reduce `BATCH_SIZE_LIMIT`** from 500 to 100 in `meta-state.js:669` so worst-case batch fits in 5s on slower hardware.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/registry-lock.js`
- Modify: `tools/learning-loop-mastra/core/meta-state.js:535–551` (writeEntry)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:560–621` (updateEntry)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:617–768` (archiveEntry, deleteEntry, metaStateBatch)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:669` (BATCH_SIZE_LIMIT 500 → 100)
- Modify: `tools/learning-loop-mastra/tools/lib/resolve-root.js` (restrict GATE_ROOT to canonical test dir)
- Modify: `.gitignore` (add `.meta-state.lock`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state.test.js` (extend with lock assertions)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/cross-process-file-lock.test.cjs` (RED test)
- Modify: `package.json` (add `proper-lockfile` to dependencies with `pnpm add -E proper-lockfile@<exact>` for supply-chain hardening)

## Implementation Steps (TDD)

### Step 1.1: RED test (write FIRST)

`tools/learning-loop-mastra/__tests__/legacy-mcp/cross-process-file-lock.test.cjs`:

> **Finding 14 — race window deterministic:** Each child inserts `await sleep(50)` inside the critical section to widen the race window; 10 writes/child instead of 5.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("parallel writes from 2 independent processes: 0 entries lost (race window widened)", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-lock-test-"));
  try {
    // Initialize registry with empty content
    const fs = await import("node:fs");
    fs.writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    // Spawn 2 child processes; each fires 10 parallel log_change calls
    // with sleep(50) inside critical section to widen race window
    const children = await Promise.all([0, 1].map((workerId) =>
      spawn(process.execPath, [
        "-e",
        `
        import { writeEntry, generateId } from "${process.cwd()}/tools/learning-loop-mastra/core/meta-state.js";
        import { slugify } from "${process.cwd()}/tools/learning-loop-mastra/core/slugify.js";
        const root = "${root}";
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const calls = Array.from({length: 10}, async (_, i) => {
          await sleep(50);
          return writeEntry(root, {
            id: generateId(slugify("worker-" + ${workerId} + "-" + i)),
            entry_kind: "change-log",
            change_dimension: "semantic",
            change_target: "tools/test/w" + ${workerId} + "-" + i,
            change_diff: {added: [], removed: [], changed: []},
            reason: "RED test: worker ${workerId} call " + i,
            status: "active",
            created_at: new Date().toISOString(),
            version: 0,
          });
        });
        Promise.all(calls).then(() => process.exit(0));
        `,
      ], { stdio: "inherit" })
    ));

    await new Promise((resolve, reject) => {
      let exited = 0;
      children.forEach((c) => {
        c.on("exit", (code) => {
          if (code !== 0) reject(new Error("child exited " + code));
          else if (++exited === 2) resolve();
        });
      });
    });

    const content = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim();
    const lines = content.split("\n").filter(Boolean);
    assert.equal(lines.length, 20, "expected 20 entries; got " + lines.length);

    const ids = new Set(lines.map((l) => JSON.parse(l).id));
    assert.equal(ids.size, 20, "duplicate ids detected — lock failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lock directory is created if missing (mkdirSync on first lock)", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-lock-test-"));
  try {
    // Don't pre-create .meta-state.lock or its parent dir
    const { withRegistryLock } = await import("../../core/registry-lock.js");
    const result = await withRegistryLock(root, async () => "ok");
    assert.equal(result, "ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

### Step 1.2: Run RED test → expect failure (H7 reproduces)

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm exec node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cross-process-file-lock.test.cjs
# Expected: FAIL — some entries lost (currently ~10-15 of 20 survive)
```

### Step 1.3: GREEN implementation

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm add -E proper-lockfile@4.1.2   # exact version pin per Finding 10
pnpm ls proper-lockfile            # verify no transitive deps
```

`tools/learning-loop-mastra/core/registry-lock.js`:

```js
import { lock as properLock, unlock as properUnlock } from "proper-lockfile";
import { join, dirname } from "node:path";
import { mkdirSync, statSync } from "node:fs";

// Lock at project root, NOT under .claude/coordination/ (Finding 4)
// Single-writer location that no MCP-tool path writes to
const LOCK_FILENAME = ".meta-state.lock";

export async function withRegistryLock(root, fn) {
  const lockPath = join(root, LOCK_FILENAME);

  // Finding 10: pre-create parent dir (root is always existing for this fn)
  const parentDir = dirname(lockPath);
  if (parentDir !== root) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Finding 12: raise stale to 30s + use realpath (symlink-safe)
  const release = await properLock(lockPath, {
    retries: { retries: 10, minTimeout: 100, maxTimeout: 1000, factor: 1.5 },
    stale: 30000,
    realpath: true,
  });
  try {
    return await fn();
  } finally {
    await properUnlock(lockPath);
  }
}
```

`tools/learning-loop-mastra/core/meta-state.js` (writeEntry):

```js
// Before (line 535):
export function writeEntry(root, entry) {
  return enqueue(root, () => {
    // ... 14 lines of read/write/rename ...
  });
}

// After:
export async function writeEntry(root, entry) {
  return enqueue(root, () =>
    withRegistryLock(root, () => {
      // ... same 14 lines ...
    })
  );
}
```

Same wrap for `updateEntry`, `archiveEntry`, `deleteEntry`, `metaStateBatch`.

### Step 1.4: Run GREEN test → expect pass

```bash
pnpm test:legacy -- cross-process-file-lock.test.cjs
# Expected: PASS — all 10 entries present, all unique ids
```

### Step 1.5: Run full regression suite

```bash
pnpm test
# Expected: 862 + 1 = 863 tests pass
```

> **Test runner note:** Plan refers to `pnpm test:legacy -- <file>` for individual-file test runs; this script does NOT exist in `package.json`. Use the actual runner: `pnpm exec node --test tools/learning-loop-mastra/__tests__/legacy-mcp/<file>.test.cjs`. The full suite is `pnpm test`.

## Success Criteria

- [ ] `cross-process-file-lock.test.cjs` passes (20 entries, 20 unique ids after 2-process parallel write with race-window-widened RED test)
- [ ] Lock-directory auto-creation test passes (no ENOENT on first lock)
- [ ] All 862 existing tests still pass
- [ ] `package.json` adds `proper-lockfile@<exact>` (pinned via `pnpm add -E`; `pnpm ls proper-lockfile` shows 0 transitive deps)
- [ ] Lock path is `<root>/.meta-state.lock` (NOT `.claude/coordination/.registry.lock`)
- [ ] `.gitignore` adds `.meta-state.lock` pattern
- [ ] `BATCH_SIZE_LIMIT` reduced from 500 → 100 in `meta-state.js:669`
- [ ] `GATE_ROOT` env var restricted to canonical test dir in `resolve-root.js`
- [ ] Lock acquisition observed <100ms in test environment; lock-hold bounded by `BATCH_SIZE_LIMIT × per-write-cost < 5s`
- [ ] `meta-state.jsonl` line count is exactly equal to `meta_state_list({compact:false}).count` post-write (no drift)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `proper-lockfile` adds transitive deps | Low | Library is single-purpose; verified at install-time via `pnpm ls` per Finding 10 |
| Stale lock on crashed process | Low | `stale: 30000` removes locks older than 30s; `realpath: true` resolves symlinks |
| Lock contention under burst load | Low | Lock scope is registry file only (not per-entry); ~5ms hold time per single-op write |
| WSL2 filesystem race (already documented) | Low | `proper-lockfile` uses `link(2)` which works in 9P; verified in WSL2 environment |
| Backwards compat with old enqueue semantics | Low | Inner `enqueue` retained; lock is additive; no behavioral change for single-process case |
| Symlink attack on lock file | Low | Lock at project root (`<root>/.meta-state.lock`), not in multi-writer `.claude/coordination/`; `realpath: true` (Finding 4) |
| TOCTOU on resolveRoot | Low | `GATE_ROOT` restricted to canonical test dir (Finding 5) |
| Lock-stealing on slow batches | Medium | `stale: 30s` + `BATCH_SIZE_LIMIT: 100` (Finding 12) |
| RED test may pass on fast CI without lock | Low | Race window widened with `setTimeout(50)` + 10 writes/child (Finding 14) |
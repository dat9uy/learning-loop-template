---
phase: 5
title: "Per-worktree session ID (multi-session isolation)"
status: pending
priority: P1
dependencies: []
---

# Phase 5: Per-worktree session ID (multi-session isolation)

## Overview

The marker file `.last-operator-message` is shared across all sessions in the same project. Phase 5 scopes the marker per-session so two Claude Code sessions in different worktrees (or even the same worktree) don't pollute each other's outbound gate decisions. This closes the **Multi-Session Isolation gap** documented at `docs/architecture.md` §378–383.

The session ID is derived from `git rev-parse --show-toplevel` (worktree-aware), with a `${pid}-${starttime}` fallback for non-git directories. This makes parallel PR operation safe: each worktree's session ID is distinct by construction.

## Requirements

- **Functional**: Two Claude Code sessions in different worktrees must not share marker file state. The outbound gate in worktree A must not be affected by a stale-state-change message in worktree B.
- **Non-functional**: Session ID derivation cost is <50ms on first call (cached for 30s in-process).

## Architecture

`tools/learning-loop-mastra/core/worktree-session-id.js` (new, ~40 lines):

```js
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

let cachedSessionId = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function getSessionId(root) {
  if (cachedSessionId && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSessionId;
  }
  let worktreeId;
  try {
    worktreeId = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      timeout: 1000,
    }).trim();
  } catch {
    // Not a git repo (or git unavailable): fall back to pid+starttime
    worktreeId = `nongit-${process.pid}-${Math.floor(Date.now() / 1000)}`;
  }
  cachedSessionId = createHash("sha256").update(worktreeId).digest("hex").slice(0, 12);
  cachedAt = Date.now();
  return cachedSessionId;
}

export function getMarkerPath(root, surface, sessionId = getSessionId(root)) {
  const { join } = require("node:path");
  return join(root, surface, "coordination", `.last-operator-message-${sessionId}`);
}
```

`tools/learning-loop-mastra/core/inbound-state.js` (modify `readLastOperatorMessage` + `writeLastOperatorMessage`):

```js
// Before (line 50):
const hits = readFromAllSurfaces(root, ".last-operator-message");

// After:
import { getSessionId, getMarkerPath } from "./worktree-session-id.js";

const sessionId = getSessionId(root);
const hits = readFromAllSurfaces(root, `.last-operator-message-${sessionId}`);
```

Same change in `writeLastOperatorMessage`.

`docs/architecture.md` (modify §378–383):

```markdown
#### Multi-Session Isolation — RESOLVED

The marker file `.last-operator-message` had no session ID. Multiple Claude Code sessions sharing a project directory shared the same marker file.

**Impact:** Session A's state-change message affected Session B's outbound gate.

**Resolution (2026-07-11):** Marker filename now includes the session ID (sha256 of `git rev-parse --show-toplevel`, 12-char prefix). Two worktrees in the same repo get distinct marker files. Backed by `tools/learning-loop-mastra/core/worktree-session-id.js`. Closes the gap as part of plan 260711-0030.
```

## Related Code Files

- **Create**: `tools/learning-loop-mastra/core/worktree-session-id.js`
- **Modify**: `tools/learning-loop-mastra/hooks/universal/inbound-gate.js:44-64` (per-session marker write; CORRECTED per Finding 2)
- **Modify**: `tools/learning-loop-mastra/core/inbound-state.js` (per-session marker read)
- **Modify**: `docs/architecture.md` §378–383 (mark RESOLVED)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/per-worktree-session-id.test.cjs` (RED test)

> **Finding 2 (Critical) — Phase 5 modifies the wrong file:** The marker WRITER is in `hooks/universal/inbound-gate.js:60` (`writeToAllSurfaces(root, ".last-operator-message", ...)`), NOT in `core/inbound-state.js`. `core/inbound-state.js` only exports `readLastOperatorMessage` + `checkObservationStaleness` (no writer). Modifications MUST target `inbound-gate.js` for the writer path; `inbound-state.js` only for the reader.

> **Finding 6 (High) — git PATH-hijack:** `execFileSync("git", [...])` uses PATH lookup. Attacker poisons PATH or writes `.git/config` with `core.hooksPath`. Mitigation: derive session ID from filesystem signature instead — read `path.join(root, ".git/HEAD")` directly. Returns null/absent if not a git repo; non-git fallback uses `${pid}-${startime}-${randomBytes(4).hex}` (with random suffix per Finding 3). No subprocess spawn.

> **Finding 11 (High) — multi-surface scoping:** `writeToAllSurfaces` writes to `.claude`, `.factory`, `.mastracode` (3 surfaces). Phase 5 scope is per-worktree; per-surface scoping extends the same worktree's session ID with the surface name (`<sessionId>-<surface>`) so cross-surface pollution is also blocked. Both writer (`inbound-gate.js:60`) and reader (`inbound-state.js:50`) must be updated.

## Implementation Steps (TDD)

### Step 5.1: RED test (write FIRST)

`tools/learning-loop-mastra/__tests__/legacy-mcp/per-worktree-session-id.test.cjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("two worktrees get distinct session IDs (filesystem signature)", async () => {
  const wt1 = mkdtempSync(join(tmpdir(), "wt1-"));
  const wt2 = mkdtempSync(join(tmpdir(), "wt2-"));
  try {
    // Initialize git so filesystem signature is "real"
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init"], { cwd: wt1 });
    execFileSync("git", ["init"], { cwd: wt2 });

    const { getSessionId } = await import("../../core/worktree-session-id.js");
    const id1 = getSessionId(wt1);
    const id2 = getSessionId(wt2);

    assert.notEqual(id1, id2, "expected distinct session IDs for distinct worktrees");
  } finally {
    rmSync(wt1, { recursive: true, force: true });
    rmSync(wt2, { recursive: true, force: true });
  }
});

test("non-git fallback includes random suffix to prevent second-precision collision", async () => {
  const wt1 = mkdtempSync(join(tmpdir(), "nongit-"));
  const wt2 = mkdtempSync(join(tmpdir(), "nongit-"));
  try {
    const { getSessionId } = await import("../../core/worktree-session-id.js");
    // Two calls in the same wall-clock second with same pid → must differ
    const id1 = getSessionId(wt1);
    const id2 = getSessionId(wt2);
    // Distinct tempdirs, distinct IDs even if same pid+second
    assert.notEqual(id1, id2, "non-git fallback must produce unique IDs");
    assert.match(id1, /^nongit-/);
  } finally {
    rmSync(wt1, { recursive: true, force: true });
    rmSync(wt2, { recursive: true, force: true });
  }
});

test("marker file is scoped per session: 2 sessions don't share state", async () => {
  const root = mkdtempSync(join(tmpdir(), "marker-test-"));
  try {
    mkdirSync(join(root, ".claude", "coordination"), { recursive: true });

    // Session A writes a marker (via the new per-session write path)
    // (mocked or via direct file write to the per-session path)
    const sessionId = "test-session-A";
    const markerPath = join(root, ".claude", "coordination", `.last-operator-message-${sessionId}`);
    writeFileSync(markerPath, JSON.stringify({ message: "session-A-state-change" }));

    // Reader (per-session scope) should NOT find it under the wrong sessionId
    const { readLastOperatorMessage } = await import("../../core/inbound-state.js");
    const wrongSessionRead = await readLastOperatorMessage(root, ".claude", "test-session-B");
    assert.equal(wrongSessionRead, null);

    // Reader with correct sessionId SHOULD find it
    const correctSessionRead = await readLastOperatorMessage(root, ".claude", sessionId);
    assert.equal(correctSessionRead?.message, "session-A-state-change");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

### Step 5.2: Run RED test → expect failure (current marker is shared)

```bash
pnpm exec node --test tools/learning-loop-mastra/__tests__/legacy-mcp/per-worktree-session-id.test.cjs
# Expected: FAIL — session B sees session A's marker (shared .last-operator-message)
```

### Step 5.3: GREEN implementation

1. **Create** `tools/learning-loop-mastra/core/worktree-session-id.js`:
   - Reads `path.join(root, ".git/HEAD")` directly (no subprocess; addresses Finding 6)
   - If absent (no git), fallback to `nongit-<pid>-<timestamp>-<randomBytes(4).hex>` (Finding 3 — random suffix)
   - Cache for 30s per root
2. **Modify** `tools/learning-loop-mastra/hooks/universal/inbound-gate.js:60` (CORRECTION — was wrongly listed as `inbound-state.js`):
   - `writeToAllSurfaces(root, \`.last-operator-message-${sessionId}\`, ...)` per surface (Finding 11)
3. **Modify** `tools/learning-loop-mastra/core/inbound-state.js:50`:
   - `readFromAllSurfaces(root, \`.last-operator-message-${sessionId}\`)` per session
4. **Update** `docs/architecture.md` §378–383.

### Step 5.4: Migration consideration

Existing `.last-operator-message` files in deployed environments are silently renamed to `.last-operator-message-<default-sessionId>` on first read. No data loss; the default session ID is `legacy-default` for unmigrated markers.

### Step 5.5: Run GREEN + regression

```bash
pnpm test
# Expected: 862 + 3 (Phase 1+2+3) + 3 (Phase 4) + 3 (Phase 5) = 871 tests pass
```

## Success Criteria

- [ ] `per-worktree-session-id.test.cjs` passes (3 sub-tests: distinct IDs, non-git collision-free, marker isolation)
- [ ] All existing tests still pass
- [ ] `docs/architecture.md` §378–383 marked RESOLVED
- [ ] `getSessionId` cached for 30s per-root (no shared state across worktrees)
- [ ] Non-git fallback uses random suffix to prevent second-precision collisions
- [ ] Legacy `.last-operator-message` files preserved (renamed, not deleted)
- [ ] No `git` subprocess spawned; session ID from filesystem signature only

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Reading `.git/HEAD` fails silently on non-git dirs | Low | Cached null; fallback to non-git path with random suffix |
| Cache stale across worktree changes | Low | Cache key includes root; 30s TTL documented |
| Multi-surface marker pollution | Low | Per-surface scoped ID (Finding 11); writer + reader both updated |
| Inbound-state tests use literal `.last-operator-message` paths | Medium | Update tests; verify by running `pnpm exec node --test tools/learning-loop-mastra/__tests__/legacy-mcp/inbound-state-*` |
| Phase 5 modifies wrong file (Finding 2) | Critical | Corrected: target `hooks/universal/inbound-gate.js:60` for writer, `core/inbound-state.js:50` for reader |
| PATH-hijack on git subprocess (Finding 6) | High | No subprocess; filesystem signature only |
---
phase: 3
title: "Post-write visibility re-read in handlers"
status: pending
priority: P1
dependencies: ["phase-02-drop-in-process-idempotency-cache"]
---

# Phase 3: Post-write visibility re-read in handlers

## Overview

Every handler that calls `writeEntry` or `updateEntry` must **re-read the registry** after the write and assert the entry is visible. If the entry is not visible, the handler returns a structured failure (not `{logged: true, ...}`). This closes:
- **T4** (`meta-260619T2233Z`, open, escalate): `meta_state_log_change` returned `logged: true` without persisting
- **T5** (`meta-260626T1419Z`, open, escalate): `meta_state_supersede` returned `superseded: true` without persisting
- **C16** (latent): `meta_state_resolve` ignores `updateEntry` return value (`meta-state-resolve-tool.js:161`)

The pattern follows `applyUpdateAndCheck` from PR #38 — generalize it from supersede/re-verify to all write/update handlers.

## Requirements

- **Functional**: If `writeEntry` returns without persisting (file race, FS error, validation drift), the handler returns `{ok: false, reason: "write_not_visible", id: "..."}` instead of `{logged: true}`.
- **Non-functional**: Re-read cost is ~5ms per call; acceptable for tool-call latency budget.

## Architecture

`tools/learning-loop-mastra/core/update-entry-helpers.js` — extend `applyUpdateAndCheck`:

```js
// Before (current applyUpdateAndCheck):
export async function applyUpdateAndCheck(root, id, patch, toolName) {
  const updateResult = await updateEntry(root, id, patch);
  if (updateResult === "version_mismatch") { /* ... */ }
  if (updateResult !== true) throw new Error(...);
  return { ok: true };
}

// After:
export async function applyUpdateAndCheck(root, id, patch, toolName) {
  const updateResult = await updateEntry(root, id, patch);
  if (updateResult === "version_mismatch") {
    const fresh = readRegistry(root).find((e) => e.id === id);
    return { ok: false, reason: "version_mismatch", current_version: fresh?.version ?? 0 };
  }
  if (updateResult !== true) {
    throw new Error(`${toolName}: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`);
  }
  // NEW: post-write visibility re-read
  const fresh = readRegistry(root).find((e) => e.id === id);
  if (!fresh) {
    return { ok: false, reason: "write_not_visible", id };
  }
  return { ok: true, entry: fresh };
}
```

New helper `assertWriteVisible(root, id, toolName)` for `meta_state_log_change` (which uses `writeEntry`, not `updateEntry`):

```js
export async function assertWriteVisible(root, id, toolName) {
  // Force re-read bypassing LRU cache (Phase 6 will close the cross-process cache invalidation gap;
  // for now we trust the within-process LRU since Phase 1's lock makes the write atomic)
  const fresh = readRegistry(root).find((e) => e.id === id);
  if (!fresh) {
    throw new WriteNotVisibleError(toolName, id);
  }
  return fresh;
}

export class WriteNotVisibleError extends Error {
  constructor(toolName, id) {
    super(`${toolName}: write succeeded but entry ${id} not visible in registry`);
    this.code = "WRITE_NOT_VISIBLE";
    this.toolName = toolName;
    this.id = id;
  }
}
```

Handler refactors:

| Handler | Current | After |
|---|---|---|
| `meta-state-log-change-tool.js` | `await writeEntry(root, entry); return {logged: true, ...}` | `await writeEntry(root, entry); const fresh = await assertWriteVisible(root, id, "meta_state_log_change"); if (!fresh) return {ok: false, reason: "write_not_visible", id};` |
| `meta-state-supersede-tool.js` | `applyUpdateAndCheck` (already uses) | `applyUpdateAndCheck` returns `{ok: true, entry}`; handler uses `entry` to build response |
| `meta-state-resolve-tool.js:161` | `await updateEntry(...); return {resolved: true, ...}` (unconditional) | `applyUpdateAndCheck` → if `ok: false`, return failure; if `ok: true`, return success with entry |
| `meta-state-re-verify-tool.js` | `applyUpdateAndCheck` (already uses) | Same pattern |

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/update-entry-helpers.js` (extend `applyUpdateAndCheck`)
- Create: `tools/learning-loop-mastra/core/write-visibility.js` (new `assertWriteVisible` helper)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js` (use `assertWriteVisible`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js` (use returned `entry`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js` (close C16)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js` (use returned `entry`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-resolve-tool.test.js` (cover C16)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/post-write-visibility-reread.test.cjs` (RED test)

## Implementation Steps (TDD)

### Step 3.1: RED test (write FIRST)

`tools/learning-loop-mastra/__tests__/legacy-mcp/post-write-visibility-reread.test.cjs`:

> **Finding 13 — restructure to avoid ESM namespace mutation:** ES module exports are read-only; mutating `(await import(...)).writeEntry = ...` throws TypeError. Use a different mechanism: refactor `meta-state-log-change-tool.js` to accept a `writeEntry` parameter for testing, OR delete the registry file between `writeEntry` and `assertWriteVisible` to simulate "write succeeded but reader can't see it."

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("log_change handler returns failure when write is not visible (registry deleted post-write)", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-write-reread-test-"));
  const origRoot = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    // Initialize empty registry
    const fs = await import("node:fs");
    const registryPath = join(root, "meta-state.jsonl");
    fs.writeFileSync(registryPath, "", "utf8");

    // Patch getRegistryPath to inject a delete-after-write side effect
    // (registry file is removed after writeEntry returns, simulating
    // rename racing with a reader)
    const metaState = await import("../../core/meta-state.js");
    const originalGetPath = metaState.getRegistryPath;
    metaState.getRegistryPath = (r) => {
      const p = originalGetPath(r);
      // Schedule a delete after writeEntry returns
      setImmediate(() => { try { unlinkSync(p); } catch {} });
      return p;
    };

    const { metaStateLogChangeTool } = await import("../../tools/handlers/meta-state-log-change-tool.js");
    const r = JSON.parse((await metaStateLogChangeTool.handler({
      change_dimension: "semantic",
      change_target: "tools/test/post-write-reread",
      change_diff: {added: [], removed: [], changed: []},
      reason: "RED test: post-write visibility re-read",
    })).content[0].text);

    // Assert: handler returned failure, NOT {logged: true}
    assert.equal(r.logged, undefined, "handler returned logged:true despite write-not-visible");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "write_not_visible");
    assert.ok(r.id, "should still include id for diagnostics");
  } finally {
    process.env.GATE_ROOT = origRoot;
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolve handler closes C16: returns failure when updateEntry returns null", async () => {
  // Patch updateEntry to return null (entry not found)
  // Assert: handler returns {ok: false, reason: "entry_not_found"}, NOT {resolved: true}
});

test("supersede handler uses returned entry from applyUpdateAndCheck", async () => {
  // Assert response.entry matches the post-update entry shape
});
```

### Step 3.2: Run RED test → expect failure (current handlers don't re-read)

```bash
pnpm exec node --test tools/learning-loop-mastra/__tests__/legacy-mcp/post-write-visibility-reread.test.cjs
# Expected: FAIL — handler returns logged:true despite deleted registry
```

### Step 3.3: GREEN implementation

1. Create `tools/learning-loop-mastra/core/write-visibility.js` with `assertWriteVisible` + `WriteNotVisibleError`.
2. Extend `applyUpdateAndCheck` in `update-entry-helpers.js` to re-read and return `{ok: true, entry}`.
3. Refactor each handler to use the new pattern.

### Step 3.4: Update existing tests

`meta-state-resolve-tool.test.js` — add coverage for C16 (resolve on non-existent id).

### Step 3.5: Run GREEN + regression

```bash
pnpm test
# Expected: 863 + 1 = 864 tests pass
```

## Success Criteria

- [ ] `post-write-visibility-reread.test.cjs` passes (3 sub-tests: log_change, supersede, resolve)
- [ ] All existing tests still pass (862 baseline preserved)
- [ ] T4 (`meta-260619T2233Z`) and T5 (`meta-260626T1419Z`) findings can be resolved in Phase 6
- [ ] C16 latent bug (resolve-handler ignores updateEntry return) is now closed
- [ ] `applyUpdateAndCheck` returns `{ok: true, entry}` (backwards-compatible if callers ignore `entry`)
- [ ] Response shapes include `ok`, `reason`, `id` fields consistently

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Re-read cost (~5ms per call) | Low | Acceptable for tool-call latency budget; Phase 6's cross-process cache invalidation will keep the cost low |
| Existing handlers assume `{logged: true}` shape | Medium | Update tests in Step 3.4; add `ok` field as standard |
| Breaking change for downstream consumers | Low | Phase 6 change-log documents the new `ok`/`reason` fields; existing success-path consumers still work |
| `assertWriteVisible` adds a re-read inside the same critical section | Low | readRegistry uses the LRU cache (within-process correct); Phase 6 closes cross-process |
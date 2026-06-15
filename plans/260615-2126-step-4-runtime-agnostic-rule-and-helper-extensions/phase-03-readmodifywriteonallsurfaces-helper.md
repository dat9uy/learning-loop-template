---
phase: 3
title: "readModifyWriteOnAllSurfaces — helper extension + gate-override refactor"
status: pending
priority: P2
effort: "1.5h"
dependencies:
  - "260615-1500-surfaces-helper-and-refactors"
  - "260615-1530-bash-gate-debate-stderr-override-recurrence"
---

# Phase 3: readModifyWriteOnAllSurfaces — helper extension + gate-override refactor

## Overview

Add `readModifyWriteOnAllSurfaces` to `core/surfaces.js` (the third and most complex of three missing helper functions). Refactor `core/gate-override.js#writeGateOverride` to use the new helper, eliminating the hand-rolled per-surface read-merge-write loop.

The read-modify-write pattern is the most nuanced of the three helper extensions: each surface's file is read independently, the caller's `modifier` function transforms the parsed content (or returns a fresh value if the file is missing/corrupt), and the result is written back atomically. The merge semantic is the caller's responsibility (the override marker merges `rule_ids`; a future consumer might overwrite or append).

## Requirements

Functional:
- New helper `readModifyWriteOnAllSurfaces(root, subpath, modifier)` in `core/surfaces.js`:
  - For each surface in `SURFACES`:
    1. Read `<root>/<surface>/coordination/<subpath>` (if exists). If missing or malformed, treat as `null`.
    2. Call `modifier(currentValue, { surface, root, subpath })` to compute the new value. The modifier may return:
       - An object → written atomically (write-temp + rename).
       - `null` or `undefined` → file is removed (`unlinkSync`).
       - A primitive → coerced to string and written as raw content (rare; opt-in via `options.raw`).
    3. If the modifier throws, log to stderr and skip the surface (fail-open).
  - Returns an array of `{ surface, action: "wrote" | "removed" | "skipped" }` per surface.
- Refactor `core/gate-override.js#writeGateOverride` to call the helper with a `modifier` that:
  - Parses the existing marker (if any).
  - Appends `rule_id` to `rule_ids` if not present.
  - Returns the merged marker with new `ttl_seconds`, `operator_note`, `created_at`.
- New test file `__tests__/surfaces-rmw.test.js` with 3 tests.

Non-functional:
- The helper's atomicity matches `writeToAllSurfaces` (write-temp + rename). The read half is best-effort.
- The override cache invalidation behavior is preserved: `writeGateOverride` calls `overrideCache.delete(root)` after the helper returns (matches the existing code at `gate-override.js:143`).
- The fail-open contract is preserved: a surface error does not abort the other surfaces; the audit append is unaffected.

## Architecture

### Helper signature

```js
/**
 * Per-surface read-modify-write with caller's modifier function.
 * The modifier is called once per surface with the current parsed value
 * (or null if missing/malformed) and a context object. The modifier returns
 * the new value (object to write, null/undefined to remove).
 *
 * @param {string} root
 * @param {string} subpath
 * @param {function} modifier — (currentValue, { surface, root, subpath }) => newValue | null
 * @returns {Array<{ surface, action: "wrote" | "removed" | "skipped" }>}
 */
export function readModifyWriteOnAllSurfaces(root, subpath, modifier) {
  const results = [];
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    let current = null;
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, "utf8");
        try {
          current = JSON.parse(content);
        } catch {
          current = null;
        }
      }
    } catch {
      // Treat as missing.
    }

    let newValue;
    try {
      newValue = modifier(current, { surface, root, subpath });
    } catch (err) {
      console.error(`surfaces.readModifyWriteOnAllSurfaces: modifier for ${surface} threw: ${err.message}`);
      results.push({ surface, action: "skipped" });
      continue;
    }

    if (newValue == null) {
      try {
        if (existsSync(path)) unlinkSync(path);
        results.push({ surface, action: "removed" });
      } catch (err) {
        console.error(`surfaces.readModifyWriteOnAllSurfaces: unlink ${path} failed: ${err.message}`);
        results.push({ surface, action: "skipped" });
      }
      continue;
    }

    const content = typeof newValue === "string" ? newValue : JSON.stringify(newValue, null, 2);
    const tmpPath = `${path}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, path);
      results.push({ surface, action: "wrote" });
    } catch (err) {
      console.error(`surfaces.readModifyWriteOnAllSurfaces: write ${path} failed: ${err.message}`);
      results.push({ surface, action: "skipped" });
    }
  }
  return results;
}
```

Imports to add to `surfaces.js`: `unlinkSync` (the rest are already imported).

### Refactored `writeGateOverride`

```js
import { readModifyWriteOnAllSurfaces, SURFACES } from "./surfaces.js";

export function writeGateOverride(root, { rule_id, ttl_seconds, operator_note }) {
  const created_at = new Date().toISOString();

  readModifyWriteOnAllSurfaces(root, OVERRIDE_FILE, (current) => {
    const ruleIds = [];
    if (current && Array.isArray(current.rule_ids)) {
      for (const id of current.rule_ids) {
        if (!ruleIds.includes(id)) ruleIds.push(id);
      }
    }
    if (!ruleIds.includes(rule_id)) ruleIds.push(rule_id);
    return {
      rule_ids: ruleIds,
      ttl_seconds,
      operator_note,
      created_at,
    };
  });

  // Invalidate cache so the next read sees the new marker immediately.
  overrideCache.delete(root);
  appendOverrideAudit(root, { rule_id, ttl_seconds, operator_note });
}
```

The function shrinks from 41 lines (105-145) to 19 lines. The per-surface loop, the inline `readFileSync`/`JSON.parse`/`mkdirSync`/`writeFileSync`/`renameSync` are all gone. The merge semantic lives in the modifier closure.

The `SURFACES` import remains in `gate-override.js` for `readGateOverride`'s per-surface iteration (Phase 3 only refactors `writeGateOverride`; `readGateOverride` continues to use `readFromAllSurfaces` would be a future refactor — out of scope here).

**Note on additive vs replacement merge:** the existing `writeGateOverride` merges `rule_ids` (additive) but refreshes `ttl_seconds`, `operator_note`, and `created_at` (replacement). The refactored version preserves this behavior. A future consumer (not the override marker) might want pure replacement; that's a different `modifier` shape and a future helper, not in scope.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/surfaces.js` — add `readModifyWriteOnAllSurfaces` (~40 lines). Add `unlinkSync` to the import.
- Modify: `tools/learning-loop-mcp/core/gate-override.js` — replace `writeGateOverride` body (~22 lines removed, 19 added). Remove the `writeFileSync`, `renameSync`, `mkdirSync`, `readFileSync` imports (no longer used in this file). Keep `statSync`, `appendFileSync`, `existsSync` for `readGateOverride` and the audit appender.
- Create: `tools/learning-loop-mcp/__tests__/surfaces-rmw.test.js` — 3 tests for the new helper.
- No other files touched.

## Implementation Steps (TDD)

1. **Append 3 RED tests to `__tests__/surfaces-rmw.test.js`** (new file):
   - Test 1: `readModifyWriteOnAllSurfaces` reads the existing value, calls the modifier with it, writes the modifier's return value atomically. Verify by writing a seed value, calling the helper with a modifier that adds a field, asserting the result has the new field.
   - Test 2: `readModifyWriteOnAllSurfaces` returns `null` from the modifier → file is removed. Verify by pre-creating a file, calling the helper with a modifier that returns `null`, asserting the file no longer exists.
   - Test 3: `readModifyWriteOnAllSurfaces` fail-open on modifier throw. Verify by calling with a modifier that throws; expect the surface to be marked `skipped` (not aborted) and the other surfaces to proceed.
2. **Run `pnpm test -- surfaces-rmw`**. Expect 3 RED.
3. **Add `readModifyWriteOnAllSurfaces` to `core/surfaces.js`.** Append after `readJsonlFromAllSurfaces`. Add `unlinkSync` to the existing import.
4. **Run `pnpm test -- surfaces-rmw`**. Expect 3 GREEN.
5. **Refactor `core/gate-override.js#writeGateOverride`.** Replace the per-surface loop with a `readModifyWriteOnAllSurfaces` call. The modifier is the merge closure. Remove the now-unused imports.
6. **Run `pnpm test -- gate-override`**. Expect 13 GREEN (the existing 13 tests cover the read, write, merge, audit, cache, tool rejection, etc.).
7. **Run the full test suite.** `pnpm test` — expect 958/959 (1 skipped). No regressions.
8. **Whole-plan consistency check.** `grep -n "writeFileSync\|renameSync" tools/learning-loop-mcp/core/gate-override.js` — expect 0 matches (the imports are removed). The audit appender's `appendFileSync` remains.

## Success Criteria

- [ ] `__tests__/surfaces-rmw.test.js` exists with 3 tests, all GREEN.
- [ ] `core/surfaces.js` exports `readModifyWriteOnAllSurfaces` with the documented contract.
- [ ] `core/gate-override.js#writeGateOverride` uses the helper; the function body is ≤20 lines.
- [ ] `pnpm test -- surfaces-rmw` shows 3 GREEN.
- [ ] `pnpm test -- gate-override` shows 13 GREEN (no regressions).
- [ ] `pnpm test` shows 958/959 (1 skipped). No regressions in any other test file.
- [ ] `writeFileSync` and `renameSync` are removed from `gate-override.js` imports.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The modifier's merge behavior diverges from the existing inline merge (e.g., the existing code preserves `created_at` from the previous marker, the new code uses the current timestamp) | The existing code at `gate-override.js:106, 130` uses `created_at = new Date().toISOString()` (always the current call's time, not the previous marker's). The refactored version preserves this. |
| The cache invalidation order is wrong: if the helper fails for `.factory`, the `.claude` write succeeded; should the cache be invalidated? | The existing code invalidates the cache after the loop completes. The refactored version does the same. The cache key is the root, not per-surface, so partial success should still invalidate (the next read will see the new state on `.claude`). |
| The modifier's `surface` and `root` context args are not used by the override modifier (the modifier only uses `current`) | That's fine; the context is for future consumers. The modifier signature is `(current, ctx) => newValue` regardless of whether `ctx` is used. |
| `unlinkSync` is not in the existing `surfaces.js` imports; adding it might regress other helpers | Verified by reading the import block. The existing 4 helpers use `readFileSync`, `writeFileSync`, `renameSync`, `mkdirSync`, `existsSync`. Adding `unlinkSync` is a single new import; no other helper is affected. |

## Security Considerations

- No attack surface change. The helper writes to existing surface coordination paths; the gate already authorizes these writes.
- The modifier is a closure passed by the caller (`gate-override.js`). The caller is internal code; no untrusted modifier source.
- The fail-open contract is preserved: a surface error does not leak information to the other surfaces (each `try/catch` is per-surface).
- The `unlinkSync` path is only triggered if the modifier returns `null`. The override marker never returns `null` (it always returns an object), so the unlink branch is dead code for the override use case. It exists for future consumers (e.g., a "clear override" tool).

## Next Steps

After Phase 3 ships:
- All 3 helper extensions are complete. The Simplification Cascade is 100% applied to Step 2's code.
- Phase 4: regression test asserts the full pattern (helper covers 100% of cross-surface operations; no hand-rolled loops remain in `core/`).
- The CLEANUP backlog items 2.1, 2.2, 2.4 are auto-resolved by the Phases 1-3 refactors.

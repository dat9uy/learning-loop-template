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

Add `readModifyWriteOnAllSurfaces` to `core/surfaces.js` (the third and most complex of three missing helper functions). Refactor `core/gate-override.js#writeGateOverride` AND `core/gate-override.js#readGateOverride` to use the new helper, eliminating both hand-rolled per-surface loops.

The read-modify-write pattern is the most nuanced of the three helper extensions: each surface's file is read independently, the caller's `modifier` function transforms the parsed content (or returns a fresh value if the file is missing/corrupt), and the result is written back atomically. The merge semantic is the caller's responsibility (the override marker merges `rule_ids`; a future consumer might overwrite or append).

**`readGateOverride` refactor (added in red-team review):** the original plan only refactored `writeGateOverride`. But Phase 4's regression test "no hand-rolled `for (const surface of SURFACES)` loops in `core/`" would have caught `readGateOverride`'s existing loop at `gate-override.js:49`. To keep Phase 4's test honest, Phase 3 refactors both functions. `readGateOverride` becomes a 1-line call to a new `readAllOverlays` helper (or uses the existing `readFromAllSurfaces` + merge in-place).

## Requirements

Functional:
- New helper `readModifyWriteOnAllSurfaces(root, subpath, modifier, options)` in `core/surfaces.js`:
  - For each surface in `SURFACES`:
    1. Read `<root>/<surface>/coordination/<subpath>` (if exists). If missing or malformed, treat as `null`.
    2. Call `modifier(currentValue)` to compute the new value. The modifier may return:
       - An object → written atomically (write-temp + rename).
       - A string → written as raw content.
       - `null` or `undefined` → NO-OP by default; file is removed ONLY if `options.removeOnNull: true` is set explicitly (opt-in for safety).
    3. If the modifier throws, log to stderr (PII-sanitized: surface + basename only) and skip the surface (fail-open).
  - Returns an array of `{ surface, action: "wrote" | "removed" | "skipped" }` per surface.
- Refactor `core/gate-override.js#writeGateOverride` to call the helper with a `modifier` that:
  - Parses the existing marker (if any).
  - Appends `rule_id` to `rule_ids` if not present.
  - Returns the merged marker with new `ttl_seconds`, `operator_note`, `created_at`.
- New test file `__tests__/surfaces-rmw.test.js` with 3 tests.

Non-functional:
- The helper's atomicity matches `writeToAllSurfaces` (write-temp + rename) **per surface**. Cross-surface atomicity is NOT provided; concurrent calls to the helper for the same `subpath` may interleave. Callers needing cross-surface consistency must serialize.
- The override cache invalidation behavior is preserved: `writeGateOverride` calls `overrideCache.delete(root)` after the helper returns (matches the existing code at `gate-override.js:143`).
- The fail-open contract is preserved: a surface error does not abort the other surfaces; the audit append is unaffected.
- **PII-safe logging:** `console.error` calls log only `surface` and `basename(path)`, not the full user-derived `subpath`.

## Architecture

### Helper signature

```js
/**
 * Per-surface read-modify-write with caller's modifier function.
 * The modifier is called once per surface with the current parsed value
 * (or null if missing/malformed) and a context object. The modifier returns
 * the new value (object to write, null/undefined to remove).
 *
 * Atomicity: each surface is atomic (write-temp + rename). Cross-surface
 * consistency is the caller's responsibility (no transaction across surfaces).
 *
 * @param {string} root
 * @param {string} subpath
 * @param {function} modifier — (currentValue) => newValue | null
 * @param {object} [options]
 * @param {boolean} [options.removeOnNull=false] — if true, modifier returning
 *   null/undefined DELETES the existing file. Default false: no-op (safer).
 *   Override only when the caller's semantic explicitly is "remove on null".
 * @returns {Array<{ surface, action: "wrote" | "removed" | "skipped" }>}
 */
export function readModifyWriteOnAllSurfaces(root, subpath, modifier, options = {}) {
  const { removeOnNull = false } = options;
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
      newValue = modifier(current);
    } catch (err) {
      // Log only surface + basename (PII-safe: avoids leaking user-derived subpath).
      console.error(`surfaces.readModifyWriteOnAllSurfaces: modifier for ${surface}/${basename(path)} threw: ${err.message}`);
      results.push({ surface, action: "skipped" });
      continue;
    }

    if (newValue == null) {
      if (!removeOnNull) {
        // Default: no-op on null (safer than unlink). Caller opts in to unlink via options.removeOnNull.
        results.push({ surface, action: "skipped" });
        continue;
      }
      try {
        if (existsSync(path)) unlinkSync(path);
        results.push({ surface, action: "removed" });
      } catch (err) {
        console.error(`surfaces.readModifyWriteOnAllSurfaces: unlink ${surface}/${basename(path)} failed: ${err.message}`);
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
      console.error(`surfaces.readModifyWriteOnAllSurfaces: write ${surface}/${basename(path)} failed: ${err.message}`);
      results.push({ surface, action: "skipped" });
    }
  }
  return results;
}
```

Imports to add to `surfaces.js`: `unlinkSync`, `basename` (the rest are already imported).

**Removed context args (YAGNI):** the original plan's modifier signature was `(current, { surface, root, subpath }) => newValue`. The only caller (`writeGateOverride`) ignored the context. The signature is now `(current) => newValue`. KISS.

### Refactored `writeGateOverride`

```js
import { readModifyWriteOnAllSurfaces, readFromAllSurfaces, SURFACES } from "./surfaces.js";

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
  }, { removeOnNull: false });  // override marker never returns null; explicit safety.

  // Invalidate cache so the next read sees the new marker immediately.
  overrideCache.delete(root);
  appendOverrideAudit(root, { rule_id, ttl_seconds, operator_note });
}

export function readGateOverride(root) {
  // First-write-wins semantic: iterate surfaces in declared order, return
  // the first valid marker. Hand-rolled loop was 12 lines; helper call is 1.
  for (const { parsed } of readFromAllSurfaces(root, OVERRIDE_FILE)) {
    if (parsed && Array.isArray(parsed.rule_ids)) return parsed;
  }
  return null;
}
```

`writeGateOverride` shrinks from 41 lines to 19 lines. `readGateOverride` shrinks from 12 lines to 5 lines (the for-of is gone; the helper iterates internally). Both functions now satisfy Phase 4's "no hand-rolled `for (const surface of SURFACES)` loops in `core/`" assertion.

The `SURFACES` import is no longer used in `gate-override.js` (both `read` and `write` go through helpers). Remove from imports.

**Note on additive vs replacement merge:** the existing `writeGateOverride` merges `rule_ids` (additive) but refreshes `ttl_seconds`, `operator_note`, and `created_at` (replacement). The refactored version preserves this behavior. A future consumer (not the override marker) might want pure replacement; that's a different `modifier` shape and a future helper, not in scope.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/surfaces.js` — add `readModifyWriteOnAllSurfaces` (~40 lines). Add `unlinkSync` to the import.
- Modify: `tools/learning-loop-mcp/core/gate-override.js` — replace `writeGateOverride` body (~22 lines removed, 19 added) AND `readGateOverride` body (~7 lines removed, 5 added). Remove the `writeFileSync`, `renameSync`, `mkdirSync`, `readFileSync` imports (no longer used in this file). Remove the `SURFACES` import (no longer used in this file). Keep `appendFileSync` for the audit appender.
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
5. **Refactor `core/gate-override.js#writeGateOverride` and `readGateOverride`.** Replace the per-surface loop in `writeGateOverride` with a `readModifyWriteOnAllSurfaces` call. Replace the per-surface loop in `readGateOverride` with a `readFromAllSurfaces` call (first-valid-wins). Remove the now-unused imports (`writeFileSync`, `renameSync`, `mkdirSync`, `readFileSync`, `SURFACES`).
6. **Run `pnpm test -- gate-override`**. Expect 12 GREEN (the existing 12 tests cover the read, write, merge, audit, cache, tool rejection, etc.; count verified by `grep -cE "^\s*await test\("`).
7. **Run the full test suite.** `pnpm test` — expect 966/967 (1 skipped). No regressions. (Baseline 957/958 + 6 helper tests.)
8. **Whole-plan consistency check.** `grep -n "writeFileSync\|renameSync" tools/learning-loop-mcp/core/gate-override.js` — expect 0 matches (the imports are removed). `grep -n "for (const surface of SURFACES)" tools/learning-loop-mcp/core/gate-override.js` — expect 0 matches (both loops gone). The audit appender's `appendFileSync` remains. **Final `surfaces.js` import line (asserted by `grep -n "import.*node:fs" tools/learning-loop-mcp/core/surfaces.js`):** `{ readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, unlinkSync }` (7 imports, all from `node:fs`). Plus `import { basename } from "node:path"` (added in Phase 1 for PII-safe logging).

## Success Criteria

- [ ] `__tests__/surfaces-rmw.test.js` exists with 3 tests, all GREEN.
- [ ] `core/surfaces.js` exports `readModifyWriteOnAllSurfaces` with the documented contract.
- [ ] `core/gate-override.js#writeGateOverride` uses the helper; the function body is ≤20 lines.
- [ ] `pnpm test -- surfaces-rmw` shows 3 GREEN.
- [ ] `pnpm test -- gate-override` shows 12 GREEN (no regressions).
- [ ] `pnpm test` shows 966/967 (1 skipped). No regressions in any other test file.
- [ ] `writeFileSync`, `renameSync`, `mkdirSync`, `readFileSync`, and `SURFACES` are removed from `gate-override.js` imports.
- [ ] `gate-override.js` has no `for (const surface of SURFACES)` loops in either `readGateOverride` or `writeGateOverride`.

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

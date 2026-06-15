---
phase: 1
title: "appendToAllSurfaces — helper extension + gate-decision-log refactor"
status: completed
priority: P2
effort: "1h"
dependencies:
  - "260615-1500-surfaces-helper-and-refactors"
  - "260615-1530-bash-gate-debate-stderr-override-recurrence"
---

# Phase 1: appendToAllSurfaces — helper extension + gate-decision-log refactor

## Overview

Add `appendToAllSurfaces` to `core/surfaces.js` (the first of three missing helper functions identified by the planning-order report § Q3). Refactor `core/gate-decision-log.js#appendDecisionLog` to use the new helper, eliminating the hand-rolled `for ... appendFileSync` loop. This is the first of three helper-extension phases (1/3) that complete the Simplification Cascade thesis.

The append semantics differ from the existing `writeToAllSurfaces`: append uses `appendFileSync` per surface (true append, never overwrites existing content), whereas `writeToAllSurfaces` uses write-temp + rename (atomic overwrite). Both are correct for their use cases; they are different operations.

## Requirements

Functional:
- New helper `appendToAllSurfaces(root, subpath, line)` in `core/surfaces.js`:
  - Appends `line + "\n"` to `<root>/<surface>/coordination/<subpath>` for every surface in `SURFACES`.
  - Creates the parent directory via `mkdirSync({ recursive: true })` if missing.
  - Best-effort: per-surface errors are swallowed and logged to stderr (matches the existing fail-open pattern in `gate-decision-log.js`).
- Refactor `core/gate-decision-log.js#appendDecisionLog` to call `appendToAllSurfaces` instead of the hand-rolled loop.
- New test file `__tests__/surfaces-append.test.js` with 3 tests.

Non-functional:
- The helper is a pure addition to `core/surfaces.js`; existing exports (`SURFACES`, `getAllCoordinationPaths`, `writeToAllSurfaces`, `readFromAllSurfaces`) are unchanged.
- The refactor preserves the existing decision log's append-only contract (lines are added, never replaced).
- The fail-open contract is preserved: a surface error does not abort the other surfaces; the gate's exit code is not affected.

## Architecture

### Helper signature

```js
/**
 * Append a line to all surface coordination files (true append, never overwrites).
 * Creates the parent directory if missing. Best-effort per surface: one
 * failure does not abort the others; errors are logged to stderr.
 * @param {string} root — project root directory
 * @param {string} subpath — relative path under coordination/
 * @param {string} line — content to append (a single line; "\n" is added)
 */
export function appendToAllSurfaces(root, subpath, line) {
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
    } catch (err) {
      // Log only surface + basename (PII-safe: avoids leaking user-derived subpath).
      console.error(`surfaces.appendToAllSurfaces: append to ${surface}/${basename(path)} failed: ${err.message}`);
    }
  }
}
```

### Refactored `appendDecisionLog`

```js
import { appendToAllSurfaces, SURFACES } from "./surfaces.js";

export function appendDecisionLog(root, entry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    command_prefix: oneLinePrefix(entry.command_prefix),
    rule_id: entry.rule_id ?? null,
    decision: entry.decision,
    reason: entry.reason,
    matched_pattern: entry.matched_pattern ?? null,
    skipped_via_override: entry.skipped_via_override ?? false,
  });

  appendToAllSurfaces(root, DECISION_LOG_FILE, line);
}
```

The function shrinks from 47 lines to 18 lines; the `for` loop and `mkdirSync`/`appendFileSync` calls are gone. The fail-open contract is preserved (the helper logs to stderr, the gate's exit code is unaffected).

### Spec alignment (note for Step 2's plan)

Step 2's plan (`plans/260615-1530-.../plan.md`) § Cross-surface discipline said "write-temp + rename per call for atomicity". The implementation uses `appendFileSync` (true append). The appendFileSync is **correct** for a log file (atomic at the line level; concurrent appends from a single Node process are serialized by the event loop). The plan's spec text is now aligned with the code via this helper: the helper's contract is "true append, never overwrite", which matches the decision log's intent.

A follow-up edit in Phase 4 (or CLEANUP) annotates Step 2's plan § Cross-surface discipline to reference the helper's append semantics.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/surfaces.js` — add `appendToAllSurfaces` (~12 lines).
- Modify: `tools/learning-loop-mcp/core/gate-decision-log.js` — replace hand-rolled loop with `appendToAllSurfaces` call (~10 lines removed).
- Create: `tools/learning-loop-mcp/__tests__/surfaces-append.test.js` — 3 tests for the new helper.
- No other files touched.

## Implementation Steps (TDD)

1. **Read `core/surfaces.js` end-to-end** to confirm the existing export style and import set. (Already read in plan-prep — quick re-read only.)
2. **Append 3 RED tests to `__tests__/surfaces-append.test.js`** (new file, follows the `surfaces.test.js` style):
   - Test 1: `appendToAllSurfaces` creates a file on each surface when the parent dir is missing. Verify by `existsSync` per surface and `readFileSync` to assert content.
   - Test 2: `appendToAllSurfaces` appends to an existing file (does not overwrite). Pre-write 1 line, call the helper, assert 2 lines.
   - Test 3: `appendToAllSurfaces` adds `"\n"` after each line; the log is newline-separated.
3. **Run `pnpm test -- surfaces-append`**. Expect 3 RED (helper does not exist yet).
4. **Add `appendToAllSurfaces` to `core/surfaces.js`.** Append the function after the existing `readFromAllSurfaces`. Add the necessary imports: `import { appendFileSync } from "node:fs"` and `import { basename } from "node:path"` (the latter for PII-safe error logging).
5. **Run `pnpm test -- surfaces-append`**. Expect 3 GREEN.
6. **Refactor `core/gate-decision-log.js#appendDecisionLog`.** Replace the `for` loop with a single call to `appendToAllSurfaces(root, DECISION_LOG_FILE, line)`. Remove the now-unused `appendFileSync`, `mkdirSync`, `SURFACES` imports. Keep the `existsSync`/`readFileSync` imports for `readDecisionLog` (Phase 2's refactor).
7. **Run `pnpm test -- gate-decision-log`**. Expect 6 GREEN (all existing decision log tests still pass — the refactor is behavior-preserving; count verified by `grep -cE "^\s*await test\("` on the test file).
8. **Run the full test suite.** `pnpm test` — expect 960/961 (1 skipped, the existing skip). No regressions. (Baseline 957/958 + 3 new helper tests.)
9. **Whole-plan consistency check.** `grep -n "appendFileSync\|appendToAllSurfaces" tools/learning-loop-mcp/core/` — confirm the helper is in `surfaces.js`; confirm `gate-decision-log.js` no longer imports `appendFileSync`.

## Success Criteria

- [x] `__tests__/surfaces-append.test.js` exists with 3 tests, all GREEN.
- [x] `core/surfaces.js` exports `appendToAllSurfaces` with the documented contract.
- [x] `core/gate-decision-log.js#appendDecisionLog` uses `appendToAllSurfaces`; the function body is ≤20 lines.
- [x] `pnpm test -- surfaces-append` shows 3 GREEN.
- [x] `pnpm test -- gate-decision-log` shows 6 GREEN (no regressions).
- [x] `pnpm test` shows 960/961 (1 skipped). No regressions in any other test file.
- [x] `grep -n "appendFileSync" tools/learning-loop-mcp/core/gate-decision-log.js` returns 0 matches (the import is removed).

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The helper's `console.error` is captured by the gate's stderr contract (the bash gate uses stderr for soft warnings) | Step 2's bash-gate test (`bash-gate-decision-visibility.test.js`) asserts stderr is empty on the OK path; the helper's `console.error` only fires on per-surface failures (rare). If a test fires the helper's error path, the test will see a stderr message. Verify by reading the existing fail-open test (`gate-decision-log.test.js` chmod 0o444 test). |
| The refactor changes the helper-call order: previously the loop was synchronous and called each surface; now `appendToAllSurfaces` does the same internally. The order is the same (.claude then .factory). | The 5 existing decision log tests cover the order implicitly (the cross-surface read test asserts both surfaces are read). No test pins the write order specifically. |
| `mkdirSync({ recursive: true })` already exists in `writeToAllSurfaces`; reusing the pattern is safe | The 2 functions diverge in their atomicity (write-temp+rename vs append) but share the dir-creation step. Verified by reading `writeToAllSurfaces` lines 30-37. |

## Security Considerations

- No attack surface change. The helper writes to existing surface coordination paths; the gate already authorizes these writes.
- The fail-open contract is preserved: a surface error does not leak information to the other surfaces (each `try/catch` is per-surface).
- The helper's `console.error` is the only new output surface; it includes the path of the failed file, which is the project-relative path. No new PII or sensitive data is leaked.

## Next Steps

After Phase 1 ships:
- Phase 2: `readJsonlFromAllSurfaces` + refactor `gate-decision-log.js#readDecisionLog`.
- Phase 3: `readModifyWriteOnAllSurfaces` + refactor `gate-override.js#writeGateOverride`.
- Phase 4: regression test asserts the full pattern (helper covers 100% of cross-surface operations).

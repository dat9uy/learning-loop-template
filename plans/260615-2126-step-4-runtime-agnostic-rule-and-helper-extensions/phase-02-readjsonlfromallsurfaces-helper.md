---
phase: 2
title: "readJsonlFromAllSurfaces — helper extension + decision-log read refactor"
status: pending
priority: P2
effort: "1h"
dependencies:
  - "260615-1500-surfaces-helper-and-refactors"
  - "260615-1530-bash-gate-debate-stderr-override-recurrence"
---

# Phase 2: readJsonlFromAllSurfaces — helper extension + decision-log read refactor

## Overview

Add `readJsonlFromAllSurfaces` to `core/surfaces.js` (the second of three missing helper functions). Refactor `core/gate-decision-log.js#readDecisionLog` to use the new helper, eliminating the hand-rolled `readAllLogContents` function. The decision log is JSONL (one entry per line); the existing `readFromAllSurfaces` helper returns parsed single-object JSON, which doesn't fit. The new helper handles JSONL parsing + cross-surface dedup + sort-by-ts.

The dedup + sort behavior is currently in `readDecisionLog`'s call site. It moves into the helper as `options` parameters, so future JSONL consumers (e.g., the recurrence tracker in Step 2) can use the same helper.

## Requirements

Functional:
- New helper `readJsonlFromAllSurfaces(root, subpath, options)` in `core/surfaces.js`:
  - Reads `<root>/<surface>/coordination/<subpath>` for every surface in `SURFACES`.
  - Splits each file by `\n`, trims, filters empty lines, parses each line as JSON.
  - Returns a flat array of parsed entries.
  - **Options**:
    - `dedupe` (default: `true`): dedupes entries by `ts + command_prefix + rule_id` (matches `readDecisionLog`'s current key).
    - `since` (default: `0`): ISO timestamp; entries with `ts < since` are filtered.
    - `sort` (default: `"asc"`): sort by `ts` ascending; pass `"none"` to skip.
  - Best-effort: per-surface errors (missing file, malformed JSONL line) are swallowed.
- Refactor `core/gate-decision-log.js#readDecisionLog` to call `readJsonlFromAllSurfaces` with the same dedup + since options.
- The `readAllLogContents` and `parseLogLines` private functions in `gate-decision-log.js` are removed.
- New test file `__tests__/surfaces-read-jsonl.test.js` with 3 tests.

Non-functional:
- The existing 5 decision log tests in `__tests__/gate-decision-log.test.js` continue to pass without modification.
- The helper's output shape is identical to `readDecisionLog`'s current output: `Array<{ ts, command_prefix, rule_id, decision, reason, matched_pattern, skipped_via_override }>`, sorted by `ts` ascending.
- The dedup key is preserved (matches the existing `ts::command_prefix::rule_id` key).

## Architecture

### Helper signature

```js
/**
 * Read JSONL from all surface coordination files, with dedup and sort.
 * Each line of each surface's file is parsed as JSON; malformed lines
 * are skipped. Entries are deduped across surfaces by ts + command_prefix
 * + rule_id (matches the decision log's existing key).
 * @param {string} root
 * @param {string} subpath
 * @param {object} options
 * @param {boolean} options.dedupe — default true
 * @param {string|number} options.since — ISO timestamp or epoch ms; default 0
 * @param {"asc"|"none"} options.sort — default "asc"
 * @returns {Array}
 */
export function readJsonlFromAllSurfaces(root, subpath, options = {}) {
  const { dedupe = true, since = 0, sort = "asc" } = options;
  const sinceMs = typeof since === "string" ? new Date(since).getTime() : since;
  const seen = new Set();
  const entries = [];

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    let content;
    try {
      if (!existsSync(path)) continue;
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (sinceMs && new Date(parsed.ts).getTime() < sinceMs) continue;
      if (dedupe) {
        const key = `${parsed.ts}::${parsed.command_prefix ?? ""}::${parsed.rule_id ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      entries.push(parsed);
    }
  }

  if (sort === "asc") {
    entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }
  return entries;
}
```

### Refactored `readDecisionLog`

```js
import { readJsonlFromAllSurfaces } from "./surfaces.js";

export function readDecisionLog(root, options = {}) {
  return readJsonlFromAllSurfaces(root, DECISION_LOG_FILE, {
    dedupe: true,
    since: options.since ?? 0,
    sort: "asc",
  });
}
```

The function shrinks from 17 lines to 7 lines. The `readAllLogContents`, `parseLogLines`, and the inline `seen` set all move into the helper.

### Why JSONL is a separate helper (not a flag on `readFromAllSurfaces`)

The existing `readFromAllSurfaces` returns `{ surface, content, parsed }` per surface — the parsed field is a single JSON object, not an array. JSONL is a different file format (line-delimited, not a single blob). A flag on the existing helper would muddy the contract ("is `parsed` an object or an array of objects?"). A new helper is cleaner.

The same precedent as `writeToAllSurfaces` (single-object) vs `appendToAllSurfaces` (line-based) in Phase 1: separate helpers for different file formats.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/surfaces.js` — add `readJsonlFromAllSurfaces` (~30 lines).
- Modify: `tools/learning-loop-mcp/core/gate-decision-log.js` — replace `readDecisionLog` body (15 lines removed, 7 added). Remove `readAllLogContents`, `parseLogLines`. Remove the `readFileSync`, `existsSync` imports (no longer used in this file).
- Create: `tools/learning-loop-mcp/__tests__/surfaces-read-jsonl.test.js` — 3 tests for the new helper.
- No other files touched.

## Implementation Steps (TDD)

1. **Append 3 RED tests to `__tests__/surfaces-read-jsonl.test.js`** (new file):
   - Test 1: `readJsonlFromAllSurfaces` parses each line of each surface's file as JSON, returns a flat array sorted by `ts` ascending.
   - Test 2: `readJsonlFromAllSurfaces` dedupes by `ts + command_prefix + rule_id` (write the same entry to both surfaces; expect 1 result).
   - Test 3: `readJsonlFromAllSurfaces` respects the `since` option (write 2 entries; pass `since = middle.ts`; expect 1 result).
2. **Run `pnpm test -- surfaces-read-jsonl`**. Expect 3 RED.
3. **Add `readJsonlFromAllSurfaces` to `core/surfaces.js`.** Append after `readFromAllSurfaces`. The `existsSync` and `readFileSync` imports are already present.
4. **Run `pnpm test -- surfaces-read-jsonl`**. Expect 3 GREEN.
5. **Refactor `core/gate-decision-log.js#readDecisionLog`.** Replace the function body with a single call to `readJsonlFromAllSurfaces`. Remove `readAllLogContents`, `parseLogLines`, the `seen` Set, the inline sort. Remove the now-unused `readFileSync` and `existsSync` imports.
6. **Run `pnpm test -- gate-decision-log`**. Expect 5 GREEN.
7. **Run the full test suite.** `pnpm test` — expect 955/956 (1 skipped). No regressions.
8. **Whole-plan consistency check.** `grep -n "readAllLogContents\|parseLogLines" tools/learning-loop-mcp/core/gate-decision-log.js` — expect 0 matches (both private functions are removed).

## Success Criteria

- [ ] `__tests__/surfaces-read-jsonl.test.js` exists with 3 tests, all GREEN.
- [ ] `core/surfaces.js` exports `readJsonlFromAllSurfaces` with `dedupe`, `since`, `sort` options.
- [ ] `core/gate-decision-log.js#readDecisionLog` is ≤10 lines and uses the helper.
- [ ] `pnpm test -- surfaces-read-jsonl` shows 3 GREEN.
- [ ] `pnpm test -- gate-decision-log` shows 5 GREEN (no regressions).
- [ ] `pnpm test` shows 955/956 (1 skipped). No regressions in any other test file.
- [ ] `readAllLogContents` and `parseLogLines` are removed from `gate-decision-log.js`.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The dedup key changes (`ts::command_prefix::rule_id` vs a different key) and breaks the cross-surface test in `gate-decision-log.test.js` | The existing key is preserved verbatim. Verified by reading `gate-decision-log.js:95` and copying the key format into the helper. |
| The sort order changes (ascending by `ts` vs the existing order) and breaks the test that asserts a specific order | The existing `readDecisionLog` already sorts ascending (`gate-decision-log.js:102`). The helper preserves the same comparator. |
| The `since` option's `new Date(since).getTime()` parsing fails for an invalid string (e.g., the user passes `"2026-13-99"`) | The existing `readDecisionLog` does the same (`gate-decision-log.js:88`). The fail-open behavior (skip entries with `ts < NaN`) is preserved. |

## Security Considerations

- No attack surface change. The helper reads from existing surface coordination paths; the gate already authorizes these reads.
- The dedup key uses `command_prefix`, which is truncated to 80 chars and trimmed (`oneLinePrefix` in `gate-decision-log.js`). The helper does not re-validate; it relies on the caller's input shape. This is the same trust boundary as today.
- Malformed JSONL lines are silently skipped (matches the existing `parseLogLines` behavior at `gate-decision-log.js:55-61`). No new error surface.

## Next Steps

After Phase 2 ships:
- Phase 3: `readModifyWriteOnAllSurfaces` + refactor `gate-override.js#writeGateOverride`.
- Phase 4: regression test asserts the full pattern (helper covers 100% of cross-surface operations).

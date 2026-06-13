---
title: "Phase 1 — Fix session_id discoverability"
description: "Surface session_id in compact output, warm-tier hints, and tool docs so assistants stop client-side filtering."
status: completed
priority: P1
effort: 2h
branch: main
tags: [mcp, meta-state, discoverability, session_id]
created: 2026-06-14
---

## Context Links

- Debug report: `plans/reports/debugger-260614-0207-session-06085a38-meta-state-process-gaps.md`
- Plan overview: `plans/260614-0222-fix-session-id-discoverability/plan.md`
- Related code:
  - `tools/learning-loop-mcp/core/loop-introspect.js:392` — `summarize()`
  - `tools/learning-loop-mcp/core/loop-introspect.js:90` — `DISCOVERABILITY_HINTS`
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js:57` — tool description
  - `AGENTS.md:99` — meta_state_list filter table

## Overview

Close the `session_id` discoverability gap identified in the debug report. The assistant in session `06085a38` filtered `meta_state_list({ compact: true })` client-side by `session_id`, but compact output strips `session_id`. It never discovered the first-class `session_id` filter on the tool itself.

## Key Insights

- `summarize()` in `loop-introspect.js` omits `session_id` from compact output. It is a narrow-query key and should be surfaced.
- `DISCOVERABILITY_HINTS` has 14 strings; warm-tier tests assert exactly 14. Adding a hint changes this count to 15.
- `meta-state-list-tool.js` already has a `session_id` schema filter at line 62, but the tool description at line 57 only advertises `id` and `ref_by`/`ref_field` as narrow-query filters.
- `AGENTS.md` line 99 mentions `meta_state_list` is filterable by `entry_kind`, `status`, `category`, etc., but does not call out `session_id` explicitly.

## Requirements

### Functional

1. `summarize()` must include `session_id` in compact output when present on the entry.
2. `loop_describe` warm tier must include a discoverability hint telling assistants to use `meta_state_list({ session_id: '...' })` as the narrow query and not to client-side filter compact output.
3. `meta_state_list` tool description must advertise `session_id` as a narrow-query filter alongside `id` and `ref_by`/`ref_field`.
4. `AGENTS.md` table of `meta_state_list` filters must mention `session_id`.

### Non-functional

- Keep individual code files under 200 lines.
- Follow existing code style and comment conventions.
- Use conventional commits when later asked to commit.
- All changes additive; no existing behavior removed.

## Architecture

No new components. Four surgical edits to existing files plus test updates.

```
┌─────────────────────────────────────┐
│  meta_state_list({ compact: true }) │
│  → toCompact() → summarize()        │
│  → now includes session_id            │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  loop_describe({ tier: 'warm' })    │
│  → buildDiscoverabilityHints()      │
│  → new hint #15 about session_id    │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  meta_state_list tool description   │
│  → mentions session_id narrow query │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  AGENTS.md filter table             │
│  → adds session_id column/row        │
└─────────────────────────────────────┘
```

## Related Code Files

### Files to modify

| File | Lines | Change |
|------|-------|--------|
| `tools/learning-loop-mcp/core/loop-introspect.js` | ~392-454 | Add `session_id` to `summarize()` compact output |
| `tools/learning-loop-mcp/core/loop-introspect.js` | ~90-105 | Add hint #15 about `session_id` narrow query |
| `tools/learning-loop-mcp/tools/meta-state-list-tool.js` | ~57 | Update description to advertise `session_id` filter |
| `AGENTS.md` | ~99 | Update filter table to mention `session_id` |
| `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` | ~14, 88, 94 | Update hint count from 14 to 15; add substring check for new hint |
| `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` | ~104-130 | Add test verifying `session_id` is present in compact output when present on entry |
| `tools/learning-loop-mcp/__tests__/meta-state-session-id-roundtrip.test.js` | ~95-115 | Assert compact output includes `session_id` after filtering |

### Files to read for context

- `tools/learning-loop-mcp/core/loop-introspect.js` — full file
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — full file
- `AGENTS.md` — lines 95-105

## Implementation Steps

1. **Edit `summarize()` in `loop-introspect.js`**
   - After line 430 (`if (entry.resolved_at) compact.resolved_at = entry.resolved_at;`), add:
     ```js
     if (entry.session_id) compact.session_id = entry.session_id;
     ```
   - This ensures `session_id` flows into compact output via `toCompact()` which destructures from `summarize()`.

2. **Add warm-tier discoverability hint in `loop-introspect.js`**
   - Append to `DISCOVERABILITY_HINTS` array (after the existing 14th hint about narrow query):
     ```js
     "Narrow query by session_id: use `meta_state_list({ session_id: '...' })` directly. Do not filter `compact: true` output client-side — compact output is for display, not for client-side filtering.",
     ```
   - This becomes hint index 14 (0-based), making the array length 15.

3. **Update `meta_state_list` tool description in `meta-state-list-tool.js`**
   - Current description at line 57 says: "The narrow-query filters `id` (string|string[]) and `ref_by`+`ref_field` are the preferred way..."
   - Change to: "The narrow-query filters `id` (string|string[]), `session_id`, and `ref_by`+`ref_field` are the preferred way..."

4. **Update `AGENTS.md` filter table**
   - At line 99, the table row for `meta_state_list` says "filterable by `entry_kind`, `status`, `category`, etc.`"
   - Change to: "filterable by `entry_kind`, `status`, `category`, `session_id`, etc.`"

5. **Update `loop-describe-warm-tier.test.js`**
   - Line 14: change `assert.strictEqual(parsed.discoverability_hints.length, 14);` to `15`.
   - Line 88: change `assert.strictEqual(parsed.discoverability_hints.length, 14);` to `15`.
   - Line 94: change `assert.strictEqual(hints.length, 14);` to `15`.
   - In the "each hint contains documented substrings" test, add assertion for the new hint (index 14):
     ```js
     const sessionIdHint = parsed.discoverability_hints[14];
     assert.ok(sessionIdHint.includes("session_id"));
     assert.ok(sessionIdHint.includes("meta_state_list"));
     assert.ok(sessionIdHint.includes("compact"));
     ```
   - Update the destructuring on line 24 to include the new hint variable:
     ```js
     const [citation, autoDefault, sourceRef, grounding, noCode, statusLifecycle, reopensHint, ruleLifecycle, toolSelection, layerSplit, relationshipScript, onDemandLookup, narrowQuery, sessionIdHint] = parsed.discoverability_hints;
     ```

6. **Update `meta-state-list-compact.test.js`**
   - Add a new test case after the existing tests (before the closing `});`):
     ```js
     test("compact output includes session_id when present on entry", async () => {
       // Seed a finding with session_id
       const withSession = {
         id: "compact-finding-with-session",
         entry_kind: "finding",
         status: "active",
         category: "loop-anti-pattern",
         severity: "warning",
         affected_system: "mcp-tools",
         description: "Finding with session_id for compact test (min 20 chars)",
         created_at: new Date().toISOString(),
         session_id: "test-session-abc-123",
       };
       writeRegistry(root, [withSession]);

       const result = await metaStateListTool.handler({
         compact: true,
       });
       const text = JSON.parse(result.content[0].text);
       const entry = text.entries.find((e) => e.id === "compact-finding-with-session");
       assert.ok(entry, "entry should be in compact output");
       assert.strictEqual(entry.session_id, "test-session-abc-123", "compact output should include session_id");
     });
     ```
   - Note: the `writeRegistry` call will overwrite the registry. This test should run in isolation or use a fresh temp root. Consider wrapping in a separate `describe` block with its own `before`/`after` hooks, or appending to the existing registry instead of overwriting.

7. **Update `meta-state-session-id-roundtrip.test.js`**
   - In the "meta_state_list filters by session_id (exact match)" test (around line 95), after asserting the filtered results, add:
     ```js
     // Verify compact output also includes session_id
     const compactResult = await metaStateListTool.handler({ session_id: sessionA, compact: true });
     const compactParsed = JSON.parse(compactResult.content[0].text);
     assert.equal(compactParsed.count, 2);
     for (const e of compactParsed.entries) {
       assert.equal(e.session_id, sessionA, "compact output should include session_id");
     }
     ```

## Todo List

- [x] Add `session_id` to `summarize()` in `loop-introspect.js`
- [x] Add warm-tier hint #15 about `session_id` narrow query in `loop-introspect.js`
- [x] Update `meta_state_list` tool description to advertise `session_id` filter
- [x] Update `AGENTS.md` filter table to mention `session_id`
- [x] Update `loop-describe-warm-tier.test.js` — hint count 14→15, add session_id hint assertions
- [x] Update `meta-state-list-compact.test.js` — add test for `session_id` in compact output
- [x] Update `meta-state-session-id-roundtrip.test.js` — assert compact output includes `session_id`
- [x] Run test suite to verify all tests pass
- [x] Run linter if applicable (no lint script in package.json)

## Success Criteria

- `meta_state_list({ compact: true })` returns `session_id` for entries that have it.
- `loop_describe` warm tier includes a hint about `meta_state_list({ session_id })` narrow query.
- All existing tests still pass; updated tests cover the new behavior.
- No direct JSONL edits; use MCP tools only.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test count assertion (14→15) missed in another test file | Low | Medium | grep all test files for `length, 14` and `length, 15` |
| `summarize()` now includes `session_id` but `toCompact()` strips it somehow | Low | High | `toCompact` does `const { description_preview, ...rest } = summarize(entry);` — `session_id` will be in `rest` |
| AGENTS.md has other `session_id` references that need updating | Low | Low | grep AGENTS.md for `session_id` before and after |
| New compact test overwrites registry and breaks subsequent tests | Medium | Medium | Use isolated temp root or append-only write |

## Rollback Plan

All changes are additive. Revert each file edit individually:
1. Remove `session_id` line from `summarize()`
2. Remove hint #15 from `DISCOVERABILITY_HINTS`
3. Revert tool description string
4. Revert AGENTS.md table
5. Revert test changes (restore `14` counts, remove new assertions)

## Next Steps

After this phase completes:
- P0 items from the debug report (clean rule entry, add entry-kind guards to archive/resolve) remain separate work.
- P2 items (unarchive path, registry-consistency check) are future enhancements.

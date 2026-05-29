---
phase: 3
title: "Tests"
status: completed
effort: "2h"
dependencies: [1]
---

# Phase 3: Tests

## Overview

Write comprehensive unit tests for the meta-state core module. Tests use Node.js built-in `node:test` and `node:assert` (no new dependencies). Follow the existing test patterns in `workflow-registry.test.js` and `delete-record-tool.test.js` — use temp directories, mock `GATE_ROOT`, and clean up after each test.

## Requirements

- **Functional:** Cover read, write, update, auto-resolve, expiry, filtering, compaction, and concurrent safety.
- **Non-functional:** Fast (<1s total), isolated (temp dirs), no external I/O.

## Architecture

Test file: `tools/learning-loop-mcp/core/meta-state.test.js`

Uses `mkdtempSync` + `tmpdir` pattern from `delete-record-tool.test.js`:
```js
const tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
process.env.GATE_ROOT = tempDir;
// ... tests ...
process.env.GATE_ROOT = originalEnv;
```

## Related Code Files

- **Create:** `tools/learning-loop-mcp/core/meta-state.test.js`
- **Pattern reference:** `tools/learning-loop-mcp/core/workflow-registry.test.js` (describe/test/assert style)
- **Pattern reference:** `tools/learning-loop-mcp/tools/delete-record-tool.test.js` (temp dir + GATE_ROOT)

## Implementation Steps

1. **Setup helper:** Create a `makeEntry(overrides)` function that returns a valid entry with sensible defaults.

2. **Test: readRegistry on missing file**
   - Call `readRegistry(tempDir)` when no file exists
   - Assert returns `[]`

3. **Test: writeEntry creates valid JSONL**
   - Write 2 entries
   - Read file as text, split on `\n`, assert 2 valid JSON lines
   - Assert `readRegistry` returns 2 entries with correct ids

4. **Test: updateEntry patches existing entry**
   - Write entry with `status: "reported"`
   - Update to `status: "active"`, `acked_at: now`
   - Read registry, assert entry has new status and acked_at
   - Assert other fields unchanged

5. **Test: checkAutoResolve with file modification**
   - Create a file, wait 1 second, modify it
   - Create entry with `auto_resolve.file_modified` pointing to that file
   - Assert `checkAutoResolve` returns `"auto-resolved"`

6. **Test: checkAutoResolve with unchanged file**
   - Create file, create entry with `created_at` after file mtime
   - Assert `checkAutoResolve` returns `null`

7. **Test: checkExpiry on reported entry**
   - Create entry with `expires_at` in the past
   - Assert `checkExpiry` returns `"expired"`

8. **Test: checkExpiry on active entry (no TTL)**
   - Create entry with `status: "active"`, `expires_at: null`
   - Assert `checkExpiry` returns `null`

9. **Test: filterEntries by single field**
   - Create entries with different categories and statuses
   - Filter by `category: "gate-logic-bug"` — assert only matching entries
   - Filter by `status: "reported"` — assert only matching entries
   - Filter by `affected_system: "gate-logic"` — assert only matching entries

10. **Test: filterEntries by multiple fields**
    - Filter by both `category` and `status`
    - Assert intersection behavior

11. **Test: compaction removes old terminal entries**
    - Write an `auto-resolved` entry with `created_at` 8 days ago
    - Write a `reported` entry
    - Call `updateEntry` on the reported entry
    - Assert the old `auto-resolved` entry is gone
    - Assert the `reported` entry still exists

12. **Test: concurrent writes are safe**
    - Launch 5 parallel `writeEntry` calls
    - Read registry, assert all 5 entries exist
    - Assert JSONL file is valid (no partial lines)

13. **Test: generateId format**
    - Call `generateId("test-slug")`
    - Assert matches regex `^meta-\d{6}T\d{4}Z-test-slug$`

## Success Criteria

- [x] All 13 test cases pass (`pnpm test` includes `meta-state.test.js`)
- [x] Tests run in <1 second total
- [x] No test leaks temp directories (clean up or use `process.env.GATE_ROOT` reset)
- [x] 100% line coverage of `meta-state.js` exports

## Risk Assessment

| Risk | Mitigation |
|---|---|
| fs.watch race conditions in auto-resolve tests | Use `utimesSync` to set explicit mtime, avoid real timing |
| Temp dir pollution on test failure | Reset `process.env.GATE_ROOT` in test cleanup |
| Concurrent write test flakiness | Run 10 iterations, assert 100% pass rate |

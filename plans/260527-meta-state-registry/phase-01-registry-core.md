---
phase: 1
title: "Registry Core"
status: completed
effort: "3h"
dependencies: []
---

# Phase 1: Registry Core

## Overview

Create the core meta-state module (`tools/learning-loop-mcp/core/meta-state.js`) that manages the JSONL registry file. This module handles all CRUD operations, auto-resolve logic (file mtime detection), TTL expiry, and atomic append safety.

## Requirements

- **Functional:** Read/write JSONL entries, filter by category/status/affected_system, auto-resolve on file change, expire after 24h.
- **Non-functional:** Zero external dependencies (Node.js `fs` only), atomic writes, concurrent-safe append, pure functions for testability.

## Architecture

```
meta-state.js
├── readRegistry(root)          → Entry[]
├── writeEntry(root, entry)     → void (atomic append)
├── updateEntry(root, id, patch) → void (atomic rewrite)
├── checkAutoResolve(entry, root) → newStatus | null
├── checkExpiry(entry)          → "expired" | null
└── filterEntries(entries, { category, status, affected_system }) → Entry[]
```

### Entry Format

```json
{
  "id": "meta-{YYMMDD}T{HHmm}Z-{slug}",
  "category": "gate-logic-bug | record-repair-gap | schema-drift | stale-ref | mcp-tool-missing",
  "severity": "warning | escalate",
  "affected_system": "gate-logic | record-validation | index-extractor | mcp-tools | workflow-registry",
  "description": "Human-readable summary",
  "evidence": {
    "journal": "docs/journals/...md",
    "code_ref": "path/to/file.js:line",
    "test": "test-file.test.js#L42"
  },
  "auto_resolve": {
    "file_modified": "path/to/file.js",
    "line_range": [start, end]
  },
  "status": "reported | active | auto-resolved | expired",
  "created_at": "2026-05-27T14:30:00Z",
  "expires_at": "2026-05-28T14:30:00Z",
  "acked_at": null,
  "resolved_at": null,
  "resolved_by": null
}
```

### State Machine

```
reported → active → resolved
         ↑        ↓
      operator ack   auto-resolve / operator resolve
         ↑
   expired (24h no ack)
```

| State | Meaning | Transition |
|---|---|---|
| `reported` | Agent created entry | `meta_state_ack` → `active`; 24h pass → `expired`; auto-resolve condition met → `auto-resolved` |
| `active` | Operator acknowledged, no TTL | `meta_state_resolve` → `resolved` (terminal, compacted after 7 days) |
| `auto-resolved` | File modified or test passed | Terminal (compacted after 7 days) |
| `expired` | 24h passed without ack | Terminal (compacted after 7 days) |
| `resolved` | Operator or auto-resolve marked done | Terminal (compacted after 7 days) |

### Atomic Write Strategy

1. **Append:** Read existing JSONL → append new line → write to `meta-state.jsonl.tmp` → `fs.renameSync` to target.
2. **Update:** Read existing JSONL → find entry by id → apply patch → write all lines to temp → rename.
3. **Compaction:** On every update, skip entries in terminal states (`auto-resolved`, `expired`, `resolved`) older than 7 days. This prevents unbounded growth.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/core/meta-state.js`
- **Pattern reference:** `tools/learning-loop-mcp/core/gate-logic.js:195-198` (atomic write for preflight markers)

## Implementation Steps

1. Create `meta-state.js` with the following exports:
   - `readRegistry(root)` — reads JSONL, parses each line, returns array of entries
   - `writeEntry(root, entry)` — atomic append with temp+rename
   - `updateEntry(root, id, patch)` — atomic rewrite with temp+rename
   - `checkAutoResolve(entry, root)` — compares `entry.auto_resolve.file_modified` mtime against `entry.created_at`
   - `checkExpiry(entry)` — compares `entry.expires_at` against `Date.now()`
   - `filterEntries(entries, filters)` — filters by category, status, affected_system (all optional)
   - `generateId(slug)` — generates `meta-{YYMMDD}T{HHmm}Z-{slug}`

2. Implement TTL logic:
   - Default `expires_at` = `created_at` + 24 hours
   - `checkExpiry` returns `"expired"` if `Date.now() > expires_at` AND `status === "reported"`

3. Implement auto-resolve logic:
   - `checkAutoResolve` resolves relative `file_modified` path against `root`
   - If file exists and `mtime > created_at` → returns `"auto-resolved"`
   - If `line_range` provided, also check the file hash or line count changed (optional v2)

4. Implement compaction:
   - On `updateEntry`, filter out terminal-state entries older than 7 days
   - Log compaction count to stderr

## Success Criteria

- [x] `readRegistry` returns empty array when file doesn't exist
- [x] `writeEntry` creates valid JSONL with one line per entry
- [x] `updateEntry` finds entry by id and applies patch atomically
- [x] `checkAutoResolve` returns `"auto-resolved"` when file mtime > created_at
- [x] `checkExpiry` returns `"expired"` when 24h passed on `reported` entry
- [x] `filterEntries` supports category, status, affected_system filters independently
- [x] Concurrent writes do not corrupt JSONL (atomic temp+rename)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| JSONL corruption from unclean shutdown | Atomic temp+rename guarantees either old or new file, never partial |
| Unbounded file growth | Compaction removes terminal entries >7 days old |
| Clock skew on mtime vs created_at | Use mtime strictly > created_at (not >=), gives 1-second buffer |
| Race between read and update | Acceptable: last writer wins on concurrent updates to same entry |

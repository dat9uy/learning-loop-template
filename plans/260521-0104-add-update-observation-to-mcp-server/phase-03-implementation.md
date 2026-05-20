---
phase: 3
title: "Implementation"
status: completed
priority: P1
effort: "30m"
dependencies: [2]
---

# Phase 3: Implementation

## Overview

Implement `update_observation` in `observation-writer.js` (unit) and expose it as an MCP tool in `server.js` (integration). Keep changes minimal and consistent with existing patterns.

## Requirements

- Functional: `updateObservation({ root, observation_id, status, reason })` scans `records/observations/*.yaml`, finds observation by `id` field, updates `status` and `updated_at`, writes atomically.
- Functional: MCP tool `update_observation` accepts `observation_id`, `status`, and optional `reason`, delegates to `updateObservation`.
- Functional: Valid statuses: `active`, `inactive`, `archived`.
- Functional: Rejects symlinked observation files; re-validates resolved path stays within `records/observations/`.
- Functional: Bounds-checks `updated_at` — reject if >5 min future or older than `created_at`.
- Non-functional: Atomic write (temp + rename) with unique temp suffix per call.
- Non-functional: No changes to existing `record_observation` or `check_gate` behavior.
- Non-functional: MCP tools bypass the write gate by design (separate process using `node:fs`); this is an accepted architectural trade-off documented in the decision record.

## Architecture

```
observation-writer.js
├── writeObservation (existing)
└── updateObservation (new)
    ├── read observations dir
    ├── skip symlinks
    ├── find by id field (NOT filename/constraint slug)
    ├── validate status
    ├── validate updated_at bounds
    ├── whitelist mutable fields (status, updated_at, notes only)
    ├── atomic write (tmp + random suffix + rename)
    ├── re-validate resolved path before rename
    └── return { updated: true, id, path } or { updated: false, reason }

server.js
├── check_gate (existing)
├── record_observation (existing)
└── update_observation (new)
    └── delegates to updateObservation
    └── logs reason to gate log
```

## Related Code Files

- Modify: `tools/constraint-gate/observation-writer.js`
- Modify: `tools/constraint-gate/server.js`

## Implementation Steps

1. In `observation-writer.js`:
   - Add `VALID_STATUSES = ['active', 'inactive', 'archived']`
   - Add `IMMUTABLE_FIELDS = ['id', 'schema_version', 'type', 'created_at', 'constraint_type', 'constraint']`
   - Add `updateObservation({ root, observation_id, status, reason })`:
     - Scan `records/observations/*.yaml` for matching `id` field (NOT filename)
     - Skip symlinked files (`lstatSync` check)
     - If not found → `{ updated: false, reason: 'not_found' }`
     - If status not in `VALID_STATUSES` → `{ updated: false, reason: 'invalid_status' }`
     - Parse YAML, verify `id` matches exactly
     - Reject if resolved path escapes `records/observations/`
     - Mutate ONLY whitelisted fields (`status`, `updated_at`, `notes`); preserve all others
     - Set `updated_at` to `new Date().toISOString()`; bounds-check (>5 min future or < created_at → reject)
     - Atomic write to same path with unique temp suffix (`tmp-${randomBytes(4).toString('hex')}`)
     - Re-validate resolved path before rename
     - Return `{ updated: true, id, path }`
2. In `server.js`:
   - Update import: `import { writeObservation, updateObservation } from "./observation-writer.js";`
   - Register new tool `update_observation` with schema:
     - `observation_id`: z.string()
     - `status`: z.string().refine(val => ['active', 'inactive', 'archived'].includes(val), { message: 'invalid_status' })
     - `reason`: z.string().optional()
   - Call `updateObservation` and return JSON result
   - Append gate log entry with tool name, decision, and reason
3. Run unit tests: `node --test tools/constraint-gate/observation-writer.test.js`
4. Run integration tests: `node --test tools/constraint-gate/server.test.js`
5. Run `pnpm validate:records` — ensure modified observations still pass validation
6. Run full suite: `pnpm test`

## Success Criteria

- [x] All new tests pass (green phase of TDD).
- [x] All existing tests pass (no regression).
- [x] `update_observation` tool appears in MCP tool list.
- [x] Code under 200 lines per file (observation-writer.js may need splitting if it grows).

## Risk Assessment

- **Risk:** YAML parse errors in existing observation files may break `updateObservation` scan. **Mitigation:** Use try/catch per file; skip unparseable files with warning.
- **Risk:** Concurrent updates may race on temp file. **Mitigation:** Unique temp suffix per call (`tmp-${randomBytes(4).toString('hex')}`) prevents collision.
- **Risk:** Symlink attack on observation file. **Mitigation:** Skip symlinks during scan and before write.
- **Risk:** Path traversal via manipulated filesystem between scan and write. **Mitigation:** Re-validate resolved path stays within observations directory before atomic rename.

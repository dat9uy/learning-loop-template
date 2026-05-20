---
phase: 2
title: "Tests"
status: pending
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Tests

## Overview

Write failing tests for `update_observation` before implementation (TDD). Tests cover unit-level (observation-writer.js) and integration-level (server.js via MCP client).

## Requirements

- Functional: Tests verify `update_observation` can toggle status (active/inactive/archived) on existing observations.
- Functional: Tests verify behavior when observation does not exist, when status is invalid, and when symlinks are encountered.
- Non-functional: Follow existing test patterns (`node:test`, `assert/strict`, tmpdir isolation, MCP stdio transport).

## Architecture

Test layers:
1. **Unit tests** (`observation-writer.test.js`): Test `updateObservation()` function directly.
2. **Integration tests** (`server.test.js`): Test via MCP client `callTool({ name: "update_observation", ... })`.

## Related Code Files

- Modify: `tools/constraint-gate/observation-writer.test.js`
- Modify: `tools/constraint-gate/server.test.js`
- Read for context: `tools/constraint-gate/observation-writer.js`
- Read for context: `tools/constraint-gate/server.js`

## Implementation Steps

0. **Bootstrap:** Add stub `export function updateObservation() { throw new Error("not implemented"); }` to `observation-writer.js` so imports resolve during red phase.
1. Add unit tests in `observation-writer.test.js`:
   - `updateObservation` toggles status from active → inactive
   - `updateObservation` toggles status from inactive → active
   - `updateObservation` returns not_found when observation does not exist
   - `updateObservation` rejects invalid status values
   - `updateObservation` updates `updated_at` timestamp
   - `updateObservation` rejects symlinked observation files (does not follow symlinks)
   - `updateObservation` preserves all fields except `status`, `updated_at`, `notes`
2. Add integration tests in `server.test.js`:
   - `update_observation` tool is listed in available tools
   - `update_observation` via MCP client changes status
   - `update_observation` returns error when observation missing
   - `update_observation` logs reason if provided
3. Run tests with `node --test tools/constraint-gate/observation-writer.test.js` — expect ONLY new tests to fail (assertion failures, not module errors).
4. Run tests with `node --test tools/constraint-gate/server.test.js` — expect ONLY new tests to fail.

## Success Criteria

- [ ] All new tests exist and fail (red phase of TDD).
- [ ] Existing tests still pass (no regression).
- [ ] Test coverage includes: happy path, not-found, invalid status.

## Risk Assessment

- **Risk:** `node --test` may not support the test patterns if syntax errors. **Mitigation:** Run after each test addition.

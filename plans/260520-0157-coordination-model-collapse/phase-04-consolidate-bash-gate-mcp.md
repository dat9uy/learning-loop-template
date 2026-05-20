---
phase: 4
title: "Consolidate Bash Gate & MCP Server"
status: completed
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Consolidate Bash Gate & MCP Server

## Overview

Clean up remaining profile-model remnants in the bash gate, MCP server, and their tests. Verify the observation-based model is the single source of truth. Ensure no dead code or stale test data remains.

## Requirements

- Functional: No profile-based concepts remain in any hook, server, or test.
- Functional: Bash gate and MCP server tests pass.
- Non-functional: No dead imports or unused variables.

## Architecture

### Bash Gate Status

After Phase 2, the bash gate no longer reads `coordination-config.json`. It is clean.

### MCP Server Cleanup

The MCP server has dead code and stale test data:

1. **`server.js:114`** — `const config = readCoordinationConfig(root);` assigns `config` but never uses it. The JSDoc on line 5 falsely claims "Reads coordination config." Remove the call and update the JSDoc.
2. **`file-readers.js`** — `readCoordinationConfig` is exported but no longer consumed by `server.js` after cleanup. Remove the function and its tests.
3. **`server.test.js`** — Creates mock `coordination-config.json` files with `profiles: {}` in 10+ test cases. Replace with empty temp dirs (no mock config needed).
4. **`file-readers.test.js`** — Tests `readCoordinationConfig` directly. Delete these tests.

### Shared Logic Clarification

The bash gate and MCP server do NOT share logic via `gate-logic.js` or `file-readers.js` in the way the original plan claimed. The bash gate only uses `gate-utils.cjs`. The MCP server uses `gate-logic.js` and `file-readers.js`. These are parallel but separate code paths. This is a legitimate design — the hook needs standalone logic (no module imports beyond Node builtins + `yaml`), while the MCP server can use richer imports.

## Related Code Files

- Modify: `tools/constraint-gate/server.js` — remove dead `readCoordinationConfig` call, update JSDoc
- Modify: `tools/constraint-gate/file-readers.js` — remove `readCoordinationConfig` export
- Modify: `tools/constraint-gate/server.test.js` — remove mock config creation
- Modify: `tools/constraint-gate/file-readers.test.js` — remove `readCoordinationConfig` tests
- Read: `.claude/coordination/hooks/bash-coordination-gate.cjs` — verify clean
- Read: `tools/constraint-gate/gate-logic.js` — verify no profile references
- Run: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs`
- Run: `.claude/coordination/__tests__/gate-integration.test.cjs`
- Run: `.claude/coordination/__tests__/gate-utils.test.cjs`
- Run: `cd tools/constraint-gate && pnpm test` (or equivalent test runner)

## Implementation Steps

1. **Audit `server.js` for dead code.**
   - Remove `const config = readCoordinationConfig(root);` at line 114.
   - Remove `readCoordinationConfig` from the `file-readers.js` import statement.
   - Update JSDoc on line 5: "Reads observation files on each call." (remove "coordination config").

2. **Clean up `file-readers.js`.**
   - Remove `readCoordinationConfig` function (lines 23-31).
   - Remove it from the module exports.

3. **Clean up `server.test.js`.**
   - Find all test cases that create mock `coordination-config.json` files.
   - Remove the mock config creation. The tests should work without any coordination config.
   - If a test explicitly asserted on `config.profiles`, remove that assertion.

4. **Clean up `file-readers.test.js`.**
   - Remove all test cases for `readCoordinationConfig`.
   - If the file becomes empty, delete it.

5. **Verify no profile remnants remain.**
   ```bash
   grep -r "readCoordinationConfig\|profile\|coordinator\|registry\|bypass" \
     tools/constraint-gate/ \
     .claude/coordination/hooks/ \
     --include="*.js" --include="*.cjs" --include="*.ts"
   ```
   - Expected: zero hits (or only hits in legitimate contexts like "observation profile" — none expected).

6. **Run all tests.**
   - `node .claude/coordination/__tests__/bash-coordination-gate.test.cjs`
   - `node .claude/coordination/__tests__/gate-integration.test.cjs`
   - `node .claude/coordination/__tests__/gate-utils.test.cjs`
   - `node .claude/coordination/__tests__/inbound-state-gate.test.cjs`
   - `cd tools/constraint-gate && pnpm test`

## Success Criteria

- [x] `server.js` has no `readCoordinationConfig` call or import.
- [x] `file-readers.js` has no `readCoordinationConfig` export.
- [x] `server.test.js` does not create mock `coordination-config.json` files.
- [x] `file-readers.test.js` has no `readCoordinationConfig` tests (or file is deleted).
- [x] Grep for profile-model terms in `tools/constraint-gate/` and `hooks/` returns zero hits.
- [x] All bash gate, integration, gate-utils, and inbound gate tests pass.
- [x] MCP server tests pass.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deleting `readCoordinationConfig` from file-readers breaks MCP server | Low | High | The server call is removed first (step 1), then the export (step 2). |
| MCP tests fail after removing mock config data | Low | Medium | Run MCP tests immediately after cleanup. Fix any test that depended on mock config. |

## Next Steps

- Phase 5 updates all documentation.

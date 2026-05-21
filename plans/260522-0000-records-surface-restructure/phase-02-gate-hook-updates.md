---
phase: 2
title: "Gate & Hook Pattern Updates"
status: pending
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Gate & Hook Pattern Updates

## Overview

Update pattern tables in gate utilities to recognize surface-first paths. **Do NOT update hook path-check logic yet** — that happens in phase 4 (same commit as file moves) to avoid a migration-window auth bypass where old flat paths would fall through unchecked.

## Requirements

- Functional: `WRITE_PATH_PATTERNS` in `gate-utils.cjs` and `gate-logic.js` must match `records/<surface>/evidence/**`, `records/<surface>/index/**`, `records/<surface>/capabilities/**`.
- Functional: Test fixtures updated to use surface-first paths.
- Non-functional: Hook path checks (`write-coordination-gate.cjs`, `bash-coordination-gate.cjs`) remain on old patterns until phase 4.

## Architecture

`globMatch(pattern, filePath)` in `gate-utils.cjs` uses regex: `*` → `[^/]*`, `**` → `.*`. Pattern `records/*/evidence/**` correctly matches `records/vnstock/evidence/foo.md`. The `*` matches a single directory segment.

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` — update `WRITE_PATH_PATTERNS` only
- Modify: `tools/constraint-gate/gate-logic.js` — update `WRITE_PATH_PATTERNS` only (MCP server uses this, not gate-utils)
- Modify: `.claude/coordination/__tests__/write-gate-index-capabilities.test.cjs` — update test paths
- Modify: `.claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs` — update test paths
- Modify: `.claude/coordination/__tests__/gate-integration.test.cjs` — update test paths
- Modify: `.claude/coordination/__tests__/gate-utils.test.cjs` — update test paths
- Modify: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs` — update test paths
- Modify: `tools/constraint-gate/server.test.js` — update hardcoded `records/evidence/test.md` paths
- Modify: `tools/constraint-gate/workflow-runner.test.js` — update trigger paths
- Modify: `.claude/coordination/workflows.json` — update trigger patterns from flat to surface-first

## Implementation Steps

1. **Update `gate-utils.cjs` pattern table ONLY**:
   - Change `WRITE_PATH_PATTERNS['records-evidence']` from `records/evidence/**` to `records/*/evidence/**`
   - Change `WRITE_PATH_PATTERNS['records-index']` from `records/index/**` to `records/*/index/**`
   - Change `WRITE_PATH_PATTERNS['records-capabilities']` from `records/capabilities/**` to `records/*/capabilities/**`
   - Do NOT change any hook path-check logic in this file yet.

2. **Update `gate-logic.js` pattern table ONLY**:
   - Apply identical `WRITE_PATH_PATTERNS` changes as step 1.
   - This file is used by the MCP server (`server.js`) and is independent of `gate-utils.cjs`.

3. **Update test files**:
   - Update all hardcoded test fixture paths from flat to surface-first.
   - Update `server.test.js` fixture paths.
   - Update `workflow-runner.test.js` trigger patterns.

4. **Update `workflows.json`**:
   - Change trigger patterns from `records/evidence/**` to `records/*/evidence/**`.
   - Change `records/capabilities/**` to `records/*/capabilities/**`.
   - Change `records/index/**` to `records/*/index/**`.

## Tests Before

- Read existing test files to understand current assertions.
- Note: hook path-check tests may still reference old flat paths — that's expected since hooks are not updated yet.

## Refactor

- Pattern table updates only.
- Test fixture path updates.

## Tests After

- Run `.claude/coordination/__tests__/` test suite. All must pass.
- Verify `gate-utils.test.cjs` tests `globMatch('records/*/evidence/**', 'records/meta/evidence/foo.md')` returns `true`.
- Verify `server.test.js` passes with updated fixture paths.

## Success Criteria

- [ ] `gate-utils.cjs` `WRITE_PATH_PATTERNS` uses `records/*/<type>/**`
- [ ] `gate-logic.js` `WRITE_PATH_PATTERNS` uses `records/*/<type>/**`
- [ ] `workflows.json` trigger patterns updated
- [ ] All `__tests__/*.test.cjs` pass
- [ ] `server.test.js` passes
- [ ] `workflow-runner.test.js` passes
- [ ] No changes to hook path-check logic yet

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `globMatch` regex doesn't match `records/*/evidence/**` correctly | Test with sample paths before committing |
| Updating hooks now creates migration window bypass | Explicitly deferred to phase 4 |

## Regression Gate

```bash
node .claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs && \
node .claude/coordination/__tests__/gate-utils.test.cjs && \
node .claude/coordination/__tests__/gate-integration.test.cjs && \
node tools/constraint-gate/server.test.js && \
node tools/constraint-gate/workflow-runner.test.js
```

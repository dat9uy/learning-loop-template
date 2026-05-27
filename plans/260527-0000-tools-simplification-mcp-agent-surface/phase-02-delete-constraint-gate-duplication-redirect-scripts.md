---
phase: 2
title: "Delete Constraint-Gate Duplication + Redirect Scripts"
status: pending
priority: P1
effort: "1h"
dependencies:
  - 1
---

# Phase 2: Delete Constraint-Gate Duplication + Redirect Scripts

## Overview

Eliminate the 82-file `tools/constraint-gate/` directory — dead code that duplicates `tools/coordination-gate/` 1:1. Update `package.json` script, `.factory/skills/constraint-gate/SKILL.md`, `.claude/skills/constraint-gate/SKILL.md`, and any remaining path references. `pnpm test` must pass with zero `constraint-gate` matches.

## Requirements

- Functional: `tools/constraint-gate/` is fully deleted; `ls` returns ENOENT
- Functional: `package.json` `"gate:server"` script points to `tools/coordination-gate/mcp/server.js`
- Functional: `.factory/skills/constraint-gate/SKILL.md` redirects to `coordination-gate`
- Functional: `.claude/skills/constraint-gate/SKILL.md` redirects to `coordination-gate`
- Functional: `rg "constraint-gate"` returns zero matches (excluding `.git/` and archived docs)
- Non-functional: Zero behavioral changes to any running gate logic

## Architecture

### Files to Delete

All of `tools/constraint-gate/`:
- `server.js`, `server.test.js`, `integration.test.js`, `gate-mcp-integration.test.js`
- `tool-registry.js`, `tool-registry.test.js`, `workflow-runner.js`, `workflow-runner.test.js`
- `resolve-root.js`, `gate-logic.js`, `file-readers.js`, `gate-logging.js`, `inbound-state.js`
- `observation-writer.js`, `record-writer.js`, `decision-writer.js`, `experiment-writer.js`, `risk-writer.js`
- `patterns.json`
- `tools/` directory (49 files: 33 tool definitions + 16 test files)

### Files to Update

| File | Change |
|------|--------|
| `package.json` | `"gate:server": "node tools/coordination-gate/mcp/server.js"` |
| `.factory/skills/constraint-gate/SKILL.md` | Replace content with redirect to `coordination-gate` skill |
| `.claude/skills/constraint-gate/SKILL.md` | Replace content with redirect to `coordination-gate` skill |
| `.mcp.json` | If `server` path references `constraint-gate`, update to `coordination-gate` |
| `.factory/coordination/hooks/*` | Verify no `constraint-gate` imports remain |
| `.claude/coordination/hooks/*` | Verify no `constraint-gate` imports remain |

## Related Code Files
- Delete: `tools/constraint-gate/` (entire directory)
- Modify: `package.json`
- Modify: `.factory/skills/constraint-gate/SKILL.md`
- Modify: `.claude/skills/constraint-gate/SKILL.md`
- Modify: `.mcp.json` (if needed)

## Implementation Steps

1. **Audit references** (10 min)
   - `rg "constraint-gate" --type json --type js --type md --type cjs`
   - `rg "constraint-gate" package.json .mcp.json`
   - Note every file that references the old path

2. **Audit `gate-utils.cjs` hook files** (10 min)
   - Read `.claude/coordination/hooks/lib/gate-utils.cjs`
   - Read `.factory/coordination/hooks/lib/gate-utils.cjs` (if exists)
   - If either references `tools/constraint-gate/`, update to `tools/coordination-gate/core/` or delete if fully superseded by universal hooks

3. **Update package.json** (5 min)
   - Change `"gate:server"` script target
   - **Document expected test count change:** `constraint-gate/` has ~16 test files. After deletion, total test count drops from ~230 to ~150. Update any CI or test-count assertions.

4. **Update skill docs** (10 min)
   - Replace both `constraint-gate` SKILL.md files with redirect stubs:
     ```markdown
     # constraint-gate (deprecated)

     This skill has been unified into `coordination-gate`.
     See `.factory/skills/coordination-gate/SKILL.md`.
     ```

5. **Delete directory** (5 min)
   - `rm -rf tools/constraint-gate/`

6. **Verify zero references** (15 min)
   - `rg "constraint-gate"` must return nothing (except `.git/` and archived journal entries)
   - `pnpm test` must pass (accept test count drop; fix any broken assertions)
   - `node tools/coordination-gate/mcp/server.js` must start without import errors

7. **Update any plan/docs references** (15 min)
   - Search `docs/`, `plans/` for `constraint-gate` references
   - Update or note them (archived plans may stay as-is)

## Success Criteria

- [ ] `tools/constraint-gate/` does not exist
- [ ] `pnpm test` passes with 0 failures
- [ ] `rg "constraint-gate"` returns zero active references
- [ ] `node tools/coordination-gate/mcp/server.js` starts successfully
- [ ] Both skill redirect files exist and point to `coordination-gate`

## Risk Assessment

- **Risk:** An active binding (`.mcp.json`, IDE config) still points to deleted path
  - Mitigation: Start MCP server manually after deletion to verify
- **Risk:** A hook or gate still imports from `constraint-gate/`
  - Mitigation: `rg` audit before deletion; fix all references first
- **Risk:** Deleting tests that had pre-existing failures creates a false sense of success
  - Mitigation: The failures were in dead code; running tests on canonical `coordination-gate/` is the real signal

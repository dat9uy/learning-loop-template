---
phase: 5
title: "Verification+Tests"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verification+Tests

## Overview

Run the full validation suite to confirm the restructure is mechanically sound: tests pass, server starts, imports resolve, no stale references remain, and the cross-surface integration tests still verify identical Claude/Droid behavior.

## Requirements
- Functional: `pnpm test` passes with zero failures.
- Functional: `pnpm check` passes (validate:records + validate:plan-loop + test).
- Functional: Server smoke test succeeds.
- Non-functional: Zero `coordination-gate` references in active code paths.

## Architecture

Verification pyramid:
```
Level 5: pnpm check           ← full validation pipeline
Level 4: pnpm test            ← all test files
Level 3: server smoke test    ← node tools/learning-loop-mcp/server.js
Level 2: import resolution    ← node -e "import('#mcp/core/index.js')"
Level 1: grep inventory       ← zero stale references
```

## Related Code Files
- Modify: `tools/learning-loop-mcp/__tests__/cross-surface.test.js` — if import paths need final sync
- Modify: `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` — if import paths need final sync

## Implementation Steps

1. **Level 1: Grep inventory**
   ```bash
   # Must return ZERO matches (except in plans/reports/records historical docs)
   rg "coordination-gate" tools/ .claude/ .factory/ package.json .mcp.json README.md docs/
   ```
   - If any match is in a file that should be updated, fix it.
   - If match is in a historical plan or record, it is acceptable.

2. **Level 2: Import resolution**
   ```bash
   node -e "import('#lib/resolve-root.js').then(m => console.log('#lib ok'))"
   node -e "import('#mcp/core/index.js').then(m => console.log('#mcp/core ok'))"
   node -e "import('#mcp/server.js').then(m => console.log('#mcp/server ok'))"
   ```

3. **Level 3: Server smoke test**
   ```bash
   timeout 5 node tools/learning-loop-mcp/server.js || true
   # Expected output:
   # learning-loop-mcp: registered 33 of 33 tools
   # learning-loop-mcp MCP server started
   ```

4. **Level 4: Test suite**
   ```bash
   pnpm test
   # Expected: all green
   ```

5. **Level 5: Full check pipeline**
   ```bash
   pnpm check
   # Expected: generate:capabilities --dry-run + validate:records + validate:plan-loop + test all pass
   ```

6. **Cross-surface integration test**
   ```bash
   node --test tools/learning-loop-mcp/__tests__/cross-surface.test.js
   # Expected: Claude and Droid hooks produce identical decisions
   ```

7. **Hook wrapper verification**
   ```bash
   node .claude/coordination/hooks/bash-coordination-gate.cjs <<< '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
   node .factory/coordination/hooks/bash-coordination-gate.cjs <<< '{"tool_name":"Execute","tool_input":{"command":"ls"}}'
   node .claude/coordination/hooks/write-coordination-gate.cjs <<< '{"tool_name":"Edit","tool_input":{"file_path":"docs/test.md"}}'
   node .factory/coordination/hooks/write-coordination-gate.cjs <<< '{"tool_name":"Create","tool_input":{"file_path":"docs/test.md"}}'
   # All should exit 0
   ```

8. **Import depth verification**
   ```bash
   # Deepest relative import should be ../../lib/ (not ../../../lib/)
   rg "\.\./\.\./\.\./lib/" tools/learning-loop-mcp/
   # Must return zero matches
   ```

9. **`.claude/coordination/__tests__` verification**
   ```bash
   node --test '.claude/coordination/__tests__/*.test.cjs'
   # Expected: all tests pass with updated paths
   ```

## TDD Structure (Regression Protection)

- **Tests Before:** Run `pnpm test` before any Phase 1 changes. Capture baseline.
- **Tests During:** After each phase, run targeted tests for that phase's files.
- **Tests After:** Full `pnpm test` + `pnpm check` after all phases complete.
- **Regression Gate:** If any test fails, the phase is not complete. Do not proceed.

## Success Criteria
- [ ] `pnpm test` passes with zero failures
- [ ] `pnpm check` passes with zero failures
- [ ] `node tools/learning-loop-mcp/server.js` starts and registers 33 tools
- [ ] `rg "coordination-gate" tools/ .claude/ .factory/ package.json .mcp.json` returns zero matches
- [ ] `rg "\.\./\.\./\.\./lib/" tools/learning-loop-mcp/` returns zero matches
- [ ] Cross-surface test passes (Claude/Droid identical decisions)
- [ ] All 6 hook wrappers exit 0 on benign inputs
- [ ] Both `.claude/` and `.factory/` `settings.json` resolve hook files successfully
- [ ] `.claude/coordination/__tests__/*.test.cjs` tests pass with updated paths

## Risk Assessment
- **Risk:** A stale reference is missed in an infrequently accessed file (e.g., `docs/journals/`, `fixtures/`).
- **Mitigation:** Broad grep across entire repo excluding `node_modules/` and `.git/`:
  `rg "coordination-gate" --type md --type js --type json --type yaml`
- **Risk:** `pnpm check` runs `generate:capabilities --dry-run` which may scan directories by path.
- **Mitigation:** Verify `generate-capabilities.js` does not hardcode `coordination-gate` paths.

---
phase: 2
title: Core-Extraction
status: completed
effort: 3h
dependencies:
  - 1
---

# Phase 2: Core-Extraction

## Overview

Extract all shared gate logic from `tools/constraint-gate/` into `tools/coordination-gate/core/` as pure, testable ESM modules. Update MCP server to import from core. Ensure zero behavioral changes — this is a pure refactor.

## Requirements

- Functional: All pure logic extracted to `core/` modules
- Functional: MCP server imports from `core/` with no duplication
- Functional: `gate-utils.cjs` preserved as CJS adapter (hooks still need it temporarily)
- Non-functional: Zero behavioral changes — identical inputs produce identical outputs

## Architecture

```
tools/coordination-gate/
├── core/                          # NEW — single source of truth
│   ├── patterns.json              # constraint patterns (moved from constraint-gate/)
│   ├── resolve-root.js            # project root resolution
│   ├── gate-logic.js              # pure decision functions
│   ├── file-readers.js            # observation/budget reading
│   ├── observation-writer.js      # observation YAML writing
│   ├── inbound-state.js           # staleness checking
│   ├── gate-logging.js            # gate-log.jsonl appending
│   ├── record-writer.js           # decision/experiment/risk writing
│   ├── decision-writer.js         # decision record specifics
│   ├── experiment-writer.js       # experiment record specifics
│   ├── risk-writer.js             # risk record specifics
│   └── index.js                   # barrel export
├── mcp/                           # RENAMED from constraint-gate root
│   ├── server.js
│   ├── tool-registry.js
│   ├── resolve-root.js            # DELETE — use core/
│   ├── gate-logic.js              # DELETE — use core/
│   ├── file-readers.js            # DELETE — use core/
│   ├── observation-writer.js      # DELETE — use core/
│   ├── inbound-state.js           # DELETE — use core/
│   ├── gate-logging.js            # DELETE — use core/
│   ├── record-writer.js           # DELETE — use core/
│   ├── decision-writer.js         # DELETE — use core/
│   ├── experiment-writer.js       # DELETE — use core/
│   ├── risk-writer.js             # DELETE — use core/
│   ├── patterns.json              # DELETE — use core/
│   ├── tools/                     # tool definitions (import from core/)
│   └── ...
└── hooks/                         # NEW — universal hook scripts
    └── (Phase 3)
```

## Related Code Files
- Create: `tools/coordination-gate/core/*.js`
- Create: `tools/coordination-gate/core/patterns.json`
- Create: `tools/coordination-gate/core/index.js`
- Modify: `tools/constraint-gate/server.js` → `tools/coordination-gate/mcp/server.js`
- Modify: all `tools/constraint-gate/tools/*.js` to import from `../core/`
- Delete: duplicate files in `tools/constraint-gate/` (after migration)

## Implementation Steps

1. **Create `core/` directory and move files** (30 min)
   - `mkdir -p tools/coordination-gate/core`
   - Copy `patterns.json`, `resolve-root.js`, `gate-logic.js`, `file-readers.js`, `observation-writer.js`, `inbound-state.js`, `gate-logging.js`, `record-writer.js`, `decision-writer.js`, `experiment-writer.js`, `risk-writer.js` from `tools/constraint-gate/` to `core/`
   - Create `core/index.js` barrel export

2. **Update MCP server imports** (45 min)
   - Update `server.js` to import from `./core/`
   - Update all `tools/*.js` to import from `../core/`
   - Update `tool-registry.js` if needed
   - Update `workflow-runner.js` if needed
   - Update all test files to import from `../core/`

3. **Preserve `gate-utils.cjs` temporarily** (15 min)
   - `gate-utils.cjs` continues to work (hooks still need it)
   - Add deprecation comment: "Migrate to coordination-gate/core in Phase 3"

4. **Run tests** (30 min)
   - `pnpm test` — ensure all existing tests pass
   - Fix any import path issues

5. **Clean up duplicate files** (30 min)
   - After tests pass, remove duplicate `.js` files from `tools/constraint-gate/`
   - Keep `tools/constraint-gate/` as symlink or re-export to `tools/coordination-gate/mcp/` for backward compatibility
   - OR: move entire `tools/constraint-gate/` to `tools/coordination-gate/mcp/`

## Success Criteria

- [x] `tools/coordination-gate/core/` contains all pure gate logic
- [x] `tools/coordination-gate/mcp/` imports from `../core/`
- [x] All existing tests pass: `pnpm test` green
- [x] No duplicate logic between `core/` and `mcp/`
- [x] `gate-utils.cjs` still functional (backward compatibility)

## Completion Notes

- Created `core/` with 12 modules: gate-logic, file-readers, observation-writer, inbound-state, gate-logging, resolve-root, record-writer, decision-writer, experiment-writer, risk-writer, patterns.json, index.js
- Updated 54 MCP tool files to import from `../../core/`
- Fixed `resolve-root.js` depth for new location (4 levels up instead of 3)
- Added `MARKER_TTL_MS` to gate-logic.js for preflight marker functions
- Exported `globMatch`, `findProjectRoot`, `extractFrontmatter`, etc. from gate-logic.js

## Risk Assessment

- **Risk**: Import path changes break tests
  - Mitigation: Run tests after each file move; fix incrementally
- **Risk**: CJS/ESM interop issues with `gate-utils.cjs`
  - Mitigation: Don't touch `gate-utils.cjs` in this phase; only move ESM files
- **Risk**: Missing file in migration
  - Mitigation: Use glob to list all `.js` files before and after; diff the lists

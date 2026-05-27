---
phase: 3
title: "Expand tools/lib/ Shared Kernel"
status: pending
priority: P2
effort: "2h"
dependencies:
  - 1
---

# Phase 3: Expand tools/lib/ Shared Kernel

## Overview

Extract reusable utilities from `tools/coordination-gate/core/` and standalone tool directories into `tools/lib/` — a language-agnostic shared kernel consumed by all tool surfaces (core, MCP, standalone). After this phase, `coordination-gate/core/` imports shared logic from `tools/lib/`; standalone tools also import from `tools/lib/`. No cross-imports between `coordination-gate/` and standalone directories except through `tools/lib/`.

## Requirements

- Functional: `tools/lib/` contains shared utilities previously duplicated or tightly coupled
- Functional: `coordination-gate/core/` imports from `tools/lib/` for shared logic
- Functional: Standalone tools import from `tools/lib/` where applicable
- Functional: No circular imports: `tools/lib/` must not import from `coordination-gate/core/` or standalone tools
- Non-functional: Zero behavioral changes

## Architecture

### New/Updated files in `tools/lib/`

| File | Source | Consumers |
|------|--------|-----------|
| `resolve-root.js` | `coordination-gate/core/resolve-root.js` | All tools |
| `gate-logging.js` | `coordination-gate/core/gate-logging.js` | Gate tools, MCP server |
| `yaml-parse-wrapper.js` | `validate-records/yaml-parse-wrapper.js` | All YAML consumers |
| `path-validator.js` | New — centralized path traversal guard | All file-writing tools |
| `frontmatter-splitter.js` | Already exists | `extract-index`, `generate-docs` |

### Import Rules

```
allowed:    coordination-gate/core/  -> tools/lib/*
allowed:    coordination-gate/mcp/ -> tools/lib/*
allowed:    standalone tools        -> tools/lib/*
allowed:    standalone tools        -> coordination-gate/core/*
forbidden:  tools/lib/*            -> coordination-gate/core/*
forbidden:  tools/lib/*            -> standalone tools/*
forbidden:  coordination-gate/core/ -> standalone tools/*
```

## Related Code Files
- Create: `tools/lib/resolve-root.js`
- Create: `tools/lib/gate-logging.js`
- Create: `tools/lib/yaml-parse-wrapper.js`
- Create: `tools/lib/path-validator.js`
- Modify: `tools/coordination-gate/core/resolve-root.js` → delete, update imports
- Modify: `tools/coordination-gate/core/gate-logging.js` → delete, update imports
- Modify: `tools/validate-records/yaml-parse-wrapper.js` → delete, update imports
- Modify: `tools/coordination-gate/core/*.js` → update imports to `tools/lib/`

## Implementation Steps

1. **Copy shared modules to `tools/lib/`** (30 min)
   - Copy `resolve-root.js`, `gate-logging.js` from `core/` to `tools/lib/`
   - Copy `yaml-parse-wrapper.js` from `validate-records/` to `tools/lib/`
   - Create `path-validator.js` with centralized `safePath(root, relative)` guard

2. **Update `coordination-gate/core/` imports** (30 min)
   - Change all internal imports from `./resolve-root.js` to `../../lib/resolve-root.js`
   - Change `./gate-logging.js` to `../../lib/gate-logging.js`
   - Delete duplicate files from `core/` after confirming imports work

3. **Update standalone tool imports** (30 min)
   - `validate-records/`: change `yaml-parse-wrapper.js` import to `../lib/yaml-parse-wrapper.js`
   - `extract-index/`: if it uses `frontmatter-splitter.js` from local copy, redirect to `../lib/`
   - `generate-docs/`: same for frontmatter logic

4. **Add `tools/lib/index.js` barrel export** (15 min)
   ```javascript
   export { resolveRoot } from "./resolve-root.js";
   export { logGateEvent } from "./gate-logging.js";
   export { parseYaml } from "./yaml-parse-wrapper.js";
   export { safePath } from "./path-validator.js";
   export { splitFrontmatter } from "./frontmatter-splitter.js";
   ```

5. **Verify import graph** (15 min)
   - `node -e "import('./tools/lib/index.js')"` — must resolve
   - `node -e "import('./tools/coordination-gate/core/index.js')"` — must resolve
   - Check for cycles: `rg "from.*tools/(coordination-gate|standalone)" tools/lib/` must be empty
   - **Re-verify universal hooks after `core/` deletions:**
     - `node .claude/coordination/hooks/bash-coordination-gate.cjs` (with test input)
     - `node .factory/coordination/hooks/bash-coordination-gate.cjs` (with test input)
     - `node .claude/coordination/hooks/write-coordination-gate.cjs` (with test input)
     - `node .factory/coordination/hooks/write-coordination-gate.cjs` (with test input)

## Success Criteria

- [ ] `tools/lib/` contains `resolve-root.js`, `gate-logging.js`, `yaml-parse-wrapper.js`, `path-validator.js`, `index.js`
- [ ] `coordination-gate/core/` imports shared logic from `tools/lib/`
- [ ] No file in `tools/lib/` imports from `coordination-gate/` or standalone tools
- [ ] `pnpm test` passes with 0 failures
- [ ] `node tools/coordination-gate/mcp/server.js` starts without import errors

## Risk Assessment

- **Risk:** Moving `resolve-root.js` breaks path resolution depth
  - Mitigation: The function computes depth from `__dirname`; test with `node tools/coordination-gate/core/index.js`
- **Risk:** `yaml-parse-wrapper.js` has different behavior in `validate-records/` vs desired shared behavior
  - Mitigation: Copy as-is first; any behavioral change is a separate plan
- **Risk:** `path-validator.js` is too restrictive and breaks valid writes
  - Mitigation: Start with minimal check (`path.startsWith(root)`) and expand later

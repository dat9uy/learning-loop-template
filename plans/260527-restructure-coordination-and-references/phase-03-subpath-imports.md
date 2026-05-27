---
phase: 3
title: "Subpath Imports"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Subpath Imports

## Overview

Add Node.js ESM subpath imports to `package.json` to eliminate deep `../../../` relative paths from `tools/learning-loop-mcp/`. The aliases `#mcp/*`, `#lib/*`, `#records/*`, and `#schemas/*` provide Vite-level ergonomics without a build step.

## Requirements
- Functional: All deep imports (`../../../lib/`, `../../core/`) in `tools/learning-loop-mcp/` replaced with subpath aliases.
- Functional: `node --test`, `node server.js`, and `pnpm check` all work with aliases.
- Non-functional: No aliases added for paths outside the scope of this refactor.

## Architecture

```json
// package.json additions
{
  "imports": {
    "#mcp/*": "./tools/learning-loop-mcp/*",
    "#lib/*": "./tools/lib/*",
    "#records/*": "./records/*",
    "#schemas/*": "./schemas/*"
  }
}
```

Before/after example:
```js
// BEFORE
import { resolveRoot } from "../../../lib/resolve-root.js";
import { makeGateDecision } from "../../core/gate-logic.js";

// AFTER
import { resolveRoot } from "#lib/resolve-root.js";
import { makeGateDecision } from "#mcp/core/gate-logic.js";
```

## Related Code Files
- Modify: `package.json` — add `"imports"` field
- Modify: `tools/learning-loop-mcp/server.js` — `#lib/resolve-root.js`
- Modify: `tools/learning-loop-mcp/tool-registry.js` — `#lib/gate-logging.js`
- Modify: `tools/learning-loop-mcp/workflow-runner.js` — verify no lib imports (none currently)
- Modify: `tools/learning-loop-mcp/tools/*.js` — `#mcp/core/*`, `#lib/*`
- Modify: `tools/learning-loop-mcp/core/index.js` — `#lib/resolve-root.js`, `#lib/gate-logging.js`
- Modify: `tools/learning-loop-mcp/hooks/*.js` — `#mcp/core/*`, `#lib/*`
- Modify: `tools/learning-loop-mcp/__tests__/*.js` — `#mcp/core/*`, `#mcp/tools/*`, `#lib/*`

## Implementation Steps

1. **Add `"imports"` to `package.json`**
   - Insert after `"type": "module"` or at top-level:
   ```json
   "imports": {
     "#mcp/*": "./tools/learning-loop-mcp/*",
     "#lib/*": "./tools/lib/*"
   }
   ```
   - **Note:** Only alias actual JS module trees. `#records/*` and `#schemas/*` are excluded — they contain YAML/JSON data, not JS modules, and exposing them as importable namespaces is unnecessary and potentially leaks path structure.

2. **Update `tools/learning-loop-mcp/server.js`**
   - `import { resolveRoot } from "../lib/resolve-root.js"` → `from "#lib/resolve-root.js"`

3. **Update `tools/learning-loop-mcp/tool-registry.js`**
   - `import { appendGateLog } from "../lib/gate-logging.js"` → `from "#lib/gate-logging.js"`

4. **Update all `tools/learning-loop-mcp/tools/*.js`**
   - `../../core/gate-logic.js` → `#mcp/core/gate-logic.js`
   - `../../core/file-readers.js` → `#mcp/core/file-readers.js`
   - `../../core/decision-writer.js` → `#mcp/core/decision-writer.js`
   - `../../core/experiment-writer.js` → `#mcp/core/experiment-writer.js`
   - `../../core/risk-writer.js` → `#mcp/core/risk-writer.js`
   - `../../core/observation-writer.js` → `#mcp/core/observation-writer.js`
   - `../../core/inbound-state.js` → `#mcp/core/inbound-state.js`
   - `../../core/record-writer.js` → `#mcp/core/record-writer.js`
   - `../../lib/resolve-root.js` → `#lib/resolve-root.js`
   - `../../lib/gate-logging.js` → `#lib/gate-logging.js`
   - `./lib/source-ref-validator.js` stays as-is (same-directory relative)

5. **Update `tools/learning-loop-mcp/core/index.js`**
   - `export { resolveRoot } from "../../lib/resolve-root.js"` → `from "#lib/resolve-root.js"`
   - `export { rotateGateLog, appendGateLog } from "../../lib/gate-logging.js"` → `from "#lib/gate-logging.js"`

6. **Update `tools/learning-loop-mcp/hooks/*.js`**
   - `../core/gate-logic.js` → `#mcp/core/gate-logic.js`
   - `../core/file-readers.js` → `#mcp/core/file-readers.js`
   - Check `hooks/lib/protocol-adapter.js` for any lib imports

7. **Update `tools/learning-loop-mcp/__tests__/*.js`**
   - `../core/decision-writer.js` → `#mcp/core/decision-writer.js`
   - `../mcp/tools/delete-record-tool.js` → `#mcp/tools/delete-record-tool.js`
   - `../mcp/lib/source-ref-validator.js` → `#mcp/lib/source-ref-validator.js`
   - `../../lib/...` → `#lib/...`
   - `../../validate-records/...` stays as-is (not aliased)

## TDD Structure (Regression Protection)

- **Tests Before:** Run `pnpm test` and capture baseline. All tests must pass before modifying imports.
- **Refactor:** Apply subpath imports in the order above (package.json first, then consumers).
- **Tests After:** Run `pnpm test` again. Any failure means an alias path is wrong.
- **Regression Gate:** `node --test 'tools/learning-loop-mcp/**/*.test.js'` must pass.

## Success Criteria
- [ ] `pnpm test` passes with zero failures
- [ ] `node tools/learning-loop-mcp/server.js` starts without errors
- [ ] `rg "\.\./\.\./\.\./lib/" tools/learning-loop-mcp/` returns zero matches
- [ ] `rg "#lib/" tools/learning-loop-mcp/` shows at least 10 matches (aliases in use)
- [ ] `rg "#mcp/core/" tools/learning-loop-mcp/` shows at least 15 matches

## Risk Assessment
- **Risk:** Node.js subpath imports require the `"imports"` field at package.json top-level. Works with `"type": "module"` since Node 14.6.0. The project already uses ESM.
- **Risk:** Some test files import from `../../validate-records/` — these stay as relative paths (not in scope for aliases).
- **Risk:** `pnpm` and `node --test` both resolve subpath imports the same way (Node.js native, no bundler needed).
- **Mitigation:** Verify with `node -e "import('#lib/resolve-root.js').then(m=>console.log('ok'))"` before bulk changes.

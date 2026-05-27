---
phase: 2
title: "Move Validation Modules into MCP Core"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Move Validation Modules into MCP Core

## Overview

Move all `tools/validate-records/*.js` files into `tools/learning-loop-mcp/core/` and rewrite their import paths. Update `tools/learning-loop-mcp/tools/validate-records-tool.js` to import from the new location. All logic stays identical.

## Related Code Files

- Move: `tools/validate-records/record-loader.js` -> `tools/learning-loop-mcp/core/record-loader.js`
- Move: `tools/validate-records/schema-loader.js` -> `tools/learning-loop-mcp/core/schema-loader.js`
- Move: `tools/validate-records/record-validation-rules.js` -> `tools/learning-loop-mcp/core/record-validation-rules.js`
- Move: `tools/validate-records/derived-claim-assurance.js` -> `tools/learning-loop-mcp/core/derived-claim-assurance.js`
- Move: `tools/validate-records/filename-convention-validation.js` -> `tools/learning-loop-mcp/core/filename-convention-validation.js`
- Move: `tools/validate-records/yaml-parse-wrapper.js` -> `tools/learning-loop-mcp/core/yaml-parse-wrapper.js`
- Move: `tools/validate-records/ajv-instance.js` -> `tools/learning-loop-mcp/core/ajv-instance.js`
- Move: `tools/validate-records/decision-effects.js` -> `tools/learning-loop-mcp/core/decision-effects.js`
- Create: `tools/learning-loop-mcp/core/negative-fixture-runner.js` (extracted from validate-records.js)
- Modify: `tools/learning-loop-mcp/tools/validate-records-tool.js` (update imports)
- Delete: `tools/validate-records/validate-records.js` (logic extracted into core + shim)

## Implementation Steps

1. Create `tools/learning-loop-mcp/core/negative-fixture-runner.js` by extracting `runNegativeFixtures` and `runValidateRecords` from `tools/validate-records/validate-records.js`:
   ```js
   import { join } from "node:path";
   import { validateDerivedAssurance } from "./derived-claim-assurance.js";
   import { validateFilenameConventions } from "./filename-convention-validation.js";
   import { loadRecords } from "./record-loader.js";
   import { loadSchemas } from "./schema-loader.js";
   import { validateRecords } from "./record-validation-rules.js";
   import { RecordParseError } from "./yaml-parse-wrapper.js";

   export function runNegativeFixtures(rootPath, allowDisallowed) { /* ... */ }
   export function runValidateRecords(rootPath, opts = {}) { /* ... */ }
   ```
2. `git mv` all module files from `tools/validate-records/` to `tools/learning-loop-mcp/core/`.
3. Rewrite imports in each moved file:
   - `../../lib/resolve-root.js` -> `#lib/resolve-root.js`
   - `../../lib/gate-logging.js` -> `#lib/gate-logging.js`
   - Relative imports within validate-records/ become relative within core/ (e.g., `./record-loader.js` stays `./record-loader.js` because they're now in the same directory).
4. Update `tools/learning-loop-mcp/tools/validate-records-tool.js`:
   - Change imports from `../../validate-records/...` to `../core/...`.
   - Add `include_negative_fixtures` boolean to schema.
   - In handler, after real-record validation, call `runNegativeFixtures(root, args.allow_disallowed_fixtures || false)` when `include_negative_fixtures` is true.
5. Run `pnpm test` — verify Phase 1 tests now pass (imports resolve, fixture runner works).
6. Run `pnpm validate:records` — it still works because old CLI still exists.
7. Commit.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Import path rewrite misses a file | High | `rg "tools/validate-records"` after move to catch stragglers |
| `tools/validate-records/validate-records.js` deleted before shim exists | Low | Only delete in Phase 4 after shim is verified |

## Success Criteria

- [x] All 8 module files exist under `tools/learning-loop-mcp/core/`.
- [x] Zero imports referencing `tools/validate-records/` inside moved files.
- [x] `index_validate` tool imports from `../core/` correctly.
- [x] `pnpm test` passes (Phase 1 contract tests now resolve imports).
- [x] `pnpm validate:records` still passes (old CLI untouched).

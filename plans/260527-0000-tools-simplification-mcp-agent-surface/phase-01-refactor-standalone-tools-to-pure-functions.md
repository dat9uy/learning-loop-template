---
phase: 1
title: "Refactor Standalone Tools to Pure Functions"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Refactor Standalone Tools to Pure Functions

## Overview

Every standalone CLI script under `tools/` becomes a library module exporting a `run*(root, opts)` pure function. MCP tool wrappers can safely `import` these modules without risking `process.exit()`. CLI I/O (argv parsing, console.log, process.exit) is isolated to a `main()` function that only runs under `if (isMain)`.

## Requirements

- Functional: Each `.js` exports a `run*(root, opts)` function returning `{result, errors, stats}`
- Functional: `process.exit()` may ONLY appear inside `main()`; never at module level, never in exported functions
- Functional: CLI `main()` only runs when `import.meta.url === process.argv[1]`
- Non-functional: Zero behavioral changes — identical CLI invocation produces identical output

## Architecture

### Pattern Template

```javascript
// tools/extract-index/extract-index.js
export function runExtraction(root, opts) {
  // pure logic, no side effects
  return { result, errors, stats };
}

export function main() {
  const args = parseArgs(process.argv);
  const root = args.root || scriptRoot;
  const outcome = runExtraction(root, args);
  // CLI I/O only here
  console.log(`Processed ${outcome.stats.filesProcessed} files`);
  if (outcome.errors.length) {
    for (const err of outcome.errors) console.error(`Error: ${err}`);
    process.exit(1);
  }
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
```

### Files to Refactor

| File | Export Name | Risk |
|------|-------------|------|
| `tools/validate-records/validate-records.js` | `runValidateRecords(root, opts)` | Medium — complex validation chain |
| `tools/extract-index/extract-index.js` | `runExtraction(root, opts)` | Low |
| `tools/generate-capabilities/generate-capabilities.js` | `runGenerateCapabilities(root, opts)` | Low |
| `tools/claim-verification/verify-claim.js` | `runVerifyClaim(root, opts)` | Medium — tight test coupling |
| `tools/list-probes/list-probes.js` | `runListProbes(root, opts)` | Low |
| `tools/list-verified/list-verified.js` | `runListVerified(root, opts)` | Low |
| `tools/search-index/search-index.js` | `runSearchIndex(root, opts)` | Low |
| `tools/check-budget/check-budget.js` | `runCheckBudget(root, opts)` | Low |
| `tools/generate-docs/generate-docs.js` | `runGenerateDocs(root, opts)` | Low |

## Related Code Files
- Modify: `tools/*/X.js` — refactor each standalone tool
- Modify: `tools/*/X.test.js` — update tests to call `run*()` instead of spawning CLI
- Modify: `tools/coordination-gate/mcp/tools/*-tool.js` — wrappers now import and call `run*()`

## Implementation Steps

1. **Pre-audit all standalone tools** (20 min)
   - `rg "process\.exit" tools/validate-records/ tools/extract-index/ tools/generate-capabilities/ tools/claim-verification/ tools/list-probes/ tools/list-verified/ tools/search-index/ tools/check-budget/ tools/generate-docs/ --glob "*.js"`
   - `rg "process\.cwd" tools/validate-records/ --glob "*.js"` — validate-records has the most helpers
   - `rg "process\.exit" tools/validate-plan-loop/ --glob "*.js"` — audit tool not in original refactor list
   - Document which helpers need the `run*()` treatment

2. **Write tests first** (30 min per tool, 4.5h total)
   - For each tool, add a test that calls `run*()` directly and asserts the same result as the CLI test
   - Run `pnpm test` — existing CLI tests must still pass (green baseline)
   - Commit after each tool: refactor one, test one

3. **Refactor `extract-index.js`** (15 min)
   - Extract `runExtraction()` from inline logic
   - Move `process.exit()` into `main()` only
   - Verify `extract-index.test.js` still passes

4. **Refactor `validate-records.js` and helpers** (60 min)
   - Extract `runValidateRecords()`; this is the most complex standalone tool
   - Audit helpers: `record-loader.js`, `schema-loader.js`, `claim-verification-rules.js`, `derived-claim-assurance.js`, `experiment-proof-match.js`, `filename-convention-validation.js`, `yaml-parse-wrapper.js`, `record-validation-rules.js`
   - Refactor any helper with `process.exit()` or `process.cwd()` to accept parameters
   - Pass `root` and `opts` instead of relying on `process.cwd()`

5. **Refactor `generate-capabilities.js` and adapters** (20 min)
   - Extract `runGenerateCapabilities()`
   - Audit `adapters/fastapi-adapter.js`, `adapters/tanstack-adapter.js`, `adapters/registry.js` for exits and globals

6. **Refactor remaining tools** (60 min)
   - `verify-claim.js`, `list-probes.js`, `list-verified.js`, `search-index.js`, `check-budget.js`, `generate-docs.js`
   - Use the same `run*()` + `main()` pattern

7. **Update MCP tool wrappers** (30 min)
   - Change wrappers from shelling out (`spawnSync`) to direct imports:
     ```js
     import { runExtraction } from "../../extract-index/extract-index.js";
     const result = runExtraction(root, opts);
     ```
   - Remove any `child_process` usage in wrappers

8. **Run full test suite** (15 min)
   - `pnpm test` — all existing tests must pass
   - `rg "process\.exit" tools/ --glob "*.js"` — must only match `main()` functions

## Success Criteria

- [ ] Each standalone `.js` exports a `run*()` function
- [ ] `process.exit()` only appears inside `main()` in each file
- [ ] MCP wrappers import and call `run*()` — no `child_process` spawn
- [ ] `pnpm test` passes with 0 failures
- [ ] `rg "process\.exit" tools/*/!(main)/*.js` returns zero results ( heuristic — verify manually)

## Risk Assessment

- **Risk:** `process.exit()` missed inside nested helper
  - Mitigation: `rg "process\.exit" tools/ --glob "*.js"` audit; enforce lint rule
- **Risk:** `run*()` API differs from what MCP wrapper expects
  - Mitigation: Write wrapper test first (TDD), then refactor tool to match
- **Risk:** `validate-records.js` refactor breaks downstream record validation
  - Mitigation: It has the most tests; use them as contract

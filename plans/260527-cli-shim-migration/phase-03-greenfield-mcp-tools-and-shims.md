---
phase: 3
title: "Greenfield MCP Tools and Shims"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Greenfield MCP Tools and Shims

## Overview

Create 2 new MCP tools for CLIs that had none: `validate-plan-loop` and `check-budget`. Move logic to core, create tools, register in `manifest.json`, create shims, delete old directories.

## Requirements

- Functional: `pnpm validate:plan-loop` and `pnpm check:budget` work identically.
- Non-functional: Zero logic changes. `pnpm test` passes.

## Architecture

```
CLI shim (tools/<name>-cli.js)  →  MCP server  →  NEW MCP tool  →  core/<module>.js
```

## Related Code Files

- Create: `tools/learning-loop-mcp/core/plan-validator.js`
- Create: `tools/learning-loop-mcp/core/budget-checker.js`
- Create: `tools/learning-loop-mcp/tools/validate-plans-tool.js`
- Create: `tools/learning-loop-mcp/tools/check-budget-tool.js`
- Create: `tools/validate-plan-loop-cli.js`
- Create: `tools/check-budget-cli.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` (add new tools)
- Modify: `package.json` (script paths)
- Delete: `tools/validate-plan-loop/` (entire directory)
- Delete: `tools/check-budget/` (entire directory)
- Move tests: relevant `.test.js` files → `tools/learning-loop-mcp/__tests__/`

## Implementation Steps

1. **Run existing tests to lock baseline.**
   ```bash
   node --test tools/validate-plan-loop/validate-plan-loop.test.js
   node --test tools/check-budget/check-budget-function.test.js
   node --test tools/check-budget/check-budget.test.js
   ```
   All must pass.

2. **Move `scanPlans` logic to core.**
   - Create `tools/learning-loop-mcp/core/plan-validator.js` with `scanPlans`, `report`, `findProjectRoot`, `extractFrontmatter`, `hasProductBuildTag`, `extractSurfaces`, `checkDecisionRecords`, `hasPhase0`, and `globSync` helper.
   - Strip logic from `tools/validate-plan-loop/validate-plan-loop.js`, leave CLI entry point.
   - Move tests and update imports.

3. **Move `runCheckBudget` logic to core.**
   - Create `tools/learning-loop-mcp/core/budget-checker.js` with `runCheckBudget`, `findBudgetFiles`, `loadSchema`, `isStale`, and `parseArgs`.
   - Strip logic from `tools/check-budget/check-budget.js`, leave CLI entry point.
   - Move tests and update imports.

4. **Create new MCP tools.**
   - `tools/learning-loop-mcp/tools/validate-plans-tool.js` — `index_validate_plans` tool. Schema: `{}` (no args). Handler calls `scanPlans(root)` and returns JSON with `violations` and `checked`. Appends gate log.
   - `tools/learning-loop-mcp/tools/check-budget-tool.js` — `budget_check` tool. Schema: `system` (string), `resource` (string), `allow_active_window` (boolean, optional). Handler calls `runCheckBudget(root, opts)` and returns JSON with `output` or `error`. Appends gate log.

5. **Register new tools in manifest.**
   Add to `tools/learning-loop-mcp/tools/manifest.json`:
   ```json
   { "file": "./tools/validate-plans-tool.js", "export": "indexValidatePlansTool" },
   { "file": "./tools/check-budget-tool.js", "export": "budgetCheckTool" }
   ```

6. **Run tests after core move and tool creation.**
   ```bash
   pnpm test
   ```
   Must pass.

7. **Create shim CLIs.**
   - `tools/validate-plan-loop-cli.js` — spawns MCP, calls `index_validate_plans`. Prints violations or success message. Exits 0 or 1.
   - `tools/check-budget-cli.js` — calls `budget_check` with `--system`, `--resource`, `--allow-active-window` mapped. Prints JSON output or error. Exits with code from MCP result.

8. **Update `package.json` scripts.**
   ```json
   "validate:plan-loop": "node tools/validate-plan-loop-cli.js",
   "check:budget": "node tools/check-budget-cli.js"
   ```

9. **Delete old directories.**
   ```bash
   rm -rf tools/validate-plan-loop/ tools/check-budget/
   ```

10. **Run integration tests.**
    ```bash
    pnpm validate:plan-loop
    pnpm check:budget -- --system vnstock --resource device-slots
    ```
    All must exit correctly.

11. **Run full test suite.**
    ```bash
    pnpm test
    ```
    Must pass.

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/plan-validator.js` exists.
- [ ] `tools/learning-loop-mcp/core/budget-checker.js` exists.
- [ ] `tools/learning-loop-mcp/tools/validate-plans-tool.js` exists.
- [ ] `tools/learning-loop-mcp/tools/check-budget-tool.js` exists.
- [ ] `tools/validate-plan-loop-cli.js` exists and works.
- [ ] `tools/check-budget-cli.js` exists and works.
- [ ] `tools/validate-plan-loop/`, `tools/check-budget/` do not exist.
- [ ] `manifest.json` includes both new tools.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| New tool registration forgotten | Medium | Check `manifest.json` and integration test |
| Tool naming collision | Low | Verify no existing tool has same name |
| `budget_check` requires AJV/schema loading | Low | Core module handles this; tool just calls it |

---
phase: 1
title: "Tests-First Read-Only Shims"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Tests-First Read-Only Shims

## Overview

Migrate 3 read-only CLIs (`search-index`, `list-verified`, `list-probes`) to thin MCP stdio shims. Move their logic modules into `core/`, update existing MCP tools to import from core, create shims, delete old directories. Tests first: lock existing behavior before moving code.

## Requirements

- Functional: `pnpm search:index`, `pnpm list:verified`, `pnpm list:probes` work identically.
- Non-functional: Zero logic changes. `pnpm test` passes.

## Architecture

```
CLI shim (tools/<name>-cli.js)  →  MCP server  →  MCP tool  →  core/<module>.js
```

## Related Code Files

- Create: `tools/learning-loop-mcp/core/search-index.js`
- Create: `tools/learning-loop-mcp/core/list-verified.js`
- Create: `tools/learning-loop-mcp/core/list-probes.js`
- Create: `tools/search-index-cli.js`
- Create: `tools/list-verified-cli.js`
- Create: `tools/list-probes-cli.js`
- Modify: `tools/learning-loop-mcp/tools/search-index-tool.js` (import from core)
- Modify: `tools/learning-loop-mcp/tools/list-verified-tool.js` (import from core)
- Modify: `tools/learning-loop-mcp/tools/list-probes-tool.js` (import from core)
- Modify: `package.json` (script paths)
- Delete: `tools/search-index/` (entire directory)
- Delete: `tools/list-verified/` (entire directory)
- Delete: `tools/list-probes/` (entire directory)
- Move tests: `tools/search-index/search-index.test.js` → `tools/learning-loop-mcp/__tests__/search-index.test.js`
- Move tests: `tools/list-verified/list-verified.test.js` → `tools/learning-loop-mcp/__tests__/list-verified.test.js`
- Move tests: `tools/list-probes/list-probes.test.js` → `tools/learning-loop-mcp/__tests__/list-probes.test.js`

## Implementation Steps

1. **Run existing tests to lock baseline.**
   ```bash
   node --test tools/search-index/search-index.test.js
   node --test tools/list-verified/list-verified.test.js
   node --test tools/list-probes/list-probes.test.js
   ```
   All must pass.

2. **Move `searchIndex` logic to core.**
   - Create `tools/learning-loop-mcp/core/search-index.js` with the `searchIndex` function and `SURFACES` constant.
   - Update `tools/learning-loop-mcp/tools/search-index-tool.js` to `import { searchIndex } from "../core/search-index.js"`.
   - Delete `searchIndex` function and `SURFACES` from `tools/search-index/search-index.js`, leaving only the CLI entry point.
   - Move test file: `tools/search-index/search-index.test.js` → `tools/learning-loop-mcp/__tests__/search-index.test.js`. Update import to `#mcp/core/search-index.js`.

3. **Move `listVerifiedClaims` logic to core.**
   - Create `tools/learning-loop-mcp/core/list-verified.js` with `listVerifiedClaims`, `loadClaims`, `loadEvidence`, `isVerifiedClaim`, `getVerifiedDimensions`, and `SURFACES`.
   - Update `tools/learning-loop-mcp/tools/list-verified-tool.js` to import from core.
   - Strip logic from `tools/list-verified/list-verified.js`, leave CLI entry point.
   - Move test file and update import.

4. **Move `listProbes` logic to core.**
   - Create `tools/learning-loop-mcp/core/list-probes.js` with `listProbes`.
   - Update `tools/learning-loop-mcp/tools/list-probes-tool.js` to import from core.
   - Strip logic from `tools/list-probes/list-probes.js`, leave CLI entry point.
   - Move test file and update import.

5. **Run tests after core move.**
   ```bash
   node --test tools/learning-loop-mcp/__tests__/search-index.test.js
   node --test tools/learning-loop-mcp/__tests__/list-verified.test.js
   node --test tools/learning-loop-mcp/__tests__/list-probes.test.js
   ```
   All must pass.

6. **Create shim CLIs.**
   - `tools/search-index-cli.js` — spawns MCP server, calls `index_search`, maps flags (`--capability`, `--dimension`, `--status`, `--json`) to tool args, prints results, exits with code 0.
   - `tools/list-verified-cli.js` — calls `capability_list_verified`, prints claims and evidence tables, exits 0.
   - `tools/list-probes-cli.js` — calls `capability_list_probes` with `stack` arg, prints paths or JSON, exits 0.
   Pattern follows `tools/validate-records-cli.js` exactly.

7. **Update `package.json` scripts.**
   ```json
   "search:index": "node tools/search-index-cli.js",
   "list:verified": "node tools/list-verified-cli.js",
   "list:probes": "node tools/list-probes-cli.js"
   ```

8. **Delete old directories.**
   ```bash
   rm -rf tools/search-index/ tools/list-verified/ tools/list-probes/
   ```

9. **Run integration tests.**
   ```bash
   pnpm search:index --json
   pnpm list:verified
   pnpm list:probes --stack api
   ```
   All must exit 0 with correct output.

10. **Run full test suite.**
    ```bash
    pnpm test
    ```
    Must pass.

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/search-index.js` exists and exports `searchIndex`.
- [ ] `tools/learning-loop-mcp/core/list-verified.js` exists and exports `listVerifiedClaims`.
- [ ] `tools/learning-loop-mcp/core/list-probes.js` exists and exports `listProbes`.
- [ ] `tools/search-index-cli.js` exists and works.
- [ ] `tools/list-verified-cli.js` exists and works.
- [ ] `tools/list-probes-cli.js` exists and works.
- [ ] `tools/search-index/`, `tools/list-verified/`, `tools/list-probes/` do not exist.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Test imports break after move | Medium | Update imports to `#mcp/core/...` or relative |
| Old directories referenced elsewhere | Low | `rg` audit before delete |
| Shim output formatting differs from old CLI | Low | Match old CLI output exactly |

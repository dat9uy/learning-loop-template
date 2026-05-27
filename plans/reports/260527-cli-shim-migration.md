# CLI-to-MCP Shim Migration

## Problem Statement

8 standalone CLIs live outside the MCP server. 5 have inverted dependency arrows (MCP tool imports from CLI module). 2 have no MCP tool at all. The `validate-records` CLI was already migrated to a thin MCP shim; the remaining 7 need the same treatment. Additionally, the disabled `generate-docs` CLI should be deleted entirely.

**Target state:** MCP core owns all logic. All CLIs are thin stdio shims. Zero logic duplication. No inverted imports.

## Requirements

- Move all CLI logic into `tools/learning-loop-mcp/core/`.
- Replace each standalone CLI with a thin stdio shim that calls the MCP server.
- Update `package.json` scripts to point to new shim paths.
- Delete standalone CLI directories and disabled `generate-docs`.
- `pnpm check` stays green throughout.

## Approaches Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| **A. All at once** | Single plan, single commit | Blast radius too large; hard to debug if tests break |
| **B. By sub-project (selected)** | Isolated risk per phase; tests validate each boundary; lessons from A inform B and C | 3 plans instead of 1 |
| **C. Only shim existing MCP-tool CLIs** | Minimal scope | Leaves `validate-plan-loop` and `check-budget` as orphans |
| **D. Keep some local logic in shims** | Simpler for complex CLIs | Violates "thin shim" principle; reintroduces duplication risk |

Selected: **B**. The `validate-records` migration proved sub-project-sized chunks work. We repeat that pattern.

## Final Design

### Architecture

```
CLI shim (tools/<name>-cli.js)
  → MCP server (tools/learning-loop-mcp/server.js)
    → MCP tool (tools/learning-loop-mcp/tools/<tool>.js)
      → MCP core module (tools/learning-loop-mcp/core/*.js)
```

All logic in `core/`. All CLIs thin shims. One exception: `verify-claim` shim calls 3 tools sequentially (`index_validate` → `index_update_claim` → `index_validate`) because it's a safety-critical write.

### Sub-project A: Read-Only CLIs (shim-only)

| CLI shim | Deletes | Core module | MCP tool |
|----------|---------|-------------|----------|
| `search-index-cli.js` | `tools/search-index/` | `core/search-index.js` | `index_search` (exists) |
| `list-verified-cli.js` | `tools/list-verified/` | `core/list-verified.js` | `capability_list_verified` (exists) |
| `list-probes-cli.js` | `tools/list-probes/` | `core/list-probes.js` | `capability_list_probes` (exists) |

Action: Move `searchIndex`, `listVerifiedClaims`, `listProbes` into `core/`. Update existing tools to import from core. Create 3 shims. Delete old directories.

### Sub-project B: Write-Capable / Complex CLIs (move logic to core, then shim)

| CLI shim | Deletes | Core module | MCP tool |
|----------|---------|-------------|----------|
| `generate-capabilities-cli.js` | `tools/generate-capabilities/` | `core/generate-capabilities.js` | `capability_generate` (exists) |
| `extract-index-cli.js` | `tools/extract-index/` | `core/extract-index.js` | `index_extract` (exists) |
| `verify-claim-cli.js` | `tools/claim-verification/` | `core/claim-update.js` | `index_update_claim` (exists) |

Action: Move pure functions into core. Update tools to import from core. Create 3 shims. `verify-claim` shim is the multi-call exception (validate → update → validate).

### Sub-project C: New MCP Tools (greenfield)

| CLI shim | Deletes | Core module | New MCP tool |
|----------|---------|-------------|--------------|
| `validate-plan-loop-cli.js` | `tools/validate-plan-loop/` | `core/plan-validator.js` | `index_validate_plans` |
| `check-budget-cli.js` | `tools/check-budget/` | `core/budget-checker.js` | `budget_check` |

Action: Extract pure functions from standalone CLIs into core. Create new MCP tool files. Register in `manifest.json`. Create 2 shims. Delete old directories.

### Also Delete

- `tools/generate-docs/` — disabled, no MCP tool, no shim.

### Package.json Script Updates

```json
{
  "validate:records": "node tools/validate-records-cli.js",
  "validate:plan-loop": "node tools/validate-plan-loop-cli.js",
  "verify:claim": "node tools/verify-claim-cli.js",
  "generate:capabilities": "node tools/generate-capabilities-cli.js",
  "extract:index": "node tools/extract-index-cli.js",
  "search:index": "node tools/search-index-cli.js",
  "list:verified": "node tools/list-verified-cli.js",
  "list:probes": "node tools/list-probes-cli.js",
  "check:budget": "node tools/check-budget-cli.js"
}
```

Remove: `generate:docs` script.

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `pnpm check` references deleted paths | High | Audit scripts before each commit |
| Import paths break during module move | Medium | Use `#lib/` and `#mcp/` aliases; update `package.json` `imports` if needed |
| MCP server spawn overhead in CI | Low | ~200ms per shim; acceptable |
| `verify-claim` multi-call shim complexity | Medium | Document exception; keep single transport open |
| Tests break when modules move | Medium | Update imports; run `pnpm test` after each sub-project |
| `manifest.json` misses new tools | Medium | Add entries during C; validate with integration test |

## Success Metrics

- All 7 new shims exist and are executable.
- `pnpm <script>` exits 0 for each migrated CLI.
- `pnpm check` exits 0 after each sub-project.
- `rg "tools/(search-index|list-verified|list-probes|generate-capabilities|extract-index|claim-verification|validate-plan-loop|check-budget|generate-docs)/"` returns zero matches in active code.
- No standalone logic remains outside `core/` for migrated features.

## Next Steps

1. **Sub-project A** — Read-only shim migration (`search-index`, `list-verified`, `list-probes`)
2. **Sub-project B** — Write-capable logic migration (`generate-capabilities`, `extract-index`, `verify-claim`)
3. **Sub-project C** — New MCP tools (`validate-plan-loop`, `check-budget`)
4. **Cleanup** — Delete `generate-docs`
5. **Integration validation** — Full `pnpm check`

Build order: A → B → C. A validates the shim pattern on trivial cases. B applies it to complex cases. C is greenfield with patterns proven in A+B.

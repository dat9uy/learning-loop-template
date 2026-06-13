---
phase: 2
title: "Stale Reference Cleanup"
status: pending
priority: P2
effort: "15min"
dependencies: [1]
---

# Phase 2: Stale Reference Cleanup

## Overview

Remove stale string references to deleted modules from live MCP tools and documentation. These are not ES module imports but runtime tool-name suggestions and documentation that will mislead agents and operators.

## 2A: TOOL_MAP Cleanup in Workflow Tools

Two live MCP tools reference `extract_index` and `generate_capabilities` as suggested tool names:

**`tools/learning-loop-mcp/tools/workflow-classify-prompt-tool.js`:**
- Line 26: `evidence: ["extract_index", "validate_records"]` → remove `"extract_index"`
- Line 29: `product: ["generate_capabilities", "extract_index"]` → remove both
- Line 33: `self_improvement: ["validate_records", "extract_index"]` → remove `"extract_index"`

**`tools/learning-loop-mcp/tools/workflow-generate-prompt-tool.js`:**
- Line 65: `evidence: ["validate_records", "extract_index"]` → remove `"extract_index"`
- Line 67: `"product-build": ["generate_capabilities", "validate_records"]` → remove `"generate_capabilities"`

## 2B: Documentation Scrub

| File | Stale References | Action |
|------|-----------------|--------|
| `docs/system-architecture.md` | `extract_index_entries`, `search_index_entries`, `list_verified_claims`, `extract-index-cli.js` | Remove tool descriptions, update tool count |
| `docs/operator-guide.md` | `pnpm extract:index`, `extract_index_entries`, `search_index_entries` | Remove extraction workflow instructions |
| `docs/record-system-architecture.md` | `extract-index/` directory, `pnpm extract:index` | Remove index extractor references |
| `docs/artifact-concepts.md` | `extract-index/index-entry-builder.js`, `extract-index` | Remove extraction examples |
| `tools/learning-loop-mcp/references/tool-selection-guide.md` | `capability_list_verified` | Remove row |
| `tools/learning-loop-mcp/references/context-retrieval-patterns.md` | `search-index`, `pnpm search:index` | Remove search index patterns |

## Implementation Steps

1. Edit `workflow-classify-prompt-tool.js` — remove dead tool names from TOOL_MAP
2. Edit `workflow-generate-prompt-tool.js` — remove dead tool names from suggestedTools
3. Scrub each documentation file listed above
4. Run `pnpm test` to verify no regressions

## Success Criteria

- [ ] Zero `extract_index` or `generate_capabilities` references in TOOL_MAP/suggestedTools
- [ ] Zero stale references to deleted modules in documentation
- [ ] `pnpm test` passes

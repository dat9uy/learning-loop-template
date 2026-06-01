---
phase: 2
title: "Vendor Doc Assist Tool"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Vendor Doc Assist Tool

## Overview

Create the `workflow_vendor_doc_assist` MCP tool that reads a vendor markdown doc (unschematized, no frontmatter required) and produces suggested evidence frontmatter + `## Findings` bullets. The tool does NOT write to `records/` — suggestions are transient, human writes the final evidence file.

## Requirements

- Functional: Tool reads a vendor doc from `records/<surface>/vendor-docs/` or any repo path.
- Functional: Tool parses the doc for headings, tables, and API descriptions.
- Functional: Tool suggests evidence frontmatter (capability, dimension, scope, validation_status) based on content analysis.
- Functional: Tool suggests `## Findings`-format bullets with topic tags, confidence scores, and source section references.
- Functional: Tool queries existing index to avoid duplicate assertions and flag possible supersessions.
- Functional: Tool supports optional `capability` filter to narrow suggestions.
- Non-functional: Tool does NOT write to `records/<surface>/evidence/` or create index entries.
- Non-functional: Tool completes in <5 seconds for typical vendor docs (<500KB).

## Architecture

The tool follows the existing MCP tool pattern in `tools/learning-loop-mcp/tools/`. It uses the `workflow_*` naming convention and is registered via `tool-registry.js`.

### Implementation Modules

- `tools/learning-loop-mcp/tools/workflow-vendor-doc-assist-tool.js` — MCP tool definition (schema, handler)
- `tools/learning-loop-mcp/core/vendor-doc-assist/` — extraction logic
  - `doc-parser.js` — parse vendor doc into sections (headings, tables, lists)
  - `suggestion-engine.js` — map sections to evidence frontmatter + findings
  - `index-querier.js` — search existing index for duplicates and supersessions

### Suggestion Engine Logic

The suggestion engine is deliberately simple and rule-based (no LLM integration). It uses heading patterns and keyword heuristics:

1. **Capability detection:** Scan headings for known capability names (vnstock-data, fastapi, tanstack, etc.) from the capability list.
2. **Dimension detection:** If headings mention "install", "setup", "dependency" → `install`. If "API", "method", "runtime" → `runtime`. If "config", "schema", "structure" → `static`. Default: `static`.
3. **Scope:** Always suggests `sandbox` for vendor docs (conservative default).
4. **Validation status:** Always suggests `pending`.
5. **Findings extraction:** For each section under a heading matching `[A-Za-z ]+`, generate a bullet: `- [topic-tag] Description of what this section asserts.`
6. **Confidence scoring:** Simple heuristic based on explicitness of the claim (0.5–0.9). Tables with clear API signatures → 0.85. Narrative text → 0.6.
7. **Cross-reference:** Search existing index for same capability + dimension + topic_tag; flag `possibly-superseded` if found.

## Related Code Files

- Create: `tools/learning-loop-mcp/tools/workflow-vendor-doc-assist-tool.js`
- Create: `tools/learning-loop-mcp/core/vendor-doc-assist/doc-parser.js`
- Create: `tools/learning-loop-mcp/core/vendor-doc-assist/suggestion-engine.js`
- Create: `tools/learning-loop-mcp/core/vendor-doc-assist/index-querier.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` — add tool entry
- Create: `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` — tests

## Implementation Steps

1. Create `tools/learning-loop-mcp/core/vendor-doc-assist/doc-parser.js`:
   - Export `parseDoc(text)` → `{ title, sections: [{ heading, level, lines, hasTable, hasCode }] }`
   - Simple line-based parser: detect `# ## ###` headings, `|`-delimited tables, ` ``` ` code blocks.
2. Create `tools/learning-loop-mcp/core/vendor-doc-assist/suggestion-engine.js`:
   - Export `generateSuggestions(parsedDoc, { capabilityFilter, existingIndex })` → `{ suggested_frontmatter, suggested_findings, cross_references, notes }`
   - Known capabilities list: `vnstock-data`, `fastapi`, `tanstack`, `product`, `meta`, `loop`.
   - Dimension heuristics: heading text + keyword matching.
   - Confidence: `0.5` default, `+0.1` for tables, `+0.1` for code examples, `+0.15` for explicit API shape.
3. Create `tools/learning-loop-mcp/core/vendor-doc-assist/index-querier.js`:
   - Export `queryExistingIndex(root, capability, dimension)` → list of existing assertion IDs + topic_tags.
   - Reuses `searchIndex` from `tools/learning-loop-mcp/core/search-index.js`.
4. Create `tools/learning-loop-mcp/tools/workflow-vendor-doc-assist-tool.js`:
   - Schema: `surface`, `vendor_doc_path`, `capability` (optional), `existing_index_query` (optional).
   - Handler: read file → parse → generate suggestions → return JSON.
   - Does not write anything.
5. Add tool to `tools/learning-loop-mcp/tools/manifest.json`.
6. Create tests in `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js`:
   - Test with a synthetic vendor doc (markdown headings, table, code block).
   - Verify suggested findings have confidence > 0.5.
   - Verify capability detection from headings.
   - Verify no writes occur.
7. Run `pnpm test` to verify.

## Success Criteria

- [x] `workflow_vendor_doc_assist` tool registered in manifest and callable via MCP
- [x] Tool reads a vendor doc and returns structured suggestions
- [x] Suggested findings include at least one `## Findings`-format bullet with confidence > 0.5
- [x] Capability detection works for known capabilities (vnstock-data, fastapi, tanstack)
- [x] Cross-reference detection flags existing index matches
- [x] Tool does not write to `records/<surface>/evidence/`
- [x] Tests pass
- [x] `pnpm check` passes

## Risk Assessment

- **Suggestion engine quality too low:** Medium — confidence threshold ensures only high-quality suggestions are presented; human always writes final evidence.
- **Capability detection misses new capabilities:** Low — capabilities list is hardcoded; new capabilities are added manually. Tool falls back to `meta` as default.
- **Doc parser breaks on non-standard markdown:** Low — vendor docs are typically well-structured markdown. Parser is line-based and lenient.
- **Index querier performance:** Low — uses existing `searchIndex` which reads from disk. For <1000 index entries, this is negligible.
- **Tool name collision:** Low — `workflow_vendor_doc_assist` is unique in the manifest.

# 2026-06-13: Stale Fixture + Dead Code Resolution

**Plan:** `plans/260613-1530-stale-fixture-and-dead-code-resolution/`
**Findings resolved:** `meta-260613T1448Z-scout-fixtures-...`, `meta-260613T1448Z-dead-product-surface-...`

## What changed

**Dead code deletion (12 files):**
- `tools/learning-loop-mcp/core/extract-index/` (6 files) — unbound product surface, zero importers
- `tools/learning-loop-mcp/core/list-verified.js` — dead
- `tools/learning-loop-mcp/core/search-index.js` — dead
- 4 test files for the above

**Stale reference cleanup:**
- Removed `extract_index`, `generate_capabilities` from TOOL_MAP in `workflow-classify-prompt-tool.js` and `workflow-generate-prompt-tool.js`
- Scrubbed 6 docs: `system-architecture.md`, `operator-guide.md`, `record-system-architecture.md`, `artifact-concepts.md`, `tool-selection-guide.md`, `context-retrieval-patterns.md`
- Tool count corrected: 35→31

**Scout fixture regeneration:**
- Ran `run-scout.js` with `writeJson: true` — 110 inventory items, 0 stale refs
- Deleted stale `records/meta/.cache/loop-describe-cold.json`

**Fallow health triage:**
- 218→189 findings (23 auto-resolved from dead code, 6 suppressed)
- Critical: 74→59
- Suppressed: `isSafeRegexPattern`, `splitSegments`, `applyPromotedRules`, `checkResolutionEvidence`, `coerceParamsToSchema`, `validateSourceRefs` — all verified low change frequency via git log

## Meta-state patches

- Cleared `evidence_code_ref` on dead-code finding (file deleted)
- Set `mechanism_check: false` on same finding (no code to hash)
- Refreshed fingerprint on `meta-260613T1421Z-...` after `record-validation-rules.js` edit

## Tests

878/878 pass throughout all phases.

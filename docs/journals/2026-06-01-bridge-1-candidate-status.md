# Bridge 1 — Evidence-First Auto-Assist Implementation

## Summary

Completed all 5 phases of Bridge 1 (Doc → Candidate Assertion). The system now supports machine-assisted vendor doc ingestion with a hard safety boundary preventing unverified assertions from reaching product code.

## Changes

### Schema & Extraction
- `schemas/index-entry.schema.json` — added `candidate` to the status enum
- `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js` — `STATUS_MAP.pending` now maps to `"candidate"` (was `"pending_approval"`)

### Vendor Doc Assist Tool
- New MCP tool: `workflow_vendor_doc_assist`
- Core modules: `doc-parser.js`, `suggestion-engine.js`, `index-querier.js`
- Rule-based heuristic engine (no LLM) that reads vendor markdown and suggests `## Findings` bullets + evidence frontmatter
- Tool is read-only — suggestions are transient, human writes final evidence

### Validation Hard-Block (Layer 5)
- `record-validation-rules.js` — new `validateCandidateConsumption` function
- Rejects experiment, decision, risk, and capability records that reference `candidate` assertions
- Frozen-legacy `claim` records are exempt
- Error message names both the candidate ID and the referencing record

### Index Query Filter
- `searchIndex()` — new `excludeCandidates` parameter (default true); skips `candidate` entries when no explicit status filter is set
- `listVerifiedClaims()` — new `includeCandidates` parameter (default false); adds `assertions` array to return value
- MCP tools `index_search` and `capability_list_verified` both expose `include_candidates` schema parameter

### Documentation
- `docs/artifact-concepts.md` — updated Dimension Overview tables to include `candidate` and distinguish it from `pending_approval`

## Tests

- 21 vendor-doc-assist tests
- 8 candidate-block validation tests
- 6 index-query-filter tests
- 1 bridge-1 e2e test (full pipeline)
- Existing extract-index tests expanded for pending→candidate mapping
- Full suite: 326 of 327 pass (1 pre-existing budget check failure unrelated to this work)

## Verification

- `pnpm validate:records` — passes (183 records, no candidate violations)
- `pnpm validate:plan-loop` — passes (65 plans, 0 violations)
- `pnpm extract:index --dry-run` — passes (114 entries, 0 written, all unchanged)

## Notable Decisions

1. `pending_approval` stays in the enum but is no longer produced by `extract-index`. It is reserved for a future human-promotion workflow.
2. The vendor doc assist tool uses keyword heuristics (not LLM) for fast, deterministic, transparent suggestions.
3. Candidate exclusion is default-true in both search and list tools — callers must explicitly opt-in to see unverified assertions.

## Risks Addressed

- Critical: `candidate` status cannot leak into product consumption via the validation layer hard-block
- Medium: suggestion quality is bounded by a confidence threshold (≥0.5); human always writes final evidence

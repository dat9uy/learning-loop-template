---
phase: 1
title: "Decision and Schema"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Decision and Schema

## Overview

Declare claims deprecated for new entries via a decision record, annotate the claim schema with deprecation metadata, create the `index-entry.schema.json` for the new `extracted-assertion` record type, and establish the `records/index/` directory.

## Context Links

- Brainstorm basis: `plans/reports/brainstorm-20260518-machine-extracted-index.md`
- Existing claim schema: `schemas/claim.schema.json`
- Existing decision examples: `records/decisions/decision-20260518T092116Z-vnstock-vendor-compat-removal.yaml`

## Key Insights

- The decision record format follows existing YAML frontmatter patterns (`id`, `schema_version`, `type: decision`, `status: approved`, `created_at`, `updated_at`, `source_refs`, `question`, `decision`, `rationale`, `alternatives`, `tradeoffs`, `supersedes`, `decision_effect`). `notes` is optional.
- JSON Schema Draft 2020-12 `deprecated` keyword is valid in AJV strict mode. It signals deprecation without breaking validation of existing records.
- The index entry schema omits top-level `created_at`/`updated_at` because chronology lives in the machine-generated `extraction` block (`first_extracted_at`, `last_updated_at`).

## Requirements

- Functional:
  - A decision record declares claim schema deprecated for new entries.
  - `schemas/claim.schema.json` carries `deprecated: true` + description pointing at the decision.
  - `schemas/index-entry.schema.json` validates `extracted-assertion` records.
  - `records/index/` directory exists (empty until Plan 3).
- Non-functional:
  - Schema must be AJV strict-mode compatible (Draft 2020-12).
  - No breaking changes to existing record validation.
- Document that `source_refs` shape is type-dependent: string array for most types, structured object array for `extracted-assertion`.

## Architecture

The `extracted-assertion` type introduces a new entity in the record system alongside claims, experiments, decisions, risks, and capabilities. It lives in `records/index/` and is machine-derived from evidence markdown `## Findings` sections.

## Related Code Files

- Create: `records/decisions/decision-260519T1400Z-claim-deprecation.yaml`
- Create: `schemas/index-entry.schema.json`
- Create: `records/index/` (directory, with `.gitkeep`)
- Modify: `schemas/claim.schema.json`

## Implementation Steps

1. **Author decision record** `records/decisions/decision-260519T1400Z-claim-deprecation.yaml`:
   - `id: decision-260519T1400Z-claim-deprecation`
   - `type: decision`, `status: approved`
   - `source_refs`: cite evidence files that support the deprecation (e.g., `local:records/evidence/...` if available; otherwise leave minimal).
   - `question`: "Should the claim schema be deprecated for new entries in favor of machine-extracted index entries?"
   - `decision`: "Claim schema is deprecated for new entries. Existing 10 claims remain frozen-legacy (read-only). New assertions are extracted into `records/index/` from evidence `## Findings`."
   - `rationale`: Cite the two root causes from the brainstorm (no synthesis work, claims not atomic) and how machine-extracted index solves both. Cite the brainstorm report by path in the rationale text (not as a `source_refs` entry, since `plans/reports/` is outside the `records/evidence` allowlist).
   - `decision_effect.action: supersede`, `scope: schema-improvement`, `affected_refs`: list the 10 existing claim files by `record:` prefix plus `local:plans/reports/brainstorm-20260518-machine-extracted-index.md`.

2. **Annotate claim schema** `schemas/claim.schema.json`:
   - Add top-level `"deprecated": true`.
   - Add `"description": "Claim Record — deprecated for new entries per decision-260519T1400Z-claim-deprecation. Existing claims are frozen-legacy."`

3. **Create index-entry schema** `schemas/index-entry.schema.json`:
   - `$schema`: `https://json-schema.org/draft/2020-12/schema`
   - `title`: `Extracted Assertion Index Entry`
   - `type`: `object`
   - Required fields: `id`, `schema_version`, `type`, `status`, `assertion`, `capability`, `dimension`, `scope`, `topic_tag`, `n_count`, `superseded_by`, `supersedes`, `source_refs`, `experiment_refs`, `extraction`
   - `id` pattern: `^assertion-[a-z0-9-]+-(static|install|runtime|product)-[a-z0-9-]+$`
   - `type` const: `extracted-assertion`
   - `status` enum: `active`, `superseded`, `pending_approval`
   - `dimension` enum: `static`, `install`, `runtime`, `product`
   - `n_count`: integer, minimum 1
   - `context`: string (optional)
   - `caveats`: array of strings (optional)
   - `source_refs`: array of objects with required `file` (JSON Schema `pattern: "^(local|record|legacy):.+"`), `section`, `bullet_index` (integer, min 1), `line_anchor`
   - `experiment_refs`: array of strings with pattern `^record:.+`
   - `superseded_by`: JSON Schema `type: ["string", "null"]` (required; null for active entries)
   - `supersedes`: array of strings (plain IDs, no `record:` prefix, consistent with existing `decision`/`claim` `supersedes`)
   - `extraction`: object with required `agent_run`, `first_extracted_at` (timestamp pattern), `last_updated_at` (timestamp pattern), `evidence_immutable_hash`

4. **Create directory** `records/index/` with a `.gitkeep` file so git tracks the empty directory.

## Success Criteria

- [ ] Decision record file exists and validates against `decision.schema.json`.
- [ ] `schemas/claim.schema.json` has `deprecated: true` and a description citing the decision.
- [ ] `schemas/index-entry.schema.json` is valid JSON Schema Draft 2020-12 (verify with AJV compile).
- [ ] `records/index/` directory exists with `.gitkeep`.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| AJV strict mode rejects `deprecated` keyword | Verified: Draft 2020-12 supports `deprecated`; AJV 8.x compiles it in strict mode. |
| Schema pattern for `id` is too loose or too tight | Pattern is intentionally simple; extraction tool is the real enforcement. Can tighten in Plan 2 if needed. |

## Security Considerations

- No auth or data-protection changes.
- Claim deprecation is editorial only — existing claims remain readable.

## Next Steps

- Phase 2: Extend validator plumbing to load and validate `extracted-assertion` records.

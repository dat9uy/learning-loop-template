---
phase: 3
title: "Artifact-Reference Index-Entry Addition"
status: completed
priority: P2
effort: "30m"
dependencies: [2]
---

# Phase 3: Artifact-Reference Index-Entry Addition

## Overview

Update `docs/artifact-reference.md` to add index-entry schema documentation alongside the existing claim schema tables. Add a deprecation banner at the top noting that the claim schema is deprecated for new entries. Update the cross-record reference map to include index entries. This phase fills a discovered gap: the artifact reference has no documentation for the new `extracted-assertion` type that Plans 1–3 introduced.

## Context Links

- Brainstorm Plan 4: `plans/reports/brainstorm-20260518-machine-extracted-index.md` § Plan 4
- Current doc: `docs/artifact-reference.md`
- Index entry schema: `schemas/index-entry.schema.json`
- Claim schema (deprecated): `schemas/claim.schema.json`
- Decision record: `records/decisions/decision-260519T1400Z-claim-deprecation.yaml`

## Key Insights

1. `docs/artifact-reference.md` is still titled “Claim Verification” and has zero mention of index entries. Readers looking up the `extracted-assertion` type will find nothing.
2. The claim schema tables (lines 119–143) are accurate for frozen-legacy claims. They should not be deleted; they should be marked as deprecated.
3. The cross-record reference map (lines 254–269) does not list index entries. It must be extended with `index_entry.source_refs` and any index-specific refs.
4. The validation architecture section (lines 280–326) describes Layer 3 as claim↔experiment↔decision ledger. This is historical truth for frozen-legacy claims. A note must be added that new validation targets the index, not the claim ledger.

## Requirements

- Functional: Add deprecation banner; add index-entry schema reference table; extend cross-record reference map.
- Non-functional: Do not remove existing claim tables; preserve them as frozen-legacy reference.

## Related Code Files

- Modify: `docs/artifact-reference.md`
- Read for context: `schemas/index-entry.schema.json`
- Read for context: `schemas/claim.schema.json`

## Implementation Steps

1. **Title and deprecation banner (top of file, line 1–4):**
   - Change title from `# Claim Verification` to `# Artifact Reference`.
   - Add immediately below title:
     ```markdown
     > **Deprecation notice:** The claim schema (`schemas/claim.schema.json`) is deprecated for new entries per `record:decision-260519T1400Z-claim-deprecation`. Existing claims in `records/claims/` are frozen-legacy (read-only audit trail). New work uses machine-extracted index entries (`schemas/index-entry.schema.json`, type `extracted-assertion`).
     ```

2. **Add new section “Index Entry” after “Claim” in the schema tables (after line 143):**
   ```markdown
   ### Index Entry (extracted-assertion)

   | Field | Type | Required | Allowed Values |
   |---|---|---|---|
   | `id` | string | yes | free |
   | `schema_version` | string | yes | free |
   | `type` | const | yes | `extracted-assertion` |
   | `assertion` | string | yes | free |
   | `context` | string | no | free |
   | `caveats` | array | yes | items: string |
   | `capability` | string | yes | free (extraction tool enforces `[a-z0-9-]+`) |
   | `dimension` | enum | yes | `static`, `install`, `runtime`, `product` |
   | `scope` | string | yes | free (conventionally `sandbox` or `production`) |
   | `topic_tag` | string | yes | free |
   | `n_count` | integer | yes | ≥ 1 |
   | `superseded_by` | string \| null | yes | `assertion-...` or `null` |
   | `supersedes` | array | yes | items: string |
   | `status` | enum | yes | `active`, `superseded`, `pending_approval` |
   | `source_refs[].file` | string | yes | `^(local|record|legacy):.+` |
   | `source_refs[].section` | string | yes | `"## Findings"` |
   | `source_refs[].bullet_index` | integer | yes | ≥ 1 |
   | `source_refs[].line_anchor` | string | yes | free |
   | `experiment_refs` | array | yes | items: pattern `^record:.+` |
   | `extraction.agent_run` | string | yes | free |
   | `extraction.first_extracted_at` | string | yes | ISO-8601 UTC |
   | `extraction.last_updated_at` | string | yes | ISO-8601 UTC |
   | `extraction.evidence_immutable_hash` | string | yes | `sha256:<hex>` |
   ```

3. **Update cross-record reference map (lines 254–269):**
   - Add row:
     ```markdown
     | `source_refs[]` | index entry | local files / records / legacy | `^(local|record|legacy):.+` | **Script** existence + allowed-root containment |
     | `experiment_refs[]` | index entry | experiment | `record:<id>` | **Script** existence |
     | `superseded_by` | index entry | index entry | bare assertion ID or `null` | Not validated (index entries use bare IDs, not `record:` prefix) |
     | `supersedes[]` | index entry | index entry | bare assertion ID | Not validated (index entries use bare IDs, not `record:` prefix) |
     ```

4. **Validation architecture section (lines 280–326):**
   - After the Layer 3 description, add:
     ```markdown
     **Index validation:** `tools/validate-records/` also validates `records/index/` YAMLs against `schemas/index-entry.schema.json`. Cross-record checks on index entries verify that `source_refs[].file` exists and that `experiment_refs[]` point to existing experiments. The claim-verification ledger (Layer 3) does not apply to index entries; they derive status directly from evidence `validation_status`. Semantic alignment of experiment proofs against index entry capability/dimension is not yet enforced.
     ```

5. **Add scope-limitation note at end of file:**
   - After all new sections, add:
     ```markdown
     > **Note:** This document remains predominantly claim-centric. Full index-first parallel sections (Dimension Overview for extracted assertions, Experiment Proof mapping for index entries, Product Decision routing) are a future documentation enhancement beyond the current canonicalization plan.
     ```

6. **Run `pnpm check` after save. Note:** `pnpm check` does not include `pnpm extract:index`; run that separately after evidence edits.

## Success Criteria

- [ ] `docs/artifact-reference.md` title changed to `Artifact Reference`.
- [ ] Deprecation banner present at top of file.
- [ ] Index entry schema table present and accurate against `schemas/index-entry.schema.json`.
- [ ] Cross-record reference map includes index entry rows.
- [ ] Validation architecture section notes index validation (including the semantic-alignment gap).
- [ ] A note is present acknowledging that the doc remains predominantly claim-centric and that full index-first parallel sections are a future doc enhancement.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Index entry schema table drifts from actual JSON schema | Copy field names directly from `schemas/index-entry.schema.json`; do not invent fields |
| Deprecation banner duplicates decision record wording | Cite the decision record by ID; keep banner to two sentences |
| Doc remains 90% claim-centric after update | Acknowledge as known limitation; full index-first parallel sections are a future enhancement beyond this plan's scope |

## Next Steps

- Phase 4 (Plans cleanup) depends on this phase for doc completeness.

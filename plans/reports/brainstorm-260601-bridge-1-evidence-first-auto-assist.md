# Brainstorm: Bridge 1 — Evidence-First Auto-Assist for Vendor Doc Ingestion

**Date:** 2026-06-01
**Skill:** ck:brainstorm
**Scope:** Bridge 1 (Doc → Candidate Assertion) of `docs/trajectory.md`
**Status:** Design approved, awaiting plan

---

## Problem Statement

The current system stops at Bridge 1. Vendor docs (e.g., `records/vnstock/evidence/unified-ui-snapshot/`, `llms.txt`) are stored as raw reference material but cannot be machine-ingested into the index because they lack the `## Findings` convention and evidence frontmatter. The gap is: "no candidate-extraction tool, and vendor docs do not author to `## Findings` convention."

The trajectory describes the destination as: "vendor documentation flows into candidate assertions, candidates become planned experiments, experiments run inside class-level approval gates and budget bounds, validated assertions land in the index, and product consumes only validated assertions."

This brainstorm determines the right abstraction, artifact model, and workflow to close the gap without polluting the index or abandoning the evidence-first quality gate.

---

## Constraints Discovered

1. **Vendor docs are not human-authored evidence.** The `_KIND.md` of `unified-ui-snapshot` explicitly says: `Extractable: No`, `Human-authored: No`. These are vendor-captured docs, not experiment observations.
2. **Index status enum is currently** `active | superseded | pending_approval`. No slot for "vendor-asserted, not yet verified."
3. **Evidence frontmatter requires** `record_type: evidence`, `capability`, `dimension`, `scope`, `validation_status`. Vendor docs have none of this.
4. **Product code must never consume unverified assertions.** The trajectory says: "Product reads only `active`."
5. **Not all vendor doc content is worth indexing.** The operator noted: "it's not useful to index all the ## Providers when we only used one provider."

---

## Approaches Evaluated

### Approach A: Ingestion Pipeline (Auto-Ingest, Xia-Pattern)

**Design:** Build a full pipeline with stages: Recon → Map → Analyze → Challenge → Plan. Vendor docs auto-ingested into `records/<surface>/vendor-docs/`. A new MCP tool `workflow_vendor_doc_ingest` parses them, extracts candidate assertions, creates index entries with `status: candidate`, and generates experiment plans.

**Pros:**
- Full autonomy path. Closes Bridge 1 entirely.
- Leverages the `ck:xia` recon/map/analyze/challenge pattern as a mental model.
- Scales to hundreds of vendor assertions without operator bottleneck.

**Cons:**
- High complexity. Needs LLM integration, confidence scoring, deduplication.
- Risk of index noise. Vendor docs contain thousands of assertions, most irrelevant.
- No quality gate. Auto-extracted assertions may misrepresent vendor behavior.
- Violates the "human operator approves classes of work, not individual experiments" principle if the loop proposes its own candidates.

**Verdict:** Rejected. Too much autonomy too fast. The trajectory says "The loop does not propose its own expansion of authority."

---

### Approach B: Evidence-First with Auto-Assist (Human-in-the-Loop)

**Design:** Vendor docs stay as raw reference in `records/<surface>/vendor-docs/`. A new MCP tool `workflow_vendor_doc_assist` reads a vendor doc + existing index, suggests `## Findings` bullets and frontmatter. The human writes the final evidence file. `extract-index` produces index entries with `status: candidate` (new status). Product gates hard-block on `candidate`.

**Pros:**
- Quality preserved. Human curates vendor assertions into evidence.
- Builds on existing evidence convention. No new artifact type.
- `candidate` status cleanly separates vendor-claimed from experiment-proven.
- Product gate hard-block prevents accidental consumption of unverified assertions.
- Matches the existing `workflow_*` MCP tool family.

**Cons:**
- Not autonomous. Operator still writes evidence.
- Requires schema change (`index-entry.schema.json` status enum).
- Requires new MCP tool.

**Verdict:** Selected. Balances autonomy and quality. Human curates, machine assists, product is protected.

---

### Approach C: Selective Auto-Extraction with Capability Filtering

**Design:** Auto-parse vendor docs, but only extract sections matching active capabilities in product. Candidates go to index with `status: candidate`. A `candidate_review` workflow promotes relevant ones.

**Pros:**
- No index pollution. Focused on what product uses.
- Partially autonomous. Machine decides what to extract, human reviews.

**Cons:**
- Requires maintaining capability→doc-section mapping. Brittle.
- The "active capabilities" list is itself a product artifact that changes.
- Introduces a new workflow (`candidate_review`) before Bridge 1 is even closed.

**Verdict:** Rejected. Adds a dependency (capability mapping) that does not yet exist. Defer to a future bridge.

---

## Final Design

### Artifact Model

| Layer | Path | Status | Human Role | Machine Role |
|-------|------|--------|-----------|-------------|
| Raw vendor docs | `records/<surface>/vendor-docs/*.md` | Unschematized | Curates (adds/removes snapshots) | Stores, tracks freshness |
| Suggested evidence | `workflow_vendor_doc_assist` output | N/A (transient) | Reviews, edits | Generates suggestions |
| Human-authored evidence | `records/<surface>/evidence/*.md` | `validation_status: pending` | Writes `## Findings` + frontmatter | Validates via `extract-index` |
| Candidate assertion | `records/<surface>/index/*.yaml` | `status: candidate` | Reviews during experiment planning | Extracts from evidence |
| Active assertion | `records/<surface>/index/*.yaml` | `status: active` | Approves experiment class | Updates after experiment |

### New Schema Field

In `schemas/index-entry.schema.json`:

```json
"status": {
  "enum": ["active", "superseded", "pending_approval", "candidate"]
}
```

- `candidate`: Extracted from evidence with `validation_status: pending` or from vendor-doc-assisted evidence. Not consumable by product.
- `pending_approval`: Human has marked it for promotion but experiment not yet run.
- `active`: Experimentally verified or decision-approved.
- `superseded`: Replaced by a newer assertion.

### Product Gate Behavior

**Hard block:** `candidate` assertions referenced by product code, decisions, or experiments trigger a validation error in `validate_records` (Layer 4).

**Soft filter:** `list-verified` and `search-index` MCP tools default to `status: active` only. A `--include-candidates` flag (default false) overrides.

### MCP Tool: `workflow_vendor_doc_assist`

**Name:** `workflow_vendor_doc_assist`
**Input:**
- `surface`: string (e.g., `vnstock`, `fastapi`)
- `vendor_doc_path`: string, relative to root (e.g., `records/vnstock/vendor-docs/unified-ui-snapshot.md`)
- `capability`: optional string, filters suggestions to this capability
- `existing_index_query`: optional string, searches existing index to avoid duplicates

**Output:**
```json
{
  "suggested_frontmatter": {
    "record_type": "evidence",
    "capability": "vnstock-data",
    "dimension": "static",
    "scope": "sandbox",
    "validation_status": "pending"
  },
  "suggested_findings": [
    {
      "topic_tag": "unified-ui-api",
      "assertion": "Unified UI provides a single entry point for all data types...",
      "confidence": 0.85,
      "source_section": "## Tổng Quan",
      "existing_index_match": null
    }
  ],
  "cross_references": [
    {
      "existing_assertion_id": "assertion-vnstock-data-static-reference-layer",
      "relationship": "possibly-superseded"
    }
  ],
  "notes": "Vendor doc is in Vietnamese. Key API surface described in migration tables."
}
```

**Behavior:**
- Does NOT write to `records/<surface>/evidence/`.
- Does NOT create index entries.
- Suggestions are transient; human writes the final evidence file.

### Vendor Doc Storage

New directory: `records/<surface>/vendor-docs/`

Files stored here are:
- Unschematized (no JSON schema)
- No frontmatter required
- Not processed by `extract-index`
- Referenced by `local:` source refs in evidence files

Example ingestion:
```
records/vnstock/vendor-docs/
  unified-ui-migration-guide.md    (from vendor GitHub)
  llms.txt                         (from docs.goclaw.sh)
  vendor-api-changelog-2026-05.md  (from vendor RSS)
```

### Evidence Authoring Flow

1. Operator places vendor doc in `records/<surface>/vendor-docs/`.
2. Agent calls `workflow_vendor_doc_assist` with the path.
3. Agent receives suggested findings + frontmatter.
4. Agent (or operator) writes `records/<surface>/evidence/<slug>.md` with:
   - Frontmatter matching the suggestion
   - `## Findings` with curated bullets
   - `## Source` citing `local:records/<surface>/vendor-docs/<file>`
5. Agent runs `pnpm extract:index` (or `index_extract` MCP tool).
6. New index entry created with `status: candidate`.
7. Agent designs experiment (Bridge 2) to prove the assertion.
8. After experiment, `extract-index` updates `status: active`.

---

## Integration with `ck:xia`

The `ck:xia` skill's workflow is: Recon → Map → Analyze → Challenge → Plan → Deliver.

We borrow this pattern as a **mental model** for the vendor doc ingestion pipeline, not as a direct tool invocation:

| Xia Phase | Bridge 1 Equivalent |
|-----------|---------------------|
| Recon | Read vendor doc, identify sections |
| Map | Map doc sections to existing index/capabilities |
| Analyze | Identify assertions, confidence, duplicates |
| Challenge | Cross-check against existing evidence, flag contradictions |
| Plan | Suggest evidence file + frontmatter + findings |
| Deliver | Human writes evidence; machine extracts index |

We do NOT invoke `ck:xia` directly. The `workflow_vendor_doc_assist` tool embeds this pattern in its implementation.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `candidate` status leaks into product | Critical | Hard-block in validation layer; `list-verified` defaults to `active` only |
| Vendor doc freshness not tracked | Medium | Add `vendor_doc` metadata (fetched_at, source_url, etag) in a sidecar YAML |
| Suggestions are low-quality | Medium | Confidence score threshold; human always writes final evidence |
| Index grows with stale candidates | Low | `candidate` entries without `experiment_refs` after 30 days trigger a warning |
| Evidence convention drift | Medium | `workflow_vendor_doc_assist` enforces the 7-section + 11-key frontmatter envelope |

---

## Success Metrics

1. A vendor doc can be placed in `vendor-docs/` and `workflow_vendor_doc_assist` produces a suggestion in <5 seconds.
2. The suggestion includes at least one `## Findings`-format bullet with confidence >0.7.
3. `extract-index` produces a `status: candidate` entry when evidence has `validation_status: pending`.
4. `validate_records` rejects any product decision or experiment that references a `candidate` assertion.
5. `list-verified` does not return `candidate` entries unless `--include-candidates` is set.

---

## Next Steps

1. **Plan:** Create `plans/260601-bridge-1-evidence-first-auto-assist/plan.md` via `/ck:plan`.
   - Phase 1: Schema change (`index-entry.schema.json` + `index-entry-builder.js`)
   - Phase 2: MCP tool `workflow_vendor_doc_assist`
   - Phase 3: Validation layer hard-block for `candidate`
   - Phase 4: `list-verified` / `search-index` filter
   - Phase 5: Test with `unified-ui-snapshot` vendor doc
2. **Implementation:** `/ck:cook` the plan.
3. **Journal:** `/ck:journal` after completion.

---

## Cross-References

- Trajectory: `docs/trajectory.md` §The Four Bridges
- Artifact concepts: `docs/artifact-concepts.md`
- Existing index extraction: `tools/learning-loop-mcp/core/extract-index/`
- Evidence template candidate: `records/meta/evidence/install-experiment-template-candidate.md`
- Xia skill: `~/.factory/skills/xia/SKILL.md`

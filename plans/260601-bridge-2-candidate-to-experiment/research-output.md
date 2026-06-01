# Research Output: Bridge 2 — Candidate to Experiment

## 1. Live Candidate Count

**Confirmed: 0 live candidates.**

- `grep -r "status: candidate" records/` returned **no matches**.
- The `index-entry.schema.json` `status` enum includes `candidate` (`["active", "superseded", "pending_approval", "candidate"]`)
- All 79 existing assertions in `records/**/index/assertion-*.yaml` are `status: active` (or `superseded` in the case of `assertion-vnstock-data-runtime-device-id-injection-required`).
- **Implication:** Bridge-1 (doc → candidate assertion pipeline) has not yet produced any `candidate` entries. Bridge-2 end-to-end testing will require synthetic candidate test data, or Bridge-1 must be exercised first to produce a real candidate.

## 2. Experiment Patterns per Dimension

Surveyed 18 experiment records (16 vnstock + 2 meta). Extracted patterns per dimension:

### Install Dimension (9 experiments)

**Method patterns:**
- Fresh container setup (Python version, substrate venv)
- Env var configuration (HOME, PATH, VIRTUAL_ENV, API key)
- Installer download and execution (one-liner, wrapper script, or direct run)
- Verification steps (exit code, import check, version capture, device registration)
- Cleanup / temp file audit

**Success metrics patterns:**
- `installer-exits-0` (or script-exits-0)
- `vnstock-data-imports-successfully` (or import check)
- `vnstock-data-version-captured` (or version captured)
- `substrate-venv-left-unmodified` (or substrate check)
- `venv-path-follows-HOME-override` (or venv path observation)
- `temp-root-cleaned-with-container` (or cleanup)
- `device-registers-successfully` (bronze tier)
- `metadata-captured`

**Example:** `experiment-vnstock-install-full-20260514T140811Z` (most comprehensive install experiment)

### Runtime Dimension (4 experiments)

**Method patterns:**
- Capability script creation / execution per domain layer
- Live API smoke tests (listing, quote, company search)
- Runtime patch verification (compat injection, Device-Id header)
- Metadata-only output capture (schema shape, row counts, column names)

**Success metrics patterns:**
- `all-capability-scripts-execute-without-error`
- `{layer}-returns-dataframe-with-{data-type}-data`
- `live-{api}-smoke-tests-pass`
- `output-matches-expected-unified-ui-schema`
- `VCI-get_headers-returns-Device-Id`

**Example:** `experiment-vnstock-capabilities-20260509T174957Z` (5-layer capability verification) and `experiment-vnstock-runtime-403-fix-20260511T143500Z` (Device-Id injection fix)

### Product Dimension (2 experiments)

**Method patterns:**
- Run actual bootstrap script in product directory
- Verify idempotency (skip when already installed)
- Verify config state (.vnstock files)
- Test import from product venv

**Success metrics patterns:**
- `script-exits-0`
- `vnstock-data-imports-from-product-venv`
- `dot-vnstock-config-valid`
- `idempotency-works-on-re-run`

**Example:** `experiment-vnstock-product-bootstrap-20260514T140811Z`

### Schema-Improvement (Meta) Dimension (2 experiments)

**Method patterns:**
- Template comparison / fit classification
- Validator fixture testing (positive + negative)
- Live ledger validation

**Success metrics patterns:**
- `All-{N}-cases-fit-template-or-legacy-classified`
- `No-required-section-empty`
- `Optional-section-list-stable`
- `Positive-fixture-validates`
- `Negative-fixtures-fail-with-expected-messages`

**Example:** `experiment-meta-install-template-candidate-260512T0046Z` and `experiment-meta-capabilities-stack-allowlist-20260510T160000Z`

### Pattern Summary

| Dimension | Method Steps | Success Metrics | Scope |
|-----------|-------------|-----------------|-------|
| install | 6-8 steps (container → env → install → verify → cleanup) | 5-7 metrics (exit, import, version, substrate, venv, device, metadata) | sandbox |
| runtime | 4-8 steps (scripts → smoke tests → metadata capture) | 4-7 metrics (execution, dataframes, schema match, Device-Id) | sandbox |
| product | 3-5 steps (bootstrap → idempotency → config → import) | 3-4 metrics (exit, import, config, idempotency) | product env |
| schema-improvement | 2-4 steps (compare → classify → validate) | 3-5 metrics (fit, stability, fixture results) | meta |

## 3. `source_refs` vs `assertion_refs` Decision

### Current State
- `experiment.schema.json` has `source_refs` (array of strings, pattern `^(local|record|legacy):.+`)
- `source_refs` already holds `record:` prefixes (e.g., `record:experiment-vnstock-install-bootstrap-substrate-20260513T182621Z`, `record:claim-vnstock-version-requirements`)
- `experiment-writer.js` creates experiments with `source_refs: []` by default
- Assertion records (`index-entry.schema.json`) have `experiment_refs` (array of `record:` strings) — the bidirectional link already exists

### Analysis
- `source_refs` is **sufficient** for holding `record:<assertion-id>` references
- `source_refs` is currently used for both evidence files (`local:`) and other records (`record:`)
- Adding `assertion_refs` would make intent **explicit** and enable schema-level validation (e.g., asserting the referenced record is actually an `extracted-assertion` type)
- The schema already has `claim_refs` and `risk_refs` as dedicated reference fields, suggesting a pattern of dedicated reference arrays for specific record types

### Decision: **Add `assertion_refs` to experiment schema**

**Rationale:**
1. `source_refs` is overloaded — it holds evidence files, claims, experiments, and would also hold assertions
2. `claim_refs` and `risk_refs` already set the precedent for dedicated reference fields
3. `assertion_refs` enables AJV-level pattern validation (e.g., `^record:assertion-...`) and queryability
4. The change is **non-breaking** — `experiment.schema.json` has `additionalProperties: true` (implicit in Draft 2020-12 when not set to false)
5. `experiment-writer.js` can be updated to support `assertion_refs` as an optional parameter

### Required Schema Change
```json
"assertion_refs": {
  "type": "array",
  "items": {
    "type": "string",
    "pattern": "^record:assertion-[a-z0-9-]+-(static|install|runtime|product)-[a-z0-9-]+$"
  }
}
```

## 4. Experiment Template

The implicit YAML template is defined in `tools/learning-loop-mcp/core/experiment-writer.js` (`buildExperimentYaml`). It produces:

- All required fields from `experiment.schema.json` (id, schema_version, type, status, created_at, updated_at, source_refs, goal, hypothesis, method, success_metrics, result, agent_outcome, product_outcome, observations, promotion_review)
- Optional fields: scope, claim_refs, risk_refs, output_level, output_capture, verification

The `verification` block always includes:
- `claim_refs` (copied from input)
- `proves` (empty array initially)
- `requires_human_approval: true`
- `approval_status: "not-required"`

## 5. Key Files Reviewed

| File | Purpose | Relevance |
|------|---------|-----------|
| `schemas/experiment.schema.json` | Experiment record schema | Needs `assertion_refs` addition |
| `schemas/index-entry.schema.json` | Assertion index entry schema | Status enum includes `candidate` |
| `tools/learning-loop-mcp/core/experiment-writer.js` | Experiment YAML builder | Needs `assertion_refs` support |
| `records/meta/evidence/install-experiment-template-candidate.md` | Evidence template | Defines candidate → experiment authoring conventions |
| `docs/trajectory.md` | Bridge definitions | Bridge 2: candidate → experiment plan |

## 6. Risk Findings

| Risk | Status | Mitigation |
|------|--------|------------|
| No candidate entries exist | **Confirmed** | Use synthetic test data in e2e tests; or exercise Bridge-1 first |
| Experiment patterns vary by dimension | **Confirmed** | Dimension-specific templates with override capability |
| Schema change needed | **Low** | Adding `assertion_refs` is non-breaking (additionalProperties: true) |

## 7. Synthetic Test Data

For Bridge-2 testing without a live candidate, a synthetic candidate can be created in the test suite:

```yaml
id: assertion-vnstock-data-install-synthetic-test
schema_version: "1.0"
type: extracted-assertion
status: candidate
assertion: "Synthetic test assertion for Bridge-2 pipeline validation"
capability: vnstock-data
dimension: install
scope: sandbox
topic_tag: synthetic-test
n_count: 1
superseded_by: null
supersedes: []
source_refs: []
experiment_refs: []
extraction:
  agent_run: "bridge-2-test"
  first_extracted_at: "2026-06-01T00:00:00Z"
  last_updated_at: "2026-06-01T00:00:00Z"
  evidence_immutable_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
```

This satisfies the `index-entry.schema.json` validation and provides a testable candidate for the Bridge-2 pipeline.

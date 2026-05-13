# Claim Verification

This document is the source of truth for claim verification. Claims no longer move through a single ordered state chain. Each claim asserts one or more independent verification dimensions, and each dimension is proved or rejected by the correct authority.

## Dimension Overview

| Dimension | Status values | Extra fields | Proof authority |
|---|---|---|---|
| `static` | `claimed`, `verified`, `rejected` | none | Experiment |
| `install` | `claimed`, `verified`, `rejected` | `scope: sandbox \| production` | Approved human-gated experiment |
| `runtime` | `claimed`, `verified`, `rejected` | `scope`, `output` | Approved human-gated experiment |
| `product` | `claimed`, `approved`, `rejected` | none | Approved decision |

At least one dimension must be present. `claimed` dimensions must not carry proof refs. Verified, approved, or rejected dimensions must carry matching proof refs or decision refs.

## Claim Fields

Every claim record includes a `verification` block:

```yaml
verification:
  static:
    status: verified
    reason: Static docs inspection completed.
    proof_refs:
      - record:experiment-id
  install:
    status: claimed
    scope: sandbox
    reason: Install proof not run yet.
    proof_refs: []
  runtime:
    status: claimed
    scope: sandbox
    output: metadata-only
    reason: Runtime proof not run yet.
    proof_refs: []
  product:
    status: claimed
    reason: Product use is not approved.
    decision_refs: []
  blocked_actions: []
```

Do not store a separate assurance level on claims. Derived assurance is projected from valid dimensions and their supporting experiments.

## Experiment Proof

Experiments prove non-product dimensions with `verification.proves`:

```yaml
verification:
  claim_refs:
    - record:claim-id
  proves:
    - dimension: runtime
      scope: sandbox
      output_level: metadata-only
  requires_human_approval: true
  approval_status: approved
```

`install` and `runtime` proofs require approved experiment status plus `requires_human_approval: true` and `approval_status: approved`.

## Product Decisions

The `product` dimension is decided, not experimentally proved. Product approval or rejection must come from an approved decision whose `decision_effect` references the claim:

```yaml
decision_effect:
  action: approve
  scope: product
  affected_refs:
    - record:claim-id
```

Runtime proof alone never approves product use.

## Runtime Output Policy

Runtime dimensions declare output as `metadata-only`, `sample-output`, or `runtime-captured`. Proof records must keep durable evidence curated and safe. Temporary install/runtime substrate stays outside the repo and must be deleted after metadata capture.

**Exception: Capability scripts.** Standalone feasibility scripts under `product/<stack>/capabilities/<scope>/` are durable executable substrate. They are not temp files; they are reusable probes that test API-return-data runtime and share the stack environment. Capability records may cite them directly as proof substrate. Capability script output (sample data, schema shapes) is captured into the experiment's evidence envelope, not committed as raw data.

## Forbidden Shortcuts

Verification never approves these by implication:

- provider install or import;
- API-key insertion or credential capture;
- local config capture;
- private package files or install logs;
- live provider calls;
- raw provider rows;
- generated product clients;
- backend, frontend, route, database, migration, or product app code.

A downstream provider proof plan must request human approval for any install/runtime step and must keep output metadata-only unless a separate decision allows more.

---

## Artifact Schema Reference

Schemas live in `schemas/*.schema.json` and are enforced by AJV. All schemas permit additional properties (no `additionalProperties: false`), so convention fields (e.g., `result_reason` on experiments) are allowed even when not formally declared.

### Common Fields (All Typed Records)

| Field | Type | Required | Allowed Values / Pattern | Notes |
|---|---|---|---|---|
| `id` | string | yes | free | Must match filename stem |
| `schema_version` | string | yes | free | e.g. `"1.0"` |
| `type` | const | yes | `claim`, `experiment`, `decision`, `risk`, `capability` | Discriminator for schema selection |
| `status` | enum | yes | per-type | see per-type tables |
| `created_at` | string | yes | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` | ISO-8601 UTC |
| `updated_at` | string | yes | same pattern | |
| `source_refs` | array | yes | items: `^(local\|record\|legacy):.+` | See Cross-Record Reference Map |
| `notes` | string | no | free | |

### Claim

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| `subject` | string | yes | free |
| `claim` | string | yes | free |
| `scope` | string | yes | free |
| `evidence_refs` | array | yes | items: string |
| `confidence` | enum | yes | `low`, `medium`, `high` |
| `limitations` | array | yes | items: string |
| `approval.status` | enum | yes | `draft`, `reviewed`, `approved`, `rejected` |
| `approval.reviewer` | string | yes | free |
| `approval.reviewed_at` | string | yes | ISO-8601 pattern |
| `verification.static.status` | enum | no | `claimed`, `verified`, `rejected` |
| `verification.static.proof_refs` | array | no | items: string |
| `verification.install.status` | enum | no | `claimed`, `verified`, `rejected` |
| `verification.install.scope` | enum | no | `sandbox`, `production` |
| `verification.install.proof_refs` | array | no | items: string |
| `verification.runtime.status` | enum | no | `claimed`, `verified`, `rejected` |
| `verification.runtime.scope` | enum | no | `sandbox`, `production` |
| `verification.runtime.output` | enum | no | `metadata-only`, `sample-output`, `runtime-captured` |
| `verification.runtime.proof_refs` | array | no | items: string |
| `verification.product.status` | enum | no | `claimed`, `approved`, `rejected` |
| `verification.product.decision_refs` | array | no | items: string |
| `verification.blocked_actions` | array | no | items: string |

### Experiment

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| `goal` | string | yes | free |
| `hypothesis` | string | yes | free |
| `method` | array | yes | items: string |
| `success_metrics` | array | yes | items: string |
| `result` | string | yes | free |
| `agent_outcome` | string | yes | free |
| `product_outcome` | string | yes | free |
| `observations` | array | yes | any |
| `promotion_review` | array | yes | any |
| `scope` | enum | no | `planning`, `install`, `runtime`, `product`, `schema-improvement` |
| `claim_refs` | array | no | items: string |
| `risk_refs` | array | no | items: string |
| `output_level` | enum | no | `none`, `docs-only`, `metadata-only`, `runtime-captured`, `product-code` |
| `output_capture.allowed_outputs` | array | no | items: string |
| `output_capture.blocked_outputs` | array | no | items: string |
| `verification.claim_refs` | array | yes | items: string |
| `verification.proves` | array | yes | objects with `dimension`, `scope`, `output_level` |
| `verification.proves[].dimension` | enum | yes | `static`, `install`, `runtime` |
| `verification.proves[].scope` | enum | no | `sandbox`, `production` |
| `verification.proves[].output_level` | enum | yes | `none`, `docs-only`, `metadata-only`, `runtime-captured`, `product-code` |
| `verification.requires_human_approval` | boolean | yes | `true` / `false` |
| `verification.approval_status` | enum | yes | `not-required`, `requested`, `approved`, `rejected` |

### Decision

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| `question` | string | yes | free |
| `decision` | string | yes | free |
| `rationale` | string | yes | free |
| `alternatives` | array | yes | items: string |
| `tradeoffs` | array | yes | items: string |
| `supersedes` | array | yes | items: string |
| `decision_effect.action` | enum | yes | `approve`, `reject`, `accept-risk`, `mitigate-risk`, `defer`, `supersede` |
| `decision_effect.scope` | enum | yes | `planning`, `install`, `runtime`, `product`, `schema-improvement` |
| `decision_effect.affected_refs` | array | yes | items: string |
| `decision_effect.boundaries.allowed_actions` | array | no | items: string |
| `decision_effect.boundaries.blocked_actions` | array | no | items: string |
| `decision_effect.boundaries.required_gates` | array | no | items: string |

### Risk

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| `risk_statement` | string | yes | free |
| `category` | enum | yes | `license`, `scope-boundary`, `data-quality`, `runtime`, `security`, `compliance`, `other` |
| `severity` | enum | yes | `low`, `medium`, `high`, `critical` |
| `likelihood` | enum | yes | `low`, `medium`, `high` |
| `confidence` | enum | yes | `low`, `medium`, `high` |
| `claim_refs` | array | no | items: string |
| `experiment_refs` | array | no | items: string |
| `mitigation.blocked_actions` | array | no | items: string |
| `mitigation.required_gates` | array | no | items: string |

### Capability

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| `stack` | string | yes | free |
| `surface` | string | yes | free |
| `maps` | array | yes | objects |
| `maps[].source` | string | yes | free |
| `maps[].route_class` | string | no | free |
| `maps[].view_class` | string | no | free |
| `maps[].response_class` | string | no | free |
| `supersedes` | array | no | items: string |

---

## Cross-Record Reference Map

| Field | On Type | Target Type | Ref Format | Verified By |
|---|---|---|---|---|
| `source_refs[]` | all typed records | local files / records / legacy | `local:<path>`, `record:<id>`, `legacy:<path>` | **AJV** pattern + **Script** existence & root allowlist |
| `evidence_refs[]` | claim | local files / records | `local:<path>`, `record:<id>` | **Script** `record:` existence |
| `supersedes[]` | decision, capability | same type | `record:<id>` | **Script** `record:` existence |
| `claim.verification.*.proof_refs[]` | claim | experiment | `record:<id>` | **Script** existence + strict semantic match (dimension, scope, output) |
| `claim.verification.product.decision_refs[]` | claim | decision | `record:<id>` | **Script** existence + decision approves claim |
| `experiment.claim_refs[]` | experiment | claim | `record:<id>` | **Script** `record:` existence |
| `experiment.risk_refs[]` | experiment | risk | `record:<id>` | **Script** `record:` existence |
| `experiment.verification.claim_refs[]` | experiment | claim | `record:<id>` | **Script** existence + claim type check |
| `risk.claim_refs[]` | risk | claim | `record:<id>` | **Script** `record:` existence |
| `risk.experiment_refs[]` | risk | experiment | `record:<id>` | **Script** `record:` existence |
| `decision.decision_effect.affected_refs[]` | decision | claim / risk / any | `record:<id>` | **Script** `record:` existence |

### Reference Prefix Grammar

| Prefix | Example | Meaning |
|---|---|---|
| `local:` | `local:records/evidence/vnstock-data/installer-prior-notes.md` | File inside repo. Must exist and stay under allowed root (`records/evidence` or `product/*/capabilities` for capability records) |
| `record:` | `record:experiment-vnstock-install-20260508T101723Z` | Pointer to another typed record by `id`. Target must exist in `records/` |
| `legacy:` | `legacy:plans/reports/legacy-doc.md` | Historical reference. Disallowed for new records; only permitted in negative fixtures |

---

## Validation Architecture

`pnpm check` runs four layers in sequence. A record must pass all layers.

### Layer 1 — AJV Schema Validation

`tools/validate-records/record-validation-rules.js` compiles each `schemas/<type>.schema.json` with AJV and validates every record individually.

Checks: required fields, type correctness, enum membership, string patterns (timestamps, source-ref URI prefix), array item shapes.

Does **not** check: cross-record existence, semantic alignment between experiment proof and claim dimension config, local file existence.

### Layer 2 — Source Reference Validation

Same file. After schema validation, scans `source_refs` on every record:

- `legacy:` → error unless `--allow-disallowed-fixtures` (negative-fixture mode only)
- `local:` → path must exist, must not escape repo root, must stay under allowed root (`records/evidence` default; `product/*/capabilities` for capability records)
- `record:` → target `id` must exist among loaded records

Also checks `evidence_refs` and `supersedes` for `record:` existence.

### Layer 3 — Cross-Record Relationship Validation

`tools/validate-records/claim-verification-rules.js` enforces the claim↔experiment↔decision ledger:

- Experiments must reference at least one claim via `verification.claim_refs`
- Experiments must declare at least one proof via `verification.proves`
- Proof `dimension` must be in `static`/`install`/`runtime`
- `install` proof requires `scope: sandbox \| production`
- `runtime` proof requires `scope` + `output_level: metadata-only \| runtime-captured`
- `install`/`runtime` proofs require `experiment.status === "approved"` and `verification.approval_status === "approved"`
- Claim `proof_refs` for `verified`/`rejected` dimensions must point to experiments that strictly match the dimension, scope, and output config
- Claim `product` dimension `decision_refs` must point to approved decisions whose `decision_effect` references the claim

This is **core learning-loop logic** — it cannot be expressed in JSON Schema because it requires cross-record lookups and semantic matching.

### Layer 4 — Derived Assurance Validation

`tools/validate-records/derived-claim-assurance.js` computes assurance level from claim dimensions and supporting experiments:

- If any dimension is `rejected` or an approved decision rejects the claim → `blocked`
- Otherwise, highest dimension in `static < install < runtime` that is either `verified` or has a valid supporting experiment
- Supporting experiment must: be `reviewed`/`approved`, strictly prove the dimension (same logic as Layer 3), and pass human-approval gates for `install`/`runtime`
- Falls back to `source-only` (has sources, no experiments) or `none`

This layer only reports `blocked` claims as errors; other assurance levels are informational.

---

## Unschematized Record Types

The following directories under `records/` do not have JSON schemas and are not validated by AJV:

| Directory | Content | Validation |
|---|---|---|
| `records/evidence/` | Markdown evidence capsules | None (referenced by `local:` or `record:`) |
| `records/backlog-items/` | Backlog items | None (empty) |
| `records/observations/` | Observations | None (empty) |
| `records/validation-gates/` | Validation gates | None (empty) |

Evidence files are validated indirectly: any `local:` reference to them is checked for existence and allowed-root containment in Layer 2.

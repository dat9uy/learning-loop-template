# Claim Verification

This document is the source of truth for claim verification. Claims no longer move through a single ordered state chain. Each claim asserts one or more independent verification dimensions, and each dimension is proved or rejected by the correct authority.

## Dimension Overview

| Dimension | Status values | Extra fields | Proof authority |
|---|---|---|---|
| `static` | `claimed`, `verified`, `rejected` | none | Experiment |
| `install` | `claimed`, `verified`, `rejected` | `scope: sandbox | production` | Approved human-gated experiment |
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

**Exception: Capability scripts.** Standalone feasibility scripts under `product/capabilities/<scope>/` are durable executable substrate. They are not temp files; they are reusable probes that test API-return-data runtime and share the product's environment. Experiment records may cite them directly as proof substrate. Capability output (sample data, schema shapes) is captured into the experiment's evidence envelope, not committed as raw data.

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

# Claim Proof Lifecycle

This document is the source of truth for moving a claim from imported or local evidence into verified, rejected, or product-approved states. Provider-specific proof plans consume this lifecycle; they do not define their own promotion rules.

## Experiment-Owned Assurance

`assurance_level` belongs on experiments, not claims. Claim assurance is derived from linked experiments.

| Assurance | Meaning |
|---|---|
| `evidence-reviewed` | Local evidence reviewed for planning use. |
| `static-verified` | Docs/artifact inspected without runtime side effects. |
| `install-verified` | Install/import substrate verified in disposable boundary. |
| `runtime-verified` | Runtime behavior verified under approved output policy. |

## Derived Claim Assurance

Claim assurance is projection, not storage.

```text
claim effective_assurance = highest valid supporting experiment assurance
  constrained by scope, approval status, conflicts, rejections, expiration, and decisions
```

| Claim projection | Derived from |
|---|---|
| source-only, implicit | Claim has `source_refs` but no valid supporting assurance experiment. Not assurance. |
| `evidence-reviewed` | Valid supporting experiment has `assurance_level: evidence-reviewed`. |
| `static-verified` | Valid supporting experiment has `assurance_level: static-verified`. |
| `install-verified` | Valid approved human-gated supporting experiment has `assurance_level: install-verified`. |
| `runtime-verified` | Valid approved human-gated supporting experiment has `assurance_level: runtime-verified`. |
| blocked/rejected | Linked experiment or decision rejects relevant scope. |

Planning-scope pack publication defaults to `static-verified`.

## Claim Fields

Every claim record must include:

- `lifecycle.state`: one of the states below.
- `lifecycle.state_reason`: short reason for the current state.
- `lifecycle.proof_refs`: record refs that prove the current high-trust or rejected state.
- `lifecycle.blocked_actions`: actions that remain blocked at the current state.

Claim relationship fields:

- `source_refs`: where the assertion came from.
- `experiment_refs`: which experiments supported, rejected, or qualified it.

Do not store `assurance_level`, `verification_level`, `qualification_level`, `evidence_refs`, or `proof_refs` on claims outside the lifecycle block.

## States

| State | Meaning | Minimum proof |
|---|---|---|
| `imported-prior` | External or historical note imported for planning verification only. | Local evidence capsule describing provenance and limitations. |
| `evidence-reviewed` | Curated local docs or evidence reviewed for planning use. | Local evidence plus reviewer approval; no runtime claim. |
| `static-verified` | Artifact or docs inspected without runtime side effects. | Reviewed or approved experiment record with metadata-only static inspection result. |
| `install-verified` | Package or tool install/import substrate verified in a disposable environment. | Approved human-gated experiment record; no retained secrets, install logs, private package files, or artifacts. |
| `runtime-verified` | Approved metadata-only runtime behavior verified. | Approved human-gated experiment record with bounded metadata-only output and no raw provider data. |
| `product-approved` | Product use explicitly approved. | Approved decision record defining scope, license, storage, runtime, and validation boundaries. |
| `rejected` | Claim should not be used. | Experiment or decision record explaining failure or rejection. |

## Allowed Transitions

| From | Allowed next states |
|---|---|
| `imported-prior` | `evidence-reviewed`, `static-verified`, `rejected` |
| `evidence-reviewed` | `static-verified`, `runtime-verified`, `rejected` |
| `static-verified` | `install-verified`, `rejected` |
| `install-verified` | `runtime-verified`, `rejected` |
| `runtime-verified` | `product-approved`, `rejected` |
| `product-approved` | `rejected` only through a superseding decision |
| `rejected` | none |

No claim may skip to `product-approved`. Product approval is a decision-layer state, not a confidence increase.

## Promotion Rules

1. A claim may stay in `imported-prior` or `evidence-reviewed` with local evidence and reviewer approval only.
2. `static-verified`, `install-verified`, and `runtime-verified` require `lifecycle.proof_refs` to experiment records whose `verification` block names the claim and target state.
3. `install-verified` and `runtime-verified` require human approval on the experiment: `requires_human_approval: true` and `approval_status: approved`.
4. `product-approved` requires `lifecycle.proof_refs` to an approved decision record that references the claim. Runtime proof alone is not enough.
5. `rejected` requires an experiment verification with `to_state: rejected` or a decision proof with `lifecycle_effect.to_state: rejected` or `decision_effect.action: reject` that references the claim.

## Decision Lifecycle Effect Fields (Transitional)

Decisions that product-approve or reject claims may include:

- `lifecycle_effect.claim_refs`: claim refs affected by the decision.
- `lifecycle_effect.to_state`: `product-approved` or `rejected`.

This is transitional. Target model uses `decision_effect`.

## Decision Effect (Target Model)

```yaml
decision_effect:
  action: approve | reject | accept-risk | mitigate-risk | defer | supersede
  scope: planning | install | runtime | product | schema-improvement
  affected_refs:
    - record:claim-or-risk-or-experiment-or-capability-id
    - pack:<id>
  boundaries:
    allowed_actions: []
    blocked_actions: []
    required_gates: []
```

## Experiment Verification Fields

Experiments that promote or reject claim lifecycle state must include:

- `verification.claim_refs`: `record:<claim-id>` refs affected by the experiment.
- `verification.from_state`: previous lifecycle state.
- `verification.to_state`: promoted or rejected lifecycle state.
- `verification.output_level`: `none`, `docs-only`, `metadata-only`, `runtime-captured`, or `product-code`.
- `verification.requires_human_approval`: whether the proof needed explicit approval before execution.
- `verification.approval_status`: `not-required`, `requested`, `approved`, or `rejected`.

Experiments may not promote a claim directly to `product-approved`; use a decision record.

## Runtime Output Policy

Runtime experiments may capture metadata plus allowed sample output plus code output when approved.

```yaml
output_level: runtime-captured
output_capture:
  allowed_outputs:
    - metadata
    - sample-output
    - code-output
  blocked_outputs:
    - raw-provider-rows
    - secrets
    - private-artifacts
```

## Forbidden Shortcuts

The lifecycle never approves these by implication:

- provider install or import;
- API-key insertion or credential capture;
- local config capture;
- private package files or install logs;
- live provider calls;
- raw provider rows;
- generated product clients;
- backend, frontend, route, database, migration, or product app code.

A downstream provider proof plan must request human approval for any install/runtime step and must keep output metadata-only unless a separate product decision allows more.

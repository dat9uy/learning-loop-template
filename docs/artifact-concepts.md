# Artifact Concepts

> **Deprecation notice:** The claim schema (`schemas/claim.schema.json`) is deprecated for new entries per `record:decision-260519T1400Z-claim-deprecation`. Existing claims in `records/<surface>/claims/` are frozen-legacy (read-only audit trail). New work uses machine-extracted index entries (`schemas/index-entry.schema.json`, type `extracted-assertion`).

This document explains artifact concepts and conventions. For field-level schema validation, see `schemas/*.schema.json` (enforced by AJV). For cross-record reference validation, use the `validate_records` MCP tool. For runtime request preparation, use `workflow_prepare_runtime_request`.

## Dimension Overview

| Dimension | Status values | Extra fields | Proof authority |
|---|---|---|---|
| `static` | `claimed`, `verified`, `rejected` | none | Experiment |
| `install` | `claimed`, `verified`, `rejected` | `scope: sandbox \| production` | Approved human-gated experiment |
| `runtime` | `claimed`, `verified`, `rejected` | `scope`, `output` | Approved human-gated experiment |
| `product` | `claimed`, `approved`, `rejected` | none | Approved decision |

At least one dimension must be present. `claimed` dimensions must not carry proof refs. Verified, approved, or rejected dimensions must carry matching proof refs or decision refs.

### Dimension Overview — Index Entries

Index entries use different status values derived from evidence `validation_status`, not an editorial lifecycle:

| Dimension | Status values | Extra fields | Proof authority |
|---|---|---|---|
| `static` | `active`, `superseded`, `pending_approval`, `candidate` | none | Experiment (via `experiment_refs`) |
| `install` | `active`, `superseded`, `pending_approval`, `candidate` | `scope` field | Approved human-gated experiment (via `experiment_refs`) |
| `runtime` | `active`, `superseded`, `pending_approval`, `candidate` | `scope`, `output` fields | Approved human-gated experiment (via `experiment_refs`) |
| `product` | `active`, `pending_approval`, `candidate` | none | Approved decision (via `decision_effect.affected_refs`) |

`claimed` does not exist for index entries. Unverified assertions surface as `candidate` when `evidence.validation_status: pending`, or are not extracted at all when `validation_status: failed`. `candidate` is for vendor-sourced or unverified assertions; `pending_approval` is for human-promoted candidates awaiting experiment.

Frozen-legacy claim counterpart: [Dimension Overview](#dimension-overview) above.

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

### Experiment Proof — Index Entries

Index entries prove dimensions via `experiment_refs` — an array pointing to the experiment records that verify the assertion. The experiment's `verification.proves` declaration is the reverse direction of the same relationship.

```yaml
experiment_refs:
  - record:experiment-vnstock-install-20260508T101723Z
```

Frozen-legacy claim counterpart: [Experiment Proof](#experiment-proof) above.

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

### Product Decisions — Index Entries

Product approval for an index entry comes from a decision whose `decision_effect.affected_refs` includes the assertion's experiment or the evidence file.

Frozen-legacy claim counterpart: [Product Decisions](#product-decisions) above.

## Decision vs Assertion — When to Use Which

A **decision** is a policy choice between alternatives. It answers "What shall we do?" and follows an editorial lifecycle (`draft` → `reviewed` → `approved`). Examples: adopt a gate, change a threshold, approve a scope boundary.

An **assertion** (machine-extracted index entry) is a factual conclusion from evidence and experiments. It answers "What is true?" and derives its status from `evidence.validation_status`. Examples: "Gate X blocks Y", "Installer Z writes config to path W", "API returns shape Q under condition R".

**Do not create decision records for yes/no factual questions.** If empirical proof shows a mechanism works or fails, capture it in `records/<surface>/evidence/` with a `## Findings` bullet, then run `pnpm extract:index` to emit the assertion into `records/<surface>/index/`. Reserve decision records for normative policy approvals that sit at the end of the chain: `evidence → index → experiments → decisions`.

## Observations vs. Meta-State

Observations (`records/observations/*.yaml`) and meta-state (`tools/learning-loop-mcp/meta-state.jsonl`) are separate systems. Do not conflate them.

- **Observations** track domain-level external state: budgets, device slots, vendor API status. Operator-managed. The gate reads them to check **existence** (meta-level: "has someone recorded this constraint?"), not to enforce **resource limits** (domain-level: "do we have budget left?"). See `docs/observation-vs-meta-state.md` for the full separation.
- **Meta-state** tracks agent reasoning and system-level findings: "I checked the budget and it was safe because the fingerprint matched." Agent-maintained. Ephemeral (24h TTL). Not used by the gate.

The gate enforces observation **existence** (pattern matched → observation present? → pass/block). The agent enforces observation **content** (budget exhausted? → same fingerprint? → proceed/stop). Both are necessary; neither replaces the other.

## Runtime Output Policy

Runtime dimensions declare output as `metadata-only`, `sample-output`, or `runtime-captured`. Proof records must keep durable evidence curated and safe. Temporary install/runtime substrate stays outside the repo and must be deleted after metadata capture.

**Exception: Runtime probes.** Standalone feasibility scripts under `product/<stack>/capabilities/<scope>/` are durable executable substrate. They are not temp files; they are reusable probes that test API-return-data runtime and share the stack environment. Capability records may cite them directly as proof substrate. Runtime probe output is captured into the experiment's evidence envelope, not committed as raw data.

## Candidate Promotion Workflow

Assertions extracted from vendor docs start with `status: candidate`. They must be promoted through a human-reviewed workflow before product code can reference them.

### Status Chain

```
candidate → pending_approval → active
```

| Status | Meaning | Who can consume it |
|--------|---------|-------------------|
| `candidate` | Vendor-sourced, unverified | Nothing — product code, decisions, and experiments are blocked from referencing it |
| `pending_approval` | Human-promoted, experiment drafted | Experiments and decisions (Layer 5 allows references) |
| `active` | Experimentally proven or decision-approved | Product code, decisions, experiments freely |
| `superseded` | Replaced by newer assertion | Read-only, preserved for audit trail |

### Transition 1: candidate → pending_approval

**Trigger:** Human operator reviews the candidate assertion and the experiment draft generated by `workflow_candidate_to_experiment`.
**Decision:** Is the assertion worth testing? Does the experiment plan look correct?
**Action:** The human operator edits the assertion YAML:
```yaml
# In records/<surface>/index/<assertion-id>.yaml
status: pending_approval
```
**Validation:** `validateRecords` allows `pending_approval` references — only `candidate` is blocked by Layer 5 (`validateCandidateConsumption`).

### Transition 2: pending_approval → active

**Trigger:** The experiment runs successfully and evidence is recorded with `validation_status: passed`.
**Action:** The operator manually promotes the assertion to `active` status.
**Result:** The assertion is now `active` and can be referenced by any record without triggering the candidate block.

### Failure Path: pending_approval → rejected

**Trigger:** The experiment fails or contradicts the assertion.
**Action:** Evidence is recorded with `validation_status: failed`. The operator may manually archive the assertion.
**Note:** The `index-entry.schema.json` does not have a `rejected` status. A future version may add it. For v1, `failed` evidence + skipped extraction is sufficient.

### What Requires Human Action

Every transition requires explicit human approval:
- `candidate → pending_approval`: operator reviews the assertion + experiment draft and decides to promote
- `pending_approval → active`: operator reviews the experiment result and promotes the assertion

There is no autonomous promotion. Full automation (class-level approval, auto-promotion on experiment success) is Bridge 3/4 territory per `docs/trajectory.md`.

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

## Schema and Validation Reference

All artifact schemas live in `schemas/*.schema.json` and are enforced by AJV. All schemas permit additional properties (no `additionalProperties: false`).

### Reference Prefix Grammar

| Prefix | Example | Meaning |
|---|---|---|
| `local:` | `local:records/vnstock/evidence/installer-prior-notes.md` | File inside repo. Must exist and stay under allowed root |
| `record:` | `record:experiment-vnstock-install-20260508T101723Z` | Pointer to another typed record by `id`. Target must exist in `records/` |
| `legacy:` | `legacy:plans/reports/legacy-doc.md` | Historical reference. Disallowed for new records |

### Validation Layers

`pnpm check` runs four layers in sequence. Use the `validate_records` MCP tool for detailed validation output.

- **Layer 1:** AJV schema validation (`schemas/*.schema.json`)
- **Layer 2:** Source reference validation (existence, allowed-root containment)
- **Layer 3:** Cross-record relationship validation (claim↔experiment↔decision ledger)
- **Layer 4:** Derived assurance validation (frozen-legacy claims only)

For full validation details, see `tools/learning-loop-mcp/core/` source or run `index_validate` via MCP.

## Unschematized Record Types

The following directories under `records/` do not have JSON schemas and are not validated by AJV:

| Directory | Content | Validation |
|---|---|---|
| `records/<surface>/evidence/` | Markdown evidence capsules | None (referenced by `local:` or `record:`) |
| `records/backlog-items/` | Backlog items | None (empty) |
| `records/validation-gates/` | Validation gates | None (empty) |

Evidence files are validated indirectly: any `local:` reference to them is checked for existence and allowed-root containment in Layer 2.

## Capability Term Glossary

The word "capability" carries three distinct meanings in this repo. Always qualify in writing.

| Term | Path | Created when | Role |
|---|---|---|---|
| **Runtime probe** | `product/<stack>/capabilities/<scope>/*.py` | During runtime-verification work for a library. | Standalone Python feasibility probe. Tests API-return-data runtime. Shares the per-stack environment. Not an integration test for product endpoints. |
| **Capability record** | `records/<surface>/capabilities/capability-*.yaml` | Operator runs `pnpm generate:capabilities` after surface changes. | Runtime-derived YAML mapping product surfaces to canonical capability entries. Schema: `schemas/capability.schema.json` v2.0 minimal. |
| **Runtime Probe Experiment** | (concept, not a path) | When verifying a library's `runtime` dimension. | Pattern documented in `docs/operator-guide.md` → "Runtime Probe Experiment". The experiment record is the ledger entry; runtime probes are its execution substrate. |

Disambiguation rule: bare "capability" defaults to **capability record** in product-build plans. Frozen records before 2026-05-10 may mention older paths/terms and remain unchanged by policy.

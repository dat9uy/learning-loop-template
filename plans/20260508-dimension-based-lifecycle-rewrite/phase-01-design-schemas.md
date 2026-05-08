---
phase: 1
title: "Design Schemas"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Design Schemas

## Overview

Define the JSON schemas for claims and experiments under the dimension-based verification model. This is the contract all other phases depend on.

## Requirements

- Claim schema replaces `lifecycle` block with `verification` dimensions
- Experiment schema replaces `assurance_level` and `verification.from_state`/`to_state` with `verification.proves` array
- Each dimension config must be validateable (enum values, required fields)
- No orphaned references to old fields

## Architecture

### Claim Schema

```yaml
verification:
  static:
    status: claimed | verified | rejected
    proof_refs: string[]     # required for verified/rejected
  install:
    status: claimed | verified | rejected
    scope: sandbox | production
    proof_refs: string[]     # required for verified/rejected
  runtime:
    status: claimed | verified | rejected
    scope: sandbox | production
    output: metadata-only | sample-output | runtime-captured
    proof_refs: string[]     # required for verified/rejected
  product:
    status: claimed | approved | rejected
    decision_refs: string[]  # required for approved/rejected
blocked_actions: string[]
```

Rules:
- At least one dimension must be present
- `claimed` → proof_refs/decision_refs must be empty
- `verified`/`rejected`/`approved` → proof_refs/decision_refs must be non-empty

### Experiment Schema

```yaml
verification:
  claim_refs: string[]
  proves:
    - dimension: static | install | runtime
      scope: sandbox | production        # for install/runtime
      output_level: none | docs-only | metadata-only | runtime-captured | product-code
  requires_human_approval: boolean
  approval_status: not-required | requested | approved | rejected
```

Removed:
- `assurance_level`
- `verification.from_state`
- `verification.to_state`

## Related Code Files

- Modify: `schemas/claim.schema.json`
- Modify: `schemas/experiment.schema.json`

## Implementation Steps

1. Read current `schemas/claim.schema.json` and `schemas/experiment.schema.json`
2. Draft new claim schema with `verification` block
3. Draft new experiment schema with `verification.proves` array
4. Validate JSON schema syntax
5. Review against brainstorm report requirements

## Success Criteria

- [ ] `schemas/claim.schema.json` validates as proper JSON Schema
- [ ] `schemas/experiment.schema.json` validates as proper JSON Schema
- [ ] No references to `lifecycle`, `assurance_level`, `from_state`, `to_state`
- [ ] Enum values match dimension model exactly

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Schema drift between claim and experiment dimension configs | Define shared vocabulary in schema descriptions |
| Missing required field for `claimed` vs `verified` | Use JSON Schema `if/then` or document in descriptions |

---
phase: 1
title: "Setup Records"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Setup Records

## Overview

Create risk and claim records for vnstock installability. These are the ledger entries the experiment will later prove.

## Requirements

- Functional: Risk record documents external .run installer download boundary. Claim record asserts vnstock is installable in sandbox.
- Non-functional: Records must pass `pnpm validate:records` before phase 2 begins.

## Architecture

```
records/
├── risks/
│   └── risk-vnstock-external-installer.yaml
└── claims/
    └── claim-vnstock-install-sandbox.yaml
```

## Related Code Files

- **Create:** `records/risks/risk-vnstock-external-installer.yaml`
- **Create:** `records/claims/claim-vnstock-install-sandbox.yaml`
- **Read for context:** `records/evidence/vnstock-data/installer-prior-notes.md`
- **Read for context:** `schemas/risk.schema.json`, `schemas/claim.schema.json`

## Implementation Steps

1. Create risk record `risk-vnstock-external-installer.yaml`
   - `risk_statement`: "External Makeself .run installer download from vnstocks.com during vnstock install"
   - `category`: security
   - `severity`: medium
   - `likelihood`: high
   - `confidence`: high
   - `mitigation.blocked_actions`: [credential-capture, raw-data-export, live-provider-calls]
   - `mitigation.required_gates`: [human-approval, temp-directory, metadata-only-output]
   - `source_refs`: [local:records/evidence/vnstock-data/installer-prior-notes.md]

2. Create claim record `claim-vnstock-install-sandbox.yaml`
   - `subject`: vnstock Python package
   - `claim`: "vnstock is installable and importable in a sandbox environment by downloading and executing the official Makeself .run installer"
   - `scope`: sandbox
   - `confidence`: medium
   - `evidence_refs`: [local:records/evidence/vnstock-data/installer-prior-notes.md]
   - `verification.static`: status claimed
   - `verification.install`: status claimed, scope sandbox
   - `verification.runtime`: status claimed, scope sandbox, output metadata-only
   - `verification.product`: status claimed
   - `blocked_actions`: [live-provider-calls, credential-capture, raw-data-export]

3. Run `pnpm validate:records`

## Success Criteria

- [ ] Risk record created and validates
- [ ] Claim record created and validates
- [ ] `pnpm validate:records` passes
- [ ] Claim `install` dimension is `claimed` (not verified yet — experiment in phase 2 will prove it)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Claim scope too broad | low | Keep scope to sandbox only |
| Risk severity misclassified | low | External .run installer download is medium severity per operator guide |

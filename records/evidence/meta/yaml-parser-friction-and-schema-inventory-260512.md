---
record_type: evidence
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
claim_support: supports
created: "2026-05-12T00:00:00Z"
id: evidence-meta-yaml-parser-friction-and-schema-inventory-260512
title: YAML parser friction and schema inventory
date: "2026-05-12"
summary: Evidence supporting the YAML parser library swap and AJV deferral.
source_refs:
  - local:plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md
---

# YAML Parser Friction And Schema Inventory

## Friction History

- `decision-20260510T170623Z-vnstock-installer-bootstrap` originally used a YAML pipe block scalar in notes; `simple-yaml-parser.js` rejected it with an opaque key/value parse error.
- `decision-260512T1321Z-artifact-timestamp-convention` drafting hit another parser gap when a sequence scalar contained `Mitigation:`; the hand-rolled parser treated the colon as a mapping separator.
- During the swap, `decision-20260509T192448Z-experiment-result-convention` exposed a real YAML issue: a plain scalar began with a backtick. The library caught it; the record was fixed by quoting the scalar without changing meaning.

## Feature Inventory

- YAML is the active friction point: block scalars, colon-bearing scalars, anchors, and other standard grammar features are parser-library concerns.
- Ledger/schema/source-ref rules remain project-specific and are still enforced by local validator code.
- The brainstorm inventory found the JSON Schema gap is real but separate: schema features such as `oneOf`, `anyOf`, `$ref`, `additionalProperties`, and conditionals deserve their own migration plan.

## AJV Deferral And Trigger

- AJV is deferred from this change to keep the posture shift singular: YAML reader now, schema validator later.
- Follow-up trigger: start a separate decision when schema enforcement needs JSON Schema 2020-12 behavior that the hand-rolled validator silently ignores, especially timestamp format constraints.
- This swap regression validated all 34 current records with byte-identical green output and identical parsed record shape snapshots.

## Notes

This file does not use the install-experiment evidence envelope because it is meta-tooling evidence, not an install experiment.

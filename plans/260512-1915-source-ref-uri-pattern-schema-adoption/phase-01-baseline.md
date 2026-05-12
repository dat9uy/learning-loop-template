---
phase: 1
title: "Baseline"
status: pending
priority: P3
effort: "15m"
dependencies: []
---

# Phase 1: Baseline

## Overview

Capture pre-change state so Phase 4 regression has a concrete diff target. Verify the two negative fixtures touched by this plan currently trip on the hand-roll path, not the AJV path.

## Requirements

- Functional: record current `pnpm check` output, current LoC of `record-validation-rules.js`, current expected strings in `validate-records.js:32, 46`.
- Non-functional: no edits.

## Architecture

Read-only inventory. No code changes.

## Related Code Files

- Read: `tools/validate-records/record-validation-rules.js`
- Read: `tools/validate-records/validate-records.js`
- Read: `schemas/claim.schema.json`, `schemas/experiment.schema.json`, `schemas/decision.schema.json`, `schemas/risk.schema.json`, `schemas/capability.schema.json`
- Read: `fixtures/negative/unsupported-source-ref/claims/unsupported-source-ref.yaml`
- Read: `fixtures/negative/malformed-pack-ref/claims/claim-bad-pack-ref.yaml`

## Implementation Steps

1. Run `pnpm check` from repo root; record exit code (must be 0) and the `Validated N records.` line.
2. `wc -l tools/validate-records/record-validation-rules.js` — record current LoC (expected: 181 lines per post-Phase A state).
3. Confirm `source_refs.items` in each of the 5 schemas is currently `{ "type": "string" }` (no `pattern`).
4. Confirm `validate-records.js:32` expected string is `"unsupported source reference"` and `:46` is `"malformed pack reference"`.
5. Confirm the two affected fixtures still load: their YAML parses, they have `source_refs` entries that should trip the rule under change.
6. Confirm `fixtures/negative/unsupported-source-ref/claims/unsupported-source-ref.yaml` `source_refs[0]` has no `^(local|record|pack|legacy):` prefix (e.g., `docs/evidence/unprefixed-source.md`).
7. Confirm `fixtures/negative/malformed-pack-ref/claims/claim-bad-pack-ref.yaml` `source_refs[0]` is the bare prefix `pack:` (no suffix).

## Success Criteria

- [ ] `pnpm check` exit 0 baselined.
- [ ] LoC of `record-validation-rules.js` captured.
- [ ] All 5 schemas confirmed to lack `pattern` on `source_refs.items`.
- [ ] Both target fixtures confirmed to trip the hand-roll path today.

## Risk Assessment

Zero. Read-only.

# 260513 — Semantic Unification: experimentProofMatch

## Context
Closed Phase C of `problem-solving-260512-1714-validate-records-simplification.md`.

## Problem
`derived-claim-assurance.js` used a loose `experimentSupportsClaim` (dimension match only) while `claim-verification-rules.js` used a strict `experimentProvesDimension` (+ scope/output match). A sandbox experiment could incorrectly grant assurance for a production-scoped claim.

## Decision
Make assurance derivation strict. Extract shared helper so both modules use identical logic.

## Changes
- **Created** `tools/validate-records/experiment-proof-match.js` — single `experimentProvesDimension` export.
- **Updated** `claim-verification-rules.js` — imports from helper, deletes local duplicate.
- **Updated** `derived-claim-assurance.js` — imports from helper, deletes loose `experimentSupportsClaim`; `isValidSupportingExperiment` now passes `dimensionConfig` through.

## Verification
`pnpm check` passes (37 records validated, 3 tests green). No behavioral regression; existing records all have matching scope/output between claims and experiments.

## Impact
Assurance derivation now respects claim dimension config scope/output requirements. Prevents over-estimation of assurance levels.

---
phase: 3
title: "Frozen-Claim Drift Tests"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Frozen-Claim Drift Tests

## Overview

Write failing tests that pin the contract for Mechanism 2 Scope A: contradictions between new extracted assertions and frozen-legacy claims in `records/claims/` must hard-stop unless the claim's own supersession record (`notes` field) already documents the change.

## Requirements

- Functional: hard-stop when a new extracted assertion contradicts a frozen claim and the claim's `notes` does not mention the change.
- Functional: pass cleanly when a frozen claim's `notes` already records the supersession (the existing `claim-vnstock-runtime-403-root-cause` case).
- Functional: the drift check runs against all 10 frozen claims, not just the one being prototyped.
- Functional: error message names both the index entry-id and the claim-id so the operator can resolve.
- Non-functional: tests use the `node:test` pattern; tmp-directory setup mirrors existing supersession tests.

## Architecture

A "contradiction" between a frozen claim and a new index entry is defined as:

1. Same capability (`claim.capability == entry.capability`).
2. Same dimension (claim's `verification.<dim>` block exists and matches `entry.dimension`).
3. Semantic opposition: either (a) topic-tag naming convention `X-required` vs `X-not-required`, or (b) the new entry's assertion negates a phrase in the claim's `verification.<dim>.reason` or top-level `claim` field.

For the first pass, (a) is the only mechanical signal. (b) is too brittle for automatic enforcement — defer to the operator via the hard-stop message.

A claim's `notes` field "records the supersession" when it contains the substring `SUPERSEDED` or names the new assertion-id directly.

Tests construct a synthetic tmp directory with `records/claims/` and `records/index/` subdirectories, then call the drift check as a unit (extracted from `runExtraction` for testability) or call `runExtraction` end-to-end and assert on its error output.

## Related Code Files

- Modify: `tools/extract-index/extract-index.test.js` — add four new test cases under a `describe("frozen-claim drift")` block.
- Read for context: `records/claims/claim-vnstock-runtime-403-root-cause.yaml` (real example, notes already record supersession), `records/claims/claim-vnstock-version-requirements.yaml` (clean control).
- Read for context: the implementation-target file from Phase 4 (created there, but its function signature is locked here by the tests).

## Implementation Steps

1. Add `describe("frozen-claim drift")` block in `extract-index.test.js`.
2. Test case `hard-stops when new entry contradicts frozen claim without supersession note`. Setup: synthetic claim YAML with `capability: cap`, `claim: "X is required."`, `verification.runtime: {status: verified, reason: "X required."}`, no `notes`. Synthetic new index entry with `capability: cap`, `dimension: runtime`, `topic_tag: x-not-required`. Expect: extraction returns error containing both `claim-id` and `assertion-id`.
3. Test case `passes when frozen claim notes already record supersession`. Same shape but claim has `notes: "SUPERSEDED by ..."`. Expect: no error.
4. Test case `does not hard-stop on unrelated frozen claims`. New entry for `capability: A`. Frozen claim exists for `capability: B`. Expect: no error.
5. Test case `names both records in error message`. Trigger the hard-stop and assert the error string contains both the claim filename and the new assertion-id.
6. Confirm all four tests FAIL on current `main` (the drift check does not exist yet).

## Success Criteria

- [ ] Four new tests added.
- [ ] All four FAIL on current code (with messages indicating missing functionality, not setup errors).
- [ ] The test that uses the real `claim-vnstock-runtime-403-root-cause.yaml` shape (or a faithful synthetic mirror) is included — proves the real-world resolution case works post-Phase 4.

## Risk Assessment

- Risk: synthetic claim fixtures drift from real claim schema. Mitigation: copy structure from a real frozen claim, not a hand-crafted minimal one.
- Risk: tests depend on real `records/claims/` contents and break when claims change. Mitigation: tmp-directory tests use synthetic fixtures only; the real-corpus regression sits in Phase 5.
- Risk: semantic-opposition detection (topic-tag convention) is brittle. Mitigation: tests use the obvious `X-required` / `X-not-required` pair; the harder cases (free-form text contradiction) are explicitly out of scope and remain operator-judgment via Mechanism 2 Scope A's intent.

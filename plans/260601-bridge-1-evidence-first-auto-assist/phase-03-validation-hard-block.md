---
phase: 3
title: "Validation Hard-Block"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Validation Hard-Block

## Overview

Add a validation layer that rejects any product record (decision, experiment, or capability) that references a `candidate` index entry. This is the safety gate that prevents unverified vendor assertions from being consumed by product code.

## Requirements

- Functional: `validate_records` (via MCP `index_validate` tool) reports an error when any product record references a `candidate` index entry.
- Functional: The error message names the `candidate` entry ID, the referencing record, and the field path.
- Functional: Frozen-legacy `claim` records are NOT checked (they predate the candidate system and use their own verification lifecycle).
- Non-functional: Zero false positives — `active`, `superseded`, and `pending_approval` entries are allowed.

## Architecture

The validation layer is `tools/learning-loop-mcp/core/record-validation-rules.js`. It already validates:
- Layer 1: AJV schema validation
- Layer 2: Source reference validation (existence, allowed-root)
- Layer 3: Cross-record relationship validation
- Layer 4: Derived assurance validation (frozen-legacy claims)

We add a new validation pass: **Layer 5: Candidate assertion consumption block**. This runs after Layer 3 but before Layer 4.

### Candidate Block Rule

For each record that is NOT a `claim` or `extracted-assertion`:
1. Collect all `record:` references in the record (from `source_refs`, `evidence_refs`, `supersedes`, `superseded_by`, `experiment_refs`, `decision_refs`, etc.).
2. For each reference, check if the target is an `extracted-assertion` with `status: candidate`.
3. If so, emit: `<record.__file>: references candidate assertion <id> — unverified vendor assertions may not be consumed by product`

### Records Checked

- `experiment` — `source_refs`, `evidence_refs`, `verification.claim_refs`, `verification.proves` references
- `decision` — `source_refs`, `evidence_refs`, `decision_effect.affected_refs`
- `capability` — `source_refs` (if any reference index entries)
- `risk` — `source_refs`, `evidence_refs`

### Records NOT Checked

- `claim` — frozen-legacy, uses its own verification lifecycle
- `extracted-assertion` — the candidate itself; it does not consume itself
- `observation` — not a typed record, not validated by this system

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/record-validation-rules.js` — add `validateCandidateConsumption` function
- Modify: `tools/learning-loop-mcp/core/record-loader.js` — no changes needed (already loads all records)
- Create: `tools/learning-loop-mcp/__tests__/candidate-block.test.js` — tests
- Modify: `docs/artifact-concepts.md` — document the candidate block rule

## Implementation Steps

1. Add `validateCandidateConsumption(records, errors)` to `record-validation-rules.js`:
   - Build a `Map<id, record>` of all `extracted-assertion` entries with their status.
   - For each non-claim/non-assertion record, traverse all reference fields recursively.
   - If any reference points to a `candidate`, push an error.
   - Reference fields to check: `source_refs`, `evidence_refs`, `experiment_refs`, `supersedes`, `superseded_by`, `decision_refs`, `verification.claim_refs`, `verification.proves` (if it contains `record:` references), `decision_effect.affected_refs`.
2. Wire `validateCandidateConsumption` into `validateRecords` after `validateRecordReferences` and before `validateClaimVerification`.
3. Add test file `candidate-block.test.js`:
   - Create a mock record set with a `candidate` assertion and an experiment referencing it.
   - Verify `validateRecords` returns an error naming both records.
   - Create a mock record set with an `active` assertion and an experiment referencing it.
   - Verify `validateRecords` returns no candidate error.
   - Verify `claim` records referencing candidate assertions are NOT flagged (frozen-legacy).
4. Update `docs/artifact-concepts.md` to document the candidate block rule.
5. Run `pnpm test` to verify.
6. Run `pnpm validate:records` to verify no existing records violate the rule.

## Success Criteria

- [ ] `validateRecords` rejects product records that reference `candidate` assertions
- [ ] Error message names the candidate assertion ID and the referencing record
- [ ] `active`, `superseded`, `pending_approval` references pass without error
- [ ] Frozen-legacy `claim` records are exempt from candidate checks
- [ ] Tests cover all record types that can reference index entries
- [ ] `pnpm validate:records` passes on existing records (no existing violations)
- [ ] `pnpm test` passes

## Risk Assessment

- **False positive on `pending_approval` references:** Low — `pending_approval` is explicitly allowed; only `candidate` is blocked.
- **Existing records violate the rule:** Medium — `pnpm validate:records` will catch this before commit. If violations exist, they must be resolved before merging.
- **Reference traversal misses nested fields:** Medium — recursive traversal of `record:` strings inside any array or object field. Unit tests verify coverage.
- **Claim exemption too broad:** Low — claims are frozen-legacy and their own verification rules handle them. No new claims should be created.

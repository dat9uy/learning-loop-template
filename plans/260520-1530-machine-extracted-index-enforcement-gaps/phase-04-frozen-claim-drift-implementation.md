---
phase: 4
title: "Frozen-Claim Drift Implementation"
status: completed
priority: P1
effort: "2h"
dependencies: [3]
---

# Phase 4: Frozen-Claim Drift Implementation

## Overview

Implement Mechanism 2 Scope A: hard-stop when a new extracted assertion contradicts a frozen-legacy claim, unless the claim's `notes` field already records the supersession. Make the four failing tests from Phase 3 pass.

## Requirements

- Functional: load all `records/claims/*.yaml` once per extraction run; build an index by `(capability, dimension)`.
- Functional: for each new extracted assertion, check matching frozen claims for semantic contradiction via topic-tag opposition (`X-required` ↔ `X-not-required`).
- Functional: hard-stop unless the claim's `notes` contains `SUPERSEDED` or names the new assertion-id.
- Functional: error messages name both records.
- Non-functional: place the drift check as a new module `tools/extract-index/frozen-claim-drift.js` to keep `extract-index.js` orchestrator-thin (it is already 290+ lines). No new npm deps.

## Architecture

New module exports `checkFrozenClaimDrift(newEntries, claimsDir): string[]` returning an array of error messages (empty when clean). Pure function — caller loads claim YAMLs and passes them in. `extract-index.js` calls it after entries are built and before write, alongside `checkSupersession`.

Topic-tag opposition pairing rule:

- `X-required` matches `X-not-required` and vice versa (literal `-not-required` / `-required` swap).
- Future heuristics deliberately out of scope; richer detection requires operator judgment.

Frozen-claim → dimension routing reads `verification.{static,install,runtime,product}` blocks. A claim contributes to drift detection for each dimension whose block exists with `status: verified` or `status: approved`.

`notes` field check: `notes.includes("SUPERSEDED")` OR `notes.includes(<new-assertion-id>)`. Case-insensitive.

## Related Code Files

- Create: `tools/extract-index/frozen-claim-drift.js` — drift check module.
- Modify: `tools/extract-index/extract-index.js` — call drift check after entries built, before write.
- Read for context: `records/claims/claim-vnstock-runtime-403-root-cause.yaml` (the resolved case — notes already record supersession).
- Read for context: `tools/extract-index/file-writer.js` (`readExistingIndex` pattern — mirror for claim loading).

## Implementation Steps

1. Create `tools/extract-index/frozen-claim-drift.js`. Export `loadFrozenClaims(claimsDir)` returning `Claim[]`, and `checkFrozenClaimDrift(newEntries, claims): string[]`.
2. Implement `loadFrozenClaims`: walk `records/claims/*.yaml`, parse each, return objects keyed by id with `capability`, `notes`, dimension blocks.
3. Implement `checkFrozenClaimDrift`: build `Map<(capability, dimension), Claim[]>`. For each new entry, derive opposite-tag candidate (`X-required` → `X-not-required` / vice versa). Look up claims in the map; for each match where the claim's text mentions the original tag's semantic (substring match on the tag stem in `claim.claim` or `verification.<dim>.reason`), check `notes` for supersession marker. If absent, push error.
4. Wire into `extract-index.js`: after `checkSupersession`, call `checkFrozenClaimDrift(parsed.map(p => p.entry), loadFrozenClaims(claimsDir))`. Append errors to the existing `errors[]` array.
5. Hard-stop semantics: any drift error blocks the entire extraction pass (same behavior as supersession hard-stop). Operator must either edit the frozen claim's `notes` or split the new finding into a non-contradictory tag.
6. Re-run Phase 3 tests. All four should pass.
7. Re-run the full test suite. No regressions.

## Success Criteria

- [ ] All four Phase 3 tests pass.
- [ ] All Phase 1 + 2 supersession tests still pass.
- [ ] `frozen-claim-drift.js` is under 200 lines.
- [ ] `extract-index.js` orchestrator gains at most ~10 lines.
- [ ] Real-corpus run (Phase 5) passes — the existing `claim-vnstock-runtime-403-root-cause` resolves cleanly because its `notes` already record the supersession.
- [ ] No new npm dependencies.

## Risk Assessment

- Risk: false positives on tag-stem substring match (e.g., `device-id-required` matches a claim mentioning `device-id` generically). Mitigation: match on the full tag stem, not a partial — and only when the new entry uses the explicit `X-required` / `X-not-required` pair. Document the heuristic limit in the module's header.
- Risk: claim-loading is slow when claims grow. Mitigation: claims are 10 today, growth bounded by deprecation. Load once per run.
- Risk: stale frozen-claim text means false-positive drift forever. Mitigation: the `notes` escape hatch is exactly the operator's resolution path; once a claim records `SUPERSEDED` (one-line edit), drift clears.

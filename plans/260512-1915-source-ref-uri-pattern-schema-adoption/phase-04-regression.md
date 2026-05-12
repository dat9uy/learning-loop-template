---
phase: 4
title: "Regression"
status: complete
priority: P3
effort: "20m"
dependencies: [2, 3]
---

# Phase 4: Regression

## Overview

Final gate completed. Every negative fixture still tripped, the `pnpm check` count matched baseline+1, and the ledger entry stayed loadable.

## Requirements

- Functional: `pnpm check` exit 0; record count matches Phase 1 baseline (now baseline + 1 due to the new decision YAML — so target = baseline + 1).
- Non-functional: no negative-fixture silent-pass; commit message conventional; journal entry written via `/ck:journal`.

## Architecture

`runNegativeFixtures` iterates 30+ fixtures and checks each emits a message containing the expected substring. The two updated cases (`unsupported-source-ref`, `malformed-pack-ref`) must trip on the new AJV pattern wording. The 28+ unaffected cases must continue to trip on their existing assertions.

## Related Code Files

- Run: `pnpm check`
- Read: terminal output for confirmation
- Stage + commit: schema files (5), validator (2), decision YAML (1) = 8 files total in one commit
- Run after commit: `/ck:journal` to capture lessons learned

## Implementation Steps

1. Run `pnpm check` from repo root. Expect:
   - Exit 0.
   - `Validated (baseline+1) records.` (the +1 is the new decision YAML).
   - No stderr output beyond the success line.

2. **Sanity dry-run on the two updated fixtures.** Modify `validate-records.js:32` expected string to an obviously wrong value (e.g., `"XXXXXXX"`); rerun `pnpm check`; confirm exit nonzero and error reads `unsupported-source-ref did not fail with expected message: XXXXXXX`. The actual emitted error in the listing reveals AJV's true wording. Confirm the wording matches the prediction `"/source_refs/0 pattern: must match pattern"`. Revert the expected string. Repeat for line 46. Purpose: prove the substring match is genuine, not a flaky `.some()`-over-stale-error.

3. Confirm `git diff --stat` shows:
   ```
   schemas/capability.schema.json | 2 +-
   schemas/claim.schema.json      | 2 +-
   schemas/decision.schema.json   | 2 +-
   schemas/experiment.schema.json | 2 +-
   schemas/risk.schema.json       | 2 +-
   tools/validate-records/record-validation-rules.js | 5 -----
   tools/validate-records/validate-records.js | 4 ++--
   records/decisions/decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml | (new file)
   8 files changed, ~+1 / ~−9 LoC (excluding the new YAML)
   ```
   If diff differs significantly, investigate (likely accidental formatting drift).

4. Commit:
   ```
   git commit -m "feat(validator): adopt AJV pattern for source-ref URI grammar

   Cascade 5 of plans/reports/problem-solving-260512-1714-validate-records-simplification.md.
   AJV now enforces ^(local|record|pack|legacy):.+ on source_refs.items across the 5
   record schemas. validateSourceRefs collapses to ledger checks only (record-ref
   existence, local-path realpath/allowlist, legacy fixture flag, pack no-op continue).
   Negative fixtures unsupported-source-ref and malformed-pack-ref now assert AJV
   pattern wording. Decision: record:decision-260512T1915Z-source-ref-uri-pattern-adoption."
   ```

5. **Subagent reviews.** Delegate to `tester` agent: run `pnpm check`, verify all negative fixtures trip, report status. Delegate to `code-reviewer` agent: review the schema+validator diff, confirm no scope creep, confirm decision YAML self-validates.

6. **Journal.** Invoke `/ck:journal` skill to write a session journal entry covering: the posture shift, the small surface area, the precedent set for treating each cascade as its own ledger entry, and any AJV wording surprises caught during dry-run.

7. Mark plan status `complete` in `plan.md` frontmatter via `ck plan check` for each phase.

## Success Criteria

- [x] `pnpm check` exit 0 with `Validated (baseline+1) records.` line.
- [x] All 30+ negative fixtures trip (no silent passes).
- [x] Both updated fixture assertions confirmed via dry-run probe.
- [x] `git diff --stat` matches expected shape; no unrelated edits.
- [x] Single commit on `main` with conventional `feat(validator):` message citing the decision record.
- [x] Tester agent: DONE.
- [x] Code-reviewer agent: DONE, no blocking issues.
- [x] Journal entry written under `docs/journals/`.
- [x] All phase rows in `plan.md` flipped to `Complete` via `ck plan check`.

## Risk Assessment

- **Risk:** AJV pattern error wording differs from prediction (`pattern: must match pattern` vs e.g. `pattern: "..."`). Step 2 dry-run is designed to surface this before commit, but if the dry-run is skipped the commit lands broken negative-fixture coverage.
  - **Mitigation:** Step 2 is non-skippable. If AJV emits e.g. `"/source_refs/0 must match pattern"` (no `pattern:` separator), update both `validate-records.js` expected strings to match what AJV actually emits.

- **Risk:** The new decision YAML increases `Validated N records.` by exactly 1, but a previous record was somehow removed (unlikely; out of scope for this plan), causing the count to mismatch baseline+1.
  - **Mitigation:** if mismatch, `git status` to find the spurious deletion and reject the commit until investigated.

- **Risk:** Commit message exceeds reasonable line length or includes AI references against the user's git rule.
  - **Mitigation:** subject ≤70 chars; body wrapped ~80; no Claude/AI references.

- **Risk:** Code reviewer flags the `typeof !== "string"` guard in `validateSourceRefs` as now-redundant and wants it removed.
  - **Mitigation:** defer per Phase 2 rationale (defense-in-depth, decouples ledger code from schema state). Document the choice in code-reviewer reply if challenged; alternatively, accept removal if reviewer's argument is stronger.

- **Risk:** Tester agent reports a fixture not covered above as breaking due to AJV pattern (e.g., a positive-path record under `records/` somehow uses a non-prefixed source_ref).
  - **Mitigation:** that's the validator catching a real bug. Decide whether to fix the record or whether the source_ref grammar needs widening. Do not weaken the pattern to mask a real violation.

- **Risk:** Journal entry slips because session ends after commit.
  - **Mitigation:** invoke `/ck:journal` as the last step of this phase before marking it complete; do not mark complete without journal output.

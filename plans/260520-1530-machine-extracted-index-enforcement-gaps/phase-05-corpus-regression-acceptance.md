---
phase: 5
title: "Corpus Regression + Acceptance"
status: completed
priority: P1
effort: "1h"
dependencies: [4]
---

# Phase 5: Corpus Regression + Acceptance

## Overview

Validate Phase 2 and Phase 4 against the real evidence/claim corpus. Confirm the supersession pair regenerates byte-for-byte without hand-edit, no frozen claim triggers spurious drift, and `pnpm check` passes end-to-end.

## Requirements

- Functional: re-running `pnpm extract:index` over the unchanged evidence corpus produces byte-identical `superseded_by` / `supersedes` fields on the `device-id-injection-required` ↔ `device-id-injection-not-required` pair.
- Functional: no frozen-legacy claim triggers a false-positive drift error on a clean run.
- Functional: a synthetic perturbation (add a finding that contradicts a frozen claim without `SUPERSEDED` in `notes`) triggers a hard-stop and exits non-zero.
- Functional: `pnpm check` is 136+/0 (Plan 5 may add tests; the count grows but failures stay at 0).

## Architecture

This is an acceptance pass, not new implementation. Steps run the real tool against the real corpus and verify the brainstorm's Plan 5 acceptance criteria. Any byte difference on the supersession pair is a regression that must be debugged before commit.

## Related Code Files

- No new files.
- Read for verification: `records/index/assertion-vnstock-data-runtime-device-id-injection-required.yaml`, `records/index/assertion-vnstock-data-runtime-device-id-injection-not-required.yaml` (the supersession pair).
- Read for verification: `records/claims/claim-vnstock-runtime-403-root-cause.yaml` (notes already record supersession — must clear drift check).

## Implementation Steps

1. Snapshot the current supersession pair files before any run: `cp records/index/assertion-vnstock-data-runtime-device-id-injection-*.yaml /tmp/snapshot-pre/`.
2. Delete the on-disk supersession pair: `rm records/index/assertion-vnstock-data-runtime-device-id-injection-*.yaml`. (Forces full regeneration; the tool would otherwise short-circuit on unchanged hash.)
3. Run `pnpm extract:index`. Confirm exit 0 and no errors.
4. Diff the regenerated files against the snapshot: `diff /tmp/snapshot-pre/ records/index/`. Acceptable differences: `extraction.agent_run`, `first_extracted_at`, `last_updated_at` (timestamps). Unacceptable: any difference in `superseded_by`, `supersedes`, `status`, `assertion`, `n_count`. If any unacceptable difference, debug Phase 2 work.
5. Run `pnpm check`. Confirm pass count is ≥ 136 + tests added in Phases 1 and 3, failure count is 0.
6. Synthetic drift test: pick `claim-vnstock-version-requirements` (no `notes` supersession). Author a tmp evidence file with a `## Findings` bullet whose topic-tag opposes a verified dimension of that claim. Run `pnpm extract:index`. Expect non-zero exit and an error message naming both records. Delete the tmp file; re-run; expect clean.
7. Update the brainstorm `plans/reports/brainstorm-20260518-machine-extracted-index.md` Plan 5 status line from "Planned 2026-05-20" to "Completed YYYY-MM-DD" with a one-line summary of what landed.
8. Update the Completion Status section at the bottom of the brainstorm similarly.

## Success Criteria

- [ ] Supersession pair regenerates byte-identical (excluding timestamp fields).
- [ ] `pnpm check` passes with 0 failures.
- [ ] Synthetic drift test triggers expected hard-stop with named records.
- [ ] No frozen-legacy claim YAML or evidence file was edited outside the synthetic-test cleanup.
- [ ] Brainstorm Plan 5 status updated to Completed.

## Risk Assessment

- Risk: byte-identity test is too strict — YAML serializer reorders fields. Mitigation: parse both sides via `parseYaml` and deep-equal, not raw text diff. (Adjust Step 4 if `diff` is noisy.)
- Risk: `agent_run` timestamp difference confuses the operator. Mitigation: Step 4 explicitly names which fields are allowed to differ.
- Risk: synthetic drift fixture leaks into git. Mitigation: write to `/tmp/`, not `records/evidence/`; verify `git status` clean before commit.
- Risk: re-extraction wipes other index entries due to hash mismatch from unrelated edits. Mitigation: Step 2 deletes only the supersession pair; run `git status records/index/` after Step 3 and confirm no unrelated YAML changes.

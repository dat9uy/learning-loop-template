---
phase: 2
title: "Citation Repair"
status: pending
priority: P1
dependencies: [1]
effort: "~15min"
---

# Phase 2: Citation Repair

## Overview

Repair the broken `evidence_journal` citation on both findings. The cited path `plans/reports/review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` does NOT exist on disk (verified by `find` and `ls`). This phase repoints both findings' `evidence_journal` to a real review file chosen by the operator in Phase 1.

**Hard prerequisite for Phase 5** (rule promotion). `meta_state_promote_rule` stamps the source finding's `promoted_to_rule` reference; if `evidence_journal` is still broken at promotion time, the audit trail is corrupted.

## Requirements

- Functional: both findings' `evidence_journal` points at a real file.
- Functional: existing `evidence_journal` value is preserved in a change-log entry (audit trail).
- Non-functional: patches are CAS-safe (`_expected_version` provided).
- Non-functional: `meta_state_relationship_validate` is called first to lint for orphan ids.

## Architecture

**Atomic batch (Red Team C2):** Both `evidence_journal` patches wrapped in a single `meta_state_batch` call with two `update` ops. This guarantees partial-failure rollback — if either op fails CAS, neither mutation is applied.

**Filesystem validation (Red Team H1):** Each candidate target file is verified with `fs.existsSync(path.resolve(target))` BEFORE the batch. `meta_state_patch` does not validate journal file existence (verified at `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:41-130`). A typo or moved file would leave the citation broken — the exact bug Phase 2 is fixing.

`_expected_version` is captured per-finding and provided to each `update` op; CAS mismatch returns `version_mismatch` and aborts the batch atomically.

## Related Code Files

- Modify: `meta-state.jsonl` (2 patches, one per finding)
- Optionally create: `plans/reports/review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` (if operator picks option b in Phase 1)

## Implementation Steps

1. **Lint for orphan ids.** Call `meta_state_relationship_validate({ description: "citation repair: repointing evidence_journal" })` to confirm no orphan cross-references.

2. **Capture current versions.** Call `meta_state_list({ id: ["meta-260622T1708Z-...", "meta-260622T1713Z-..."] })` to capture `_expected_version` for both findings.

3. **Log the citation repair.** Call `meta_state_log_change` with:
   - `change_dimension: "surface"`
   - `change_target: "meta-state.jsonl#evidence_journal"`
   - `change_diff`: `{ changed: ["meta-260622T1708Z-...:evidence_journal", "meta-260622T1713Z-...:evidence_journal"] }`
   - `reason`: "Citation repair: both findings cited a non-existent journal (review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md). Repointed to <operator-chosen target> per Phase 1 research."
   - `applies_to: { statuses: ["reported"], tools: ["meta_state_patch"] }`
   - `evidence_code_ref: "meta-state.jsonl"`

4. **Verify filesystem.** For the chosen target, run `fs.existsSync(path.resolve("plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md"))`. If the file is missing, abort with the missing path named. This catches typos and moved files before the batch writes a broken citation.

5. **Atomic batch (C2 fix).** Call `meta_state_batch({ operations: [<update_finding_1>, <update_finding_2>] })` with shape:
   ```js
   {
     operations: [
       { op: "update", id: "meta-260622T1708Z-...", _expected_version: <v1>,
         patch: { evidence_journal: "plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md" } },
       { op: "update", id: "meta-260622T1713Z-...", _expected_version: <v2>,
         patch: { evidence_journal: "plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md" } }
     ]
   }
   ```
   On batch success, both patches are applied. On any CAS mismatch, neither is applied (atomic rollback).

6. **Verify the patches.** Call `meta_state_list({ id: ["meta-260622T1708Z-...", "meta-260622T1713Z-..."] })` to confirm both `evidence_journal` fields now point at a real file. Re-run `fs.existsSync` on the resolved paths as a second check.

7. **Optional: write the missing review (if operator chose option b).** Create `plans/reports/review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` with a retrospective review of PR #8 (merge SHA `e528bab529cfbe6669e5c9c21f18a9ad862bd1d8`):
   - PR title, merge SHA, what it shipped (storage D5+D6)
   - Registry delta: 11 entries swept (179 → 168), 1 finding resolved, 4 ad-hoc archive ops, 1 change-log
   - 2 findings filed: meta-260622T1708Z (pr-quality-rule), meta-260622T1713Z (schema-bloat)
   - Reference: `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` (the per-plan PR-body draft that did document deltas)

## Success Criteria

- [ ] `meta_state_relationship_validate` returned no orphans
- [ ] `meta_state_log_change` for the citation repair succeeded
- [ ] Both target files verified via `fs.existsSync` BEFORE batch write
- [ ] `meta_state_batch` with 2 update ops succeeded (atomic; no partial state)
- [ ] Finding 1 `evidence_journal` repointed (operator target)
- [ ] Finding 2 `evidence_journal` repointed (operator target)
- [ ] Both `evidence_journal` values now point at real files (registry check + filesystem check)
- [ ] (If option b) `plans/reports/review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` exists and is citable

## Risk Assessment

- **CAS mismatch on patch.** Risk: low. `_expected_version` is captured in step 2; mismatch returns `version_mismatch` and aborts.
- **Operator target file also broken.** Risk: low. Phase 1's candidate list is hand-verified; the operator can re-verify before picking.
- **Patch fails to find the new file.** Risk: very low. `meta_state_patch` does not validate file existence; it only validates schema. The verification step (`ls plans/reports/`) is the catch.

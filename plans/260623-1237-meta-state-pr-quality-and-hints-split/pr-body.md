# Meta-state PR-quality rule + discoverability hints split

Atomic follow-up to PR #8 (Phase D Plan 2 — storage) addressing 2 review findings.

## Changes

- Split `DISCOVERABILITY_HINTS` (17 entries) into `DISCOVERABILITY_HINTS` (16 meta-surface contracts) + `PROCESS_HINTS` (2 process rules)
- Added CI advisory workflow for PR-body registry delta enumeration
- Promoted `rule-pr-body-registry-deltas` with consult-checklist enforcement
- Repaired broken `evidence_journal` citations on both source findings
- Updated 6 consumer files, 4 test files, 1 docs file

## Swept entries

(none)

## Superseded entries

- `meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat` — rule promoted + superseded; consolidated_into: `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`
- `meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules` — PROCESS_HINTS split shipped; consolidated_into: `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`

## New entries

- `rule-pr-body-registry-deltas` (rule, active, agent/consult-checklist)
- `loop-design-pr-quality-rules-and-hints-split` (loop-design, active)
- `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan` (change-log, active)
- `meta-260623T1352Z-meta-state-jsonl-evidence-journal` (change-log, active — citation repair)

## Promoted rules

- `meta-260622T1708Z-...` → `rule-pr-body-registry-deltas`

## Other patches

- Both findings' `evidence_journal` repointed from non-existent `review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` to `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`

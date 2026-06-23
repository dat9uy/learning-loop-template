# 2026-06-23 — Meta-state PR-quality rule + discoverability hints split

**Plan:** `plans/260623-1237-meta-state-pr-quality-and-hints-split/plan.md`
**Branch:** `main`
**PR:** (pending)

## Summary

Atomic fixup addressing 2 findings from PR #8 review (meta-260622T1708Z, meta-260622T1713Z). Split `DISCOVERABILITY_HINTS` (17 entries) into `DISCOVERABILITY_HINTS` (16 meta-surface contracts) + `PROCESS_HINTS` (2 process rules). Added CI advisory workflow for PR-body registry delta enumeration. Promoted `rule-pr-body-registry-deltas` with consult-checklist enforcement.

## Phase Outcomes

| Phase | Name | Outcome |
|-------|------|---------|
| 1 | Research | Verified: 15 mutating tools, 17 hints (16 meta + 1 process), PR #8 SHA `e528bab`, citation target confirmed |
| 2 | Citation Repair | Both findings' `evidence_journal` repointed to `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` via atomic batch |
| 3 | PROCESS_HINTS Split | `DISCOVERABILITY_HINTS` (16) + `PROCESS_HINTS` (2) in `loop-introspect.js`. Updated 6 consumers + 4 test files. Cold-session parity preserved (mirror intentionally asymmetric). |
| 4 | PR-body CI Advisory | New `.github/workflows/meta-state-pr-body-advisory.yml` + `tools/scripts/ci-registry-deltas.sh`. Parser test covers 3 categories + XSS escape. Advisory-only. |
| 5 | Rule Promotion | `rule-pr-body-registry-deltas` promoted (agent, consult-checklist, project_has_learning_loop_mcp). 6-item pattern. H6 ordering gate in `loop-describe-tool.js`. |
| 6 | Acceptance Gate | All tests pass (1144). Cold-session parity passes. YAML valid. Change-log + journal + PR body written. Source findings superseded. |

## Test Count Delta

- Before: ~1138 tests (9 namespaces)
- After: 1144 tests (9 namespaces)
- Delta: +6 tests (+1 warm-tier, +1 cold-session routing, +1 SessionStart, +5 parser)

## Registry Deltas

**Superseded entries:**
- `meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat` → superseded, consolidated into `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`
- `meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules` → superseded, consolidated into `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`

**New entries:**
- `rule-pr-body-registry-deltas` (rule, active, agent/consult-checklist)
- `loop-design-pr-quality-rules-and-hints-split` (loop-design, active)
- `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan` (change-log, active)
- `meta-260623T1352Z-meta-state-jsonl-evidence-journal` (change-log, active — citation repair)

**Promoted rules:**
- `meta-260622T1708Z-...` → `rule-pr-body-registry-deltas`

## Open Follow-ups

- `rule-runtime-agnostic-features` (pre-existing consult-checklist rule) has no PROCESS_HINTS row — H6 gate warns. Separate fix needed.
- CI advisory is advisory-only; promote to required check after one quarter of measured compliance.
- Mirror hook (`.factory/hooks/loop-surface-inject.cjs`) intentionally keeps 17 entries in `LOCAL_DISCOVERABILITY_HINTS`. `LOCAL_PROCESS_HINTS` is a forward feature for Droid.

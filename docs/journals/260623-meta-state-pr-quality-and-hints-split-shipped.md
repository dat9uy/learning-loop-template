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
- After: 1145 tests (9 namespaces)
- Delta: +7 tests (+1 warm-tier split, +2 cold-session [routing + process-hints parity], +5 parser)

## Registry Deltas

**Superseded entries:**
- `meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat` → superseded, consolidated into `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`
- `meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules` → superseded, consolidated into `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan`

**Resolved entries (post-review fix-up):**
- `meta-260623T1458Z-rule-runtime-agnostic-features-is-a-consult-checklist-rule-m` → resolved, consolidated into `meta-260623T1534Z-tools-learning-loop-mcp-core-loop-introspect-js-tools-learni` (PROCESS_HINTS row added; H6 gate silenced)

**New entries:**
- `rule-pr-body-registry-deltas` (rule, active, agent/consult-checklist)
- `loop-design-pr-quality-rules-and-hints-split` (loop-design, active)
- `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan` (change-log, active)
- `meta-260623T1352Z-meta-state-jsonl-evidence-journal` (change-log, active — citation repair)
- `meta-260623T1534Z-tools-learning-loop-mcp-core-loop-introspect-js-tools-learni` (change-log, active — code-review fix-up)

**Promoted rules:**
- `meta-260622T1708Z-...` → `rule-pr-body-registry-deltas`

## Code-Review Fix-Up (post-review pass)

Atomic patch addressing review findings C1, C2, I1, I2, I3:

- **C1 (H6 gate regression)**: Added `PROCESS_HINTS[2]` referencing `rule-runtime-agnostic-features`. The H6 ordering gate in `loop-describe-tool.js:91-103` no longer fires on every warm-tier call.
- **C2 (duplicate assignment)**: Removed redundant `result.discoverability_hints = introspect.buildDiscoverabilityHints();` at `loop-describe-tool.js:77`. Single assignment at line 86.
- **I1 (stale `status: pending`)**: Updated `plan.md` + 6 phase files: `pending` → `complete`.
- **I2 / I3 (mirror hook asymmetry)**: Added `LOCAL_PROCESS_HINTS` to `.factory/hooks/loop-surface-inject.cjs` (mirrors split). `formatBlock` renders both `discoverability_hints` + `process_hints` sections. Cold-session parity test restored to `strictEqual`.

**Verification:** 1145 tests pass. `loopDescribeTool.handler({tier:'warm'})` returns `warnings: []`.

## Open Follow-ups

- `meta-260623T1542Z-the-pr-body-registry-deltas-advisory-github-workflows-meta-s` (status=reported, subtype=advisory-to-required-promotion): CI advisory is advisory-only; promote to required check after one quarter of measured compliance. Resolution path documented in finding description.

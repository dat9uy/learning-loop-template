---
phase: 5
title: "Guide Shrink Verification"
status: pending
priority: P1
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Guide Shrink Verification

## Overview

Verify that every procedural section removed from `docs/operator-guide.md` has been fully encoded into a workflow tool, meta evidence file, or existing MCP tool. This phase is a hard gate: if any procedural instruction escaped deletion or any deleted content lacks a replacement, the shrink is incomplete and the guide cannot be considered migrated.

## Key Insights

- The operator guide is ~600 lines; the target is ~120 lines. The delta (~480 lines) must be fully accounted for.
- Deletion without verification risks knowledge loss — the exact problem this plan exists to solve.
- Verification must be MECHANICAL, not manual reading: use diff + grep + checklist against the brainstorm's encoding table.
- Any section still present in the guide after shrink that contains procedural instruction (not philosophy/reasoning) is a failure.

## Requirements

- Functional:
  - Every section listed in the brainstorm's "What Gets Encoded" table has a verified replacement
  - Every section listed in the brainstorm's "What Stays in Operator Guide" table is still present
  - No procedural instruction remains in the guide that is not covered by a tool
  - All cross-references from guide → tools use actual registered tool names
- Non-functional:
  - Verification is repeatable: a script or checklist, not a one-time manual read
  - Verification produces an artifact: `plans/260521-2244-decrease-outside-instruction-workflow-tools/shrink-verification-report.md`

## Related Code Files

- Read: `docs/operator-guide.md` (post-shrink)
- Read: `plans/reports/brainstorm-260521-decrease-outside-instruction.md` §What Gets Encoded / What Stays
- Read: `records/evidence/meta/*.md`
- Create: `plans/260521-2244-decrease-outside-instruction-workflow-tools/shrink-verification-report.md`

## Implementation Steps

1. **Generate pre-shrink baseline**
   - `git show HEAD:docs/operator-guide.md > /tmp/operator-guide-pre.md`
   - Line count baseline: `wc -l /tmp/operator-guide-pre.md`

2. **Generate post-shrink state**
   - Current `docs/operator-guide.md` line count: `wc -l docs/operator-guide.md`
   - Diff: `diff /tmp/operator-guide-pre.md docs/operator-guide.md > /tmp/guide-diff.patch`

3. **Verify encoding completeness checklist**
   For each section in the brainstorm's encoding table, verify replacement exists:
   - [ ] Agent intake flow (13 steps) → `workflow_classify_prompt`, `workflow_intake_orient`, `workflow_intake_plan`
   - [ ] Runtime validation protocol → `workflow_prepare_runtime_request`
   - [ ] Runtime artifact standard → `workflow_prepare_runtime_request` (embeds rules)
   - [ ] Operator card: Product Build Request → `workflow_product_build`
   - [ ] Operator card: Runtime Probe Experiment → `workflow_runtime_probe`
   - [ ] Operator card: Intentional Skip → `workflow_intentional_skip`
   - [ ] Operator card: Evidence Verification → `workflow_verify_evidence_execution`
   - [ ] Operator card: External Decision → `workflow_external_decision`
   - [ ] Operator card: Self-Improvement → `workflow_self_improvement`
   - [ ] Evidence-MD → Experiment-YAML conversion → `workflow_convert_evidence_to_experiment`
   - [ ] Phase success criteria → `workflow_report_phase_status`
   - [ ] Experiment result convention → `workflow_report_phase_status` + index entry
   - [ ] Rule origins → `records/index/assertion-loop-rules-*.yaml`
   - [ ] Agent anti-confusion checklist → `records/evidence/meta/agent-confusion-patterns.md`
   - [ ] Record naming conventions → `records/evidence/meta/naming-conventions.md`
   - [ ] MCP tools table → auto-generated from server (actual tool list)

4. **Verify "stays in guide" checklist**
   - [ ] Philosophy (why the loop exists) still present
   - [ ] Governance model (high-level) still present
   - [ ] How to reason with the loop still present
   - [ ] Resource budget overview still present
   - [ ] Write domain rules (hook reference) still present
   - [ ] Workflow auto-trigger (config reference) still present

5. **Scan for escaped procedural instruction**
   - Grep for imperative verbs in remaining guide: "must", "should", "always", "never", "call", "run", "check"
   - Any match that is not a cross-reference to a tool or a philosophical statement = failure
   - Exception: "must" in security/hook contexts is acceptable

6. **Verify cross-reference correctness**
   - Every tool name referenced in the guide must exist in `server.js`
   - No `gate_*` prefixes on existing tool names
   - No references to deleted sections

7. **Write verification report**
   - `plans/260521-2244-decrease-outside-instruction-workflow-tools/shrink-verification-report.md`
   - Sections: Encoding Checklist, Stay-in-Guide Checklist, Escaped Instruction Scan, Cross-Reference Audit, Pass/Fail

## Todo List

- [ ] Generate pre-shrink baseline diff
- [ ] Run encoding completeness checklist (16 items)
- [ ] Run stay-in-guide checklist (6 items)
- [ ] Scan for escaped procedural instruction
- [ ] Verify cross-reference correctness
- [ ] Write `shrink-verification-report.md`
- [ ] Report verdict: PASS or BLOCKED (with specific gaps)

## Success Criteria

- [ ] Encoding completeness checklist: 16/16 items verified
- [ ] Stay-in-guide checklist: 6/6 items verified
- [ ] Escaped procedural instruction scan: zero findings
- [ ] Cross-reference audit: all tool names resolve to registered tools
- [ ] `shrink-verification-report.md` written with pass/fail verdict
- [ ] Guide line count < 120 (range 100-140)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Verification is subjective | Medium | Use mechanical checklist + grep; reduce human judgment |
| Grep for imperative verbs has false positives | Low | Review findings manually; exclude philosophical statements |
| Report is written but gaps are ignored | High | Report verdict must be PASS or BLOCKED; BLOCKED stops progress |

## Security Considerations

- Verification only reads files; no writes
- Report is read-only documentation

## Next Steps

After Phase 5 completes with PASS verdict, proceed to Phase 6 (Integration Test). If BLOCKED, fix gaps in Phase 4 (guide shrink) and re-run Phase 5.

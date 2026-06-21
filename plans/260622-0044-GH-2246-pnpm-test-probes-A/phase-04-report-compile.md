---
phase: 4
title: "Report compile"
status: completed
priority: P2
dependencies: [1, 2, 3]
---

# Phase 4: Report compile

## Overview

Assemble the final report from Phases 1, 2, 3 outputs. The report is the single deliverable of Plan A. Target: <300 lines at `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md`. Each probe section is appended in the format defined by its phase file. The report also includes a top-level summary of new constraints and the operator trade-off verdict.

## Why This Phase Exists

The 3 probe phases produce raw data. The report phase synthesizes that data into a single source of truth for Plan B. Without this synthesis, Plan B would re-read the 3 phase outputs and the brainstorm, multiplying the context cost.

## Requirements

- Functional: produce a <300 line report that captures all 3 probe answers + the operator trade-off verdict + new constraints.
- Non-functional: read-only. The only file written is `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md`. No meta-state mutations.

## Related Code Files (read-only)

- `plans/260622-0044-GH-2246-pnpm-test-probes-A/phase-01-probe-1-runtime-parity.md` — Probe 1 output (the report appendix)
- `plans/260622-0044-GH-2246-pnpm-test-probes-A/phase-02-probe-4-pnpm-test-consumers.md` — Probe 4 output
- `plans/260622-0044-GH-2246-pnpm-test-probes-A/phase-03-probe-7-fingerprint-drift-dependency.md` — Probe 7 output
- `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md` — brainstorm §7 (where new constraints go)
- Output target: `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md`

## Implementation Steps

1. **Verify all 3 probe phases are complete.** Check the phase files' success criteria checklists. If any phase is incomplete, do not proceed — flag the blocker.

2. **Gather the 3 probe outputs.** Each phase's "Output Format" section specifies the exact markdown block to append. Copy verbatim. The combined output is written to `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` (not `report.md`).

3. **Write the report header.** Include:
   - Plan A title
   - Date generated
   - Status: "All 3 probes closed" or "Probe X: partial — see section"
   - Operator trade-off verdict (one-paragraph synthesis)
   - New constraints (consolidated list, or "None")

4. **Append the 3 probe sections** in order: Probe 1, Probe 4, Probe 7.

5. **Append the "Constraints for Plan B" section.** List every new constraint discovered by any probe. This is the section Plan B reads first.

6. **Append the "Open questions" section.** Any unresolved questions for the operator. If none, write "None — all 3 probes closed with concrete answers."

7. **Verify line count.** Target: <300 lines. If over, identify the largest section and trim duplication. (Note: the consumer table in Probe 4 can be large; if necessary, move the table to a sibling file and link to it.)

8. **Cross-link from the brainstorm.** Add a single-line note to `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md` §7 (or a new §12 "Plan A data-gathering results") pointing to the new report. **This is the only modification outside the plan directory allowed by this plan.**

9. **Mark this phase as completed** by ticking the success criteria checkboxes.

10. **Record pre-existing stale-ref in the report's "New constraints" section** (per Validation Session 1, D2):
    The original `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m` finding's `evidence_code_ref` is `package.json:7`, but the test script has since moved to `package.json:17` (the `--test-timeout=30000` was added by `plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/`). This is a pre-existing stale-ref that Plan B should handle via `meta_state_refresh_fingerprint` or `meta_state_patch`. Plan A is read-only and does not perform this refresh. Add the following line to the "New constraints for brainstorm §7" section:

    > `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m`'s `evidence_code_ref` has drifted from `package.json:7` to `package.json:17` (test script line moved when `--test-timeout=30000` was added). **Defer to Plan B** — Plan A is strictly read-only. Refresh via `meta_state_refresh_fingerprint` (re-hash) or `meta_state_patch` (update the ref) as part of Plan B's closeout for this finding.

## Success Criteria

- [x] `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` exists and is <300 lines
- [x] All 3 probe sections are present in the order: 1, 4, 7
- [x] The "Constraints for Plan B" section is present and lists every new constraint
- [x] The "Open questions" section is present (with content or "None")
- [x] Brainstorm §7 (or new §12) has a one-line cross-link to the report
- [x] No files outside `plans/260622-0044-GH-2246-pnpm-test-probes-A/` are modified (except the brainstorm cross-link)
- [x] No meta-state mutations

## Report Template

```markdown
# Plan A — pnpm test probes data-gathering report

**Date:** 2026-06-22
**Status:** [All 3 probes closed | Probe X partial]
**Source brainstorm:** plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md

## Operator trade-off verdict

[1 paragraph: does the operator's "slow test is the signal" claim hold, and at what level — full suite or per-namespace? Answered by Probe 7. Does the Layer 1 fix have one or three surfaces? Answered by Probe 1. Can the Layer 1 fix use a single output shape, or does it need a partition? Answered by Probe 4.]

## New constraints for brainstorm §7

[Bullet list, or "None"]

## Probe 1: Runtime Parity
[from phase 1 output]

## Probe 4: pnpm test consumers
[from phase 2 output]

## Probe 7: Fingerprint-drift dependency
[from phase 3 output]

## Constraints for Plan B

[Consolidated list of new constraints from all 3 probes]

## Open questions

[None, or list of unresolved questions for the operator]
```

## Risk Assessment

- **Risk:** Probe 4's consumer table exceeds the <300 line budget. **Mitigation:** move the table to `plans/260622-0044-GH-2246-pnpm-test-probes-A/consumer-table.md` and link from the report; the report keeps a summary count.
- **Risk:** The 3 probes surface contradictions (e.g., Probe 1 says Mastra Agent is off the path, Probe 4 says Mastra Agent is a Class B consumer). **Mitigation:** document the contradiction in the "Open questions" section; do not paper over it. Plan B will need to resolve it.
- **Risk:** The cross-link to the brainstorm is rejected (write gate blocks plan/report cross-edits). **Mitigation:** if blocked, do not edit the brainstorm; instead, note the report path in the brainstorm via a follow-up instruction to the operator. Plan B can read the report directly.

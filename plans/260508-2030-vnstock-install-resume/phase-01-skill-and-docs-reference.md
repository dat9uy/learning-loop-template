---
phase: 1
title: "Skill and Docs Reference"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Skill and Docs Reference

## Overview

Lock the meta-process improvement pattern (Q3 N=1 vs N≥2 gap classification, Q1-Q5 cascade as worked example) into the learning-loop skill and operator guide so that future cleared-context agents can find and apply it. Per user direction this phase must complete before any other phase.

## Requirements

- Functional: skill reference file gains a Gap Classification by Sample Count section AND a Worked Example pointer to the brainstorm report. Operator guide Self-Improvement Flow subsection gains a pointer to the same report.
- Non-functional: zero execution risk. Pure doc edits. No schema changes. No new files.

## Architecture

```
.claude/skills/learning-loop/references/meta-evidence-self-improvement.md
├── (existing) Self-Improvement Decision Rules — referenced by new sections
├── (NEW) Gap Classification by Sample Count
│   ├── N=1 closeable — principle a single case proves
│   └── N≥2 deferred — schema/template requiring multiple instances
└── (NEW) Worked Example — pointer to plans/reports/brainstorm-20260508-...md

docs/operator-guide.md
└── Self-Improvement Flow subsection (existing)
    └── (NEW) one-line pointer to brainstorm report
```

## Related Code Files

- **Modify:** `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- **Modify:** `docs/operator-guide.md`
- **Read for context:** `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`

## Implementation Steps

1. Read current `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` end-to-end.

2. Append a new section after "Self-Improvement Decision Rules":

   ```markdown
   ## Gap Classification by Sample Count

   Meta-evidence gaps split into two classes based on what the gap requires to close:

   - **N=1 closeable** — gaps where the missing item is a *principle* a single case can prove. Close via meta-claim → meta-decision (no meta-experiment needed). Example: process-side artifact ambiguity (one case shows knowledge pack is the agent-facing artifact).
   - **N≥2 deferred** — gaps where the missing item is a *schema or template*. One case is not enough to abstract the shape. Defer canonization until at least N=2 (preferably N=3) cases exist. Example: capability-schema-gap, runtime envelope schema.

   When opening or reviewing a meta-evidence file, classify it. Apply this informally first; promote the classification rule to a meta-claim only after a second loop iteration validates it.

   ## Worked Example

   For a complete example of meta-process improvement debate captured as a brainstorm report — Q1-Q5 cascade, deferred-meta-evidence pattern with `## Trigger` recall mechanism, structural prevention via doc rules — see:

   `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`

   This report covers: secret-injection class for runtime gates, N=1 vs N≥2 classification, evidence truth-status communication via claims-first scanning, and recall mechanism for deferred meta-evidence. It is the canonical example for future meta-process brainstorms.
   ```

3. In the existing "Self-Improvement Decision Rules" section, add a single bullet near the top:

   ```markdown
   - Classify each gap by required sample count (see "Gap Classification by Sample Count" below). N=1 gaps close fast via principle adoption; N≥2 gaps defer until enough cases exist.
   ```

4. Read current `docs/operator-guide.md` "Self-Improvement Flow" subsection.

5. Append one line at the end of that subsection:

   ```markdown
   For a worked example of meta-process improvement debate (multi-question cascade, deferred-meta-evidence pattern, `## Trigger` recall mechanism), see `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`.
   ```

6. Run `pnpm check` to confirm no doc validators flag the edits.

## Success Criteria

- [ ] Skill reference file has new "Gap Classification by Sample Count" section
- [ ] Skill reference file has new "Worked Example" section pointing to brainstorm report
- [ ] Skill reference file's "Self-Improvement Decision Rules" cross-references the new sections
- [ ] Operator guide Self-Improvement Flow subsection has the worked-example pointer
- [ ] `pnpm check` passes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pointer goes stale if brainstorm report is renamed/moved | low | Keep report path stable; record_ref-style links discouraged for skill refs (no validator); operator notices if link breaks |
| Classification heuristic adopted prematurely | low | Worded as "informal classification" + "promote to meta-claim only after second iteration validates" |
| Doc edit conflicts with Phase 2 patch (same file) | low | Phase 2 patches a different subsection (Agent Intake Flow step 2); no overlap |

---
phase: 2
title: "Rename capability script to runtime probe in docs"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

<!-- Updated: Validation Session 1 - Scope expanded: skill references + experiment heading rename -->

# Phase 2: Rename capability script to runtime probe in docs

## Overview

Walk all active documentation and replace the overloaded term "capability script" with "runtime probe." This disambiguates Layer 1 artifacts (executable probes) from Layer 2 artifacts (capability records). Journals and historical plans are exempt — they are frozen historical records.

## Requirements

- Functional: No occurrence of "capability script" (singular or plural) remains in any active doc, README, skill reference, or root `README.md`.
- Functional: The "Capability Runtime Experiment" concept name is renamed to "Runtime Probe Experiment" everywhere it appears as a heading or reference.
- Functional: Where "capability script" is replaced, the sentence still reads naturally.
- Non-functional: Directory paths stay the same (`product/<stack>/capabilities/`).
- Non-functional: Journals and historical plans are left untouched.

## Architecture

The rename is a pure editorial find-and-replace. The term mapping:

| Old | New |
|-----|-----|
| capability script | runtime probe |
| capability scripts | runtime probes |
| Capability scripts | Runtime probes |
| Capability Runtime Experiment | Runtime Probe Experiment |

Path references like `product/<stack>/capabilities/` do NOT change.

**Validation scope expansion:** Two skill reference files and the experiment concept name are also renamed per user decision in Validation Session 1.

## Related Code Files

- Modify: `docs/philosophy.md` (line 89)
- Modify: `docs/charter.md` (lines 15, 48)
- Modify: `docs/record-system-architecture.md` (lines 33, 43)
- Modify: `docs/artifact-reference.md` (line 422)
- Modify: `docs/operator-guide.md` (lines 271, 273, 278, 282, 286, and related)
- Modify: `product/README.md` (line 5)
- Modify: `product/web/capabilities/README.md` (line 3)
- Modify: `README.md` (line 11)
- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md` (line 27)
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` (lines 22, 38)

## Implementation Steps

1. Read `docs/philosophy.md` around line 89.
   - Replace: `A capability script proves a library returns usable data.`
   - With: `A runtime probe proves a library returns usable data.`

2. Read `docs/charter.md`.
   - Line 15: Replace "capability scripts" with "runtime probes" in context of `product/<stack>/` scaffolding.
   - Line 48: Replace "capability scripts" with "runtime probes" in the directory description.

3. Read `docs/record-system-architecture.md`.
   - Line 33: Replace "capability scripts" with "runtime probes" in the artifact→location mapping.
   - Line 43: Replace "capability scripts" with "runtime probes" in the evidence flow diagram text.

4. Read `docs/artifact-reference.md` around line 422.
   - Replace "capability scripts" with "runtime probes" in the Capability Runtime Experiment concept description.

5. Read `docs/operator-guide.md` — this file has the most occurrences.
   - Section heading at line 271: Replace `### Capability Runtime Experiment` with `### Runtime Probe Experiment`.
   - Within the section and elsewhere in the file:
     - Replace all instances of "capability scripts" / "capability script" with "runtime probes" / "runtime probe".
   - Section "Stacks and Capability Locations" (around line 284):
     - Update table heading and any prose.
   - Ensure any remaining references to the concept use "Runtime Probe Experiment" consistently.

6. Read `product/README.md` around line 5.
   - Replace "capability scripts" with "runtime probes".

7. Read `product/web/capabilities/README.md`.
   - Replace "capability scripts" with "runtime probes".

8. Read `README.md` around line 11.
   - Replace "capability scripts" with "runtime probes".

9. Read `.claude/skills/learning-loop/references/learning-loop-rules.md`.
   - Line 27: Replace "capability scripts" with "runtime probes".

10. Read `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`.
    - Line 22: Replace "capability script, capability record, Capability Runtime Experiment" with "runtime probe, capability record, Runtime Probe Experiment".
    - Line 38: Replace "capability scripts" with "runtime probes".

11. Run a final grep sweep to confirm zero occurrences of "capability script" in active docs and skill references:
    ```bash
    grep -rn "capability script" docs/ product/README.md product/web/capabilities/README.md README.md .claude/skills/learning-loop/references/ || echo "Clean"
    ```

12. Run `pnpm validate:records` to ensure no doc changes broke record validation (unlikely, but safe).

## Success Criteria

- [x] `grep -rn "capability script" docs/ product/README.md product/web/capabilities/README.md README.md .claude/skills/learning-loop/references/` returns zero matches.
- [x] All replaced sentences read naturally with "runtime probe(s)" substituted.
- [x] "Capability Runtime Experiment" renamed to "Runtime Probe Experiment" everywhere it appears as a heading or concept reference.
- [x] Directory paths unchanged (`product/<stack>/capabilities/`).
- [x] Journals and historical plans untouched.
- [x] `pnpm validate:records` passes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Rename confuses operators used to "capability script" | Add a note in `docs/operator-guide.md` glossary: "Runtime probe (formerly capability script) — executable script that tests a library against live endpoints" |
| "Runtime Probe Experiment" rename breaks historical record references | Historical experiment records (e.g., `experiment-vnstock-capabilities-20260509T174957Z`) are frozen and exempt. Only active docs/skill references are updated |
| Directory path comment in docs says "capabilities" and gets confused | Leave path references as-is; only rename the artifact term |
| Skill reference rename changes agent prompt behavior | The renamed terms are more precise, so this is the intended effect. Verify prompts still read naturally after substitution |

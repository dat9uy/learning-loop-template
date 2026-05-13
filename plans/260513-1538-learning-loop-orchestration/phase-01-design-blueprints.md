---
phase: 1
title: "Design Orchestration Blueprints"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Design Orchestration Blueprints

## Overview

Design the new reference documents that close the full-lifecycle orchestration gap in the learning-loop skill. The skill currently has individual blueprints for planning and execution, but no blueprint that chains them together with claim-evidence validation and claim updates.

## Requirements

- Functional: Design 3 new prompt blueprints + 1 optional helper script spec.
- Non-functional: Blueprints must reuse existing patterns (runtime artifact standard, forbidden captures, envelope fields). No new schema fields.

## Architecture

```
prompt-blueprints.md (existing)
  └── Add 3 new sections:
      ├── Full-Lifecycle Experiment Orchestration Prompt
      ├── Post-Experiment Claim Update Prompt
      └── Claim-Evidence Alignment Review Prompt

OR (alternative):

references/orchestration-patterns.md (new file)
  ├── Full-Lifecycle Orchestration Blueprint
  ├── Post-Experiment Claim Update Blueprint
  ├── Claim-Evidence Alignment Review Blueprint
  └── Experiment-to-Claim Promotion Rules

SKILL.md
  └── Add "full-lifecycle orchestration" as task class #9
```

## Related Code Files

- Read: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Read: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Read: `.claude/skills/learning-loop/SKILL.md`
- Read: `docs/artifact-reference.md` (cross-record reference map, validation architecture)
- Read: `docs/operator-guide.md` (runtime artifact standard, agent intake flow)
- Create: `.claude/skills/learning-loop/references/orchestration-patterns.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Modify: `.claude/skills/learning-loop/SKILL.md`

## Implementation Steps

1. Read existing blueprints and docs to ensure consistency.
2. Decide whether to add sections to `prompt-blueprints.md` or create a new `orchestration-patterns.md`.
   - Decision criterion: if orchestration content exceeds 150 lines, create a new file to keep `prompt-blueprints.md` under 300 lines.
3. Design the **Full-Lifecycle Orchestration Blueprint**:
   - Evidence-first scanning step (read claim + evidence before planning)
   - Experiment planning sub-step
   - Approval gate before execution
   - Execution delegation to Runtime Proof Prompt
   - Result capture into experiment record
   - Claim-evidence alignment review
   - Claim update delegation to Post-Experiment Claim Update Prompt
   - Validation commands
4. Design the **Post-Experiment Claim Update Blueprint**:
   - Update experiment YAML: `result`, `result_reason`, `agent_outcome`, `observations`
   - Map experiment `result` to claim dimension status:
     - `supports` → `verified`
     - `does-not-support` → `rejected`
     - `inconclusive` → stay `claimed`, add limitation
   - Construct and run `pnpm verify:claim -- --claim <id> --dimension <dim> --status <status> --reason ... --proof-ref <experiment> [--apply]`
   - Run `pnpm validate:records && pnpm check`
5. Design the **Claim-Evidence Alignment Review Blueprint**:
   - Read claim verification block and experiment `verification.proves`
   - Verify dimension, scope, and output_level match
   - Verify evidence envelope supports the hypothesis
   - Flag mismatches before claim update
6. Design **Promotion Rules** (reference table):
   - `experiment.result` × `experiment.verification.proves` → `claim.verification.<dimension>.status`
   - Multi-experiment synthesis rules (when ≥2 experiments target same claim dimension)
7. Document the optional **orchestration helper script** spec:
   - A `tools/` script that reads an experiment YAML and outputs the exact `pnpm verify:claim` command.
   - Defer implementation to a separate plan if complexity is high.

## Success Criteria

- [ ] Design document drafted with all 3 blueprints specified.
- [ ] Consistency check: new blueprints do not contradict existing runtime artifact standard or forbidden captures.
- [ ] Promotion rules table is complete for all 3 experiment result types.
- [ ] Design stays under 300 lines per reference file.
- [ ] No new schema fields proposed.

## Risk Assessment

- **Risk:** Over-engineering the orchestration blueprint into a rigid workflow that doesn't fit all experiment types.
  - Mitigation: Keep blueprints as *prompt skeletons*, not enforced state machines. Each step is delegable/skippable.
- **Risk:** Duplicating content between SKILL.md, prompt-blueprints.md, and the new reference.
  - Mitigation: Follow DRY — promotion rules live in one place; SKILL.md only references them.

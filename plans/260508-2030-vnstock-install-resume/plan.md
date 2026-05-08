---
title: "vnstock Install Resume"
description: "Continuation plan that resumes the failed vnstock install knowledge encoding plan with corrected env-var-driven installer contract and locks the meta-process improvement pattern (Q1-Q5 cascade) into the learning-loop skill and operator guide."
status: completed
priority: P1
branch: "main"
tags: [vnstock, install, knowledge-pack, meta-process, continuation]
blockedBy:
  - "Vendor device-limit gate blocked vnstock_data package installation during Phase 3 rerun"
blocks: []
created: "2026-05-08T16:10:19.658Z"
createdBy: "ck:plan"
source: skill
---

# vnstock Install Resume

## Overview

Resume the install experiment blocked in `plans/260508-1545-vnstock-install-knowledge-encoding/` using the corrected installer contract proven by the prior run (env-var-driven, not flag-driven), with the API key injected by the operator's shell so that the value never enters agent context. Before the rerun, lock the meta-process improvement pattern derived from the brainstorm debate (Q1–Q5) into the learning-loop skill and operator guide so that future cleared-context agents have a discoverable example.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Skill and Docs Reference](./phase-01-skill-and-docs-reference.md) | Complete |
| 2 | [Procedural Setup](./phase-02-procedural-setup.md) | Complete |
| 3 | [Experiment Rerun](./phase-03-experiment-rerun.md) | Blocked (env-var key path confirmed; vendor device-limit gate blocked package install/import) |
| 4 | [Pack Verification](./phase-04-pack-verification.md) | Blocked (depends on successful install evidence; current Phase 3 evidence does not support install) |

## Dependencies

```
Phase 1 (Skill and Docs Reference)
  └──→ Phase 2 (Procedural Setup)

Phase 2 (Procedural Setup)
  └──→ Phase 3 (Experiment Rerun)

Phase 3 (Experiment Rerun)
  └──→ Phase 4 (Pack Verification)
```

Phase 1 MUST complete before any other phase per user direction.

## Predecessor

Failed plan: `plans/260508-1545-vnstock-install-knowledge-encoding/` (status: blocked). Failed plan stays archived as-is — do not edit. Its evidence files are read-only inputs to this plan.

## Source

- Brainstorm report: `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` (Q1–Q5 cascade locked)
- Prior experiment evidence: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (proves flag contract is wrong)
- Prior meta evidence: `records/evidence/meta/{capability-schema-gap,install-experiment-template-gap,process-side-artifact-ambiguity,runtime-run-schema-deferral}.md`

## Key Decisions (locked from brainstorm)

- **Q1 (runner)**: substrate-only secret injection. No `tools/` runner artifact. Operator's shell does the work.
- **Q2 (secret store)**: env var via `read -s`. Reject plaintext dotfile. Defer gpg/keychain.
- **Q3 (N=1 vs N≥2)**: capture as deferred meta-evidence. Apply heuristic informally.
- **Q4 (truth-status)**: structural rule (claims-first scanning) + per-file `## Supersedes` link. User accepted the human-direct-browse hole ("trust the doc rule"). Defer claim-side status block + computed view.
- **Q5 (recall)**: per-file `## Trigger` section + operator-guide pre-experiment scan rule. Defer validation-tool emission and plan-template integration.
- **Q6 (capability-dir scan, added during plan review)**: complementary rule to Q4 E. Capability-dir scanning for *planning-context* discovery; claim-first scanning for *truth-status* discovery. Motivated by missed `unified-ui-snapshot/` evidence in initial Phase 3 draft. Adopted N=1 informally; promote to meta-claim if a second case confirms.

## Success Criteria

- [x] Phase 1 complete: skill and docs reference updates landed before any other work
- [x] `pnpm check` passes after edits
- [ ] Install dimension verified for `vnstock-data` claim under sandbox scope
- [x] New experiment evidence file with `secret_injection_class` + `static_dimension_consistency` fields AND `## Supersedes` section
- [x] Four new meta-evidence files exist with `## Trigger` sections
- [x] Four existing meta-evidence files retrofitted with `## Trigger` sections
- [x] `docs/operator-guide.md` patched in two subsections (Self-Improvement Flow + Agent Intake Flow step 2 with Q4 E + Q5 R2 + Q6 rules)
- [x] `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` updated
- [x] Agent transcript review confirms zero literal API key value in agent/tool output; temp-local config files containing the key were deleted with substrate

## Reviews

- [Review 2026-05-09 — record-layer gaps and follow-up scope](../reports/review-20260509-vnstock-resume-record-layer-gaps.md): retrospective on Phase 3's blocked experimental outcome. Surfaces 11 gaps, 9 decisions, 14 open items. Defines anti-patterns for the next-context agent. The follow-up investigation (operator claim, 2-sandbox falsification, record-layer migration) lives in a new plan, not this one.

Plan-level `status: completed` reflects `ck:project-management` lifecycle (work was performed and reviewed). Experiment-level outcome remains `blocked` (vendor device-limit gate stopped package install before import verification); this is captured in `blockedBy` above and in the per-phase status fields. Plan-status and experiment-status are orthogonal axes; do not conflate them.

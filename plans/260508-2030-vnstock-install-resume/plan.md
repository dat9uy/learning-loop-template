---
title: "vnstock Install Resume"
description: "Continuation plan that resumes the failed vnstock install knowledge encoding plan with corrected env-var-driven installer contract and locks the meta-process improvement pattern (Q1-Q5 cascade) into the learning-loop skill and operator guide."
status: pending
priority: P1
branch: "main"
tags: [vnstock, install, knowledge-pack, meta-process, continuation]
blockedBy: []
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
| 1 | [Skill and Docs Reference](./phase-01-skill-and-docs-reference.md) | Pending |
| 2 | [Procedural Setup](./phase-02-procedural-setup.md) | Pending |
| 3 | [Experiment Rerun](./phase-03-experiment-rerun.md) | Pending |
| 4 | [Pack Verification](./phase-04-pack-verification.md) | Pending |

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

## Success Criteria

- [ ] Phase 1 complete: skill and docs reference updates landed before any other work
- [ ] `pnpm check` passes after edits
- [ ] Install dimension verified for `vnstock-data` claim under sandbox scope
- [ ] New experiment evidence file with `secret_injection_class` field AND `## Supersedes` section
- [ ] Three new meta-evidence files exist with `## Trigger` sections
- [ ] Four existing meta-evidence files retrofitted with `## Trigger` sections
- [ ] `docs/operator-guide.md` patched in two subsections (Self-Improvement Flow + Agent Intake Flow step 2)
- [ ] `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` updated
- [ ] Agent transcript review confirms zero literal API key value

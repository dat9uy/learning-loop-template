---
title: "Meta-Evidence Gap Revisit: Install Template + Capability Schema"
description: "Resolve meta-evidence gaps surfaced in brainstorm-260512-0046: draft install experiment template candidate from 4 vnstock install evidence MDs (Gap 1, trigger N=2 exceeded), update capability-schema-gap.md with partial-supersession note + re-pin N>=3 trigger (Gap 2, trigger not yet met). Parser-swap decision out of scope."
status: pending
priority: P2
branch: "main"
tags: [meta, evidence, learning-loop, install-template, capability-schema, gap-resolution]
blockedBy: []
blocks: []
created: "2026-05-11T18:48:13.516Z"
createdBy: "ck:plan"
source: skill
---

# Meta-Evidence Gap Revisit: Install Template + Capability Schema

## Overview

Brainstorm (`plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`) established that:

- Gap 1 (`records/evidence/meta/install-experiment-template-gap.md`) trigger threshold `N=2` is exceeded; 4 vnstock install evidence MDs converge on a 7-section envelope.
- Gap 2 (`records/evidence/meta/capability-schema-gap.md`) is partially superseded by the existing minimal `schemas/capability.schema.json` but the N>=3-verified-packs trigger is not yet met.

Plan resolves Gap 1 via meta-experiment + template candidate, updates Gap 2 MD with partial-supersession note, and runs validation gates. No code changes, no schema changes, no validator changes.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Gap 1 Artifacts](./phase-01-gap-1-artifacts.md) | Pending |
| 2 | [Gap 2 MD Update](./phase-02-gap-2-md-update.md) | Pending |
| 3 | [Validation And Meta-Decision](./phase-03-validation-and-meta-decision.md) | Pending |

## Dependencies

- Brainstorm source: `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`
- Loop policy reference: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Evidence corpus (Gap 1): 4 MDs under `records/evidence/vnstock-data/experiment-install-*.md`
- Schema reference (Gap 2): `schemas/capability.schema.json`
- Validation gates: `pnpm validate:records`, `pnpm check`

## Out of Scope

- YAML parser library swap (`decision-20260510T172056Z-yaml-parser-library-swap`) remains in draft and is independently scoped.
- New schema files or validator extensions.
- Editing approved capability records (`capability-fastapi-reference-rest`, `capability-tanstack-reference-render`).
- Editing frozen historical experiment records.

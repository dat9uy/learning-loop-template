---
title: "Meta-Process Skill Template Fix"
description: "Fix four gaps discovered during meta-workflow testing of the fundamental capability plan: prohibit CLAUDE memory in favor of records/index, split domain-specific content from operator-guide, enforce decision-record encoding in product-build prompts, and capture the discovery as meta-evidence."
status: completed
priority: P2
branch: "main"
tags: [meta-process, skill-template, learning-loop, operator-guide, memory]
blockedBy: []
blocks: []
created: "2026-05-20T14:33:40.660Z"
createdBy: "ck:plan"
source: skill
---

# Meta-Process Skill Template Fix

## Overview

Closes structural gaps in the learning-loop skill templates and operator-guide that allowed the `260520-2101-fundamental-capability-productization` plan to:
1. Rely on injected CLAUDE memory instead of `records/index/` for pattern replication.
2. Replicate a vnstock-specific gate pattern without a generic template.
3. Encode architectural decisions in plan prose rather than `records/decisions/` artifacts.
4. Instruct agent-authored evidence creation without operator confirmation.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research and Analysis](./phase-01-research-and-analysis.md) | Completed |
| 2 | [Memory Prohibition Implementation](./phase-02-memory-prohibition-implementation.md) | Completed |
| 3 | [Operator-Guide Domain Split](./phase-03-operator-guide-domain-split.md) | Completed |
| 4 | [Product-Build Blueprint Update](./phase-04-product-build-blueprint-update.md) | Completed |
| 5 | [Meta-Evidence and Validation](./phase-05-meta-evidence-and-validation.md) | Completed |

## Key Decisions

- Add hard memory prohibition rule to `references/learning-loop-rules.md`; delete project-scoped memory files.
- Split `docs/operator-guide.md` into generic core + `docs/operator-guide-vnstock-appendix.md`.
- Update `references/prompt-blueprints-product-build.md` with decision-record requirement and operator-only evidence protocol.
- Capture the discovery as a light meta-evidence note; do not flag the fundamental plan as failed.

## Dependencies

- Related plan: `260520-2101-fundamental-capability-productization` (the plan that surfaced these gaps). Not a block — this plan improves the template it was based on.

## Risks

| Risk | Mitigation |
|------|------------|
| Large operator-guide diff affects in-flight plans referencing it | Keep all section anchors stable; move only vnstock-specific prose |
| Deleting memories is irreversible | Memories are lightweight feedback notes; value is already encoded in rule changes |
| Fundamental plan may still violate new template if executed unchanged | Defer plan revision to later session; write gate blocks `records/evidence/**` anyway |

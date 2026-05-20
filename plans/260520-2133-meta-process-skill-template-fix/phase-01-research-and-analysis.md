---
phase: 1
title: "Research and Analysis"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 1: Research and Analysis

## Overview

Read all target files, map exact content boundaries for modification, and document the current state before any edits.

## Requirements

- Functional:
  - Identify every vnstock-specific section in `docs/operator-guide.md`
  - Identify every place the learning-loop skill references or relies on memory
  - Identify all gaps in `references/prompt-blueprints-product-build.md`
- Non-functional:
  - Produce a boundary map showing what moves where

## Architecture

Read-only phase. No file modifications.

## Related Code Files

- Read: `docs/operator-guide.md`
- Read: `docs/philosophy.md`
- Read: `docs/record-system-architecture.md`
- Read: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Read: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Read: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`
- Read: `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md`
- Read: `.claude/skills/learning-loop/references/orchestration-patterns.md`
- Read: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/MEMORY.md`
- Read: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/feedback_*.md`
- Read: `plans/260520-2101-fundamental-capability-productization/phase-05-records-and-documentation.md`

## Implementation Steps

1. Read `docs/operator-guide.md` and annotate every vnstock-specific paragraph, example, or command.
2. Read `references/learning-loop-rules.md` and note absence of memory prohibition.
3. Read `references/prompt-blueprints-product-build.md` and note:
   - No decision-record requirement
   - No pre-implementation checklist
   - No operator-only evidence protocol
4. Read the fundamental plan Phase 5 and document the evidence-authority violation.
5. List all memory files and their contents.
6. Grep all plans and docs for references to `docs/operator-guide.md` sections. Document which references will break after the split and which plans need updates.
7. Produce a boundary map document (can be prose in this phase file).

## Success Criteria

- [ ] Boundary map completed showing what moves from operator-guide to appendix
- [ ] Memory file inventory listed
- [ ] Blueprint gap list documented
- [ ] Evidence-authority violation in fundamental plan documented with citation

## Risk Assessment

- **Scope creep**: Research may discover additional gaps. Scope-lock to the four identified gaps only; defer new findings to future meta-evidence.

---
phase: 2
title: "Memory Prohibition Implementation"
status: completed
priority: P2
effort: "20m"
dependencies: [1]
---

# Phase 2: Memory Prohibition Implementation

## Overview

Add a hard memory-prohibition rule to the learning-loop skill and delete project-scoped memory files so agents stop relying on injected context.

## Requirements

- Functional:
  - Update `references/learning-loop-rules.md` with a rule forbidding memory use
  - Delete all 4 feedback memory files and `MEMORY.md` index
- Non-functional:
  - Rule must cite `docs/philosophy.md` premise: "the record is the memory"

## Architecture

Rule addition + file deletion. No code changes.

## Related Code Files

- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Modify: `.claude/settings.json`
- Delete: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/feedback_check_records_first.md`
- Delete: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/feedback_no_memory_as_enforcement.md`
- Delete: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/feedback_observation_before_workaround.md`
- Delete: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/feedback_vnstock_safe_import.md`
- Delete: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/memory/MEMORY.md`

## Implementation Steps

1. Add a new section to `references/learning-loop-rules.md` under `## Core Philosophy`:
   ```markdown
   ## Memory Prohibition

   Do not use injected CLAUDE.md memory or session context as a source of truth. The learning-loop system maintains its own state in `records/`. Before acting on any recalled fact, verify it against `records/index/` or `records/observations/`. If a memory contradicts the records, trust the records. If the records are silent, treat the memory as unverified and create an experiment or observation to confirm it.
   ```
2. Update `.claude/settings.json` to disable memory loading for this project. Add or update a `memory` section:
   ```json
   {
     "memory": {
       "enabled": false
     }
   }
   ```
   Or use the project-specific memory disable mechanism if available in the harness.
3. Delete the 4 memory files.
4. Delete `MEMORY.md`.
5. Verify no other project files reference these memory paths.

## Success Criteria

- [ ] `references/learning-loop-rules.md` contains explicit memory prohibition
- [ ] All 4 memory files deleted
- [ ] `MEMORY.md` index deleted
- [ ] No broken references in skill docs

## Risk Assessment

- **Global memory vs project memory**: Only delete project-scoped memory (`~/.claude/projects/.../`). Do not touch `~/.claude/memory/` if it exists.
- **Skill references memory**: If any skill file references `MEMORY.md`, update it to reference `records/index/` instead.

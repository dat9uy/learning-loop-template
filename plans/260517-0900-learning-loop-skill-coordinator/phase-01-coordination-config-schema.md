---
phase: 1
title: "Coordination Config Schema"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Coordination Config Schema

## Overview

Create `.claude/coordination/` directory with skill-registry.json and coordination-config.json. These are the declarative configs that the hook and coordinator read.

## Requirements

- Functional: skill-registry.json lists which skills are gated and their profiles
- Functional: coordination-config.json defines profiles with write allowlists/forbidlists
- Functional: runtime validation (field existence, type checks) — no JSON schemas in v1
- Non-functional: sensible defaults for this repo's existing skills

## Red Team Fixes Applied

| Finding | Fix |
|---------|-----|
| #5 Schema files premature | Drop JSON schemas from v1. Validate with runtime checks in hook/coordinator. |
| #6 skill_overrides YAGNI | Remove from v1 config. Add when a skill actually needs overrides. |
| #7 post_execution undefined | Remove from v1 profiles. Coordinator manually runs pnpm check after skill completes. |
| #10 deploy budget metadata | Not needed in v1 — no external-system skills registered yet. Add when deploy is registered. |
| Test file extension | Use .cjs for test files (package.json has "type": "module") |

## Related Code Files

- Create: `.claude/coordination/skill-registry.json`
- Create: `.claude/coordination/coordination-config.json`
- Create: `.claude/coordination/__tests__/coordination-config.test.cjs`

## Implementation Steps

### Step 1: Write tests for config validation

Create `.claude/coordination/__tests__/coordination-config.test.cjs`:

**Test cases:**
1. skill-registry.json has required fields: `version`, `coordinator`, `registered_skills`
2. Each registered skill has `profile` field
3. `unregistered_skills_bypass` defaults to true
4. coordination-config.json has required fields: `version`, `profiles`
5. Each profile has `write_allowlist` and `write_forbidlist` (arrays)
6. Each profile has `gate_signals` (array)
7. No `post_execution` in v1 profiles (documented as future)
8. No `skill_overrides` in v1 config (documented as future)

### Step 2: Create skill-registry.json

```json
{
  "version": "1.0",
  "coordinator": "learning-loop",
  "registered_skills": {
    "backend-development": { "profile": "code-generation" },
    "frontend-development": { "profile": "code-generation" },
    "tanstack": { "profile": "code-generation" },
    "cook": { "profile": "plan-execution" },
    "fix": { "profile": "code-generation" },
    "mcp-builder": { "profile": "code-generation" },
    "web-frameworks": { "profile": "code-generation" },
    "mobile-development": { "profile": "code-generation" }
  },
  "unregistered_skills_bypass": true
}
```

Note: `deploy` is NOT registered in v1. No external-system skills are active. Add when needed.

### Step 3: Create coordination-config.json

```json
{
  "version": "1.0",
  "profiles": {
    "code-generation": {
      "description": "Skills that write code files",
      "write_allowlist": ["product/**", "tools/**"],
      "write_forbidlist": ["records/**", "evidence/**", "docs/**", "plans/**", "schemas/**"],
      "read_requirelist": ["docs/operator-guide.md", "docs/artifact-reference.md"],
      "gate_signals": ["validation_window"]
    },
    "plan-execution": {
      "description": "Skills that execute plans",
      "write_allowlist": ["product/**", "tools/**", "records/**", "evidence/**"],
      "write_forbidlist": ["schemas/**"],
      "read_requirelist": ["docs/operator-guide.md", "docs/artifact-reference.md"],
      "gate_signals": ["validation_window"]
    },
    "external-system": {
      "description": "Skills that interact with external systems (not used in v1)",
      "write_allowlist": ["product/**", "records/**", "evidence/**"],
      "write_forbidlist": ["schemas/**"],
      "read_requirelist": ["docs/operator-guide.md"],
      "gate_signals": ["budget_check", "validation_window", "staleness_check"]
    }
  }
}
```

### Step 4: Run tests

Verify config files pass runtime validation.

## Success Criteria

- [ ] `.claude/coordination/` directory exists with both config files
- [ ] Both config files are valid JSON
- [ ] All registered skills have valid profiles
- [ ] No `post_execution` in v1 profiles
- [ ] No `skill_overrides` in v1 config
- [ ] Tests pass: `node .claude/coordination/__tests__/coordination-config.test.cjs`

## TDD Notes

Tests are written FIRST (Step 1). Config files are implementations that satisfy the tests (Steps 2-3).

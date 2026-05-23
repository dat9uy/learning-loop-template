---
phase: 4
title: Factory-Config
status: completed
effort: 2h
dependencies:
  - 3
---

# Phase 4: Factory-Config

## Overview

Create `.factory/` configuration mirror for Droid CLI: hooks, skills, and settings. Droid will use the same universal hook scripts as Claude Code, ensuring identical gate behavior across both agent surfaces.

## Requirements

- Functional: `.factory/settings.json` configures Droid hooks matching `.claude/settings.json`
- Functional: `.factory/coordination/hooks/` are thin wrappers pointing to universal scripts
- Functional: `.factory/skills/` contains Droid-compatible skill definitions
- Functional: Droid can invoke MCP tools via same `mcp__constraint-gate__*` naming
- Non-functional: No duplication of logic — all paths point to `tools/coordination-gate/`

## Architecture

```
.factory/                          # NEW — Droid CLI configuration
├── settings.json                  # Hook configuration for Droid
├── coordination/
│   └── hooks/                     # Thin wrappers (same pattern as .claude)
│       ├── bash-coordination-gate.cjs
│       ├── write-coordination-gate.cjs
│       ├── inbound-state-gate.cjs
│       └── lib/
│           └── gate-utils.cjs     # Re-export from core (or delete if universal)
└── skills/
    ├── learning-loop/
    │   └── SKILL.md               # Droid-compatible version
    └── constraint-gate/
        └── SKILL.md               # Droid-compatible version
```

### Droid vs Claude Tool Name Mapping

| Claude Code | Droid CLI | Universal Hook Handles |
|-------------|-----------|------------------------|
| `Bash` | `Execute` | Yes (protocol-adapter) |
| `Edit` | `Edit` | Yes |
| `Write` | `Create` | Yes (protocol-adapter) |
| `Create` | `Create` | Yes |
| `ApplyPatch` | `ApplyPatch` | Yes |

### Droid Settings Format

Droid uses the same JSON structure as Claude Code for hooks:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$FACTORY_PROJECT_DIR\"/.factory/coordination/hooks/inbound-state-gate.cjs"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Create|ApplyPatch",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$FACTORY_PROJECT_DIR\"/.factory/coordination/hooks/write-coordination-gate.cjs"
          }
        ]
      },
      {
        "matcher": "Execute",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$FACTORY_PROJECT_DIR\"/.factory/coordination/hooks/bash-coordination-gate.cjs"
          }
        ]
      }
    ]
  }
}
```

## Related Code Files
- Create: `.factory/settings.json`
- Create: `.factory/coordination/hooks/bash-coordination-gate.cjs`
- Create: `.factory/coordination/hooks/write-coordination-gate.cjs`
- Create: `.factory/coordination/hooks/inbound-state-gate.cjs`
- Create: `.factory/skills/learning-loop/SKILL.md`
- Create: `.factory/skills/constraint-gate/SKILL.md`
- Read: `.claude/settings.json` (template)
- Read: `.claude/skills/learning-loop/SKILL.md` (template)
- Read: `.claude/skills/constraint-gate/SKILL.md` (template)

## Implementation Steps

1. **Create `.factory/coordination/hooks/`** (30 min)
   - Create thin wrapper scripts (same pattern as `.claude/` wrappers)
   - Use `$FACTORY_PROJECT_DIR` for project-relative paths
   - All wrappers delegate to `tools/coordination-gate/hooks/`

2. **Create `.factory/settings.json`** (15 min)
   - Mirror `.claude/settings.json` hook configuration
   - Use `$FACTORY_PROJECT_DIR` env var for absolute paths
   - Matchers: `Execute` (not `Bash`), `Edit|Create|ApplyPatch`

3. **Create `.factory/skills/`** (30 min)
   - Copy `.claude/skills/learning-loop/SKILL.md` → `.factory/skills/learning-loop/SKILL.md`
   - Copy `.claude/skills/constraint-gate/SKILL.md` → `.factory/skills/constraint-gate/SKILL.md`
   - Update paths: `.claude/` → `.factory/`, `node .claude/...` → `node "$FACTORY_PROJECT_DIR"/.factory/...`
   - Update skill frontmatter for Droid conventions

4. **Update MCP server registration** (15 min)
   - Ensure MCP server is registered in `.mcp.json` or Droid's MCP config
   - Droid uses `mcp__constraint-gate__*` naming (already works)

5. **Document dual-surface setup** (15 min)
   - Update `CLAUDE.md` with `.factory/` configuration notes
   - Update `.claude/coordination/hooks/README.md` with Droid compatibility

## Success Criteria

- [x] `.factory/settings.json` exists and configures PreToolUse + UserPromptSubmit hooks
- [x] `.factory/coordination/hooks/` exist and delegate to universal scripts
- [x] `.factory/skills/` contains learning-loop and constraint-gate skills
- [x] Droid can invoke MCP tools (`mcp__constraint-gate__check_gate`, etc.)
- [x] No logic duplication between `.claude/` and `.factory/`

## Completion Notes

- Created `.factory/settings.json` with `Execute` and `Edit|Create|ApplyPatch` matchers
- Created 3 thin wrapper hooks in `.factory/coordination/hooks/` (same pattern as `.claude/`)
- Created `.factory/skills/learning-loop/SKILL.md` and `.factory/skills/constraint-gate/SKILL.md`
- Updated skill paths from `tools/constraint-gate/` to `tools/coordination-gate/mcp/`
- Both `.claude/` and `.factory/` wrappers point to same `tools/coordination-gate/hooks/` scripts

## Risk Assessment

- **Risk**: Droid settings format differs from Claude Code
  - Mitigation: Research confirmed same JSON structure; test with Droid
- **Risk**: `$FACTORY_PROJECT_DIR` not available in all Droid contexts
  - Mitigation: Use `__dirname` resolution as fallback
- **Risk**: Skills need Droid-specific adaptations
  - Mitigation: Keep skills minimal; Droid auto-discovers same patterns
- **Risk**: MCP server not auto-discovered by Droid
  - Mitigation: Document manual registration in `CLAUDE.md`

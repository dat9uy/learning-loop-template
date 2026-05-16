---
phase: 3
title: "Hook Registration"
status: pending
priority: P1
effort: "30m"
dependencies: [0, 2]
---

# Phase 3: Hook Registration

## Overview

Register the skill-coordination-gate hook in project settings as a PreToolUse hook on the Skill tool. Strategy depends on Phase 0 findings: if settings merge, create `.claude/settings.json`; if override, add hooks to existing `.claude/settings.local.json`.

## Requirements

- Functional: hook fires on every Skill tool call in this project
- Functional: hook script path is correct relative to project root
- Functional: existing `settings.local.json` permissions preserved
- Non-functional: hook is project-local only (not global settings)
- Non-functional: global hooks continue to work (merge, not override)

## Red Team Fixes Applied

| Finding | Fix |
|---------|-----|
| #9 Settings may shadow global hooks | Phase 0 verifies merge behavior. If override, replicate global hooks in project settings. |
| settings.local.json permissions | Merge hooks into existing `settings.local.json` instead of creating new `settings.json`. |

## Related Code Files

- Modify: `.claude/settings.local.json` (add hooks key alongside existing permissions)
- Read: `~/.claude/settings.json` (global, to understand merge behavior)
- Read: `.claude/settings.local.json` (existing permissions)

## Implementation Steps

### Step 1: Verify merge behavior (from Phase 0 findings)

Phase 0 documents whether project settings.json merges with or overrides global settings. Apply the correct strategy:

**If merge:** Create `.claude/settings.json` with only the coordination hook. Global hooks continue to work.

**If override:** Add coordination hook to existing `.claude/settings.local.json` (which already has permissions). This preserves both permissions and hooks.

### Step 2: Register hook

Based on Phase 0 merge behavior findings, add the coordination hook. Example (if adding to settings.local.json):

```json
{
  "permissions": { ... existing permissions ... },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/coordination/hooks/skill-coordination-gate.cjs"
          }
        ]
      }
    ]
  }
}
```

### Step 3: Verify registration

- Invoke a registered skill → should be blocked
- Invoke an unregistered skill → should pass through
- Verify global hooks still fire (privacy-block, scout-block, descriptive-name)
- Verify existing permissions still work (pnpm check, pnpm check:budget, etc.)

## Success Criteria

- [ ] Coordination hook registered in project settings
- [ ] Hook fires on Skill tool calls
- [ ] Hook does NOT fire on non-Skill tool calls
- [ ] Global hooks continue to work (verified)
- [ ] Existing permissions preserved (verified)

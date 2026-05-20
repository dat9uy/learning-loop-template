---
phase: 2
title: "Delete Model A & Fix Bash Gate"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Delete Model A & Fix Bash Gate

## Overview

Delete all profile-based components (skill gate, skill registry, coordination config, active-profile, bypass mechanism). **Critical prerequisite:** remove the bash gate's `readCoordinationConfig` guard BEFORE deleting the config file, so the bash gate never enters a fail-open state. Update `settings.json`. Delete `integration-test.sh`.

## Requirements

- Functional: Bash gate continues to enforce constraints after `coordination-config.json` is deleted.
- Functional: No skill invocation is blocked purely because of its name.
- Functional: No `.active-profile` or `.bypass-next` artifacts remain.
- Functional: `settings.json` remains valid JSON after hook removal.

## Architecture

### Deletion Order (Safety-Critical)

1. **Fix bash gate FIRST.** Remove `readCoordinationConfig` call and `!config.profiles` guard from `bash-coordination-gate.cjs`. The gate should proceed directly to constraint pattern matching.
2. **Then delete config file.** `coordination-config.json` can now be safely deleted because the bash gate no longer depends on it.
3. **Then delete other Model A files.**

This order eliminates the intermediate broken state between config deletion and gate fix.

### settings.json After Removal

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/coordination/hooks/inbound-state-gate.cjs"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/coordination/hooks/write-coordination-gate.cjs"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/coordination/hooks/bash-coordination-gate.cjs"
          }
        ]
      }
    ]
  }
}
```

## Related Code Files

- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs` — remove config guard
- Delete: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Delete: `.claude/coordination/skill-registry.json`
- Delete: `.claude/coordination/coordination-config.json`
- Delete: `.claude/coordination/.active-profile` (if exists)
- Delete: `.claude/coordination/.bypass-next` (if exists)
- Modify: `.claude/settings.json` — remove Skill matcher block
- Delete: `.claude/coordination/__tests__/skill-coordination-gate.test.cjs`
- Delete: `.claude/coordination/__tests__/coordination-config.test.cjs`
- Delete: `.claude/coordination/integration-test.sh`
- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` — KEEP `readCoordinationConfig`, `readActiveProfile`, `getProfile` until Phase 3 rewrites the write gate

## Implementation Steps

1. **Fix bash gate config dependency.**
   - Read `bash-coordination-gate.cjs`.
   - Delete lines 60-63 (the `readCoordinationConfig` call and `if (!config || !config.profiles)` guard).
   - The gate should proceed directly to `matchConstraintPattern(command)` at line 65.
   - Run `bash-coordination-gate.test.cjs` — update the "missing config → exit 0" test to reflect new behavior (now the gate proceeds to constraint matching).

2. **Delete skill-coordination-gate.cjs.**
   - `git rm .claude/coordination/hooks/skill-coordination-gate.cjs`

3. **Delete skill-registry.json.**
   - `git rm .claude/coordination/skill-registry.json`

4. **Delete coordination-config.json.**
   - `git rm .claude/coordination/coordination-config.json`

5. **Clean up artifacts.**
   - `rm -f .claude/coordination/.active-profile`
   - `rm -f .claude/coordination/.bypass-next`

6. **Update settings.json.**
   - Remove the `Skill` matcher block from `PreToolUse` hooks array.
   - Use the exact JSON structure shown in Architecture above.
   - Validate JSON immediately after edit:
     ```bash
     node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json'))"
     ```

7. **Delete obsolete tests and integration script.**
   - `git rm .claude/coordination/__tests__/skill-coordination-gate.test.cjs`
   - `git rm .claude/coordination/__tests__/coordination-config.test.cjs`
   - `git rm .claude/coordination/integration-test.sh`

8. **Leave gate-utils exports intact.**
   - Do NOT remove `readCoordinationConfig`, `readActiveProfile`, or `getProfile` from `gate-utils.cjs` yet.
   - The existing `write-coordination-gate.cjs` still imports them.
   - These exports will be removed in Phase 3 when the write gate is rewritten.

## Success Criteria

- [x] `bash-coordination-gate.cjs` has no `readCoordinationConfig` call and no `!config.profiles` guard.
- [x] `bash-coordination-gate.test.cjs` passes with updated expectations.
- [x] `skill-coordination-gate.cjs` does not exist.
- [x] `skill-registry.json` does not exist.
- [x] `coordination-config.json` does not exist.
- [x] `.active-profile` and `.bypass-next` do not exist.
- [x] `settings.json` is valid JSON.
- [x] `settings.json` has no `Skill` matcher in `PreToolUse`.
- [x] `skill-coordination-gate.test.cjs` and `coordination-config.test.cjs` do not exist.
- [x] `integration-test.sh` does not exist.
- [x] `gate-utils.cjs` still exports `readCoordinationConfig`, `readActiveProfile`, `getProfile`.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bash gate test fails after config guard removal | Low | High | Update test expectations in same commit as guard removal. |
| settings.json syntax error after removal | Low | Medium | Validate JSON with node command immediately after edit. |
| Intermediate broken state if steps run out of order | Medium | Critical | Follow the exact order in Implementation Steps. Do not skip step 1. |

## Next Steps

- Phase 3 rewrites the write gate to use domain rules and cleans up gate-utils exports.

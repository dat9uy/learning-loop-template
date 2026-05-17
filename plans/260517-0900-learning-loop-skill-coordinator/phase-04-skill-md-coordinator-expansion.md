---
phase: 4
title: "SKILL.md Coordinator Expansion"
status: completed
priority: P1
effort: "2h"
dependencies: [0, 1]
---

# Phase 4: SKILL.md Coordinator Expansion

## Overview

Expand `.claude/skills/learning-loop/SKILL.md` with a coordination workflow. When invoked as a coordinator (target skill specified), learning-loop reads the coordination config, checks state, builds a constraint prompt, and returns instructions for Claude to execute directly.

**Key design change from red team:** The coordinator does NOT programmatically invoke target skills (no `invokeSkill()` API exists). Instead, it builds a detailed constraint prompt and returns it. Claude executes the target skill's instructions directly, with the bypass file set so the hook allows the next invocation.

## Requirements

- Functional: new "When to Use" triggers for coordination mode
- Functional: coordination workflow that reads skill-registry.json + coordination-config.json
- Functional: pre-execution gate checks (budget, validation window)
- Functional: constraint prompt construction from profile
- Functional: bypass file creation before returning instructions
- Non-functional: existing workflow (prompt authoring) unchanged
- Non-functional: SKILL.md stays under 150 lines (detail in coordination-rules.md)

## Red Team Fixes Applied

| Finding | Fix |
|---------|-----|
| #3 Skills can't invoke other skills | Coordinator returns instructions; Claude executes directly. Uses bypass file (Phase 2). |
| #7 Post-execution steps undefined | Remove `post_execution` from v1 profiles. Document as future enhancement. |
| #8 coordinator-rules.md content vacuum | Include actual constraint prompt template, gate signal logic, and error handling in the reference file. |
| #4/6 SKILL.md line budget | Keep SKILL.md minimal (~150 lines). ALL coordination detail goes in `coordination-rules.md`. |

## Related Code Files

- Modify: `.claude/skills/learning-loop/SKILL.md`
- Create: `.claude/skills/learning-loop/references/coordination-rules.md`
- Read: `.claude/coordination/skill-registry.json`
- Read: `.claude/coordination/coordination-config.json`

## Implementation Steps

### Step 1: Add coordination triggers to SKILL.md

Add to "When to Use" section:
```markdown
Also use when:
- A skill call was blocked by the coordination hook (you are now the coordinator)
- Any external skill needs to interact with this repo's records, evidence, or state
```

### Step 2: Add coordination workflow to SKILL.md

New section after existing workflow. Keep minimal — all detail in coordination-rules.md:
```markdown
## Coordination Workflow

When invoked as coordinator (target skill specified):

1. Load `references/coordination-rules.md` for the full coordination protocol.
2. Read `.claude/coordination/skill-registry.json` → find target skill profile.
3. Read `.claude/coordination/coordination-config.json` → load profile rules.
4. Run pre-execution gates per profile (budget_check, validation_window).
5. Build constraint prompt per the template in coordination-rules.md.
6. Write `.claude/coordination/.bypass-next` (one-shot hook bypass).
7. Return the constraint prompt + instructions for Claude to invoke the target skill directly.
8. After target skill completes, run `pnpm check` to validate records.
```

### Step 3: Create coordination-rules.md with actual content

This is the critical reference file. Must contain:

**Profile resolution logic:**
```
Given target skill name:
1. Look up skill in skill-registry.json → get profile name
2. Look up profile in coordination-config.json → get rules
3. If skill has overrides in coordination-config.json, apply them (v2 feature, not in v1)
4. If skill not found → error: "Unknown skill: {name}"
5. If profile not found → error: "Unknown profile: {profile}"
```

**Constraint prompt template:**
```markdown
## Constraints for {target_skill}

You are being invoked under coordination. Follow these rules strictly:

### Write Allowlist (MAY write to):
{write_allowlist items as bullet list}

### Write Forbidlist (MUST NOT write to):
{write_forbidlist items as bullet list}

### Read Requirelist (MUST read first):
{read_requirelist items as bullet list}

### Gate Check Results:
{gate_check_results}

### Stop Conditions:
- If you need to write outside the allowlist, STOP and report.
- If validation window is active, STOP and report DEFERRED.
- If you encounter secrets or raw data, STOP and refuse.
```

**Gate signal handling:**
```
budget_check:
  - Run: pnpm check:budget -- --system {system} --resource {resource}
  - Exit 0 → proceed, embed remaining budget in prompt
  - Exit 1 → return BLOCKED signal (budget exhausted)
  - Exit 2 → return BLOCKED signal (error)

validation_window:
  - Check: read budget YAML, check validation_window.active field
  - If true → return DEFERRED signal
  - If false → proceed

staleness_check:
  - Check: budget YAML last_verified field
  - If >7 days old → return WARNING, ask operator to confirm
  - If fresh → proceed
```

**Error states and fallbacks:**
```
- Registry missing/malformed → hook allows (fail-open, git tracks changes)
- Config missing → coordinator invokes skill without constraints (graceful degradation)
- Budget check fails → BLOCKED, operator must resolve
- Target skill not installed → error message, do not invoke
- Post-execution pnpm check fails → halt, report failures, do not proceed
```

**Bypass mechanism:**
```
Before returning instructions to invoke the target skill:
1. Write empty file to .claude/coordination/.bypass-next
2. The hook checks for this file on next Skill tool call
3. If file exists → allow the call and delete the file
4. One-shot: only the NEXT invocation is bypassed
```

### Step 4: Remove post_execution from v1 profiles

Update coordination-config.json to remove `post_execution` from all profiles. Document as v2 enhancement. In v1, the coordinator manually runs `pnpm check` after the target skill completes (step 8 in SKILL.md workflow).

### Step 5: Verify SKILL.md line count

SKILL.md must stay under 150 lines. All coordination detail lives in coordination-rules.md.

## Success Criteria

- [ ] SKILL.md has coordination triggers in "When to Use"
- [ ] SKILL.md has coordination workflow section (minimal, references coordination-rules.md)
- [ ] coordination-rules.md has actual content (template, gate logic, error handling, bypass)
- [ ] Existing prompt-authoring workflow unchanged
- [ ] SKILL.md stays under 150 lines
- [ ] post_execution removed from v1 profiles
- [ ] Bypass mechanism documented

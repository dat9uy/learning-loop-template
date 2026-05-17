# Coordination Rules

Protocol for the learning-loop coordinator when invoked with a target skill.

## Profile Resolution

Given target skill name:

1. Look up skill in `.claude/coordination/skill-registry.json` → get profile name
2. Look up profile in `.claude/coordination/coordination-config.json` → get rules
3. If skill not found → error: "Unknown skill: {name}"
4. If profile not found → error: "Unknown profile: {profile}"

## Pre-Execution Gate Checks

Run these checks based on the profile's `gate_signals`:

### budget_check
```
Run: pnpm check:budget -- --system {system} --resource {resource}
Exit 0 → proceed, embed remaining budget in prompt
Exit 1 → return BLOCKED signal (budget exhausted)
Exit 2 → return BLOCKED signal (error)
```

### validation_window
```
Read budget YAML, check validation_window.active field
If true → return DEFERRED signal
If false → proceed
```

### staleness_check
```
Check budget YAML last_verified field
If >7 days old → return WARNING, ask operator to confirm
If fresh → proceed
```

## Constraint Prompt Template

Build this prompt and return it to Claude:

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

## Bypass Mechanism

Before returning instructions to invoke the target skill:

1. Write empty file to `.claude/coordination/.bypass-next`
2. The hook checks for this file on next Skill tool call
3. If file exists → allow the call and delete the file
4. One-shot: only the NEXT invocation is bypassed

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Registry missing/malformed | hook allows (fail-open, git tracks changes) |
| Config missing | coordinator invokes skill without constraints (graceful degradation) |
| Budget check fails | BLOCKED, operator must resolve |
| Target skill not installed | error message, do not invoke |
| Post-execution pnpm check fails | halt, report failures, do not proceed |

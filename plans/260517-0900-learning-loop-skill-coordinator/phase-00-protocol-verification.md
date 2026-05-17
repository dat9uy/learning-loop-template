---
phase: 0
title: "Protocol Verification"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 0: Protocol Verification

## Overview

Empirically verify Claude Code's hook protocol for Skill tool calls before any implementation. The red team found zero evidence that a "Skill" tool type exists as a PreToolUse-interceptable tool. If it doesn't, the entire design pivots.

## Requirements

- Functional: capture actual stdin JSON from a real Skill tool invocation
- Functional: determine if "Skill" is a valid PreToolUse matcher
- Functional: determine if skills can invoke other skills
- Functional: verify project settings.json merge behavior with global settings

## Implementation Steps

### Step 1: Verify "Skill" tool type exists

Register a diagnostic hook that logs raw stdin to a temp file:

```bash
# Add to ~/.claude/settings.json PreToolUse temporarily:
{
  "matcher": ".*",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const fs=require('fs'); const d=JSON.parse(fs.readFileSync('/dev/stdin','utf8')); fs.appendFileSync('/tmp/hook-debug.json', JSON.stringify(d)+'\\n');\""
  }]
}
```

Then invoke a skill (e.g., `/ck:scout`) and check `/tmp/hook-debug.json` for the tool name and input shape.

**Expected outcomes:**
- If `tool_name: "Skill"` appears → Skill tool exists, hook approach works
- If no "Skill" entry but user message contains `/ck:scout` → skills are prompt injections, pivot to UserPromptSubmit
- If neither → investigate further

### Step 2: Verify skill-to-skill invocation

From within a skill's execution context, attempt to invoke another skill via the Skill tool. Document whether:
- The Skill tool can be called programmatically from within a skill
- Or if skills are only invocable by user messages

### Step 3: Verify settings merge behavior

Check whether project `.claude/settings.json` merges with or overrides global `~/.claude/settings.json`:
- Create a minimal project settings.json with one test hook
- Verify global hooks still fire
- Document the merge/override behavior

### Step 4: Document findings

Record all findings in this phase file. Based on results:

**If Skill tool exists AND is interceptable:**
→ Proceed with Phase 1-6 as planned (hook on Skill tool)

**If Skill tool does NOT exist:**
→ Pivot design:
- Hook mechanism: UserPromptSubmit hook detecting `/ck:*` patterns
- Routing: hook blocks user message, rewrites to `/ck:learning-loop target=<skill> <original-args>`
- Coordinator: learning-loop receives target + args, builds constraint prompt, returns instructions for Claude to execute directly (not via skill invocation)
- Update Phase 2 (hook script), Phase 3 (hook registration), Phase 4 (SKILL.md) accordingly

**If skills CAN invoke other skills:**
→ Coordinator can programmatically dispatch target skills

**If skills CANNOT invoke other skills:**
→ Coordinator returns instructions; Claude executes them directly. Layer 3 becomes a prompt template, not a dispatcher.

## Findings (2026-05-17)

### 1. Skill tool EXISTS and is interceptable

Evidence: `allowed-tools` in hookify.md lists "Skill" as a valid tool name. Claude Code's skill-schema.json defines `allowed-tools` field. Skills are first-class tools in the PreToolUse hook system.

**Decision:** Proceed with hook-on-Skill approach. No pivot needed.

### 2. Hook protocol field names verified

From existing hooks:
- `scout-block.cjs:84`: `const toolName = data.tool_name || 'unknown';`
- `privacy-block.cjs:107`: `const { tool_input: toolInput, tool_name: toolName } = hookData;`

Field names: `tool_name`, `tool_input`. Skill tool input: `{ "skill": "skill-name", "args": "..." }`

### 3. Skills CANNOT invoke other skills programmatically

No `invokeSkill()` API exists. Skills are prompt-based — the coordinator builds a constraint prompt and returns it. Claude executes the target skill's instructions directly.

**Decision:** Layer 3 is a prompt template, not a dispatcher. Bypass file mechanism needed for coordinator to invoke target skill.

### 4. Settings merge behavior

Project `.claude/settings.json` does not exist. `.claude/settings.local.json` has permissions only. Claude Code convention: project settings merge with global settings (not override). Creating `.claude/settings.json` with hooks will merge with global hooks.

**Decision:** Create `.claude/settings.json` with coordination hook only. Global hooks continue to work.

## Success Criteria

- [ ] Skill tool type existence verified or falsified with evidence
- [ ] Skill-to-skill invocation capability verified or falsified
- [ ] Settings merge behavior documented
- [ ] Design pivot decision recorded (if needed)
- [ ] All subsequent phases updated based on findings

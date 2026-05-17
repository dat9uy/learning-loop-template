# Research Report: Inbound Gate Platform-Level Options

## Executive Summary

The brainstorm report assumed no platform hook for operator messages exists. **This is wrong.** Claude Code's `UserPromptSubmit` hook fires before the agent processes any submitted prompt. It can block the prompt (exit code 2), inject context (`hookSpecificOutput.additionalContext`), or validate input. This is exactly the "inbound gate" layer the brainstorm identified as missing.

MCP cannot intercept messages (protocol is client-to-server request/response). The hook system is the correct layer.

## Key Findings

### 1. Claude Code Has 29 Hook Events

Per-session: `SessionStart`, `SessionEnd`
Per-turn: `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`, `PostToolBatch`
Per-tool-call: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`
Standalone/async: `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`, `Notification`, `Setup`

### 2. `UserPromptSubmit` Is the Inbound Gate

- Fires **before** Claude processes a submitted prompt
- Receives the raw prompt string
- Can **block** the prompt (exit code 2 or JSON `decision: "block"`)
- Can **inject context** via `hookSpecificOutput.additionalContext`
- Can validate input and reject with a reason

This project already uses `UserPromptSubmit` for `simplify-gate.cjs` — the pattern is proven.

### 3. MCP Cannot Intercept Messages

- MCP protocol is client-to-server request/response
- No server-initiated message interception
- Notifications are post-hoc status updates, not pre-processing
- MCP's `resources/subscribe` is pull-then-notify for data changes

### 4. Hook Lifecycle

Three cadences:
- **Once per session** (SessionStart/End)
- **Once per turn** (UserPromptSubmit, Stop, PostToolBatch)
- **Every tool call** (PreToolUse → tool exec → PostToolUse)

Exit codes: 0 = success, 2 = blocking error (stderr fed to Claude), other = non-blocking error.

### 5. Context Injection

Return `hookSpecificOutput.additionalContext` from any event. Placement in Claude's context depends on the event. For `UserPromptSubmit`, this appears alongside the prompt — exactly where we need it.

## Implications for the Inbound Gate

The brainstorm report's "missing platform feature" section is **incorrect**. The feature exists. The correct action is:

1. Build an `inbound-state-gate.cjs` hook on `UserPromptSubmit`
2. Scan operator messages for state-change signals
3. Check if active observations are stale relative to the message
4. If stale: inject context reminding the agent to update observations, or block until it does
5. Register it in `settings.json` alongside the existing `PreToolUse` hooks

## Sources

| Source | Location | Credibility |
|--------|----------|-------------|
| Official docs | code.claude.com/docs/en/hooks | Authoritative |
| Codex parity tracker | openai/codex#21753 | High |
| Rulesync sync issue | dyoshikawa/rulesync#1628 | High |
| Existing usage | `.claude/settings.json` (simplify-gate.cjs) | Confirmed |

## Hook Format (Verified)

From `~/.claude/hooks/simplify-gate.cjs`:

**Input** (JSON on stdin):
```json
{ "prompt": "...", "user_prompt": "...", "cwd": "/path/to/project" }
```

**Soft warning** (inject context, exit 0):
```json
{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "message" } }
```

**Hard block** (reject prompt, exit 2):
```json
{ "continue": false, "decision": "block", "reason": "message" }
```

**Pass-through**: exit 0 with no output.

## Unresolved Questions

- Does `additionalContext` from `UserPromptSubmit` appear before or after the prompt in Claude's context?
- Should the inbound gate block (exit 2) or inject context (exit 0 with additionalContext)?
- How to detect "state-change signals" in operator messages reliably without false positives?

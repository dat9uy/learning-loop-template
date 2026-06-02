---
date: "2026-06-02T07:55:00Z"
status: research
tags: [research, droid, hooks, lifecycle, session-start, factory]
related:
  - plans/reports/brainstorm-260602-strict-mcp-call-rules.md
  - plans/260602-self-enforcing-loop/plan.md
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
  - ~/.factory/settings.json
  - ~/.factory/hooks/
---

# Research: Droid `SessionStart` Hook Lifecycle Support

> **Status: research.** Answers Open Question 1 from `brainstorm-260602-strict-mcp-call-rules.md`. The fall-back to `UserPromptSubmit` is no longer needed; `SessionStart` is the canonical event.

## Question

Does Droid expose a `session-start` hook event (one-shot, fires at session start, output added to context), or should the loop-surface-injection design rely on `UserPromptSubmit` with a session-start marker file (as a fallback)?

## Answer (TL;DR)

**`SessionStart` is a fully supported, first-class Droid hook event.** Output is added to the context. The fallback to `UserPromptSubmit` is unnecessary. Recommend `SessionStart` with matcher `startup` (optionally also `resume`/`clear`/`compact`).

## Evidence

### 1. Official Hooks Reference (Factory docs)

`https://docs.factory.ai/reference/hooks-reference.md` — the canonical reference lists `SessionStart` as a first-class event alongside `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionEnd`, `Notification`.

`SessionStart` description (verbatim):
> "Runs when Droid starts a new session or resumes an existing session (which currently does start a new session under the hood). Useful for loading in development context like existing issues or recent changes to your codebase, installing dependencies, or setting up environment variables."

**Matchers:**
- `startup` — Invoked from startup
- `resume` — Invoked from `--resume`, `--continue`, or `/resume`
- `clear` — Invoked from `/clear`
- `compact` — Invoked from auto or manual compact

**Input schema:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.factory/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "off",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

**Output semantics** (from `## Hook Output > Simple: Exit Code`):
> "Exit code 0: Success. `stdout` is shown to the user in transcript mode (CTRL-R), **except for `UserPromptSubmit` and `SessionStart`, where stdout is added to the context.**"

**JSON output semantics** (from `## Hook Output > SessionStart Decision Control`):
> "`SessionStart` hooks allow you to load in context at the start of a session. `hookSpecificOutput.additionalContext` adds the string to the context. **Multiple hooks' `additionalContext` values are concatenated.**"

**Execution details** (from `## Hook Execution Details`):
- Timeout: 60s default, configurable per command
- Parallelization: all matching hooks run in parallel
- Environment: `$FACTORY_PROJECT_DIR` available (project root absolute path)

### 2. Session Automation Cookbook (Factory docs)

`https://docs.factory.ai/guides/hooks/session-automation.md` — the official cookbook for "automate session setup with context loading, environment configuration, and dependency management." Recommends `SessionStart` for:

> "1. **Run at session start**: Triggered when starting new sessions or resuming
> 2. **Load context**: Add relevant project information to the conversation
> 3. **Setup environment**: Configure paths, environment variables, tools
> 4. **Check dependencies**: Verify required tools and packages are available
> 5. **Persist state**: Set environment variables for the entire session"

This is exactly our use case. The cookbook's first example ("Load project context") is structurally identical to the proposed loop-surface-injection hook: read project state at startup, inject a context block.

### 3. Configuration Files

The Factory docs describe three locations, in priority order:
- `~/.factory/hooks.json` — user (applies to all projects)
- `.factory/hooks.json` — project (commit to share)
- Enterprise managed policy hooks

Or: `hooks` key in the matching `settings.json` (current behavior). Fallback if `hooks.json` is absent.

**Current state in this environment:**
- `~/.factory/settings.json` has the `hooks` key with `UserPromptSubmit`, `PreToolUse`, `TaskCompleted`. No `SessionStart`.
- `/home/datguy/codingProjects/learning-loop-template/.factory/hooks/` exists (legacy `.cjs` scripts) but no `.factory/hooks.json` at the project root.
- No `SessionStart` hook currently configured at any level.

This is consistent: the user has not yet adopted `SessionStart`. The project has not adopted project-level `hooks.json`. The new design will be the first `SessionStart` hook in this environment.

### 4. Cross-Reference with Existing Codebase

The learning-loop-mcp server has a `lib/session-state-manager.cjs` (in `~/.factory/hooks/lib/`, not the project). Its purpose is "Persist/restore session progress across sessions" — but it operates at the hook-orchestration level, not as a `SessionStart` hook itself. State is stored in `~/.claude/session-states/{hash}/latest.md` with 7-day auto-expire. This means the project already has session-state infrastructure but does not use it to inject context at session start.

No existing `SessionStart` consumer in the project. No `SessionStart` blocker. Greenfield.

## Comparison: `SessionStart` vs `UserPromptSubmit` Fallback

| Property | `SessionStart` (canonical) | `UserPromptSubmit` (fallback) |
|---|---|---|
| Fires once per session? | Yes (only at startup/resume/clear/compact) | No — fires on every user prompt |
| Output to context? | Yes (`stdout` injected) | Yes (`stdout` injected) |
| Caching needed? | No — fires once | Yes — need marker file (`.factory/.session-start-fired`) to avoid re-injecting on every prompt |
| Distinguishes startup/resume? | Yes (`source` field) | No |
| Resilience to `/clear`? | Yes — re-fires on `clear` matcher | No — marker file may persist across clear |
| Cost | 1 invocation per session | 1 invocation per user prompt (filtered by marker) |
| Matchers | startup / resume / clear / compact | (no matchers) |
| Documented for context-loading? | Yes (canonical, recommended) | No (works as a side effect) |

**Verdict:** `SessionStart` is strictly better for this use case. The fallback to `UserPromptSubmit` is a worse choice but still functionally correct if `SessionStart` is unavailable in a future Droid version.

## Hook Wiring Design

Per the new (and current) Factory convention, project-level hooks live in `.factory/hooks.json` at the project root. Current project does not have this file. Two options:

| Option | Where the `SessionStart` entry lives | Trade-off |
|---|---|---|
| **Project-level** (Recommended) | New `/home/datguy/codingProjects/learning-loop-template/.factory/hooks.json` | Project-scoped, commits to the repo, applies only when working in this project. Matches the brainstorming intent (only inject in learning-loop-mcp projects). |
| User-level | Add `SessionStart` to `~/.factory/settings.json` `hooks` key | Applies to all projects. Generic; no project-scoped gating needed. The hook script itself must still check for `.mcp.json` + `learning-loop-mcp` to be silent in plain projects. |

**Recommendation:** Project-level. Aligns with the brainstorm's "only inject when project has `.mcp.json` + `learning-loop-mcp`" design. The hook file can be committed and shared with the project.

**File shape** (project-level):
```json
{
  "SessionStart": [
    {
      "matcher": "startup",
      "hooks": [
        {
          "type": "command",
          "command": "\"$FACTORY_PROJECT_DIR\"/.factory/hooks/loop-surface-inject.cjs",
          "timeout": 10
        }
      ]
    }
  ]
}
```

**Script shape** (`loop-surface-inject.cjs`, ~30-50 lines):
```js
#!/usr/bin/env node
// Read ./.mcp.json. If absent or no learning-loop-mcp key, exit 0 silently.
// Otherwise, spawn the MCP server (per .mcp.json config) and call loop_describe({tier:"summary"}).
// Format result as a 1KB block. Print to stdout (Droid adds to context).

const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
if (input.source !== 'startup') process.exit(0);
const cwd = input.cwd;
const mcpCfg = require('path').join(cwd, '.mcp.json');
if (!require('fs').existsSync(mcpCfg)) process.exit(0);
const cfg = JSON.parse(require('fs').readFileSync(mcpCfg, 'utf-8'));
if (!cfg.mcpServers?.['learning-loop-mcp']) process.exit(0);

// Spawn MCP server, send JSON-RPC initialize + tools/call(loop_describe), parse response.
// Print formatted block to stdout.
```

## Risks and Mitigations

### Risk: latency on session start

Spawning the MCP server + calling `loop_describe` adds ~200-500ms to session start. The Factory session-automation cookbook explicitly addresses this in its "Troubleshooting" section:
> "Run expensive operations asynchronously: # Start background job for slow operations ... # Return immediately with basic context"

Mitigation: spawn the MCP server in the background; return a static "loop surface pending" block immediately. The injected block can also be a stale snapshot (last seen in this session) for the first turn. Acceptable degradation.

### Risk: `FACTORY_PROJECT_DIR` not set in the hook env

Per Factory docs, `$FACTORY_PROJECT_DIR` is set "only when Droid spawns the hook command." If absent (e.g., manual testing), fall back to `process.cwd()`. Cheap defense in the script.

### Risk: `SessionStart` not supported in older Droid versions

Factory docs current as of writing. For backward compat, the script can detect missing `SessionStart` support by checking the input `hook_event_name` (would be `UserPromptSubmit` if running on an older surface). If `UserPromptSubmit`, the script still injects the block — same effect.

### Risk: multiple `SessionStart` hooks interfere

Per the JSON-output spec, multiple hooks' `additionalContext` values are concatenated. No interference risk. Each hook just appends to context.

## Open Questions Resolved

The brainstorming report (`brainstorm-260602-strict-mcp-call-rules.md`) had three open questions. This research resolves #1:

| # | Question | Status |
|---|---|---|
| 1 | Droid lifecycle support | **RESOLVED** — `SessionStart` is supported. Use `matcher: "startup"`. Fallback to `UserPromptSubmit` no longer needed (still valid as defense-in-depth). |
| 2 | Cache invalidation budget | Unresolved — needs decision in plan phase. |
| 3 | Rule naming | Unresolved — operator preference. |

## Recommended Next Step

Update `plans/reports/brainstorm-260602-strict-mcp-call-rules.md` Open Question 1 to:
- Mark as resolved with this research as evidence
- Replace the `inbound-gate with marker file` fallback with the canonical `SessionStart` hook approach
- Note the project-level `.factory/hooks.json` location (not user-level `settings.json`)
- Keep the `UserPromptSubmit` defense-in-depth note in the Risks section

If approved, the next step is `/ck:plan --tdd` for `plans/2606XX-strict-mcp-call-rules/` with 2 phases:
1. **Phase 1: gate-scope-predicate** — new meta-state rule with opt-in `scope_predicate` field; loadPromotedRules extension; tests.
2. **Phase 2: session-start hook** — new `.factory/hooks/loop-surface-inject.cjs` + new `.factory/hooks.json` (project-level); test in mock Droid environment.

## References

- Factory Hooks Reference: https://docs.factory.ai/reference/hooks-reference.md
- Factory Session Automation Cookbook: https://docs.factory.ai/guides/hooks/session-automation.md
- Factory Hooks Guide: https://docs.factory.ai/cli/configuration/hooks-guide.md
- Factory MCP docs: https://docs.factory.ai/cli/configuration/mcp.md
- Current user-level config: `~/.factory/settings.json`
- Current project-level scripts: `~/.factory/hooks/` (legacy, scripts only — no `hooks.json`)
- Brainstorm report: `plans/reports/brainstorm-260602-strict-mcp-call-rules.md`
- Self-enforcing-loop plan: `plans/260602-self-enforcing-loop/plan.md`
- `loop_describe` tool: `tools/learning-loop-mcp/tools/loop-describe-tool.js`

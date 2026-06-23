---
phase: 1
title: "Research"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Research

## Overview

Research the actual Claude Code programmatic task-update interface. Plan 1a's `mastra_task_update` wrapper shells out to `claude task update --id X --status Y`, which fails with `error: unknown option '--id'` because the Claude Code CLI has no `task update` subcommand. Phase 1 enumerates the real interfaces and decides which of three fix paths Phase 2 will execute.

**Gates Phase 2:** no critical-fix work begins until Phase 1 returns a decision.

## Requirements

- Functional: identify whether a working Claude Code programmatic task-update interface exists (CLI subcommand, SDK method, JSON-RPC call, env-var side effect, or none).
- Non-functional: research must be reproducible (cite doc URL + version + verification command).
- Decision: pick one of three paths (see "Implementation Steps").

## Architecture

The wrapper (`tools/learning-loop-mcp/tools/task-update.js:33-35`) currently invokes:

```js
const args = ["task", "update", "--id", taskId, "--status", status];
await execFileAsync("claude", args);
```

This fails because `claude task` opens an interactive session, not a flag-based update. Phase 1 enumerates alternatives.

## Related Code Files

- Read: `tools/learning-loop-mcp/tools/task-update.js` (broken wrapper under review)
- Read: `tools/learning-loop-mastra/__tests__/task-update.test.js` (mocks CLI; test doesn't catch real failure)
- Read: `docs/journals/260622-phase-d-plan-1a-shipped.md` (Plan 1a's decision rationale for the wrapper)

## Implementation Steps

1. **Inventory Claude Code CLI subcommands.** Run `claude --help` + `claude <subcommand> --help` for each candidate subcommand. Document which accept task-update-style flags.

2. **Search the Claude Code docs for programmatic task-update interfaces.** Look for: SDK methods, JSON-RPC endpoints, environment variables, plugin APIs, MCP server task tools. Cite doc URL + version.

3. **Check `~/.claude/coordination/hooks/` for any existing task-update path.** The session-start hook and other hooks may already invoke task updates through a working interface.

4. **Survey agent SDKs.** Check `@anthropic-ai/claude-agent-sdk` and similar packages for `TaskUpdate`-style methods that return `{changed: bool}`.

5. **Decide fix path.** Choose ONE:

   - **Path A — Working interface exists.** Document the interface (CLI subcommand + flags, or SDK method + signature). Phase 2 implements the wrapper against this interface.
   - **Path B — No working interface, defer to upstream.** Phase 2 reverts the `meta_state_resolve` for `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n`, removes the wrapper from the manifest, and marks the finding as `active` (operator-acked; deferred to upstream Claude Code release).
   - **Path C — Workaround: track via local cache + always return `changed: true`.** Phase 2 keeps the wrapper but stops shelling out to `claude`; instead, it writes the cache directly and returns `{changed: true, current: status}` regardless. Tradeoff: this lies to the agent about whether the underlying TaskUpdate fired. **Discouraged unless A and B both fail.**

6. **Record the decision in this phase file's "Decision" section below.**

## Decision

**Path chosen:** **B** (delete wrapper; revert resolution; file new active finding)

**Evidence:**
- **Source 1:** `claude --help` output (verified 2026-06-22 23:38 UTC) shows available subcommands: `agents`, `doctor`, `install`, `mcp`, `setup-token`, `update|upgrade`. No `task` subcommand. The `claude task --help` invocation prints the same main usage text — confirming `claude task` is not a subcommand.
- **Source 2:** `claude mcp list` shows connected servers: `ccs-image-analysis`, `ccs-websearch`, `learning-loop-mastra`. The `learning-loop-mastra` server is the wrapper's host. No MCP server exposes a TaskUpdate tool that returns `{changed: bool}`. The native TaskUpdate is a built-in Claude Code tool, not an MCP-discoverable tool.
- **Source 3:** `~/.claude/tasks/<session-id>/<task-id>.json` shows the internal task storage format. The JSON has fields `id, subject, description, activeForm, status, blocks, blockedBy`. There is no public API to read or write these files from outside Claude Code; the only entry point is the built-in TaskUpdate tool, which returns "Updated task #N" regardless of actual change (per the existing `meta-260622T1439Z-...` finding).
- **Source 4:** `package.json` does not list `@anthropic-ai/claude-agent-sdk` or any other Claude Code programmatic SDK. `ls node_modules/@anthropic-ai/` returns empty.
- **Source 5:** No `claude` subcommand accepts `--id` as a flag in non-interactive mode (verified by reading the full `--help` text). The wrapper's `claude task update --id X --status Y` invocation is rejected at the CLI level.
- **Source 6:** `~/.claude/coordination/hooks/` and `~/.claude/hooks/` contain hooks for SessionStart, PreToolUse, etc. but no hook receives task-update events that could be wrapped for the no-op signal.

**Conclusion:** No working interface found. The wrapper is irrecoverable without an upstream Claude Code change.

**Implementation contract for Phase 2 (Path B):**
- Delete `tools/learning-loop-mcp/tools/task-update.js`
- Delete `tools/learning-loop-mastra/__tests__/task-update.test.js`
- Remove manifest entry from `tools/learning-loop-mastra/tools/manifest.json` line 33
- Update `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160-166`: `mastra.length` 32→31, `tools.length` 42→41
- Update `tools/learning-loop-mastra/server.js:151-152` description: "41 tools" → "31 tools" (per Red Team Finding 9, NOT deferred to Phase 5)
- File NEW active finding `meta-260623T????Z-claude-code-task-update-interface-still-missing` via `meta_state_report` (the original `meta-260622T1439Z-...` stays resolved; `meta_state_patch` cannot reopen because of immutable-field deny-list — per Red Team Finding 3)
- Log a `meta_state_log_change` for the wrapper removal (during Phase 6)

## Success Criteria

- [x] Phase 1.1 — CLI subcommand inventory completed; no `task` subcommand found
- [x] Phase 1.2 — Doc search completed; no programmatic task-update interface documented
- [x] Phase 1.3 — Hook scan completed; no task-update path discovered in `~/.claude/hooks/` or `~/.claude/coordination/hooks/`
- [x] Phase 1.4 — SDK survey completed; no `@anthropic-ai/claude-agent-sdk` installed; no public API for native TaskUpdate
- [x] Phase 1.5 — Decision recorded: **Path B** (delete wrapper + file new active finding)
- [x] Phase 1.6 — No code changes in this phase (verify-only)

## Risk Assessment

- **Research returns no working interface (Path B required).** Risk: medium. The plan's journal §"Decisions" entry #8 implied the wrapper was viable; reverting means Plan 3 agents don't get a TaskUpdate idempotency primitive. Mitigation: the finding resolution reversal is one `meta_state_resolve` call; the wrapper's manifest entry is one line removal; both are reversible.
- **Research discovers a partial interface (e.g., CLI flag with caveats).** Risk: low. Phase 2 implements against the documented interface; if caveats surface during testing, fall back to Path C or B.
- **Research reveals the upstream Claude Code fix has shipped.** Risk: low. If `TaskUpdate` natively returns `{changed: bool}`, Phase 2 may simplify to a passthrough wrapper that calls the native tool via MCP.

# Mastra Code — Runtime Integration Guide

Mastra Code is the third validated runtime alongside Claude Code and Droid CLI. It integrates with the learning loop via **MCP-only** integration (programmatic `createMastraCode({ tools })` is a separate, follow-up plan). This doc covers configuration, hook integration, identity, tool namespacing, smoke testing, and troubleshooting.

## Overview

- **Package:** `mastracode` (npm)
- **Config dir:** `.mastracode/` at project root
- **API:** `createMastraCode({ cwd })` → `{ session, controller, mcpManager, hookManager, ... }` (alias for `bootLocalAgentController` since 0.26.0)
- **Integration model:** MCP-only — tools come from `.mastracode/mcp.json`, not from `extraTools`

## Configuration

### `.mastracode/mcp.json` — MCP Server Registration

```json
{
  "mcpServers": {
    "learning-loop": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/mastra/server.js"]
    }
  }
}
```

Satisfies contract Req #2 (`mcp-client-config`). Discovery priority (highest first):
1. `.claude/settings.local.json` (Claude Code compat)
2. `~/.mastracode/mcp.json` (global)
3. `<root>/.mastracode/mcp.json` (project root)
4. `<project>/.mastracode/mcp.json` (project-local)

### `.mastracode/hooks.json` — Declarative Lifecycle Hooks

```json
{
  "PreToolUse": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js",
      "matcher": { "tool_name": "execute_command" },
      "timeout": 5000,
      "description": "Learning-loop bash coordination gate"
    },
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js",
      "matcher": { "tool_name": "write_file" },
      "timeout": 5000,
      "description": "Learning-loop write coordination gate"
    },
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js",
      "matcher": { "tool_name": "string_replace_lsp" },
      "timeout": 5000,
      "description": "Learning-loop write coordination gate"
    },
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js",
      "matcher": { "tool_name": "delete_file" },
      "timeout": 5000,
      "description": "Learning-loop write coordination gate"
    }
  ],
  "UserPromptSubmit": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js",
      "timeout": 5000,
      "description": "Learning-loop inbound state gate"
    }
  ],
  "SessionStart": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js",
      "timeout": 10000,
      "description": "Learning-loop gate-log recurrence check"
    }
  ]
}
```

Satisfies Req #5 (`settings-integration`) and Req #6 (`hook-declarative-config`).

**Mastra Code's built-in tool names** (discovered live via probe):
| Tool | Purpose |
|---|---|
| `execute_command` | Run shell commands |
| `write_file` | Create/write files |
| `string_replace_lsp` | Edit files (string replacement) |
| `delete_file` | Delete files |
| `view` | Read files |
| `find_files` | Find files by glob |

### `.mastracode/settings.json` — Runtime Settings

```json
{
  "shellPassthrough": false,
  "omScope": "project"
}
```

`shellPassthrough: false` is REQUIRED (Req #7 — `settings-no-bypass`). Setting it to `true` bypasses the bash-gate hook entirely.

### `.mastracode/database.json` — Runtime Identity

```json
{
  "resourceId": "mastra-code"
}
```

Alternative to `process.env.MASTRA_RESOURCE_ID="mastra-code"`.

## Hook Integration

Mastra Code uses **declarative JSON** hooks (`.mastracode/hooks.json`), NOT shim files. This is the biggest departure from Claude Code/Droid CLI (which use per-runtime shim files in `<surface>/coordination/hooks/`).

| Event | Hook Script | Matcher |
|---|---|---|
| PreToolUse | `bash-gate.js` | `tool_name: "execute_command"` |
| PreToolUse | `write-gate.js` | `tool_name: "write_file"`, `"string_replace_lsp"`, `"delete_file"` |
| UserPromptSubmit | `inbound-gate.js` | (none) |
| SessionStart | `recurrence-check-on-start.js` | (none) |

All hook scripts are in `tools/learning-loop-mastra/hooks/legacy/`. Each is a thin wrapper delegating to the universal hook.

## Identity Marker

The runtime SHOULD set its identity via one of:
- `process.env.MASTRA_RESOURCE_ID="mastra-code"` (additive alternative for Mastra Code)
- `.mastracode/database.json` with `{ "resourceId": "mastra-code" }`
- `process.env.RUNTIME_ID="mastra-code"` (canonical, for any runtime)

The validator accepts `MASTRA_RESOURCE_ID` OR `RUNTIME_ID`; first match wins. Both unset → advisory note only (not a hard failure). `MASTRA_RESOURCE_ID` is spoofable until LIM-3 caller-identity ships (Plan 5 deferral D5).

## Tool Namespacing

MCP tools from the loop's server are auto-namespaced as `<serverName>_<toolName>` per Mastra Code's McpManager. Three observed patterns (verified live at `mastracode@0.26.0`):

| Pattern | Example | Count |
|---|---|---|
| `learning-loop_mastra_<tool>` | `learning-loop_mastra_loop_describe` | 30 |
| `learning-loop_ask_<agent>` | `learning-loop_ask_intake_agent` | 3 |
| `learning-loop_run_workflow_<workflow>` | `learning-loop_run_workflow_intake_orient` | 11 |

**Total:** 44 tools exposed via MCP.

## Smoke Test

```bash
pnpm smoke:mastracode
```

Exits 0; stdout JSON contains:
- `ok: true`, `status: "live"`
- `mcp_servers[0].connected === true` (learning-loop server, stdio transport)
- `mcp_tool_names.length === 44`
- `roundtrip.ok === true` (tool `learning-loop_mastra_loop_describe` invoked successfully)
- `wire_format_probe.exit_code === 0` (universal bash-gate parses Mastra-Code-shaped payload)

## Contract Validation

```bash
node tools/learning-loop-mastra/interface/contract.js mastra-code
```

Expected: `{ok: true, missing: [], notes: [...]}` — all 7 requirements pass.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mcp-client-config` fails | `.mastracode/mcp.json` missing or wrong `args` path | Ensure `args` ends with `tools/learning-loop-mastra/mastra/server.js` |
| `hook-declarative-config` fails | `hooks.json` malformed or missing event entries | Validate JSON; ensure `PreToolUse`, `UserPromptSubmit`, `SessionStart` all present |
| `settings-no-bypass` fails | `shellPassthrough: true` in `.mastracode/settings.json` | Set to `false` |
| `skill-spec` fails | `SKILL.md` not found in `.claude/skills/` or `.mastracode/skills/` | Copy `.factory/skills/learning-loop/SKILL.md` to `.claude/skills/learning-loop/` |
| Tools not loading | MCP server not starting | Run `node tools/learning-loop-mastra/mastra/server.js` directly to check for errors |
| LibSQL lock conflict | Both Mastra Code and loop write to same DB | Configure `.mastracode/database.json` with sibling path |
| `identity-marker-not-adopted` in notes | `MASTRA_RESOURCE_ID` / `RUNTIME_ID` not set | Advisory only; set via `.mastracode/database.json` or env var |

## Cross-references

- `interface/CONTRACT.md` — formal 7-requirement spec
- `interface/RUNTIME_ONBOARDING.md` — worked example for Mastra Code
- `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` — API research
- `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` — Harness framework
- `scripts/probe-mastracode.cjs` — read-only probe + smoke test

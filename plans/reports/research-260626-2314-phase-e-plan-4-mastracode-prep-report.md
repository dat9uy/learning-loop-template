# Research Report: Mastra Code Runtime Integration (Phase E Plan 4 Prep)

## Executive Summary

The `/mastra` skill does NOT cover Mastra Code. The actual Mastra Code docs (`https://code.mastra.ai/llms.txt` + subpages) and the Harness framework docs (`https://mastra.ai/docs/harness/overview`) were fetched directly. **The previous Phase E scope report contained 4 inaccuracies** that affect Plan 4 design:

1. **`createMastraCode` does NOT take `configDir`** — actual signature uses `cwd` (no `configDir` parameter exists).
2. **MCP server config goes in `.mastracode/mcp.json`**, not via `createMastraCode({configDir})` API.
3. **Hooks are declarative JSON in `.mastracode/hooks.json`**, NOT `.mastracode/coordination/hooks/*.cjs` shim files (like Claude Code). The 5-req contract's Requirement #1 needs amendment.
4. **No `RUNTIME_ID` env var** — closest equivalents are `MASTRA_RESOURCE_ID` env var or `resourceId` field in `.mastracode/database.json`.

Mastra Code is the "flagship Harness implementation" (terminal-based coding agent). Plan 4 should adapt the interface contract for Mastra Code's declarative model rather than copy Claude Code's shim pattern.

## Research Methodology

- Sources consulted: 5 (Mastra Code index + 4 subpages + Harness overview)
- Date range: 2026-06-26 (live docs)
- Key URLs:
  - `https://code.mastra.ai/llms.txt` (Mastra Code index)
  - `https://code.mastra.ai/reference.md` (API reference)
  - `https://code.mastra.ai/configuration.md` (settings, MCP, skills, hooks)
  - `https://code.mastra.ai/customization.md` (modes, extra tools, subagents)
  - `https://mastra.ai/docs/harness/overview` (Harness framework)

## Key Findings

### 1. `createMastraCode` — actual API signature

```typescript
import { createMastraCode } from 'mastracode'

const {
  harness,        // Harness — main orchestrator
  mcpManager,     // MCPManager — manages MCP server connections
  hookManager,    // HookManager — manages lifecycle hooks
  authStorage,    // AuthStorage — OAuth credentials
  resolveModel,   // function
  storageWarning, // string | null
  builtinPacks,   // ModePack[]
  builtinOmPacks, // OmPack[]
  effectiveDefaults,
} = await createMastraCode(options)
```

**`CreateMastraCodeOptions`:** `cwd` (string, default `process.cwd()`), `modes`, `extraTools`, `subagents`, `storage`, `initialState`, `heartbeatHandlers`, `resolveModel`. **No `configDir` parameter exists.**

> "Mastra Code is designed as a composable library." — `customization.md`

**Implication for Plan 4:** the Phase E scope report's claim "`createMastraCode({ configDir })` from npm `mastracode`" (Rev 5, Q7, R6 references) is **incorrect**. There is no `configDir` option. The correct pattern is to set `cwd` to the project root and let Mastra Code discover `.mastracode/` configs from disk.

### 2. MCP server hosting — config file, not API

```json title=".mastracode/mcp.json"
{
  "mcpServers": {
    "learning-loop": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/mastra/server.js"]
    }
  }
}
```

**Discovery paths (priority order):**

| Priority | Path | Scope |
|---|---|---|
| Highest | `.mastracode/mcp.json` | Project |
| | `~/.mastracode/mcp.json` | Global |
| Lowest | `.claude/settings.local.json` | Project (Claude Code compatible) |

**Critical detail:** tools are **auto-namespaced** as `serverName_toolName`. Our MCP tools become `learning-loop_loop_describe`, `learning-loop_meta_state_list`, etc. The `interface/contract.js` validator must account for this namespacing when checking tool exposure (Requirement #3 / skill spec).

**Transports supported:** stdio (local process via `command` + `args`) and HTTP (remote via `url`). OAuth supported for HTTP.

**Startup behavior:** connects to all configured servers on session start; reports status (`MCP: 2 server(s) connected, 15 tool(s)`). Invalid entries (both `command` AND `url`, or invalid URL) are skipped.

### 3. Skills — `.mastracode/skills/<name>/SKILL.md` (Claude Code compatible)

**Discovery paths (priority order):**

| Priority | Path | Scope |
|---|---|---|
| Highest | `.mastracode/skills/` | Project |
| | `.claude/skills/` | Project (Claude Code compatible) |
| | `.agents/skills/` | Project (Agent Skills spec compatible) |
| | `~/.mastracode/skills/` | Global |
| | `~/.claude/skills/` | Global |
| Lowest | `~/.agents/skills/` | Global |

**SKILL.md frontmatter shape:**

```md
---
name: release-check
description: Check whether a release is ready
metadata:
  goal: true
---
```

`name`, `description` required. `user-invocable: false` hides from autocomplete. `metadata.goal: true` exposes as `/goal/<name>`. Activate via `/skill/<name>`.

**Implication for Plan 4:** since `.claude/skills/` is in the discovery path, the skill file created by Plan 2 (`.claude/skills/learning-loop/SKILL.md`) **is already discoverable by Mastra Code without modification**. Plan 4 should verify this discovery path works for Mastra Code — likely no new skill file needed in `.mastracode/skills/learning-loop/`. **Requirement #3 may be satisfied by the existing Plan 2 artifact** (test this assumption).

### 4. Hooks — declarative JSON (NOT shim files)

**This is the biggest departure from the Claude Code model.**

**Config paths:**

| Priority | Path | Scope |
|---|---|---|
| Higher | `.mastracode/hooks.json` | Project |
| Lower | `~/.mastracode/hooks.json` | Global |

**Config shape:**

```json title=".mastracode/hooks.json"
{
  "PreToolUse": [
    {
      "type": "command",
      "command": "node scripts/validate-tool.js",
      "matcher": { "tool_name": "execute_command" },
      "timeout": 5000,
      "description": "Validate shell commands before execution"
    }
  ],
  "PostToolUse": [
    {
      "type": "command",
      "command": "node scripts/log-tool.js"
    }
  ]
}
```

**Supported events:**

| Event | Fires | Blocks? |
|---|---|---|
| `PreToolUse` | Before tool call | Yes |
| `PostToolUse` | After tool call | No |
| `Stop` | Agent response ends | Yes |
| `UserPromptSubmit` | User sends message | Yes |
| `SessionStart` | Session begins | No |
| `SessionEnd` | Session ends | No |
| `Notification` | TUI fires notification | No |

**Hook I/O protocol:** receives JSON on stdin:

```json
{
  "session_id": "thread-abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "execute_command",
  "tool_input": { "command": "npm test" }
}
```

For blocking events, responds on stdout:

```json
{"decision": "block", "reason": "This command is not allowed"}
```

**Hook payload contains `session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`.**

**Major deviation from Phase E scope report:** the report said Requirement #1 needs 4 shim files mirroring Claude Code's `bash-coordination-gate.cjs`, `write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`. **Mastra Code has no equivalent shim concept** — hooks are declarative command invocations, not JS module imports. To satisfy the learning loop's gates, we need to write the gate logic as standalone Node scripts invoked from `.mastracode/hooks.json` entries.

**Hook coverage gap (analysis vs. Claude Code):**

| Learning-loop hook | Claude Code shim | Mastra Code hook config |
|---|---|---|
| Bash gate (PreToolUse blocking) | `bash-coordination-gate.cjs` | `.mastracode/hooks.json` `PreToolUse` → `node tools/learning-loop-mastra/hooks/legacy/bash-gate.js` |
| Write gate (PreToolUse blocking) | `write-coordination-gate.cjs` | `.mastracode/hooks.json` `PreToolUse` matcher for Write/Edit tools → `node tools/learning-loop-mastra/hooks/legacy/write-gate.js` |
| Inbound state gate (UserPromptSubmit) | `inbound-state-gate.cjs` | `.mastracode/hooks.json` `UserPromptSubmit` → `node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js` |
| Recurrence check (SessionStart) | `recurrence-check-on-start.cjs` | `.mastracode/hooks.json` `SessionStart` → `node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js` |

The gate scripts (`tools/learning-loop-mastra/hooks/legacy/*.js`) are the universal hooks — they read JSON from stdin, return decisions on stdout. **No new code is needed** for Mastra Code hooks; only the `.mastracode/hooks.json` config file needs to be created. This is simpler than the Phase E scope report implied.

### 5. Identity markers — no `RUNTIME_ID`

**Closest equivalents:**

- `MASTRA_RESOURCE_ID` env var (overrides default resource ID)
- `resourceId` field in `.mastracode/database.json`
- `MASTRA_USER_ID` env var (identity)
- `MASTRA_PLANS_DIR` env var (plans directory)
- `session_id` field in every hook payload

**No documented `RUNTIME_ID` convention.** The interface contract's Requirement #4 (identity marker) needs amendment for Mastra Code:

- Option A: Use `MASTRA_RESOURCE_ID=mastra-code` (closest semantic match — identifies the runtime instance, not the runtime type)
- Option B: Use `MASTRA_USER_ID=mastra-code` (less appropriate — user vs runtime)
- Option C: Set `resourceId` in `.mastracode/database.json`

**Recommendation:** Option A (`MASTRA_RESOURCE_ID=mastra-code`). The hardening plan's R2 write-gate can key on `MASTRA_RESOURCE_ID` for Mastra Code (and on `RUNTIME_ID` for Claude Code / Droid — pending their adoption).

### 6. Settings file — `.mastracode/settings.json`

Path: project-level `.mastracode/settings.json` or global `~/.mastracode/settings.json`. JSON format. The doc shows `shellPassthrough` and `omScope` fields; full schema not exhaustive in the docs but the file exists.

**Implication for Requirement #5 (settings integration):** the settings file is the settings integration target. Mastra Code will discover `.mastracode/settings.json` automatically when launched from the project root (no explicit registration needed).

### 7. Modes — custom agent modes

```typescript
const { harness } = await createMastraCode({
  modes: [
    {
      id: 'review',
      name: 'Review',
      default: true,
      defaultModelId: 'anthropic/claude-sonnet-4-6',
      color: '#f59e0b',
      agent: reviewAgent,
    },
  ],
})
```

Each mode = one `Agent` instance. Default modes: Build, Plan, Fast.

**The Phase E scope report mentioned "Mode 1 peer MCP"** (AGENTS.md §3.9, Q7) — **this terminology is not in the current Mastra Code docs.** "Mode 1" likely refers to a previous internal design doc or a planned feature. The current API uses `modes[]` array for custom mode configuration; there's no specific "peer MCP mode." Plan 4 should clarify whether "Mode 1" refers to a particular mode in the `modes[]` array or is stale terminology.

## Plan 4 Impact Analysis — Corrected 9-Item Checklist

The Rev 11 "Remaining items for Plan 4" section had 9 items. Revised with corrections:

| # | Item (Rev 11) | Correction / Refinement |
|---|---|---|
| 1 | Install `npm install mastracode`; smoke-test | **Add: clarify whether to use programmatic `createMastraCode()` or a CLI binary** (docs only show programmatic). If CLI, find the binary entry point. |
| 2 | Create `.mastracode/coordination/hooks/*.cjs` (4 shims) | **REPLACE WITH: create `.mastracode/hooks.json`** (declarative config) with 4 entries: `PreToolUse` for bash, `PreToolUse` for Write/Edit, `UserPromptSubmit` for inbound-state, `SessionStart` for recurrence-check. Each entry invokes the existing universal scripts in `tools/learning-loop-mastra/hooks/legacy/`. |
| 3 | Register `mcpServers.learning-loop` via `createMastraCode({configDir})` | **REPLACE WITH: create `.mastracode/mcp.json`** with `mcpServers.learning-loop` entry pointing at `node tools/learning-loop-mastra/mastra/server.js` (post-Plan-6 path). Tool names will be auto-namespaced as `learning-loop_*`. |
| 4 | Create `.mastracode/skills/learning-loop/SKILL.md` | **MAY NOT BE NEEDED.** The existing `.claude/skills/learning-loop/SKILL.md` (shipped in Plan 2) is already in Mastra Code's skill discovery path. Verify discovery; only create `.mastracode/skills/learning-loop/SKILL.md` if discovery fails. |
| 5 | Set `RUNTIME_ID=mastra-code` | **CHANGE TO:** set `MASTRA_RESOURCE_ID=mastra-code` (closest semantic equivalent). Document the deviation from the contract's `RUNTIME_ID` convention. |
| 6 | Configure `.mastracode/settings.json` | **NO CHANGE.** Settings file exists; create at project root. |
| 7 | Run `interface/contract.js mastra-code` → `{ok: true}` | **VERIFY:** contract validator must accept Mastra Code's hook config (declarative JSON, not shim files). May need a contract amendment to recognize `.mastracode/hooks.json` as a valid hook mechanism. Tool exposure check must account for the `learning-loop_*` namespace prefix. |
| 8 | Document in `docs/agents/mastra-code.md` | **NO CHANGE.** |
| 9 | Confirm Mode 1 hook layer doesn't need changes | **CLARIFY:** the Mode 1 terminology is stale. The actual integration model is: Mastra Code reads `.mastracode/hooks.json` for hook config; it reads `.mastracode/mcp.json` for MCP servers. The hooks fire correctly without `.claude/` or `.factory/` coordination directories. |

**Contract amendment needed:** Requirement #1 (hook shim set) currently says "Runtime must provide `coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs`". For Mastra Code, the equivalent is `.mastracode/hooks.json` with declarative entries. The contract should either:
- (a) Accept both: "Hook shim set OR declarative hooks.json config"; or
- (b) Add a new requirement: "Runtime must provide either hook shims OR a declarative hooks config that invokes the same universal scripts."

Recommend (b) — explicit alternatives are clearer for future runtime authors.

## Unresolved Questions

1. **CLI vs programmatic invocation:** ✅ **RESOLVED 2026-06-27 — programmatic invocation chosen.** Per operator decision in `/problem-solving` session: programmatic `createMastraCode()` is preferred because (a) it eliminates the MCP server wrapper for Mastra Code, (b) it enables the subagent pattern (Mastra agent can be a subagent that calls our tools directly), (c) it avoids the MCP protocol overhead, (d) it allows programmatic composition with Mastra workflows. The MCP server (`tools/learning-loop-mastra/mastra/server.js`) is still needed for Claude Code and Droid (which can't import our tool factories directly). The integration is **hybrid**: MCP for Claude Code / Droid, programmatic for Mastra Code. See `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` for the Harness class API details and `plans/reports/brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` for the broader write-gate layer placement question opened by this decision.
2. **Mode 1 terminology:** "Mode 1 peer MCP" appears in AGENTS.md §3.9 and the Phase E scope report (Rev 5 Q7) but not in current Mastra Code docs. Is this a planned future feature, or stale terminology from an earlier design?
3. **Hook payload for `PreToolUse` — tool namespacing:** ✅ **RESOLVED 2026-06-27 — no namespacing with programmatic invocation.** With programmatic integration (per Q1), our tools are imported directly as native Mastra tools via `createMastraCode({ tools: { ... } })` or as part of a custom `Agent` instance passed to a mode/subagent. There is no MCP namespacing — tools appear with their original names (e.g., `loop_describe`, `meta_state_list`, `meta_state_report`). The write-gate hook matcher in `.mastracode/hooks.json` targets these native names directly. **Still requires smoke test** to confirm exact tool name format in the Mastra Code hook payload (TBD at implementation time). For BUILT-IN tools (e.g., Mastra Code's edit/write tool), the write-gate hook matcher needs the exact built-in tool name (TBD — see Q2 below, which has been renumbered).
4. **`MASTRA_RESOURCE_ID` semantics for R2:** Does `MASTRA_RESOURCE_ID` represent the runtime instance (like `RUNTIME_ID`) or the resource scope (like a project name)? The R2 write-gate semantics need clarification.
5. **Contract validator update path:** How does the `interface/contract.js` validator get the new "declarative hooks.json" check? Add to Requirement #1 as alternative, or new requirement? What test coverage is needed?
6. **Storage conflict:** Mastra Code uses LibSQL by default for its storage. Our loop also uses LibSQL (`tools/learning-loop-mastra/data/mastra-memory.db`). Are these the same DB or separate? Will running both conflict? Plan 4 should disambiguate.

**Questions remaining open after this update:** 2 (Mode 1 terminology), 4 (MASTRA_RESOURCE_ID semantics), 5 (contract validator update path), 6 (LibSQL storage conflict). Plus 4 new questions from the harness class research: Mastra Code's built-in write/edit tool names, hook timeout behavior, toolCategoryResolver for MCP tools (now N/A — no MCP for Mastra Code), contract test isolation.

## References

### Official Documentation

- Mastra Code index: `https://code.mastra.ai/llms.txt`
- Mastra Code API reference: `https://code.mastra.ai/reference.md`
- Mastra Code configuration: `https://code.mastra.ai/configuration.md`
- Mastra Code customization: `https://code.mastra.ai/customization.md`
- Mastra Code modes: `https://code.mastra.ai/modes.md`
- Harness overview: `https://mastra.ai/docs/harness/overview`
- Harness class reference: `https://mastra.ai/reference/harness/harness-class`

### Project Documents

- Phase E scope report (Rev 11): `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`
- Interface spec: `tools/learning-loop-mastra/interface/CONTRACT.md`
- Runtime onboarding guide: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md`
- Contract validator: `tools/learning-loop-mastra/interface/contract.js`
- Universal hook scripts: `tools/learning-loop-mastra/hooks/legacy/{bash,write,inbound}-gate.js`

### Quality Standards Applied

- YAGNI: only contract amendments strictly needed for Mastra Code's declarative hooks; no new abstraction layer.
- KISS: Mastra Code hooks = existing universal scripts + `.mastracode/hooks.json` config (no new shim files).
- DRY: reuses Plan 2's `.claude/skills/learning-loop/SKILL.md` for Mastra Code's skill spec (Claude Code compatible discovery path).

## Next Steps for Plan 4 Authoring

1. **Resolve CLI question (1):** install `npm install mastracode` and check if there's a binary in `node_modules/.bin/`. If not, write a wrapper script (`scripts/run-mastracode.sh` or similar) that invokes `createMastraCode()` programmatically with `cwd` set to project root.
2. **Draft contract amendment** for Requirement #1: add `hooks.json` as alternative to shim files.
3. **Update `interface/contract.js`** to check `.mastracode/hooks.json` structure (presence + required event entries).
4. **Add `MASTRA_RESOURCE_ID` check** to Requirement #4 (identity marker) — accept either `RUNTIME_ID` (existing convention) or `MASTRA_RESOURCE_ID` (Mastra Code convention).
5. **Verify MCP tool namespacing** with a smoke test: launch Mastra Code with `.mastracode/mcp.json` pointing at our server, confirm tools appear as `learning-loop_*`.
6. **Resolve Mode 1 question (2):** ask operator whether "Mode 1 peer MCP" is stale terminology or a planned feature.
7. **Storage conflict check (6):** verify LibSQL DB sharing between Mastra Code and our loop works.
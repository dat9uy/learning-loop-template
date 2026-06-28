# Research Report: Mastra Harness Class Deep-Dive (Phase E Plan 4 Foundation)

## Executive Summary

The Harness is the **framework layer** that Mastra Code wraps. This report covers the Harness class API from the installed `@mastra/core@1.42.0` source. Key findings for Plan 4:

1. **The Harness has NO hook system** — hooks are a Mastra Code layer (separate `hookManager` in `createMastraCode()`). The Harness exposes **events** (subscribable callbacks) and **permissions** (declarative policy). Our learning-loop gates (which use Claude Code's hook stdin/stdout JSON protocol) integrate via Mastra Code's hook layer, NOT the Harness.

2. **Tool category system includes `'mcp'` as a first-class category** — our MCP server's tools (consumed by Mastra Code) will be classified under the `mcp` category. The write-gate hook matcher must target this category to filter our tools specifically.

3. **`HarnessConfig.resourceId` is the framework-level runtime identifier** — semantically equivalent to our `RUNTIME_ID` convention. Plan 4 should set `resourceId: 'mastra-code'` when wrapping `createMastraCode()`.

4. **36+ HarnessEvent types** are emitted via `harness.subscribe()`. The 6 most relevant for Plan 4: `message_update`, `tool_start`, `tool_approval_required`, `tool_end`, `error`, `display_state_changed`.

5. **`@mastra/mcp` package provides both server and client** — we are the server (`tools/learning-loop-mastra/mastra/server.js`); Mastra Code is the client. Tools from our server appear in Mastra Code's tool list with namespaced names.

## Research Methodology

- Sources: `@mastra/core@1.42.0` (installed locally) + `@mastra/mcp@1.10.0` (installed locally)
- Date: 2026-06-26
- Key files read:
  - `node_modules/@mastra/core/dist/harness/harness.d.ts` (563 lines)
  - `node_modules/@mastra/core/dist/harness/types.d.ts` (931 lines)
  - `node_modules/@mastra/mcp/dist/client/client.d.ts` (InternalMastraMCPClient)
- Verification: types from the actual installed version, not memory

## Key Findings

### 1. Harness Class — Constructor Signature

```typescript
export declare class Harness<TState = {}> {
  constructor(config: HarnessConfig<TState>);
  // ...
}
```

**`HarnessConfig<TState>` fields (all of them):**

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Unique harness instance ID |
| `resourceId` | `string` | No | **Runtime/grouping identifier (thread scope)** |
| `storage` | `MastraCompositeStore` | No | Persistence (threads, messages, state) |
| `stateSchema` | `PublicSchema<TState>` | No | Zod/JSON Schema for state shape |
| `initialState` | `Partial<TState>` | No | Initial state values |
| `memory` | `DynamicArgument<MastraMemory>` | No | Shared memory across modes |
| `modes` | `HarnessMode<TState>[]` | Yes | Agent modes (Build/Plan/Review/etc.) |
| `tools` | `DynamicArgument<ToolsInput \| undefined>` | No | Shared tools across all modes |
| `workspace` | `DynamicArgument<Workspace \| undefined> \| WorkspaceConfig` | No | Workspace config |
| `browser` | `DynamicArgument<MastraBrowser \| undefined>` | No | Browser automation |
| `heartbeatHandlers` | `HeartbeatHandler[]` | No | Periodic background tasks |
| `idGenerator` | `() => string` | No | Custom ID generator |
| `modelAuthChecker` | `ModelAuthChecker` | No | Custom auth source for models |
| `modelUseCountProvider` | `ModelUseCountProvider` | No | Per-model usage tracking |
| `modelUseCountTracker` | `ModelUseCountTracker` | No | Model selection callback |
| `customModelCatalogProvider` | `CustomModelCatalogProvider` | No | Extra model catalog entries |
| `subagents` | `HarnessSubagent[]` | No | Subagent definitions (Explore, Plan, etc.) |
| `resolveModel` | `(modelId: string) => MastraLanguageModel` | No | Model ID resolver |
| `omConfig` | `HarnessOMConfig` | No | Observational Memory defaults |
| `disableBuiltinTools` | `BuiltinToolId[]` | No | Disable built-in tools |
| `toolCategoryResolver` | `(toolName: string) => ToolCategory \| null` | No | Map tool names to permission categories |
| `pubsub` | `PubSub` | No | Event bus |
| `threadLock` | `{ acquire, release }` | No | Thread locking for multi-process |
| `observability` | `ObservabilityEntrypoint` | No | Tracing/scoring backend |

**For Plan 4:** `resourceId` is the key field for runtime identity. `toolCategoryResolver` is needed to classify MCP tools under the `mcp` category.

### 2. Built-in Tools (disable-able)

```typescript
export type BuiltinToolId =
  | 'ask_user'         // ask the user a question
  | 'submit_plan'      // submit a plan for approval
  | 'task_write'       // write a task list
  | 'task_update'      // update tasks
  | 'task_complete'    // mark task done
  | 'task_check'       // check task status
  | 'subagent';        // spawn a subagent
```

All 7 can be disabled via `disableBuiltinTools: ['ask_user', ...]` in `HarnessConfig`. Useful when the harness is used for non-coding-agent purposes where these primitives don't apply.

### 3. Tool Category & Permission System

```typescript
export type ToolCategory = 'read' | 'edit' | 'execute' | 'mcp' | 'other';
export type PermissionPolicy = 'allow' | 'ask' | 'deny';

export interface PermissionRules {
  categories: Partial<Record<ToolCategory, PermissionPolicy>>;
  tools: Partial<Record<string, PermissionPolicy>>;
}
```

**Approval resolution chain** (`resolveToolApproval()`):

1. Per-tool `deny`
2. `yolo` mode (auto-approve all)
3. Per-tool policy
4. Session tool grant
5. Session category grant
6. Category policy
7. Default: `'ask'`

**For Plan 4 — `mcp` category:**

The `toolCategoryResolver` callback maps tool names → categories. Default behavior: all tools are `other` unless a resolver is provided. **MCP-sourced tools will appear as `other` by default** unless Mastra Code wires the resolver to map `mcp__*` tools to `mcp` category.

**Implication for the write-gate hook:** the write-gate matcher in `.mastracode/hooks.json` must match on `tool_name` directly (e.g., `mcp__learning-loop__loop_describe` or `learning-loop_loop_describe` — actual format TBD), not rely on the `mcp` permission category.

### 4. HarnessEvent — 36+ Event Types

Key events for Plan 4 integration:

| Event | When | Use case |
|---|---|---|
| `message_update` | Streaming message content | UI rendering |
| `tool_start` | Tool call begins | Tool-call logging |
| `tool_approval_required` | Tool needs user approval | Gate layer can intercept |
| `tool_update` | Tool streaming partial result | Streaming UI |
| `tool_end` | Tool call completes | Audit logging |
| `error` | Harness error | Error reporting |
| `mode_changed` | Mode switched | Mode-aware logic |
| `model_changed` | Model switched | Model-aware logic |
| `thread_changed` | Thread switched | Session continuity |
| `display_state_changed` | Coalesced state snapshot | UI rendering |
| `om_status` | Observational Memory status | Long-conversation mgmt |

**Note:** `tool_approval_required` fires from the **Harness internal permission system**, NOT from external hooks. Mastra Code's hook system is orthogonal — `PreToolUse` hook fires before the Harness even sees the tool call.

**Hook vs Event distinction:**

- **Hook** (Mastra Code layer): pre-tool-call gate, stdin/stdout JSON, can BLOCK
- **Event** (Harness layer): post-tool-call notification, TypeScript callback, OBSERVE-ONLY

Our learning-loop gates use the **hook model** (Claude Code-compatible). They integrate with Mastra Code's hook system, not the Harness event system.

### 5. Resource ID — Runtime Identity Pattern

```typescript
// Set on config:
const harness = new Harness({
  id: 'my-coding-agent',
  resourceId: 'mastra-code',  // ← runtime instance identifier
  // ...
});

// Get/set at runtime:
harness.getResourceId(): string
harness.setResourceId({ resourceId: 'foo' }): void
harness.getDefaultResourceId(): string
harness.getKnownResourceIds(): Promise<string[]>
```

**For Plan 4:** set `resourceId: 'mastra-code'` when wrapping `createMastraCode()`. This becomes the canonical runtime identity for Mastra Code instances. The hardening plan's R2 write-gate can key on this.

**Mapping to our 5-req contract:**

- Requirement #4 (identity marker) = `HarnessConfig.resourceId` for Mastra Code
- Validator should accept `MASTRA_RESOURCE_ID` env var OR `.mastracode/database.json` resourceId field OR `HarnessConfig.resourceId` (whichever is set)

### 6. Observational Memory (OM) — Not Relevant to Plan 4

The Harness includes an automatic memory system (observer + reflector agents) that compresses long conversations. Plan 4 doesn't need this; it's a Mastra Code feature for sessions that exceed the model's context window.

**Skip for Plan 4.** May revisit in a follow-up plan if long-running sessions become a use case.

### 7. MCP Integration via `@mastra/mcp`

The `@mastra/mcp@1.10.0` package provides:

- **Client (`@mastra/mcp/client`)** — `InternalMastraMCPClient` is the low-level implementation. `MCPClient` is the public API (wraps multiple clients). Key methods: `connect()`, `disconnect()`, `getTools()`, `getResources()`, `getPrompts()`, `setRoots()`, `sendRootsListChanged()`.
- **Server (`@mastra/mcp/server`)** — exposes Mastra agents/workflows as MCP servers.

**For our loop:**

- We use `@mastra/mcp/server` to expose our tools via `tools/learning-loop-mastra/mastra/server.js`.
- Mastra Code uses `@mastra/mcp/client` (via `mcpManager`) to connect to us via stdio.
- Tools from our server appear in Mastra Code's tool list with auto-namespaced names (per the previous research report: `learning-loop_loop_describe`).

**Tool namespacing convention** — the exact format depends on Mastra Code's MCP manager implementation. Common conventions:
- `serverName__toolName` (double underscore, MCP standard)
- `mcp__serverName__toolName` (Claude Code convention)
- `serverName_toolName` (single underscore, Mastra docs claim this)

**Plan 4 smoke test must verify** which convention Mastra Code uses and update the write-gate hook matcher accordingly.

### 8. Mastra Code — How It Wraps Harness

`createMastraCode()` returns `{harness, mcpManager, hookManager, authStorage, ...}`. The wiring:

```
Mastra Code
  ├── Harness (Harness<TState>)     ← session orchestration
  ├── MCPManager                     ← MCP server connections (uses @mastra/mcp/client)
  ├── HookManager                    ← .mastracode/hooks.json execution
  └── AuthStorage                    ← OAuth credentials
```

**Key insight:** the `hookManager` is separate from the `harness`. Hooks fire BEFORE tool calls enter the Harness. The write-gate hook can block a tool call before the Harness ever sees it.

**Tool call flow:**

```
Mastra Code receives tool call from LLM
  ↓
HookManager fires .mastracode/hooks.json PreToolUse hooks
  ↓ (if any hook returns {"decision": "block"}, call is blocked)
Harness receives tool call
  ↓
Harness emits 'tool_start' event
  ↓
Harness permission system checks (resolveToolApproval)
  ↓ (if approval needed, emits 'tool_approval_required', pauses for user)
Tool executes
  ↓
Harness emits 'tool_end' event
```

**Our gate integration point:** step 2 — Mastra Code's HookManager, before the Harness sees the call. The write-gate hook receives JSON on stdin (per the docs), runs its logic, returns decision on stdout.

## Plan 4 — Corrected Integration Design

Combining Mastra Code + Harness knowledge:

### Configuration (.mastracode/)

| File | Purpose | Plan 4 action |
|---|---|---|
| `.mastracode/mcp.json` | MCP server registration | CREATE — register `learning-loop` server |
| `.mastracode/hooks.json` | Lifecycle hooks | CREATE — register 4 hooks |
| `.mastracode/settings.json` | Settings (shell, theme, etc.) | CREATE — minimal config |
| `.mastracode/database.json` | Storage overrides (resourceId) | CREATE — `resourceId: 'mastra-code'` |
| `.mastracode/skills/learning-loop/SKILL.md` | Skill spec | MAYBE NOT NEEDED — `.claude/skills/` is in Mastra Code's discovery path |

### Hook Configuration (.mastracode/hooks.json)

```json
{
  "PreToolUse": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js",
      "matcher": { "tool_name": "execute_command" },
      "timeout": 5000
    },
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js",
      "matcher": { "tool_name": "edit_file" },  // need to verify Mastra Code's actual write tool name
      "timeout": 5000
    }
  ],
  "UserPromptSubmit": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js",
      "timeout": 5000
    }
  ],
  "SessionStart": [
    {
      "type": "command",
      "command": "node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js",
      "timeout": 10000
    }
  ]
}
```

**Tool name question:** Mastra Code's actual tool names for built-in tools need verification. The doc said `execute_command` for shell. Need to confirm the write/edit tool names.

### Contract Amendments (interface/CONTRACT.md)

**Requirement #1 (hook shim set)** — add alternative path:

> Original: Runtime must provide `coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` (4 files).
>
> **Amendment:** Runtime MUST satisfy Requirement #1 via EITHER:
> (a) **Shim file set:** 4 `.cjs` shim files in the runtime's coordination dir (Claude Code, Droid), each delegating to universal scripts.
> (b) **Declarative hooks config:** A `.mastracode/hooks.json` (or equivalent) with entries for PreToolUse (bash), PreToolUse (write), UserPromptSubmit (inbound), SessionStart (recurrence). Each entry invokes the universal script in `tools/learning-loop-mastra/hooks/legacy/`.

**Requirement #4 (identity marker)** — add Mastra Code option:

> Original: Runtime SHOULD set `RUNTIME_ID` env var.
>
> **Amendment:** Runtime MUST set runtime identity via one of:
> (a) `RUNTIME_ID` env var (Claude Code, Droid — pending adoption).
> (b) `MASTRA_RESOURCE_ID` env var OR `HarnessConfig.resourceId` OR `.mastracode/database.json` resourceId field (Mastra Code).

### Contract Validator Updates (interface/contract.js)

The validator currently checks 4 things. New requirements:

1. **Hook mechanism check:** Detect which mechanism the runtime uses and verify accordingly:
   - If `.claude/coordination/hooks/*.cjs` or `.factory/coordination/hooks/*.cjs` exist → check shim file set.
   - If `.mastracode/hooks.json` exists → check hook entries for the 4 required events + valid command paths pointing at `tools/learning-loop-mastra/hooks/legacy/*.js`.

2. **MCP tool namespacing check:** When validating MCP server registration, query the server (if accessible) to list tools and verify they exist under the expected namespaced names.

3. **Identity marker flexibility:** Accept any of `RUNTIME_ID`, `MASTRA_RESOURCE_ID`, or `database.json` resourceId.

## Unresolved Questions

1. **Tool namespacing convention** — does Mastra Code use `learning-loop_loop_describe` (single underscore per docs), `mcp__learning-loop__loop_describe` (MCP standard), or something else? Need a smoke test against `npm install mastracode`.

2. **Mastra Code's built-in tool names for write/edit** — the `matcher.tool_name` in `hooks.json` needs exact tool names. The doc only shows `execute_command` for shell. What are the edit/write tool names?

3. **CLI vs programmatic invocation** — is there a `mastracode` CLI binary in `node_modules/.bin/` after `npm install mastracode`, or do we need a wrapper script that calls `createMastraCode()` programmatically?

4. **LibSQL storage conflict** — both our loop and Mastra Code use LibSQL by default. Will they share the same DB or conflict?

5. **Hook timeout behavior** — the docs say `timeout: 5000` (5 seconds) is configurable per hook. Are blocking decisions returned within the timeout window? What's the failure mode if a hook times out — allow or deny?

6. **ToolCategoryResolver behavior for MCP tools** — does Mastra Code's `toolCategoryResolver` automatically map `mcp__*` tools to the `mcp` category, or do we need to provide a custom resolver via `createMastraCode()`?

7. **Contract test isolation** — when the contract validator checks `.mastracode/hooks.json` and discovers it points at the universal scripts, will the validator actually invoke those scripts (smoke test) or just check file existence?

## Combined Plan 4 Execution Path

Combining this report with the previous Mastra Code research report, the Plan 4 execution is:

**Phase 0 — Prerequisites**
- Install `npm install mastracode` (pre-flight: `mastra_gate_check` for vendor API install)
- Verify `@mastra/core` and `@mastra/mcp` already installed (✅ done — versions confirmed)
- Smoke test: launch `createMastraCode({ cwd: process.cwd() })` programmatically in a probe script to confirm package works
- Document actual tool namespacing convention (resolve Q1)
- Document actual tool names for write/edit (resolve Q2)

**Phase 1 — Configuration**
- Create `.mastracode/mcp.json` with `learning-loop` server entry pointing at `tools/learning-loop-mastra/mastra/server.js`
- Create `.mastracode/hooks.json` with 4 hook entries (PreToolUse × 2, UserPromptSubmit, SessionStart)
- Create `.mastracode/settings.json` (minimal)
- Create `.mastracode/database.json` with `resourceId: 'mastra-code'`

**Phase 2 — Contract amendments**
- Amend `tools/learning-loop-mastra/interface/CONTRACT.md`:
  - Requirement #1: add declarative hooks alternative
  - Requirement #4: add `MASTRA_RESOURCE_ID` option
- Update `tools/learning-loop-mastra/interface/contract.js`:
  - Add hook mechanism detection (shim vs declarative)
  - Add `MASTRA_RESOURCE_ID` check
  - Add MCP tool namespacing awareness

**Phase 3 — Smoke test**
- Write `scripts/probe-mastracode.cjs` that:
  - Imports `createMastraCode`
  - Boots the harness with `cwd: process.cwd()`, `resourceId: 'mastra-code'`
  - Connects to MCP servers via `.mastracode/mcp.json`
  - Lists connected MCP servers and their tools (verify namespacing)
  - Triggers a SessionStart hook (verify fires)
  - Triggers a PreToolUse hook via a synthetic tool call (verify fires + decision protocol works)
  - Asserts all hooks fired correctly + MCP server reachable
  - Cleans up

**Phase 4 — Documentation**
- Create `docs/agents/mastra-code.md` with:
  - Mastra Code overview + Harness relationship
  - Configuration walkthrough (.mastracode/ files)
  - Hook integration model (declarative JSON vs Claude Code shim)
  - R2 ownership conventions (resourceId = 'mastra-code')
  - Tool namespacing convention (with example)
  - Smoke test procedure

**Phase 5 — Verify**
- `pnpm test` GREEN
- `node interface/contract.js mastra-code` → `{ok: true, missing: []}`
- Manual end-to-end smoke test

## References

### Installed Package Sources (Primary)

- `node_modules/@mastra/core/dist/harness/harness.d.ts` (563 lines)
- `node_modules/@mastra/core/dist/harness/types.d.ts` (931 lines)
- `node_modules/@mastra/mcp/dist/client/client.d.ts`
- `node_modules/@mastra/mcp/package.json`

### Official Documentation

- Harness overview: `https://mastra.ai/docs/harness/overview`
- Harness reference: `https://mastra.ai/reference/harness/harness-class`
- Mastra Code API: `https://code.mastra.ai/reference.md`
- Mastra Code configuration: `https://code.mastra.ai/configuration.md`

### Project Documents

- Previous research: `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`
- Phase E scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`
- Interface spec: `tools/learning-loop-mastra/interface/CONTRACT.md`
- Runtime onboarding: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md`
- Contract validator: `tools/learning-loop-mastra/interface/contract.js`

## Quality Standards Applied

- **YAGNI:** only contract amendments strictly needed (2 requirement edits); no new abstraction layer.
- **KISS:** reuse existing universal hook scripts via declarative config; no new gate code.
- **DRY:** `.claude/skills/learning-loop/SKILL.md` (Plan 2 artifact) is auto-discovered by Mastra Code; no duplicate skill file needed.

## Next Steps

1. **Run smoke test** with `npm install mastracode` + `createMastraCode` programmatic invocation to resolve tool namespacing + tool name questions (Q1, Q2).
2. **Draft contract amendments** for Requirement #1 + #4 (described above).
3. **Author Plan 4** (`plans/<timestamp>-phase-e-mastra-code-validation/`) with the 5-phase execution path from this report.
4. **Verify against AGENTS.md §3.9** — does "Mode 1 peer MCP" refer to a specific mode or stale terminology? Resolve before authoring.
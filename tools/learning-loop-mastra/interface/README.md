# Runtime Interface

The runtime interface is the **contract** that an agent runtime (Claude Code, Droid CLI, future Mastra Code) must satisfy to integrate with the learning loop. It is the third layer in the 3-layer architecture (see AGENTS.md §1.1).

## Why it exists

Before this layer existed, the contract was implicit in code: the 4 hook shims in `.claude/coordination/hooks/` + 4 in `.factory/coordination/hooks/`, the MCP config in `.mcp.json` and `.factory/mcp.json`, the skill specs in `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md`. To add a new runtime, an implementer had to reverse-engineer the contract from the existing runtimes.

The `interface/` directory makes the contract explicit:
- **README.md** (this file) — what the interface IS and why it exists.
- **CONTRACT.md** — the 5 requirements a runtime MUST satisfy.
- **contract.js** — the validator. Run as `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`.
- **RUNTIME_ONBOARDING.md** — step-by-step guide for adding a new runtime (worked example: Mastra Code).

## Relationship to the 3 layers

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: Runtime Interface (this directory)             │
└────────────────────────┬─────────────────────────────────┘
                         │ satisfies
┌────────────────────────▼─────────────────────────────────┐
│  Layer 2: Mastra Shell (tools/learning-loop-mastra/)     │
└────────────────────────┬─────────────────────────────────┘
                         │ wraps
┌────────────────────────▼─────────────────────────────────┐
│  Layer 1: Core (tools/learning-loop-mastra/core/)        │
└──────────────────────────────────────────────────────────┘
```

- **Core** owns the loop's logic. Zero `@mastra/*` imports (see `core/README.md`).
- **Mastra shell** wraps Core in Mastra framework primitives (`server.js`, `create-loop-*.js`, `workflows/`, `agents/`).
- **Runtime interface** (this directory) is the contract runtimes sign to consume the shell. It is NOT core (it mentions MCP, hooks, skill specs — none of which are pure logic) and NOT shell (the shell is the implementation, not the spec).

## The 5 requirements (at a glance)

See `CONTRACT.md` for full predicates and verification steps.

| ID | What | Pass criteria |
|----|------|---------------|
| `hook-shim-set` | 4 `.cjs` shims in `<surface>/coordination/hooks/` | Each shim exists as a file |
| `mcp-client-config` | MCP config has `mcpServers.learning-loop` entry | Entry points to `tools/learning-loop-mastra/mastra/server.js` |
| `skill-spec` | `skills/learning-loop/SKILL.md` exists | References `loop_describe` AND `meta_state_list` |
| `identity-marker` (PROPOSED) | `RUNTIME_ID` env var set | Advisory only today; never fails |
| `settings-integration` | Settings file references 4 shim basenames | All 4 basenames present in `command` strings |

## How to use this layer

- **Read the spec:** `interface/CONTRACT.md`.
- **Validate an existing runtime:** `node interface/contract.js claude-code` or `droid` or `mastra-code`.
- **Add a new runtime:** `interface/RUNTIME_ONBOARDING.md` (worked example: Mastra Code).

## Distinction from `protocol-adapter`

The word "interface" appears in two contexts:
- `interface/` (this directory) = the **runtime-to-loop contract** (what runtimes must provide to consume the loop).
- `tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js` = the **loop-to-tool-name I/O adapter** (normalizes hook stdin/stdout between Claude Code and Droid CLI).

These are different concepts. The runtime interface is about what runtimes must provide; the protocol adapter is about how the loop normalizes its own internal I/O.

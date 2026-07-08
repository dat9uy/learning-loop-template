# Runtime Interface — MCP-Transport Conformance + Onboarding

The transport-agnostic runtime participation contract lives at `docs/runtime-contract.md` (the concept: 4 capabilities a runtime must provide to participate, stated without reference to any transport). This directory is the **MCP-transport conformance validator + onboarding** — one of N transports. It is the third layer in the 3-layer architecture (see `AGENTS.md` §1.1, and `docs/architecture.md` for the full mechanism).

## Why it exists

Before this layer existed, the contract was implicit in code: the 4 hook shims in `.claude/coordination/hooks/` + 4 in `.factory/coordination/hooks/`, the MCP config in `.mcp.json` and `.factory/mcp.json`, the skill specs in `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md`. To add a new runtime, an implementer had to reverse-engineer the contract from the existing runtimes.

The `interface/` directory makes the MCP-transport contract explicit:
- **README.md** (this file) — what this directory IS and why it exists.
- **CONTRACT.md** — the MCP-transport conformance checklist (the 10 mechanism checks that prove the 4 concept capabilities are wired).
- **contract.js** — the validator. Run as `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`.
- **RUNTIME_ONBOARDING.md** — step-by-step guide for adding a new runtime on the MCP transport (worked example: Mastra Code).

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

## The 10 MCP-transport checks (at a glance)

The 4 transport-agnostic capabilities live in `docs/runtime-contract.md`; the 10 mechanism checks below are how the MCP transport proves them. See `CONTRACT.md` for full predicates and verification steps.

| ID | Capability | Pass criteria |
|----|-----------|---------------|
| `hook-shim-set` | Gate enforcement | 4 `.cjs` shims in `<surface>/coordination/hooks/` (N/A for declarative runtimes) |
| `mcp-client-config` | Capability surface | MCP config has `mcpServers.learning-loop` pointing at `mastra/server.js` |
| `skill-spec` | Capability surface | `skills/learning-loop/SKILL.md` references `loop_describe` AND `meta_state_list` |
| `identity-marker` | Identity + discoverability | `RUNTIME_ID`/`MASTRA_RESOURCE_ID` env set (advisory; never fails) |
| `settings-integration` | Gate enforcement | Settings file references all 4 universal-hook paths |
| `hook-declarative-config` | Gate enforcement | Declarative `hooks.json` has the 3 required events + valid commands (Mastra Code) |
| `settings-no-bypass` | Record routing | No `shellPassthrough`/`disableHooks`/`disableMcp` bypass enabled |
| `.mastracode-config-presence` | Identity + discoverability | `.mastracode/` has all 4 config files (Mastra Code) |
| `mastracode-session-start-pins-loop-surface` | Identity + discoverability | `mcp.json` sets `env.LOOP_SURFACE` on the learning-loop entry (Mastra Code) |
| `tools-manifest-has-path-fields` | Record routing | Every `tools/manifest.json` entry declares `pathFields: string[]` (all runtimes) |

## How to use this layer

- **Read the spec:** `interface/CONTRACT.md`.
- **Validate an existing runtime:** `node interface/contract.js claude-code` or `droid` or `mastra-code`.
- **Add a new runtime:** `interface/RUNTIME_ONBOARDING.md` (worked example: Mastra Code).

## Distinction from `protocol-adapter`

The word "interface" appears in two contexts:
- `interface/` (this directory) = the **runtime-to-loop contract** (what runtimes must provide to consume the loop).
- `tools/learning-loop-mastra/hooks/universal/lib/protocol-adapter.js` = the **loop-to-tool-name I/O adapter** (normalizes hook stdin/stdout between Claude Code and Droid CLI).

These are different concepts. The runtime interface is about what runtimes must provide; the protocol adapter is about how the loop normalizes its own internal I/O.

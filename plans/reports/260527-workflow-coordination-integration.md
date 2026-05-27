---
title: "Workflow Integration into Coordination System"
description: "Brainstorm report on whether and how to keep workflows.json within the coordination system, and what replaces it if removed"
date: "2026-05-27"
status: "approved"
scope: coordination-system, mcp, workflow
---

# Workflow Integration into Coordination System

## Problem Statement

`workflows.json` at `.claude/coordination/workflows.json` defines 4 file-change-triggered workflows that spawn CLI processes (`validate-records-cli.js`, `extract-index-cli.js`, `generate-capabilities-cli.js`). These are triggered via the `workflow_notify_artifact` MCP tool, which the agent must remember to call after every write.

Three problems:
1. **Paradigm mismatch** — `workflows.json` is procedural automation (when X, do Y) bolted onto a conversational agent system where the agent chooses tools intentionally.
2. **Surface asymmetry** — The runner hardcodes `.claude/coordination/workflows.json` and `.claude/coordination/workflow-log.jsonl`. Droid CLI has no equivalent registry.
3. **Agent burden** — The agent must remember to call `workflow_notify_artifact` after every file write, or validation never runs.

## Evaluated Approaches

### Approach A: Keep Status Quo

Keep `workflows.json`, `workflow-runner.js`, `workflow_notify_artifact`, and `workflow_trigger` as-is.

**Pros:**
- No migration cost
- Agent already knows to call `workflow_notify_artifact`

**Cons:**
- Droid CLI has no `workflows.json` — surface parity broken
- Paradigm mismatch deepens as MCP tools proliferate
- `workflow_notify_artifact` is an easy thing for agents to forget
- Red team already flagged 15 critical/high findings in the original plan (260521-0200-mcp-workflow-layer)

**Verdict:** Reject. The red team found command injection, stdio corruption, race conditions, and dead triggers.

### Approach B: Remove Workflows, Move to Pre-commit

Delete `workflows.json` and all workflow trigger tooling. Add a pre-commit hook that runs validators before every commit.

**Pros:**
- Validation runs automatically before every commit (no agent burden)
- No external system dependency — runs entirely within the repo
- Removes 2 MCP tools, `workflow-runner.js`, and `workflows.json`
- Cleaner MCP surface — only intentional tools remain

**Cons:**
- No development-time validation feedback (agent must run `pnpm validate:records` manually while coding)
- Loses the `workflow_trigger` tool for ad-hoc workflow execution
- Requires `husky` or similar pre-commit tooling installed

**Verdict:** Partial — pre-commit handles commit-time, but we still need a way for the agent to validate during development.

### Approach C: Remove Procedural Layer, Promote to Explicit MCP Sequences

Delete `workflows.json` and `workflow_notify_artifact`/`workflow_trigger`. The agent calls `index_validate`, `index_extract`, `capability_generate` directly when the skill/quickstart says so.

**Pros:**
- Pure MCP-native pattern — agent reads skill, calls tools intentionally
- No hidden automation, no surface parity problem
- Skill/quickstart already documents the chain: `index_validate` → `index_extract`
- Gate messages remind agent when validation is needed

**Cons:**
- Relies on agent reading skill documentation (but this is already true for preflight, record CRUD, etc.)
- No automatic background execution

**Verdict:** This is the correct long-term architecture for a conversational agent system.

### Approach D: Surface-Aware Registry (Recommended)

Replace `workflows.json` with a **surface-aware workflow registry** that lives in the MCP core (not a JSON file in `.claude/coordination/`). The registry defines trigger rules declaratively, but the **agent** is the executor — not a hidden spawn loop.

Key design:
- Registry moves to `tools/learning-loop-mcp/core/workflow-registry.js` — shared, surface-agnostic
- `workflow_notify_artifact` keeps its name but changes behavior: instead of spawning processes, it returns a list of MCP tools the agent should call next
- The agent decides whether to call `index_validate`, `index_extract`, etc.
- `workflow_trigger` is renamed to `workflow_run_validation` and becomes a convenience tool that calls the validation chain internally
- Gate messages and skill documentation reference the registry, telling the agent exactly which tools to call for which file types

**Pros:**
- Registry is centralized, surface-agnostic, testable
- Agent remains in control — no hidden automation
- Validation runs during development (agent calls tools explicitly)
- Easy to extend: add new trigger rules without touching coordination dirs
- Removes child process spawning entirely (no stdio corruption, no command injection)

**Cons:**
- Requires updating 2 MCP tools and deleting `workflow-runner.js`
- Agent must still remember to call `workflow_notify_artifact` (but it now returns actionable guidance instead of fire-and-forget spawns)

**Verdict:** Best of both worlds — keeps the coordination concept, removes the procedural anti-pattern.

## Final Recommended Solution

Implement **Approach D: Surface-Aware Registry** with the following changes:

### 1. Delete Procedural Runner
- `workflow-runner.js` → delete
- `tools/extract-index-cli.js`, `tools/validate-records-cli.js`, `tools/generate-capabilities-cli.js` → keep as standalone scripts for CI, but remove from workflow spawning

### 2. Create Workflow Registry Core
- `tools/learning-loop-mcp/core/workflow-registry.js` — declarative trigger-to-tool mapping:
  ```js
  export const WORKFLOW_REGISTRY = {
    "evidence-changed": {
      triggers: ["records/*/evidence/**"],
      change_types: ["created", "updated"],
      recommended_tools: ["index_extract", "index_validate"]
    },
    "observation-changed": {
      triggers: ["records/observations/**"],
      change_types: ["created", "updated"],
      recommended_tools: ["index_validate"]
    },
    "capability-changed": {
      triggers: ["records/*/capabilities/**"],
      change_types: ["created", "updated"],
      recommended_tools: ["index_validate", "capability_generate"]
    },
    "index-changed": {
      triggers: ["records/*/index/**"],
      change_types: ["created", "updated"],
      recommended_tools: ["index_validate"]
    }
  };
  ```

### 3. Refactor `workflow_notify_artifact`
- Keep tool name for backward compatibility
- Instead of spawning processes, evaluate triggers against registry and return:
  ```json
  {
    "logged": true,
    "matched_workflows": ["evidence-changed"],
    "recommended_next_tools": ["index_extract", "index_validate"],
    "reasoning": "Evidence file changed; index and validation recommended"
  }
  ```

### 4. Refactor `workflow_trigger`
- Rename to `workflow_run_validation` (or keep name but change behavior)
- Instead of spawning CLI scripts, call the corresponding MCP tools internally (or return the tool list and let agent call them)
- If calling internally: chain `index_validate` → `index_extract` as sequential MCP tool invocations

### 5. Add Pre-commit Hook (CI layer)
- Use `simple-git-hooks` (zero-dependency, 10.9KB) — config lives in `package.json`
- Pre-commit command: `pnpm validate:records && pnpm extract:index`
- One-time setup: `npx simple-git-hooks` (documented in README)
- See `plans/reports/260527-pre-commit-solution-research.md` for full comparison
- Rationale: The project is heavily plain-JS; `simple-git-hooks` is lighter than Husky (no `.husky/` dir) and avoids Python `pre-commit` overhead. Hand-written `core.hooksPath` was rejected due to extra manual setup friction.

### 6. Update Skill Documentation
- Update `coordination-gate` skill to mention: "After writing evidence files, call `workflow_notify_artifact` to get recommended next steps"
- Update `agent-manifest.json` — `workflow_notify_artifact` description should mention it returns recommendations, not spawns processes

### 7. Keep `workflow_notify_artifact`/`workflow_trigger` as Standalone MCP Tools — Do NOT Embed in Hooks
The workflow tools must remain standalone MCP tools invoked by the agent intentionally, not embedded into the PreToolUse gate layer (`write-gate.js`, `bash-gate.js`, `inbound-gate.js`).

**Rationale:**
- Hooks are synchronous decision points that return exit codes; they cannot chain async MCP tool calls.
- Embedding workflow evaluation into hooks would recreate the hidden procedural anti-pattern Approach D was designed to eliminate.
- The gate's role is path protection and advisory output; its job is not side-effect execution.
- The write gate MAY emit an advisory reminder (e.g., "After this write, call `workflow_notify_artifact` to get validation steps"), but it must never invoke the tool automatically.

**Guardrail:** If the write gate detects a `records/**` path, it allows the write but can append a soft warning to its JSON output reminding the agent to call `workflow_notify_artifact` afterward. The actual tool call remains the agent's explicit decision.

## Implementation Considerations

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Agent ignores recommended tools from `workflow_notify_artifact` | Medium | Skill documentation + gate messages reinforce the pattern; pre-commit catches missed validation at commit time |
| Registry eval fails silently | Low | `workflow_notify_artifact` always returns a result; empty `recommended_tools` is explicit |
| Backward compatibility — agents trained on old behavior | Low | Tool name unchanged; behavior change is from spawn to recommendation (safer, not breaking) |
| Removing `workflow-runner.js` breaks external scripts | Medium | No external scripts reference it; it's internal to MCP |
| Pre-commit not installed on contributor's machine | Low | Document setup in README; pre-commit is optional safety net, not mandatory gate |

### Touchpoints

| File | Action |
|---|---|
| `tools/learning-loop-mcp/workflow-runner.js` | Delete |
| `tools/learning-loop-mcp/tools/notify-artifact-tool.js` | Refactor — return recommendations instead of spawning |
| `tools/learning-loop-mcp/tools/trigger-workflow-tool.js` | Refactor — return/call MCP tools instead of spawning |
| `tools/learning-loop-mcp/core/workflow-registry.js` | Create — declarative registry |
| `tools/learning-loop-mcp/agent-manifest.json` | Update descriptions for `workflow_notify_artifact`, `workflow_trigger` |
| `.claude/coordination/workflows.json` | Delete |
| `.claude/coordination/workflow-log.jsonl` | Keep for audit trail (now logs recommendations, not spawn PIDs) |
| `package.json` | Add `simple-git-hooks` devDependency + `simple-git-hooks` config object |
| `README.md` | Document `npx simple-git-hooks` one-time setup step |
| `.factory/skills/coordination-gate/SKILL.md` | Update quickstart |
| `.claude/skills/coordination-gate/SKILL.md` | Update quickstart |

## Success Metrics

1. `workflow_notify_artifact` returns structured recommendations (no child process spawning)
2. Pre-commit hook validates records before every commit without agent involvement
3. No `.claude/coordination/workflows.json` dependency in any surface
4. Agent manifest updated with new tool descriptions
5. All 4 original workflows (evidence, observation, capability, index) still have equivalent coverage via explicit MCP tool chains

## Next Steps

1. `/ck:plan 260527-workflow-coordination-integration.md` — produce implementation plan with phases
2. `/ck:cook <plan>` — execute

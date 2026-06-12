# Research: Mastra-Based Runtime/Model-Agnostic Productization

> **⚠️ Status as of 2026-06-12 (operator-approved contract, refined by 2026-06-12 operator reframe):**
> This report was committed to main on 2026-06-11 (merge commit `56e4267`). The 2026-06-12 reframe **promotes** the §3.x decisions and §8 resolutions from "snapshot" to **operator-approved contract**. The §1-§2 background (current state, Mastra concepts) and §4 risks remain research/snapshot — descriptive, can be refined in place without operator sign-off. **What is contract as of 2026-06-12** (durable until a new operator decision is recorded in `meta-state.jsonl` as a `change-log` or `loop-design` entry):
> - §3.6 "What changes" — wire-format coercion is **reproduced**, not dropped (per F7 expansion; see below).
> - §3.7 — Storage Layer deferral (deferred to Mastra Phase 3).
> - §3.8 — Bridge 5/6 atomic meta-surface front, the engine/instance split, the Bridges 1-4 voiding, the 7-step implementation order (Step 0 → Step 7).
> - §3.10 — Meta-surface is the only bound surface; Q8 reopened as Option D (re-debate from meta-surface); the ~36/~20 tool-surface split.
> - §3.9 — Hook layer interaction; runtime hooks stay at the runtime layer in Mode 1; consult-gate re-implementation in Mastra tool `execute` in Phase 1.
> - §8 Q1–Q7 — Mastra Code as the final runtime target; model selection is session-level; Apache-2.0 license; LibSQL memory default; Mode 1 peer-MCP integration; `MastraServer` HTTP out of scope.
> - **What is not contract** (still research/snapshot, can be refined in place without operator sign-off):
> - §1 current state; §2 Mastra concepts (descriptive, can be wrong if upstream changes); §4 risks and mitigations.
>
> The 2026-06-11 "during the same session" caveat about `2315341 feat(mcp-tools): patch validateToolInput for top-level array/boolean wire-format coercion` **understated** the impact: as of 2026-06-12 verification, `coerceParamsToSchema` and `installWireFormatCoercion` in `tools/learning-loop-mcp/tool-registry.js` are **in production with full test coverage** at `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-coercion-fix.test.js`. They are **load-bearing** for stdio clients that pass JSON-string arrays, booleans, and numbers at the top level of tool arguments. The original Q3 framing ("drop the coercion in Phase 1, gated on Phase 0 parity test") is no longer accurate: Phase 1 of the Mastra migration must **reproduce the upstream behavior in Mastra's `createTool` input validation**, not just delete the helpers. Deleting them without reproduction is a regression for stdio clients. (Q3 was RESOLVED 2026-06-11, REVISED 2026-06-12 — see §8.)
>
> **What the operator is doing (2026-06-12):** applying a from-scratch reframe that collapses Bridge 5 and Bridge 6 into one atomic front called the **meta-surface**. All Bridge 1-4 work is deferred and unbound; the product surface is re-debated from the meta-surface. This reframe is reflected in:
> - `AGENTS.md` (full rewrite, 2026-06-12; previous at `AGENTS.old.260612-1300.md`)
> - `docs/trajectory.md` (full rewrite, 2026-06-12; previous at `docs/trajectory.old.260612-1300.md`)
> - `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` (status: VOIDED BY RE-DEBATE, 2026-06-12)
> - `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` (status: VOIDED BY RE-DEBATE, 2026-06-12)
> - `plans/reports/consistency-260612-1300-mastra-research-report.md` (the 9-finding consistency check that produced the reframe; the operational source of truth)
>
> **What the next agent should do, before starting Phase 0:**
> 1. **Read `meta-state.jsonl`** (last 50 lines, or filter `entry_kind` via `meta_state_list`) for any new operator-side resolutions that supersede the contract decisions captured here. Contract supersession requires a `change-log` or `loop-design` entry.
> 2. **Re-verify the locked implementation order (§3.8.1 step 0 → step 7, plus §3.10's "What does NOT change" list)** against `main`'s current state. The 2026-06-12 reframe added Step 0 ("Re-debate product-surface schemas using the meta-surface as substrate") and Step 7 ("Bridge 7 question, post-meta-surface") to the implementation order; the rest of the order is preserved from §3.8.1.
> 3. **Re-verify Q3 in light of the live wire-format coercion helpers.** Phase 1 of the Mastra migration must reproduce `coerceParamsToSchema` + `installWireFormatCoercion` behavior in Mastra's `createTool` input validation. A Phase 0 byte-for-byte parity test against the existing 985-test suite (verified 2026-06-12 via `pnpm test`: 984 pass, 1 skipped, 147 suites) is the gate. The helpers are in `tools/learning-loop-mcp/tool-registry.js` lines 77-134 (`coerceParamsToSchema`) and 197-235 (`installWireFormatCoercion`); the wire-format tests are at `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-coercion-fix.test.js`.
> 4. **Refine §1-§2 and §4 in place** without operator sign-off (these are research/snapshot, not contract). **Do not refine §3.x or §8 in place** without first recording a `change-log` or `loop-design` entry in `meta-state.jsonl` that supersedes the prior contract.
> 5. **If the live helpers' behavior cannot be reproduced in Mastra**, the Q3 §8 resolution is the most likely contract to revisit. A new `change-log` entry documenting the failure mode is the precondition for any §3.x or §8 in-place refinement.

**Type:** research
**Date:** 2026-06-11 (committed); 2026-06-12 (refined by operator reframe)
**Slug:** mastra-runtime-model-agnostic-productization
**Work context:** learning-loop-template
**Aligned to:** the meta-surface (Bridge 5+6 atomic front) per `AGENTS.md` §10 and `docs/trajectory.md` §4. The 2026-06-11 alignment ("Bridge 6 (self-model as product) per `docs/trajectory.md`") is superseded; the 2026-06-12 reframe unifies Bridge 5 and Bridge 6.

## TL;DR

The current `learning-loop-mcp` is **already runtime-agnostic at the MCP transport layer** (Droid CLI connects via stdio to the same server). The runtime-coupling the user perceives is at the *agent-loop coupling* level — the agent that runs the loop must know which MCP server to call, but it doesn't know the underlying runtime.

The main target is **Droid + Mastra Code** (per operator clarification 2026-06-11). **Mastra Code is the official Mastra product for coding agent runtime** — a TUI-based reference application at `https://github.com/mastra-ai/mastra/tree/main/mastracode`, installable as `npm install -g mastracode` / `npx mastracode`, built on top of the Mastra framework, and embeddable programmatically via `createMastraCode({...})`. The end-state vision is that the agentic coding workflow *and* the learning loop are both built on Mastra: the learning loop ships as a Mastra app (exposing tools/agents/workflows via `MCPServer`), and the runtime is either Droid (today) or Mastra Code (final Mastra-fy of the whole agentic coding setup + learning loop).

Mastra gives us a higher-level framework (Agent / Tool / Workflow / MCPServer) that:

1. **Keeps the runtime-agnostic claim intact** — `MCPServer` exposes the same stdio/HTTP/SSE transports, so Droid (today) and Mastra Code (final target) can both connect to the same learning-loop server.
2. **Promotes the loop's own workflows to first-class objects** — `createWorkflow()` with `.then()/.commit()/.suspend()/.resume()` is more powerful than the current `workflow_*` MCP tools (which are one-shot planning calls, not state machines).
3. **Aligns the loop with Mastra Code's architecture** — Mastra Code is a TUI + Harness + Mastra Agent + LibSQL storage. The learning loop, once Mastrafy'd, can be embedded into Mastra Code via `createMastraCode({...})` with its tools/agents/workflows registered as part of the same Mastra instance. The loop and the coding workflow share primitives, storage, and memory.
4. **Maps cleanly onto Bridge 6's destination** — the loop's self-model (meta-state registry) becomes the substrate an Agent reasons about; the operator stops caring which runtime calls the loop.

**Model-agnosticism is a weaker concern** than runtime-agnosticism for this user (per operator clarification 2026-06-11). Droid already configures the model per-session via `/model`; the loop does not need to police which model is in use. The Mastra router's `"provider/model-name"` format is a free bonus, not a primary driver. (Mastra Code's own multi-model support is part of the same picture: Claude, GPT, Gemini, plus custom OpenAI-compatible providers.)

Recommended phasing: **coexistence → mastrafy-deterministic-tools → mastrafy-workflows → new-agents-on-top → embed-in-Mastra-Code**. Stop short of ripping out the existing server until the parallel Mastra server has full test parity and the operator has decided which surface is canonical.

## 1. Current State

### 1.1 What "runtime-agnostic" actually means today

The current setup is already runtime-agnostic at the IPC level:

```jsonc
// .mcp.json  (Claude Code)
{ "mcpServers": { "learning-loop-mcp": { "command": "node", "args": ["tools/learning-loop-mcp/server.js"] } } }
// .factory/mcp.json  (Droid CLI) — identical shape
```

Both surfaces spawn the same `server.js` over stdio. The `McpServer` from `@modelcontextprotocol/sdk@1.29.0` is the same SDK used by any MCP-compatible client. The end-state target is **Droid (today) + Mastra Code (final Mastra-fy of the whole agentic coding setup + learning loop)** — both connect to the same MCP server.

**Mastra Code** (`https://github.com/mastra-ai/mastra/tree/main/mastracode`, npm `mastracode`) is the **official Mastra product for coding agent runtime** — a TUI-based reference application built on top of the Mastra framework, embeddable programmatically via `createMastraCode({...})`. Its 4-layer architecture is TUI → Harness → Mastra Agent → LibSQL storage. The final Mastra-fy of the agentic coding setup is to use Mastra Code (or a Mastra-Code-embedded harness) as the runtime, with the learning loop registered as part of the same Mastra instance.

"Pi" (`https://github.com/earendil-works/pi`) was mentioned as a placeholder in the user's original prompt; it is not a concrete integration target. The runtime-agnostic claim is forward-looking: as long as the client speaks MCP, it works. **Mastra Code is the real target** — it is itself an MCP-compatible client and shares primitives (Agent, Tool, Workflow, Memory) with the learning loop.

**What is NOT runtime-agnostic today:**

- The agent's *prompts and skill manifest* (`.factory/skills/**` vs `.claude/skills/**`) are duplicated per surface; the agent's prompt engineering assumes a specific Claude/Droid tool vocabulary (`Edit` vs `Create`, `Bash` vs `Execute`).
- The hook matrix (`.claude/coordination/**` vs `.factory/coordination/**`) is mirrored but the runtime hook surface differs.
- The agentic-coding workflow itself is hand-rolled and tightly coupled to the outer agent's tool grammar. This is the gap **Mastra Code** is meant to close: it is itself a Mastra-native coding agent with its own tool layer (view / edit / bash / goals / plan persistence / observational memory) and it can register the learning loop's tools/agents/workflows into the same `Mastra` instance via `createMastraCode({...})`.
- Some MCP-tool logic implicitly assumes the calling agent is a particular Claude/Droid class (e.g., `meta_state_relationships` was originally written to traverse fields Claude agents tend to ask about).

### 1.2 What "model-agnostic" currently means

There is **no model coupling at the MCP server level** — the server does no LLM work. Model coupling lives entirely in the agent runtime, where the agent picks a single model per session (Droid configures this via `/model` at session start; Mastra Code exposes per-prompt model switching plus OAuth login for Anthropic and OpenAI).

**Model selection is a session-level concern, not a loop-level concern.** The operator picks the model once at the start of a Droid session; the loop's tools do not need to know or care which model is in use. This is a *weaker* claim than "the loop itself is model-agnostic" — it is "the loop is model-agnostic because it does not invoke models itself."

Mastra would add a *stronger* claim: the loop could host its own agents (`Agent` class) that themselves are model-agnostic via the model router:

```ts
new Agent({ model: "anthropic/claude-sonnet-4-6" })  // or any "provider/model"
```

For the current scope (Droid + Mastra Code), this is a **free bonus, not a primary driver**. The migration does not need to optimize for per-deployment model flips; the model's per-session choice in the outer agent is enough. (Mastra Code's own multi-provider support — Claude / GPT / Gemini / custom OpenAI-compatible — is the runtime-side analog of the same model-agnostic property.)

### 1.3 Inventory of current MCP tools (56 tools per `agent-manifest.json`, 59 tool files on disk, 8 groups)

Per `tools/learning-loop-mcp/agent-manifest.json` (canonical tool list, verified 2026-06-12). The `introspection` group has 2 tools (`loop_describe` + `loop_get_instruction`), not 1 — the 52 number in earlier reports predates the `260611-1700-loop-get-instruction` plan that added the second introspection tool.

| Group | Count | Shape | LLM-decision-driven? |
|---|---|---|---|
| `gate` | 2 | constraint check + preflight marker | no |
| `record_crud` | 9 | create/update decision / experiment / risk / observation | no |
| `workflow` | 15 | intake, classify, prepare, convert, verify, generate prompt, external decision, self-improvement, intentional skip, report phase, product build, runtime probe, notify, trigger | **yes — most of these** |
| `index` | 5 | validate, extract, search, update claim, validate plans | no |
| `budget` | 1 | check resource budget | no |
| `capability` | 3 | generate, list probes, list verified | no |
| `meta_state` | 16 | report, list, ack, resolve, promote-rule, sweep, log-change, patch, derive, check-grounding, refresh-fingerprint, refresh-tools, query-drift, batch, archive, relationship-validate | mostly no (algorithmic), `self_improvement` is LLM-driven |
| `introspection` | 2 | `loop_describe`, `loop_get_instruction` | no |

**Key split:** ~70% of tools are deterministic CRUD/queries; ~30% are LLM-decision-driven (intake, classify, prepare, convert, generate prompt, self-improvement, product build, runtime probe).

## 2. Mastra Concepts (verified from official docs, 2026-06-11)

Verified against `https://mastra.ai/reference/tools/mcp-server`, `/reference/tools/create-tool`, `/reference/agents/agent`, `/reference/workflows/workflow`, `/reference/tools/mcp-client`, `/docs/mcp/overview`, `/guides/migrations/upgrade-to-v1/mcp`, `/guides/guide/publishing-mcp-server`.

### 2.1 `createTool()` — the deterministic unit

```ts
createTool({
  id, description,
  inputSchema, outputSchema,            // Standard JSON Schema (Zod, Valibot, ArkType)
  execute: async (input, context) => output,
  // optional: mcp.annotations, suspend/resume, requestContext, hooks
})
```

Maps 1-to-1 onto most current `meta_state_*`, `record_*`, `gate_*`, `index_*`, `budget_*`, `capability_*` tools.

### 2.2 `Agent` — the LLM-decision unit

```ts
new Agent({
  id, name,
  instructions,                        // system prompt
  model: "provider/model-name",        // ← model-agnostic at this layer
  tools: { ... },                      // map of createTool() results
  memory,                              // optional, requires storage
  hooks: { beforeToolCall, afterToolCall },
})
```

`instructions` can be a string, array, or function of `requestContext` — the latter enables context-aware prompts without forking the agent.

Mastra's `MCPServer` auto-converts agents to MCP tools named `ask_<agentKey>`. The MCP client sees a single tool whose description embeds the agent's instructions, and whose input is `{ message: string }`.

### 2.3 `createWorkflow()` — the multi-step state machine

```ts
const wf = createWorkflow({
  id, inputSchema, outputSchema, stateSchema?,
}).then(step1).then(step2).commit()

const run = await wf.createRun()
const result = await run.start({ inputData, initialState })
```

Key capabilities not present in the current `workflow_*` tools:

- `stateSchema` + `setState`/`state` — cross-step state without re-prompting.
- `suspend` / `resume` — long-running workflows that pause for operator input.
- `branch` / `parallel` — conditional + concurrent execution.
- `onFinish` / `onError` callbacks — uniform result handling.
- `schedule` — cron-driven workflow (out of scope for the loop, but available).
- Workflows are themselves MCP tools: `run_<workflowKey>` with `inputSchema` derived from the workflow's `inputSchema`.

### 2.4 `MCPServer` — the exposure layer

```ts
new MCPServer({
  id, name, version, description?, instructions?,
  tools, agents, workflows,             // ← the three primitives, mixed
  mapAuthInfoToUser?, fga?,            // optional auth/FGA
  repository?, releaseDate?, isLatest?, packageCanonical?, packages?, remotes?,
  resources?, prompts?, appResources?, // optional MCP resources/prompts/apps
})
// + startStdio() / startSSE() / startHTTP() / close()
```

**One MCPServer can hold all three primitives simultaneously.** This is the central win for our productization: a single Mastra app exposes our tools, our workflows, AND our agents over the same MCP surface.

### 2.5 Transport matrix

| Transport | Use case | Mastra method | Our fit |
|---|---|---|---|
| stdio | in-process, single-client | `startStdio()` | drop-in for Claude/Droid today |
| HTTP (streamable) | remote, multi-client, resumable sessions | `startHTTP({ httpPath: '/mcp', ... })` | future product hosting |
| SSE | remote, legacy clients | `startSSE({ ssePath, messagePath, ... })` | migration path for older clients |
| serverless | edge functions, stateless | `startHTTP({ serverless: true })` | Vercel/Cloudflare deploys (no current need) |

**A Mastra app can offer all four at once** by mounting multiple `start*` handlers on the same HTTP server. The loop can stay on stdio (no change for Claude/Droid) and *also* serve `/mcp` over HTTP for any web/MCP client that wants to call it.

### 2.6 Model router — the model-agnostic claim

Verified signature: `model: "provider/model-name"`. The router resolves the provider key + model id at call time. No code change to swap providers. The agent's `instructions`, `tools`, `memory`, and `hooks` are unaffected.

The current `@modelcontextprotocol/sdk` server has *no* concept of model — model-agnosticism there means "the server doesn't care what model the caller uses." Mastra extends that to "the server can host agents that themselves are model-agnostic."

## 3. Mapping & Migration Strategy

### 3.1 The split — what goes where

| Current shape | Mastra primitive | Why |
|---|---|---|
| `record_*`, `gate_*`, `index_*`, `budget_*`, `capability_*`, `meta_state_*` (algorithmic) | `createTool()` | pure functions, no LLM |
| `workflow_intake_orient`, `workflow_intake_plan`, `workflow_classify_prompt`, `workflow_verify_evidence`, `workflow_convert_evidence` | **Workflow** | multi-step state machines with branching |
| `workflow_product_build`, `workflow_self_improvement`, `workflow_runtime_probe` | **Agent** + **Workflow** combo | open-ended LLM decisions interleaved with tool calls |
| `workflow_prepare_runtime_request`, `workflow_generate_prompt`, `workflow_external_decision`, `workflow_intentional_skip`, `workflow_report_phase_status` | **Tool** (deterministic) + **Agent** (uses it) | templating/logic, not state |
| `loop_describe` | **Tool** (deterministic, tiered reads) | algorithmic; returns the full `discoverability_hints` block at one of 4 tiers (`summary`/`hot`/`warm`/`cold`) |
| `loop_get_instruction` | **Tool** (deterministic, key-indexed) | algorithmic; on-demand lookup of a single hint from the same `discoverability_hints` block by named slug, 0-based index, or array of either. Composes with `loop_describe`: warm/hot hints surface at start; `loop_get_instruction` is for when they scroll out of context or when cross-referencing and the agent is unsure which canonical pattern applies. Backed by `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js`; consumes `buildDiscoverabilityHints()` from `core/loop-introspect.js`. Added in plan `260611-1700-loop-get-instruction`. |
| `workflow_notify_artifact`, `workflow_trigger` | **Tool** (writes to registry) | algorithmic; could become event-driven via a workflow `onFinish` |

The "agent" tier is *new capability* — today, LLM decisions are made by the *outer* agent (Claude/Droid), not by tools inside the loop. With Mastra, we can host LLM decisions *inside* the loop, which is a structural shift: the loop stops being a passive tool server and becomes an active reasoning engine about its own state.

### 3.2 The runtime-agnostic claim is preserved (or strengthened)

After migration, the runtime surface is:

```
┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐
│ Claude Code  │  │ Droid CLI        │  │ Mastra Code (final)    │
│              │  │ (today's primary)│  │ = TUI + Harness +      │
│              │  │                  │  │   Mastra Agent +       │
│              │  │                  │  │   LibSQL storage       │
└──────┬───────┘  └──────┬───────────┘  └──────────┬─────────────┘
       │ MCP (stdio)     │ MCP (stdio)             │ createMastraCode({...})
       │                 │                         │   (loop tools/agents/
       │                 │                         │    workflows registered
       │                 │                         │    into the same Mastra
       │                 │                         │    instance)
       └─────────────────┴─────────────────────────┘
                                │
                  ┌─────────────▼──────────────┐
                  │ Mastra MCPServer           │
                  │   tools: { ... }           │  ← productized loop
                  │   agents: { ... }          │
                  │   workflows: { ... }       │
                  └────────────────────────────┘
```

Runtime-agnostic at the MCP transport layer (today: ✅ for Droid/Claude; after: ✅ for Droid/Claude/Mastra Code). The agent prompts inside Mastra are decoupled from the calling agent's vocabulary — Mastra's agents don't care whether their caller is Droid, Claude, or Mastra Code.

**The Mastra Code path is structurally different from the Droid/Claude path.** Droid and Claude are *external* MCP clients; they call the loop over stdio. Mastra Code is *itself* a Mastra app — the loop and the coding workflow can be **embedded** into a single `Mastra` instance via `createMastraCode({...})`, sharing storage (LibSQL), memory (Observational Memory), and agent engine. In this mode, the "MCP transport" is effectively bypassed — both halves run inside the same process and call each other as native Mastra tools/agents.

### 3.3 The model-agnostic claim is strengthened

Today: "the server doesn't care which model the caller uses." This is a weak claim — the *calling* agent is locked to a model family by its runtime.

After: the loop can host *its own* agents whose model is set per-deployment:

```ts
// dev: cheap model
new Agent({ model: "google/gemini-2.5-flash", ... })
// prod: stronger model
new Agent({ model: "anthropic/claude-sonnet-4-6", ... })
```

Both use the same tools, the same instructions, the same memory. Swap the model string. The loop's behavior changes (smarter vs cheaper) but its structure doesn't.

### 3.4 Phasing

> **Scope (per §3.10):** all phases are **meta-surface only**. Product-surface tools and workflows are paused. The plan's effective tool surface shrinks from 52 to ~38 (per §3.10's table).

**Phase 0 — Coexistence (no migration, add Mastra as a peer).**
- Add `@mastra/core` + `@mastra/mcp` as dependencies (kept separate package, e.g. `tools/learning-loop-mastra/`).
- Build a parallel `MCPServer` that registers a *subset* of meta-surface tools via `createTool()` — start with the deterministic ones (`gate_check`, `record_*`, `meta_state_*` algorithmic).
- Run it on a different port/path or as a separate `command` entry in `.mcp.json`.
- Verify a Droid session can call either server. Compare outputs byte-for-byte on the meta-surface subset.

**Phase 1 — Mastrafy the deterministic tools.**
- Wrap each deterministic tool as a `createTool()` invocation.
- Replace the `@modelcontextprotocol/sdk` `McpServer` for that subset with `MCPServer`.
- Keep the rest on the existing server. Two servers during the transition.
- Acceptance: the 47 deterministic tools run through Mastra with no behavioral change.

**Phase 2 — Promote the workflow tools to Mastra Workflows.**
- Convert `workflow_intake_orient → intake_plan` into a `createWorkflow` with steps.
- The state machine replaces the per-call re-orientation that today requires the agent to remember prior state.
- `stateSchema` carries the orientation context across steps.
- `suspend`/`resume` enables operator checkpoints without spinning up a new agent turn.

**Phase 3 — Add agents (the new capability).**
- `intakeAgent` — uses the `intake_orient` + `intake_plan` tools to do its own intake, instead of forcing the outer agent to call them.
- `scoutAgent` — moves the existing `tools/learning-loop-mcp/scout/**` into a proper agent with memory.
- `selfImprovementAgent` — uses the `self_improvement` tool, plus `meta_state_*` tools, to propose loop changes.
- `productBuildAgent` — uses `workflow_product_build` as a tool, plus records/observations, to drive the build pipeline.
- These agents become MCP tools themselves (`ask_intake_agent`, etc.) — Droid can call them or skip them.

**Phase 4 — Cut over (deferred decision).**
- Replace the existing `learning-loop-mcp` server with the Mastra-based one.
- Mark the old server `legacy` for one release.
- Update `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` to point at the new tool surface.
- Update `agent-manifest.json` to the new group names.

**Phase 5 — Embed in Mastra Code (long-term, post-Phase 4).**
- **Mastra Code** (`https://github.com/mastra-ai/mastra/tree/main/mastracode`, npm `mastracode`) is the **official Mastra product for coding agent runtime** — a TUI-based reference application built on top of the Mastra framework. It exposes `createMastraCode({...})` for programmatic embedding.
- **Phase 5 ships Mode 1 (peer MCP servers)** per operator decision 2026-06-11 (Q6 resolved in §8). Mastra Code runs the coding workflow's `MCPServer`; the learning loop runs its own `MCPServer`; they talk via MCP. Same shape as today, both Mastra-based. Reversible; the loop can be deployed independently.
- **Mode 2 (same Mastra instance via `createMastraCode({...})`)** is deferred. It would collapse the MCP boundary to in-process calls, share LibSQL storage and Observational Memory, and structurally couple the loop and the coding workflow. Mode 2 is a follow-up only if the operator's vision requires single-app coupling.

Each phase is independently shippable. Phases 0–2 are pure refactors (no behavior change). Phases 3–5 are capability additions and require a new plan with separate review.

### 3.5 What does NOT change

- **The records model.** `records/<surface>/{decisions,experiments,risks}.yaml` and `records/observations/*.yaml` remain the source of truth. Mastra hosts the *access patterns*; it doesn't own the storage.
- **The gate logic.** The constraint patterns in `core/patterns.json` and the staleness check in `core/inbound-state.js` are runtime-agnostic by construction. They move into the Mastra tools unchanged.
- **The hooks.** `.claude/coordination/**` and `.factory/coordination/**` are still needed — they intercept tool calls *before* they reach MCP. Mastra doesn't replace the gate; it consumes the gate's decisions.
- **The meta-state registry.** `meta-state.jsonl` is the Bridge 6 product. Mastra hosts the `meta_state_*` tools; it doesn't replace the registry.
- **The MCP transport.** We still speak MCP to Claude/Droid. We just host the server differently.

### 3.6 What changes

- **Tool registration moves from `McpServer.tool()` to `MCPServer({ tools: { ... } })`.** Same wire format. Different in-process registration.
- **Wire format coercion logic is reproduced in Phase 1, not dropped** (per Q3 resolution in §8, revised 2026-06-12). Today, `tool-registry.js#coerceParamsToSchema` does JSON-string-to-array/bool/number coercion and `installWireFormatCoercion` patches `McpServer#validateToolInput`. Both helpers are in production with full test coverage. Mastra's `createTool` validates inputs via Zod natively, but it does not replicate the JSON-string-to-typed-value coercion — that behavior is load-bearing for stdio clients. The Phase 0 byte-for-byte parity test is the gate: if the existing **985 tests** (verified 2026-06-12 via `pnpm test`; 984 pass, 1 skipped, 147 suites, ~9s duration) pass against the Mastra server with the coercion reproduced, the behavior is preserved. If they fail, surface the diffs and decide case-by-case. See F6 of the consistency report for the per-glob breakdown.
- **`{item: X}` unwrap logic is dropped in Phase 1** alongside the coercion. If Mastra's `createTool` accepts the same envelopes, the `unwrapItemWrap` helper can be deleted; if not, Phase 0 surfaces the diff.
- **One MCP server becomes two surfaces under one Mastra app:** tools (procedural), agents (LLM-driven), workflows (multi-step). Each is registered on the same `MCPServer`.
- **Model selection becomes a per-deployment env var.** `MASTRA_AGENT_MODEL=anthropic/claude-sonnet-4-6` (or whatever) flips the model for all agents. Today, the model is implicitly the outer agent's model.
- **The product-surface registry is paused** (per §3.10). The new `MCPServer` exposes only the meta-surface tools (~38 of 52). The ~14 product-surface tools (capability_generate, product-surface index_update_claim, vendor-doc-assist, runtime-probe, product-build, etc.) are not registered. The legacy `records/<vendor>/` directories are archived, not deleted.

### 3.7 Storage Layer sequencing decision (deferral)

`AGENTS.md` § "The Storage Layer Trajectory (Approach A → SQLite)" describes a pending migration of the meta-state registry from JSONL to SQLite. The pre-conditions for un-parking it are: registry > 2x current size (~1000 entries), inverse-index > 50ms, drift query > 200ms. None have fired (current: ~500 entries, inverse-index <1ms).

**The operator's concern (2026-06-11):** if we build the Storage Layer first and migrate to Mastra afterwards, we may reinvent the wheel — both would use SQLite, both would need schema management, both would need read/write paths with cache invalidation.

**Decision (2026-06-11): defer the Storage Layer. Do not ship it as a standalone plan. Fold it into the Mastra migration at Phase 3.**

Reasoning:

- **Both migrations want SQLite.** The Storage Layer targets `better-sqlite3`. Mastra's storage config supports LibSQL (which is SQLite). Picking the same engine for both eliminates the duplicated plumbing.
- **Mastra's storage can subsume the meta-state registry.** Mastra's `storage` config can host structured data; the meta-state entries/refs/fingerprints map onto Mastra's storage primitives. The Storage Layer migration becomes a "map meta-state onto Mastra storage" sub-step, not a separate project.
- **The LRU fix already gives 50x headroom on the cold path.** `plans/260608-2255-index-extractor-optimization` shipped a structural fix that drops the cold tier from 250ms to <10ms. At 1000, 2000, 5000 entries the LRU-cached path stays <10ms. The Storage Layer's main value is *durability* (write-ahead log, atomicity) and *query expressivity* (SQL joins), not raw read speed.
- **Phase 3 is when storage becomes necessary anyway.** The Mastra migration's Phase 3 adds agents that need memory (Observational Memory, conversation history). At that point, a storage backend is mandatory. The meta-state storage decision can be made alongside it.

**Sequencing decision rule (operator-stated, easy to revise):**

> **Storage Layer ships iff (a) the LRU fix doesn't hold AND (b) the Mastra migration is blocked on it. Otherwise, it lives inside the Mastra migration as a sub-step.**

**Where this prediction is wrong — three failure modes:**

1. **Mastra's storage doesn't fit the meta-state shape cleanly.** Mastra's `storage` is optimized for conversation history (threads, messages, resources), not flat key-value registries with rich cross-references. If the mapping is awkward, the Storage Layer migration becomes a necessary interim fix. *Test: prototype the mapping at Phase 0/1 before committing to deferral.*
2. **The LRU fix doesn't hold at production scale.** If the cold tier degrades faster than predicted, the Storage Layer migration may be needed as a Bridge 6 deliverable independent of Mastra. *Test: monitor the cold tier at 1000, 2000, 5000 entries; trip the pre-conditions before deferring.*
3. **The operator wants the Storage Layer as a Bridge 6 product deliverable.** The trajectory doc frames meta-state as the product; a more robust storage layer is on-mission for Bridge 6 even without Mastra. *Test: confirm with operator whether Storage Layer is a Bridge 6 deliverable or a perf optimization. (Confirmed 2026-06-11: defer; not a Bridge 6 deliverable in its own right.)*

**Concrete plan (post-deferral):**

1. Storage Layer stays parked. No new work.
2. At Phase 3 of the Mastra migration (when agents need memory), pick LibSQL as the Mastra storage backend.
3. At that point, decide: same SQLite file as Mastra's memory, or separate file, same engine. **Likely separate file, same engine** — schemas are unrelated (meta-state = entries/refs/fingerprints; Mastra memory = threads/messages/observations).
4. The dual-write window (per trajectory doc) collapses to a single Mastra-side concern.

**Not captured as a meta-state finding** (per operator decision 2026-06-11). The decision lives in this research report only; can be promoted to a `meta_state_propose_design` or `meta_state_report` later if reaffirmed.

### 3.8 Bridge 5 (Approach 3) sequencing decision — meta-surface only, atomic with Bridge 6

> **Operator reframe, 2026-06-12:** Bridge 5 and Bridge 6 are one atomic front called the **meta-surface**. The Bridge 5 codegen engine ships first, **but its only validated output target is `meta-state.jsonl`**. Product-surface schemas (`capability`, `index-entry`, `claim`, `resource-budget`, plus any future product shape) are **unbound**: the engine *can* generate them, but no product records are generated, validated, or migrated against the current product registry. The product surface is **re-debated and re-validated by the meta-surface** once the meta-surface exists. All Bridge 1-4 work is **deferred** until the meta-surface ships; existing "shipped" or "design approved" claims in Bridge 1-4 reports are **structurally voided** because the product surface they were building toward is being redesigned.

**Status check (2026-06-12):** Bridge 5 is *partially* shipped. Per `AGENTS.md` § "What Has Happened Since (2026-06-05 update)":
- **Approach 2** (tool zod generated from JSON Schema via `core/schema-to-zod.js`) — **SHIPPED** for 4 record types (experiment, risk, decision, observation)
- **Approach 3** (full codegen for writers + validators) — **pending**, scoped to meta-surface only. Product-surface binding is not in scope.

The Bridges table in `AGENTS.md` § "The Six Bridges" inconsistently lists Bridge 5 as "Not shipped" — that table pre-dates the 2026-06-05 update. Approach 3 is the remaining work, scoped to the meta-surface (4 entry kinds in `meta-state.jsonl`).

#### 3.8.1 Engine vs Instance (the inversion)

The 2026-06-11 framing was "Bridge 5 produces writers/validators for 4 record types; the per-surface instances are paused." The 2026-06-12 operator reframe splits this further:

- **Engine** (what Bridge 5 produces): a schema-to-code generator that takes any JSON Schema and emits writers + validators. The engine is provable against the meta-surface because the meta-surface is small (4 entry kinds), stable (locked since SP3 shipped 2026-06-05), and self-owned (the loop is its own designer).
- **Instance** (what the engine generates): only the meta-surface — `finding`, `change-log`, `rule`, `loop-design` entries in `meta-state.jsonl`. Product-surface schemas are **not bound** to real records. The engine has the *ability* to generate them, but the *decision* to bind is deferred until the meta-surface exists and can re-debate the product surface.

This eliminates the 11 drift cells by construction: there is no product instance to drift against.

**Quantitative impact (meta-surface only):**

| Meta-surface record type | Hand-written files (today) | After Bridge 5 + Mastra (in order) |
|---|---|---|
| `finding` (meta-state) | 0 (lives only in `meta-state.jsonl`) | 0 + 1 Mastra wrapper = 1 |
| `change-log` (meta-state) | 0 (lives only in `meta-state.jsonl`) | 0 + 1 Mastra wrapper = 1 |
| `rule` (meta-state) | 0 (lives only in `meta-state.jsonl`) | 0 + 1 Mastra wrapper = 1 |
| `loop-design` (meta-state) | 0 (lives only in `meta-state.jsonl`) | 0 + 1 Mastra wrapper = 1 |
| **Meta-surface total** | **0** | **0 + 4 Mastra wrappers = 4** |

**Product-surface record types (capability, index-entry, claim, resource-budget, observation, ...):** not counted. They are unbound. The Bridge 5 engine has the ability to generate them, but no instance is in scope.

**Decision (2026-06-12): ship Bridge 5 Approach 3 BEFORE the Mastra migration starts, scoped to the meta-surface only. The Mastra migration's Phase 0/1 consumes the meta-surface output.**

Reasoning:

- **Mastra's `createTool({ inputSchema, outputSchema })` accepts Standard JSON Schema** (Zod, Valibot, ArkType, or any library implementing the spec). The current `core/schema-to-zod.js` already converts JSON Schema to Zod at runtime. **Bridge 5 Approach 3's output is exactly what Mastra's `createTool` consumes.** No translation layer is needed.
- **The hand-maintenance problem the trajectory doc names is 4 parallel field catalogues per record type today (JSON schema, tool zod, writer output, validator paths).** Shipping Mastra Phase 1 *before* Bridge 5 Approach 3 adds a **5th catalogue** — the Mastra tool's `inputSchema`/`outputSchema`. By scoping Bridge 5 to the meta-surface only, we avoid growing the catalogue for product-surface types.
- **Mastra migration Phase 1 shrinks dramatically** with Bridge 5 done first for the meta-surface. Each meta-surface Mastra tool becomes a thin wrapper that pulls the Zod from `buildZodFor('<meta-state-kind>')`. No per-tool zod is hand-written for the meta-surface.
- **Bridge 5 is independent of storage backend.** Approach 3 generates TypeScript code from JSON Schema; it doesn't care whether the registry lives in JSONL or SQLite. The two are orthogonal. Storage Layer stays deferred to Mastra Phase 3 (per §3.7).
- **The dependency that does matter is SP3 schema stability.** Approach 3 needs the meta-state / record schemas to be stable. SP3 shipped 2026-06-05. We need ~1 release cycle of post-SP3 schema immutability before Approach 3 ships. *Check the git diff on `schemas/*.schema.json` since 2026-06-05; if the diff is non-trivial, defer Approach 3.*

**Updated implementation order (replaces §3.4 Phasing for the meta-surface axis):**

0. **Re-debate product-surface schemas (the bridge 7 question).** Use the meta-surface as the substrate for the re-debate. **Not in scope for this report; deferred until after step 6.** The current product-surface schemas are unbound and treated as a design exploration, not a contract.
1. **Declare SP3 schema stability.** Mechanical check + 1 release cycle. (For the meta-surface only; product-surface schemas are not in scope.)
2. **Bridge 5 Approach 3** — full codegen for writers + validators, scoped to the meta-surface only. Extends the existing `core/schema-to-zod.js`. Ships its own plan. The output target is `meta-state.jsonl`; the output types are the 4 entry kinds (`finding | change-log | rule | loop-design`).
3. **Mastra migration Phase 0** — coexistence (no Bridge 5 dependency; just registers deterministic tools, ~30 of them, meta-state-touching).
4. **Mastra migration Phase 1** — mastrafy the ~30 meta-state deterministic tools. **Now this phase is dramatically smaller**: thin wrappers that consume the Bridge 5 output. No per-tool zod hand-written.
5. **Mastra migration Phase 2-3** — workflows + agents (Phase 3 is where Storage Layer folds in per §3.7).
6. **Mastra migration Phase 4-5** — cut over + embed in Mastra Code (Mode 1). At this point, the meta-surface is the only bound surface. **Phase 5 does not bind to product-surface schemas; it operates entirely on the meta-surface.**
7. **(Post-meta-surface, out of scope here.)** Re-debate product-surface schemas using the meta-surface as substrate. This is the Bridge 7 question.

**Pre-Phase 0 (added by §3.10): migrate the legacy meta-surface content out of `records/`.**
- ~~Convert `records/meta/evidence/*.md` → `meta-state.jsonl` findings.~~ **Already done (2026-06-12 verification).** The `records/meta/evidence/` subdirectory no longer exists; the conversion is complete.
- ~~Convert `records/meta/capabilities/*.yaml` → `meta-state.jsonl` rules.~~ **Already done (2026-06-12 verification).** The `records/meta/capabilities/` subdirectory no longer exists; the conversion is complete.
- Convert `records/meta/experiments/*.yaml` (2 files: `experiment-meta-capabilities-stack-allowlist-20260510T160000Z.yaml`, `experiment-meta-install-template-candidate-260512T0046Z.yaml`) → `meta-state.jsonl` change-logs. **Not yet converted; ~2 file conversions remain.**
- Resolve Q8 for `records/observations/*.yaml` (5th entry kind vs separate file).
- ~~Delete the converted `records/meta/` content (after conversion is verified).~~ **Partial completion:** `records/meta/evidence/` and `records/meta/capabilities/` already gone; `records/meta/experiments/` (2 files) and `records/meta/index/` (12 files) remain.
- ~~Delete `records/index.yaml` (derive from meta-state at runtime).~~ **Already done (2026-06-12 verification).** No `records/index.yaml` exists.
- Archive `records/<vendor>/` (per §3.10). Product-surface content is unbound and treated as design exploration, not as a contract that constrains Bridge 5.

#### 3.8.2 Bridges 1-4 voided by re-debate

The operator reframe of 2026-06-12 voids all prior "Bridge 1-4 shipped" or "Bridge 1-4 design approved" claims. The reports themselves remain in `plans/reports/` as historical engineering record, but their status is marked "voided by re-debate, 2026-06-12". The reason: the product surface is being redesigned by the meta-surface, and the schemas + integration shapes those reports were building toward are no longer the right ones to commit to.

**Reports voided (in-place header edit, not deleted):**

- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — "Status: Design approved, awaiting plan" → voided; the `index-entry.schema.json` and `claim.schema.json` shapes are unbound.
- `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` — "Bridge 2 is complete and tested but never exercised on real data" → voided; the candidate-to-experiment pipeline is a product-surface design that needs re-debate. The report's own line 101 self-flags this: *"Bridge 2 is marketed as 'complete' while untested end-to-end."* — the operator reframe is consistent with that self-flag.
- All `plans/<date>-bridge-{1,2,3,4}-*/` plan directories — treated as historical record, not as in-flight work.
- All Bridge 1-4 status claims in `AGENTS.md` and `docs/trajectory.md` — superseded by the meta-surface framing.

**What stays valid (the engineering is real, the contracts are not):**

- The pipeline implementations (MCP tools, schema files, validators) remain in the repo. They are not deleted; they are unbound.
- The findings and rules about *how* the pipeline was built (test coverage, error paths, performance benchmarks) are valid historical record. They are referenced from `meta-state.jsonl` change-logs for forensic continuity.

**The pattern:** A bridge can be "built" in the sense that all the code and tests are present, but "unbuilt" in the sense that the contract it was built against is voided. The 2026-06-12 reframe collapses the two senses by anchoring the contract to the meta-surface. Once the meta-surface is the only bound surface, the only "built" bridges are the ones that operate on the meta-surface (which is none of Bridges 1-4; those are all product-surface by definition).

**Sequencing decision rule (operator-stated, 2026-06-12, supersedes the 2026-06-11 rule):**

> **The meta-surface (Bridge 5+6) is the active front, in no particular order. All Bridge 1-4 work is deferred. The Bridge 5 codegen engine ships first, scoped to the meta-surface only. The Mastra migration's Phase 0-5 follow, also meta-surface only. Product-surface binding is the Bridge 7 question, deferred until after the meta-surface ships.**

**Where this prediction is wrong — three failure modes:**

1. **SP3 schemas are still in flux.** The trajectory says Approach 3 is "sequenced after SP3 — SP3's schemas need to stabilize first." If the SP3 schemas are still being edited (e.g., new fields, status enum changes), Approach 3 will need to be redone as SP3 settles. *Test: check the git history on `schemas/*.schema.json` since 2026-06-05; if the diff is non-trivial, defer Approach 3.*
2. **The meta-surface engine produces output that is not equivalent to the existing hand-written meta-state tools.** The 16 `meta_state_*` tools in `tools/learning-loop-mcp/tools/meta-state-*-tool.js` have hand-written logic (e.g., `meta_state_derive_status`, `meta_state_check_grounding`). If the Bridge 5 engine's output for the meta-surface types does not match the existing hand-written behavior, the cut-over breaks. *Test: at Bridge 5 Phase 0, generate meta-state zod from the engine and compare against `buildZodSchemaFor('observation', ...)` and the hand-written `meta-state-*-tool.js` schemas. Any divergence is a blocker.*
3. **The product surface re-debate (Bridge 7) reveals that the meta-surface shape is also wrong.** If the loop, using its own meta-surface as substrate, concludes that the 4-kind union (`finding | change-log | rule | loop-design`) does not generalize, the meta-surface itself is in scope for re-debate. *Test: at Step 7 (post-meta-surface), audit whether the 4-kind union is still the right shape for the product surface the loop is designing. If not, the meta-surface is in scope too.*

**Captured as a meta-state finding** (operator decision, 2026-06-12, supersedes the 2026-06-11 "not captured" decision). The Bridges 1-4 voiding and the meta-surface atomicity are durable contracts; they belong in `meta-state.jsonl` as a `loop-design` entry. Promote when the Bridge 5 plan is opened.

### 3.9 Hook layer interaction with the Mastra migration

**Operator question (2026-06-11):** with our direction (Bridge 5 + Mastra + Bridge 6), what replaces the runtime "hooks" mechanism? Do Mastra workflows replace them, or do we still need hooks?

**Short answer:** hooks are not replaced by Mastra workflows. They are still needed as long as the calling agent is an external MCP client (Droid, Claude Code). The hook layer and the MCP server layer are different layers; they intercept at different points in the call chain. The Mastra migration (Phases 0-4) does not touch the runtime hook layer in Mode 1.

**The two enforcement layers (today):**

| Layer | Where it runs | What it does | Files (today) |
|---|---|---|---|
| **Runtime hooks** | Outer agent's process (Droid / Claude Code) | Pre-tool-call interception; can **hard-block** (exit 2) | `.factory/hooks/**`, `.claude/coordination/**` → `tools/learning-loop-mcp/hooks/{bash,write,inbound}-gate.js` |
| **Consult-gates** | Inside the MCP server | Per-tool-call rule checks; **soft-block** (return error) | `core/meta-state.js` rule enforcement inside `meta_state_resolve`, `gate_check`, etc. |

**The call chain (today):**

```
[Operator message]
        ↓
[Runtime hooks layer]   ← PreToolUse intercept: bash-gate.js, write-gate.js, inbound-gate.js
        ↓ (if not blocked)
[Agent decides to call tool]   ← LLM picks tool + args
        ↓
[Tool dispatched to MCP server]   ← stdio to learning-loop-mcp
        ↓
[MCP tool handler runs]   ← consult-gates (4 rules) fire here
        ↓
[Result returned to agent]
```

**The matrix (resolved 2026-06-11):**

| Hook | Mode 1 (peer MCP, current decision) | Mode 2 (Mastra Code embedded, deferred) |
|---|---|---|
| **Bash/Execute gate** | **Stays at runtime** (Droid / Claude) | Moves to Mastra `beforeToolCall` on the agent |
| **Write gate** | **Stays at runtime** | Moves to Mastra `beforeToolCall` |
| **Inbound gate** | **Stays at runtime** | Moves to Mastra message handler |
| **Consult-gates (4 rules)** | Moves to Mastra tool `execute` (re-implement in TS) — **Phase 1 of the Mastra migration** | Same (already in MCP server) |

**Why workflows don't replace hooks:**

- A Mastra `createWorkflow` is a state machine: it has state, steps, and resumability. It orchestrates a sequence.
- A hook is a point-in-time interceptor: a function that runs before/after a tool call.
- A workflow uses a hook; a workflow doesn't replace a hook.

**Why Mode 1 (peer MCP) cannot collapse the hook layer into Mastra:**

- The runtime hook fires *before* the LLM's tool dispatch. It is the only layer that can hard-block the call before it reaches the MCP server.
- A Mastra `beforeToolCall` runs *inside* the Mastra agent's process. If the calling agent is an external MCP client (Droid, Claude), the Mastra `beforeToolCall` runs in the MCP server process, not the caller's. It cannot intercept before the runtime hook.
- The runtime hook is the *first* thing that happens. Mastra sees the call only after the runtime hook lets it through.

**What the Mastra migration (Phases 0-4, Mode 1) actually changes:**

- **Phase 0** (coexistence): no hook-layer change. The new Mastra `MCPServer` runs in parallel; the runtime hooks continue to fire on the existing server.
- **Phase 1** (mastrafy deterministic tools): the **consult-gate logic re-implements** inside the Mastra tool's `execute` function (TypeScript). The runtime hooks are unchanged. The consult-gate code moves from `core/meta-state.js` to the Mastra tool wrapper.
- **Phases 2-4** (workflows, agents, cut over): no hook-layer changes. The cut-over swaps the MCP server implementation; the runtime hooks don't care which server they're talking to.
- **Phase 5** (Mastra Code, Mode 1): Mastra Code is a new runtime with its own hook surface. The existing runtime hooks continue to fire for Droid. Mastra Code may need its own hook layer (`.mastracode/hooks/**` or whatever its hook surface is) — a parallel duplication, not a consolidation.

**What changes in Mode 2 (deferred per Q6):**

- **Move runtime gate logic into Mastra `beforeToolCall`.** TypeScript re-implementation of `core/gate-logic.js` semantics. The `.factory/hooks/**` and `.claude/coordination/**` shim files are deleted.
- **Move inbound gate logic into Mastra message handler.** TypeScript re-implementation of `core/inbound-state.js` staleness check.
- **Mastra Code becomes the only runtime.** Droid is no longer used (or is used as a fallback). The runtime hooks are gone; the Mastra `beforeToolCall` and message handler are the only enforcement layer.

**The `core/gate-logic.js` source of truth:**

- The gate logic itself (`core/gate-logic.js`, `core/inbound-state.js`, `core/patterns.json`) does NOT move between modes.
- What changes is the **call site**: from the runtime hook files (Mode 1) to the Mastra `beforeToolCall` (Mode 2).
- The logic is identical; the host is different.

**YAGNI / KISS / DRY check:**

- **YAGNI:** Don't build a Mastra `beforeToolCall` re-implementation of the runtime gates until you need to (Mode 2). The runtime hooks work today.
- **KISS:** The hooks are simple (pattern-match, read observations, decide). Don't over-engineer the Mastra port until it ships.
- **DRY:** The hooks are already de-duplicated at the universal-script level (`.cjs` shims call into shared `*.js` files). The DRY win from Mode 2 is small — the call sites collapse, not the logic.

**Triggers to revisit:**

- **Mode 2 hooks decision:** operator commits to Mode 2 (deferred per Q6), OR a new MCP client appears whose hook surface differs from Droid/Claude's (parallel duplication unsustainable), OR the runtime gate logic gets a new rule that needs to be re-implemented in TypeScript.
- **Mode 1 hooks decision (probably never):** runtime hooks become a maintenance burden, OR a new runtime appears with no hook mechanism.

**Architectural validation points:**

- **Phase 0:** confirm the new Mastra `MCPServer` does not need runtime gate re-implementation. The call chain is identical to today.
- **Phase 1:** confirm the consult-gate re-implementation in the Mastra tool's `execute` is bit-equivalent to the current behavior. The existing test suite (especially the cold-session discoverability test and the resolution-evidence-required consult-gate) is the gate.
- **Phase 5 (Mode 1):** confirm Mastra Code has an equivalent hook layer; if not, document the gap and decide case-by-case.

**Not captured as a meta-state finding** (per operator decision 2026-06-11). The decision lives in this research report only; can be promoted to a `meta_state_propose_design` or `meta_state_report` later if reaffirmed.

### 3.10 Scope: meta-surface as the only bound surface (2026-06-12 reframe)

> **Operator reframe, 2026-06-12:** The 2026-06-11 framing was "Bridge 5 is meta-surface only; product surface is paused." The 2026-06-12 reframe is sharper: **the meta-surface is the only bound surface**. The Bridge 5 codegen engine can produce any schema, but the only **bound** output is `meta-state.jsonl` (the 4-kind union: `finding | change-log | rule | loop-design`). Product-surface schemas are **unbound**: no records are generated, validated, or migrated against them. The product surface is **re-debated and re-validated by the meta-surface** once the meta-surface exists. All Bridge 1-4 work is **deferred** until the meta-surface ships.

**The inversion (engine vs instance):**

- **Engine:** the Bridge 5 schema-to-code generator. Provable against the meta-surface because the meta-surface is small (4 entry kinds), stable (locked since SP3 shipped 2026-06-05), and self-owned (the loop is its own designer).
- **Instance (bound):** only the meta-surface — `finding`, `change-log`, `rule`, `loop-design` entries in `meta-state.jsonl`. The engine's only validated output.
- **Instance (unbound):** all product-surface schemas. The engine *can* generate them; the loop *could* bind to them. The decision to bind is deferred until the meta-surface exists and can re-debate the product surface using itself as substrate.

**Why this is sharper than "paused":**

- "Paused" implies a state to resume from. The 2026-06-12 reframe removes the assumption that the current product-surface schemas (capability, index-entry, claim, resource-budget, observation) are the right shape to resume to. They may not be.
- "Meta-surface only" implies the meta-surface is the only thing in scope. The 2026-06-12 reframe adds: **the meta-surface is also the only thing the loop commits to**. The loop's self-model is the only contract the loop writes; everything else is design exploration.

**Two product-surface distinctions (2026-06-12 reframe adds):**

- **Product observations** (resource budgets, gate constraints, vendor-API ledgers): may or may not be the right shape. The current `observation.schema.json` and `resource-budget.schema.json` are artifacts of the substrate-driven era. Re-debate is required.
- **Product schemas** (capability, index-entry, claim): may or may not be the right shape. The Bridge 1-4 reports' designs are voided (per §3.8.2). Re-debate is required.

**What "meta-surface is the only bound surface" means:**

```
records/                              ← product-surface content only (unbound, archived per §3.10)
├── vnstock/                          ← product-surface only (unbound, archived)
├── fastapi/                          ← product-surface only (unbound, archived)
├── tanstack/                         ← product-surface only (unbound, archived)
└── product/                          ← product-surface only (unbound, archived)

meta-state.jsonl                      ← THE bound surface (4-kind union: finding | change-log | rule | loop-design)
```

The `meta-state.jsonl` registry is the **only contract** the loop writes. The product-surface content in `records/` is design exploration, archived for forensic continuity, and explicitly **not** a contract that constrains Bridge 5 or the meta-surface.

**Original 2026-06-11 framing (now superseded by 2026-06-12 reframe):**

The 2026-06-11 framing said `records/meta/` and `records/observations/` were both "meta-surface" and stayed in `records/`. The 2026-06-11 operator edit tightened that: `records/` is **strictly product-level**, and ALL meta-level content is moved out of `records/`.

The 2026-06-12 reframe goes further: **the meta-surface is the only bound surface**. The 2026-06-11 framing still permitted product-surface schemas to be "the right shape to resume to" once the meta-surface shipped. The 2026-06-12 reframe removes that assumption — the product surface must be re-debated from scratch, and the current schemas are unbound.

**Three reasons (operator-stated, 2026-06-11, sharpened 2026-06-12):**

1. **The product-surface registry is stale.** A lot of MD or YAML files in `records/<vendor>/` don't follow the rules the new design will require. The new design should not be hindered by that. **2026-06-12 sharpening:** the rules the new design *will* require are themselves TBD; the loop must derive them from the meta-surface, not from the old product schemas.
2. **The old design inflated meta with product-level.** The meta level is now compressed into the meta-state registry (`meta-state.jsonl`). The product-level inflation is no longer needed. The `records/meta/*` directory is a vestige of that old inflation; it is deleted.
3. **The product-surface design question is deferred and unbound.** "How the learning loop registry is designed for product-level" will be answered AFTER the meta-surface ships. At that time, the learning loop itself will be the main designer of the product-level registry, using the meta-surface as its substrate. The current product schemas are **explicitly unbound** — they are design exploration, not contracts. This is consistent with `AGENTS.md` and `docs/trajectory.md`.

**What "meta-surface is the only bound surface" means (directory layout):**

```
records/                              ← product-surface content only (unbound, archived per §3.10)
├── vnstock/                          ← product-surface only (unbound, archived)
├── fastapi/                          ← product-surface only (unbound, archived)
├── tanstack/                         ← product-surface only (unbound, archived)
└── product/                          ← product-surface only (unbound, archived)

meta-state.jsonl                      ← THE bound surface (4-kind union: finding | change-log | rule | loop-design)
```

`records/` contains ONLY `<vendor>/` subdirectories (plus `observations/` and `meta/` which are themselves in the process of being converted/archived per §3.10). Every meta-level entry that survives is in `meta-state.jsonl`:

| Was at | New location | Status (2026-06-12) |
|---|---|---|
| `records/meta/evidence/*.md` | `meta-state.jsonl` (as `finding` or `change-log` entries) | **Already converted** (2026-06-12 verification). Subdir no longer exists. |
| `records/meta/capabilities/*.yaml` | `meta-state.jsonl` (as `rule` entries) | **Already converted.** Subdir no longer exists. |
| `records/meta/experiments/*.yaml` | `meta-state.jsonl` (as `change-log` entries) | **2 files remain** to convert. |
| `records/meta/index/*.yaml` | `meta-state.jsonl` (as `finding` entries) | **12 files remain** to convert. |
| `records/observations/*.yaml` | **Re-debated.** May become a 5th meta-state entry kind, may stay as a separate file, may be folded into `finding` entries. **The current shape is unbound.** | **Q8 reopened** (operator decision 2026-06-12). |
| `records/index.yaml` | Derived from `meta-state.jsonl` at runtime; not a separate file | **Already done.** No `records/index.yaml` exists. |
| `meta-state.jsonl` (root) | unchanged | **The single self-model artifact.** |

**Open Question (Q8) — REOPENED, 2026-06-12:** Where do constraint observations and resource budgets go? The 2026-06-11 framing resolved this as "Option A: 5th meta-state entry kind." The 2026-06-12 reframe reopens the question because **the product-surface shape is itself unbound**. Options:

- **Option A** — make observations a 5th entry kind in `meta-state.jsonl` (extends the union to 5: finding | change-log | rule | loop-design | observation). Cleanest semantically; requires a schema change. Validated by the meta-surface once it ships.
- **Option B** — keep observations as a separate file at the root, e.g. `observations.yaml`. Minimal change; the meta-state stays 4-kind; observations remain a sibling artifact.
- **Option C** — fold observations into `finding` entries (with a `kind: observation` discriminator). Smallest change to the meta-state schema; semantically lossy.
- **Option D (new, 2026-06-12)** — observations are a **product-surface concept** that may not exist in the new design. The current `observation.schema.json` is a relic of the substrate-driven era. The loop, using the meta-surface as substrate, decides whether observations are the right shape at all. **Re-debate required.**

The current `gate_check` and `budget_check` tools read observations; the gate logic (`core/gate-logic.js`, `core/inbound-state.js`) reads observations; the staleness check is observation-driven. Whatever storage choice we make, the gate logic must continue to work. **Recommend Option D (re-debate from meta-surface)** for consistency with the operator's "meta-surface is the only bound surface" intent. The 2026-06-11 "Option A recommended" is superseded.

**What the 2026-06-12 reframe eliminates (engine vs instance cascade):**

| Eliminated | Why it can go (engine vs instance) |
|---|---|
| `records/meta/*` (evidence, capabilities) | **Instance replaced** by `meta-state.jsonl` (engine = meta-state) |
| `records/meta/experiments/*.yaml` (2 files), `records/meta/index/*.yaml` (12 files) | **Instance replaced** by `meta-state.jsonl` (engine = meta-state) — pending conversion |
| `records/observations/*` (constraint observations) | **Instance unbound.** Engine (the meta-state registry) can host observations; the question is reopened for re-debate. |
| `records/index.yaml` (the loop's index file) | **Instance replaced** by runtime derivation from `meta-state.jsonl` |
| `records/<vendor>/*` (product surface) | **Instance unbound.** Engine (Bridge 5 codegen) can generate product records; the decision to bind is deferred. |
| `capability_*` (3 tools) | **Instance replaced** — capabilities are product-surface; the engine (meta-state) does not host them as tools. Tools dropped; the meta-state `rule` kind is the only "capability" representation in the meta-surface. |
| `index_extract`, `index_search`, `index_update_claim` (3 of 5 index tools) | **Instance replaced** — these operate on `records/meta/evidence/*` and `records/index.yaml`, which are gone. |
| `record_create_observation` (1 of 9 record_crud tools) | **Instance unbound.** Operates on `records/observations/`, which is unbound (Q8 reopened). |
| Product-surface binding for any record type (capability, index-entry, claim, resource-budget) | **Instance unbound.** Engine has the ability; binding is the Bridge 7 question. |
| The "~38 → ~30 tool surface reduction" math | **Cascade impact:** the 56-tool surface today (per `agent-manifest.json`) → ~34 bound to meta-surface (gate 2 + meta_state 16 + introspection 2 + record_crud ~5 minus observation + workflow ~6 + index ~2 + budget 1 = ~34). The remaining 22 tools are dropped, paused, or unbound. |
| The "where do constraint observations live?" question (Q8) | **Reopened** as a re-debate from the meta-surface, not a 4-kind-union extension problem. |

**Tool surface (2026-06-12 reframe):**

| Group | Today (per `agent-manifest.json`) | **§3.10 2026-06-12 (meta-surface bound)** |
|---|---|---|
| `gate` | 2 | **2** (gate is meta-surface) |
| `record_crud` | 9 | **~5** (drop `record_create_observation` and `record_update_observation`; Q8 reopened for re-debate; the other 7 stay bound to meta-state as `change-log` entries) |
| `workflow` | 15 | **~8** (only meta-state-touching workflows stay; the rest are unbound) |
| `index` | 5 | **~2** (drop `index_extract`, `index_search`, `index_update_claim`; keep `index_validate` and `index_validate_plans` for the meta-state) |
| `budget` | 1 | **1** (budget is meta-surface) |
| `capability` | 3 | **0** (capabilities are unbound product-surface; no tool representation) |
| `meta_state` | 16 | **16** (all meta) |
| `introspection` | 2 | **2** (`loop_describe` + `loop_get_instruction`, both meta-surface) |
| **Total** | **56** | **~36** bound to meta-surface; **~20** unbound or dropped |

The plan's tool surface shrinks from 56 (today, per manifest) to **~36** (bound to meta-surface). The remaining ~20 tools are unbound (operate on product-surface shapes that are being re-debated) or dropped.

**Bridge 5 scope (2026-06-12 reframe — engine vs instance):**

- **Engine:** schema-to-code generator. Provable against the meta-surface. The engine itself has the ability to generate any record type from any JSON Schema.
- **Instance (bound):** the 4 meta-surface entry kinds (`finding | change-log | rule | loop-design`). The engine produces writers + validators for these. The output target is `meta-state.jsonl`.
- **Instance (unbound):** all product-surface schemas. The engine has the ability to generate them; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are **unbound**; they are design exploration, not contracts.
- **The engine vs instance split is the key Bridge 5 innovation of the 2026-06-12 reframe.** The 2026-06-11 framing conflated engine and instance ("Bridge 5 produces writers/validators for 4 record types"); the 2026-06-12 reframe separates them. The engine ships; the instance is bound only for the meta-surface.

**Phase refinements (each phase is "meta-surface is the only bound surface"):**

- **Phase 0**: coexistence with 3 meta-state-touching tools (`gate_check`, `meta_state_list`, `meta_state_report`). The legacy `record_create_decision` stays bound because `decision` records are a meta-surface kind (they log decisions about the loop, not decisions about products). Bound to meta-state as `change-log` entries.
- **Phase 1**: mastrafy the ~36 meta-state tools. Tool count drops to ~36 (from 56 today).
- **Phase 2**: promote ~8 meta-state workflow tools to `createWorkflow` (intake, classify, etc.). All workflows are meta-state-touching.
- **Phase 3**: add 3-4 meta-state agents (intake, scout, self-improvement). **Storage Layer folds in here** (LibSQL, separate files for meta-state and Mastra memory).
- **Phase 4**: cut over. The new `MCPServer` exposes ~36 tools, all bound to meta-surface.
- **Phase 5 (Mode 1)**: Mastra Code connects via MCP to the loop's `MCPServer`. The exposed tools are ~36 meta-state tools only. **No product-surface binding is added at Phase 5.** Product binding is the Bridge 7 question (post-meta-surface).

**Consistency check with `AGENTS.md` and `docs/trajectory.md` (2026-06-12 reframe):**

- `AGENTS.md` line 251 (current): "The current focus is Bridge 6, not Bridges 1–5." **Superseded.** The 2026-06-12 reframe says: "The current focus is the **meta-surface** (Bridge 5+6, in no particular order). All Bridge 1-4 work is deferred."
- `AGENTS.md` line 253 (current): "Bridges 1–5 are aspirational; Bridge 6 is the active front." **Superseded.** The 2026-06-12 reframe says: "Bridges 1-4 are **deferred and unbound**; the **meta-surface** (Bridge 5+6) is the active front. The Bridges table needs a full rewrite to reflect this — see the consistency report at `plans/reports/consistency-260612-1300-mastra-research-report.md` and the AGENTS.md rewrite task."
- `AGENTS.md` "The loop has shifted from vnstock-driven to self-learning driven" — **consistent**. The 2026-06-12 reframe is the operationalization: the substrate is archived, the self-model is the only bound surface.
- `docs/trajectory.md` § The Sixth Bridge: "The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior." — **Consistent.** The 2026-06-12 reframe makes the self-model the **only** meta-level artifact; everything meta-level lives in `meta-state.jsonl`.
- `docs/trajectory.md` § "What Stays Human Forever": "The operator decides what counts as a 'loss function' and what counts as 'operator capture.'" — **Consistent.** The operator's 2026-06-12 decision to bind only the meta-surface and re-debate the product surface IS the operator exercising the loss-function choice.

**Migration of the legacy meta-surface content (status as of 2026-06-12):**

- `records/meta/*` (evidence, capabilities) → **DONE.** Subdirs no longer exist; content is in `meta-state.jsonl`.
- `records/meta/experiments/*.yaml` (2 files) → **PENDING.** Convert to `meta-state.jsonl` change-logs; the `meta_state_log_change` change-log entry will document each conversion.
- `records/meta/index/*.yaml` (12 files) → **PENDING.** Convert to `meta-state.jsonl` findings; document with `meta_state_log_change`.
- `records/observations/*` → **REOPENED** (Q8). The current 8 yaml files are unbound. The 2026-06-11 "Option A: 5th entry kind" recommendation is superseded by Option D (re-debate from meta-surface). No conversion happens until the meta-surface decides what observations should look like.
- `records/index.yaml` → **DONE.** No `records/index.yaml` exists.
- `records/<vendor>/` → **ARCHIVED** (per §3.10). The records are still on disk, unbound, treated as design exploration. Use `meta_state_archive` MCP tool to formally archive when the meta-surface ships.

**What does NOT change (2026-06-12 reframe):**

- **The hooks.** Per §3.9: hooks stay at the runtime layer in Mode 1.
- **The meta-state registry.** `meta-state.jsonl` is the meta-surface. The 4-kind union is the bound shape.
- **The MCP transport.** Still speaks MCP. The new `MCPServer` exposes ~36 meta-surface tools.
- **§3.7 Storage Layer deferral.** Unchanged — meta-state storage is meta-surface; LibSQL target is unaffected.
- **§3.9 Hook layer.** Unchanged — hooks stay at the runtime layer in Mode 1.
- **The deprecation of `coerceParamsToSchema` and `installWireFormatCoercion` helpers.** The 2026-06-12 reframe does not change the §3.6 wire-format decision. The helpers are in production with test coverage; Phase 1 must reproduce their behavior in Mastra, not just delete them (see consistency report F7).

**What changes (2026-06-12 reframe):**

- **The Bridges 1-4 reports are voided by re-debate.** They are marked "voided by re-debate, 2026-06-12" in-place. See §3.8.2 for the list.
- **The §8 resolved-questions list.** Q8 is reopened (Option D: re-debate from meta-surface). The 2026-06-11 "All 7 open questions resolved" is no longer accurate; 6 are resolved, Q8 is reopened.
- **The `AGENTS.md` Bridges table needs a full rewrite.** The 2026-06-12 reframe is sharper than the 2026-06-11 framing; the operator has asked for a from-scratch rewrite of the Bridge 5/6/Six-Bridges sections. See consistency report item 5 in the Action Checklist.
- **Q1–Q7 resolutions in §8 remain valid.** Mastra Code as the final runtime target, model-agnosticism as a free bonus, coercion as in-production helpers, Apache-2.0 license, LibSQL memory default, Mode 1 peer-MCP integration, `MastraServer` HTTP out of scope. All still hold under the 2026-06-12 reframe.

**The deferred question (now explicit, 2026-06-12 reframe):**

> "How should the learning-loop registry be designed for product-level?"

This question is **deferred until after the meta-surface ships**. At that point, the loop itself — using the meta-surface machinery that Bridge 5+6 provides — will be the main designer of the product-level registry. The current product records are an artifact of the old design; they **explicitly do not constrain** the new design. The loop may conclude that product observations, capabilities, and index-entries are not the right shapes at all, and may invent new ones.

The deferred question is the *Bridge 7* question. It is open-ended by design. **All Bridge 1-4 work (which is what Bridge 7 used to be split into) is unified into this single question**, because the product surface is one re-debate, not four independent bridges.

**Captured as a meta-state finding** (operator decision, 2026-06-12, supersedes the 2026-06-11 "not captured" decision). The meta-surface atomicity, the engine/instance split, and the Bridges 1-4 voiding are durable contracts; they belong in `meta-state.jsonl` as a `loop-design` entry. Promote when the Bridge 5 plan is opened (see consistency report action checklist item 10).

## 4. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Mastra version churn (v1.x migration already happened, more coming) | medium | Pin `@mastra/core` + `@mastra/mcp` to a tested minor. Use codemods for upgrades. Track via `meta_state_log_change` change-log entries (per Bridge 6 protocol). |
| Bundle size / startup time (Mastra is larger than the raw SDK) | low | Tools are loaded lazily; the `McpServer` connects after `import`. Cold-start budget should be measured in Phase 0. |
| Loss of the existing `coerceParamsToSchema` semantics — clients depend on them | medium | Phase 0/1 ships a `meta_state_log_change` documenting the wire-format changes. Run the existing test suite against the Mastra server to catch any silent behavior drift. |
| The new agents (Phase 3) require model calls — adds a runtime cost today the loop doesn't have | medium | Phase 3 is opt-in. Agents are *additional* tools; the calling agent decides whether to use them. Document the per-call cost clearly. |
| Mastra is one vendor (license: Apache-2.0) | low | The Mastra server still speaks MCP. If we ever want to swap, we lose the `createWorkflow` state machine but keep the same wire format. The Bridge 6 product (meta-state registry) is unaffected. |
| `MCPClient` for the outer agent to call other MCP servers | n/a (out of scope) | If the loop needs to call *external* MCP servers (e.g., a vendor's MCP), Mastra's `MCPClient` is the right primitive. Not in current scope. |
| The user's "Pi" runtime may not yet speak MCP | medium | Confirm before relying on the runtime-agnostic claim for Pi. The stdio path is the lowest common denominator; HTTP adds capability if Pi supports it. |
| Loss of the `gate_check` *prompting* affordance — the gate today tells the agent "you should call `gate_check` before any side-effect" | low | Keep the *hook* (`bash-gate.js`) and the *tool* (`gate_check`) both. Mastra hosts the tool; the hook still runs. |
| Existing `meta_state_refresh_tools` admin tool reaches into SDK internals (`_registeredTools`) | low | If we replace the SDK, the refresh path must be re-implemented. Mastra's `MCPServer` exposes a clean re-registration API — likely less brittle. |

## 5. What this means for Bridge 6

`docs/trajectory.md` § "The Sixth Bridge" frames the meta-state registry as the *product*. The current server is a *transport* for that product. After Mastra migration:

- The product (meta-state registry) is unchanged.
- The transport (the MCP server implementation) becomes Mastra-based.
- The product gains a *reasoning layer* (the new agents in Phase 3) that can self-derive status, propose designs, and explain drift — without requiring the outer agent to do all the LLM work.
- The **Mastra Code embedding (Phase 5)** extends this further: the loop and the agentic-coding workflow share primitives, storage (LibSQL), and memory (Observational Memory). The loop's self-model can influence the agentic-coding workflow and vice versa. Critically, the loop's own findings become part of the same conversation memory the coding workflow reads from — making "self-learning about self" a first-class property of the coding session, not a side-channel MCP call.

Concretely: today, "is this finding still valid?" requires the outer agent to read `meta-state.jsonl`, call `meta_state_derive_status`, interpret the result. With a Mastra Agent embedded in Mastra Code, the loop itself answers: "is finding X still valid?" returns `{ valid: true, reason: "...", evidence: [...] }` directly, and the coding workflow reads the answer as part of its own observational memory. The self-model becomes ambient context, not a side-channel call.

This is exactly the destination sentence in `docs/trajectory.md`: *"a self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior."* The Mastra migration is the implementation path; the trajectory is unchanged.

## 6. Recommended Next Step

**No follow-up plan or brainstorm at this time** (per operator decision 2026-06-11). The research report is the deliverable.

When the operator is ready to proceed, the recommended first ship is **Phase 0 (coexistence)** as a thin plan:

- Add a `tools/learning-loop-mastra/` package that registers 3 deterministic tools (`gate_check`, `record_create_decision`, `meta_state_list`) via Mastra's `createTool()`.
- Run it as a peer MCP server on stdio (different `command` entry in `.mcp.json`).
- Pass: byte-identical output for the deterministic subset, existing test suite green.
- Output: a follow-up plan (`260612-...-mastra-coexistence-followup/`) with the 4-phase rollout + decision criteria for the cut-over.

The new agents (Phase 3) and the "Mastra Code" unification (post-Phase 4) are the structural shifts and deserve separate plans / brainstorms at the time.

## 7. References

- `docs/trajectory.md` § The Sixth Bridge — self-model as product
- `AGENTS.md` § MCP-First Record Access; Meta-State Group; Storage Layer Trajectory
- `tools/learning-loop-mcp/agent-manifest.json` — current tool inventory
- `tools/learning-loop-mcp/server.js` — current server entry point
- `tools/learning-loop-mcp/tool-registry.js` — current tool registration + wire-format coercion
- `.mcp.json` + `.factory/mcp.json` — runtime-agnostic MCP transport
- `.agents/skills/mastra/SKILL.md` — Mastra skill overview
- `https://github.com/mastra-ai/mastra/tree/main/mastracode` — **Mastra Code** (official Mastra product for coding agent runtime; TUI + Harness + Mastra Agent + LibSQL; npm `mastracode`; `createMastraCode({...})` factory; verified 2026-06-11)
- `https://mastra.ai/reference/tools/mcp-server` — `MCPServer` reference (verified 2026-06-11)
- `https://mastra.ai/reference/tools/create-tool` — `createTool()` reference (verified 2026-06-11)
- `https://mastra.ai/reference/agents/agent` — `Agent` reference (verified 2026-06-11)
- `https://mastra.ai/reference/workflows/workflow` — `createWorkflow` reference (verified 2026-06-11)
- `https://mastra.ai/reference/tools/mcp-client` — `MCPClient` reference (verified 2026-06-11)
- `https://mastra.ai/guides/migrations/upgrade-to-v1/mcp` — v0.x→v1.x migration (verified 2026-06-11)
- `https://mastra.ai/guides/guide/publishing-mcp-server` — packaging + npm publish (verified 2026-06-11)
- `https://mastra.ai/guides/guide/notes-mcp-server` — end-to-end tutorial (verified 2026-06-11)

## 8. Unresolved Questions (post-clarification)

1. ~~What is "Pi"?~~ **RESOLVED 2026-06-11**: Pi (`https://github.com/earendil-works/pi`) was a placeholder mentioned in the original prompt. Concrete runtime targets are **Droid (today) and Mastra Code (final Mastra-fy)**.
2. ~~Per-deployment model selection vs per-agent.~~ **RESOLVED 2026-06-11**: model selection is a session-level concern handled by Droid's `/model` (and Mastra Code's per-prompt model switching). The loop does not need its own model config.
3. ~~Should the existing `coerceParamsToSchema` semantics be preserved 1-to-1 in Mastra, or is this the moment to clean them up?~~ **RESOLVED 2026-06-11, REVISED 2026-06-12**: the 2026-06-11 resolution ("drop the coercion in Phase 1, gated on Phase 0 parity test") is **superseded** by the 2026-06-12 verification that the helpers are in production with test coverage. **New resolution:** Phase 1 of the Mastra migration must **reproduce the upstream behavior in Mastra's `createTool` input validation**, not delete the helpers. Specifically:
   - `coerceParamsToSchema` (in `tools/learning-loop-mcp/tool-registry.js` lines 77-134) re-hydrates JSON-string top-level arrays, booleans, and numbers to their typed counterparts. It is a recursive, typeName-gated, depth-bounded coercion. The behavior is load-bearing for stdio clients that pass `["x", "y"]` as a JSON string instead of an array.
   - `installWireFormatCoercion` (lines 197-235) patches `McpServer#validateToolInput` to run `coerceParamsToSchema` before the original Zod parse. It is load-bearing because the MCP SDK validates before the handler-level coercion runs.
   - The Phase 0 byte-for-byte parity test (existing **985 tests** verified 2026-06-12 via `pnpm test`: 984 pass, 1 skipped, 147 suites, ~9s duration; see F6 of the consistency report for the per-glob breakdown) is still the gate, but the test is now a **regression test against accidental deletion**, not a "is this dead code?" test. Pass = behavior is preserved in Mastra. Fail = surface the diffs and decide case-by-case.
   - **Equivalent behavior in Mastra:** use `createTool()`'s `inputSchema` (Zod, Valibot, or ArkType) with `.preprocess()` or a Zod transform that re-hydrates JSON-string values. Alternatively, hook into Mastra's `beforeToolCall` lifecycle (per §3.9) to run the same coercion before the tool's `execute` function. The exact mechanism is a Phase 1 implementation detail; the contract is "stdio clients see no behavior change."
   - **Trigger to revisit:** any Phase 0 parity test failure, OR a documented decision that stdio wire-format coercion is no longer needed (e.g., all clients migrate to HTTP transport where the SDK handles JSON natively).
4. ~~License compatibility.~~ **RESOLVED 2026-06-11**: no action. Apache-2.0 is permissive, compatible with private use, modification, and internal distribution. Record the adoption as a `meta_state_log_change` entry when Phase 0 lands (per Bridge 6 protocol). Revisit only if the loop is published.
5. ~~Phase 3 agents' memory.~~ **RESOLVED 2026-06-11**: defer to Phase 3 plan. Default backend: **LibSQL** (matches the Storage Layer target, Mastra Code's default, avoids Postgres/Mongo dependencies). Likely separate SQLite file from the meta-state registry, same engine. Mastra Code's free Observational Memory is a Phase 5 bonus, not a Phase 3 requirement. Trigger to revisit: at Phase 3 plan, audit whether the agents need cross-session memory that single-session `Memory` doesn't provide.
6. ~~Mastra Code integration mode (Phase 5).~~ **RESOLVED 2026-06-11**: **Mode 1 (peer MCP servers) ships first.** Mode 2 (same Mastra instance via `createMastraCode({...})`) is deferred. Mode 1 is the safe, reversible integration: Droid and Mastra Code both connect to the loop's `MCPServer` via MCP. Mode 2 follows only if the operator's "final Mastra-fy" vision requires single-app coupling. Trigger to revisit: operator's vision requires single-app coupling, OR the Phase 5 surface area is dominated by cross-loop/coding-workflow state that Mode 1's MCP boundary makes awkward.
7. ~~Is `MastraServer` (HTTP, OpenAPI) in scope?~~ **RESOLVED 2026-06-11**: out of scope. The loop's primary surface is MCP (Droid, Mastra Code, any future MCP client). `MastraServer` is a parallel HTTP/OpenAPI surface for non-terminal clients; there's no concrete need today. Add it only if a non-MCP client (web UI, IDE plugin) appears. Trigger to revisit: a concrete non-MCP client requirement surfaces.

**All 7 open questions resolved 2026-06-11.** No questions remain.

8. ~~Where do constraint observations and resource budgets live?~~ **RESOLVED 2026-06-11 (Option A)**: extend the meta-state union to 5 kinds (finding | change-log | rule | loop-design | **observation**). The `records/observations/*.yaml` directory is deleted; content is converted to `meta-state.jsonl` entries of kind `observation`. The gate logic (`core/gate-logic.js`, `core/inbound-state.js`) is updated to read observations from the meta-state. The 5th entry kind is a schema change; the consult-gate `rule-project-skill-boundary` and `rule-cold-session-test-must-pass-before-resolution` are unaffected (they operate on different entry kinds). The `gate_check` and `budget_check` tools' `gate` and `budget` tool groups continue to work — only their observation source changes.
9. **RESOLVED 2026-06-11 (delete, not archive):** The legacy `records/meta/*` content is **deleted** after conversion to `meta-state.jsonl`. The source files are gone; the meta-state is the single self-model. `records/index.yaml` is deleted; the index is derived from `meta-state.jsonl` at runtime by the (refactored) introspection tools. The `records/<vendor>/` product directories remain **archived** (per §3.10, unchanged) — that's where the reversible semantics are valuable, since the product records are an artifact of an old design.

# Research: Mastra-Based Runtime/Model-Agnostic Productization

**Type:** research
**Date:** 2026-06-11
**Slug:** mastra-runtime-model-agnostic-productization
**Work context:** learning-loop-template
**Aligned to:** Bridge 6 (self-model as product) per `docs/trajectory.md`

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

### 1.3 Inventory of current MCP tools (58 tools, 7 groups)

Per `tools/learning-loop-mcp/agent-manifest.json`:

| Group | Count | Shape | LLM-decision-driven? |
|---|---|---|---|
| `gate` | 2 | constraint check + preflight marker | no |
| `record_crud` | 9 | create/update decision / experiment / risk / observation | no |
| `workflow` | 15 | intake, classify, prepare, convert, verify, generate prompt, external decision, self-improvement, intentional skip, report phase, product build, runtime probe, notify, trigger | **yes — most of these** |
| `index` | 5 | validate, extract, search, update claim, validate plans | no |
| `budget` | 1 | check resource budget | no |
| `capability` | 3 | generate, list probes, list verified | no |
| `meta_state` | 16 | report, list, ack, resolve, promote-rule, sweep, log-change, patch, derive, check-grounding, refresh-fingerprint, refresh-tools, query-drift, batch, archive, relationship-validate | mostly no (algorithmic), `self_improvement` is LLM-driven |
| `introspection` | 1 | `loop_describe` | no |

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
| `loop_describe` | **Tool** (deterministic, tiered reads) | algorithmic |
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

**Phase 0 — Coexistence (no migration, add Mastra as a peer).**
- Add `@mastra/core` + `@mastra/mcp` as dependencies (kept separate package, e.g. `tools/learning-loop-mastra/`).
- Build a parallel `MCPServer` that registers a *subset* of tools via `createTool()` — start with the deterministic ones (`gate_check`, `record_*`, `meta_state_*` algorithmic).
- Run it on a different port/path or as a separate `command` entry in `.mcp.json`.
- Verify a Droid session can call either server. Compare outputs byte-for-byte on the deterministic subset.

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
- **Wire format coercion logic is dropped in Phase 1** (per Q3 resolution in §8). Today, `tool-registry.js#coerceParamsToSchema` does JSON-string-to-array/bool/number coercion. Mastra's `createTool` validates inputs via Zod natively. The Phase 0 byte-for-byte parity test is the gate: if the existing 675+ tests pass against the Mastra server without coercion, the coercion was dead code, drop it. If they fail, surface the diffs and decide case-by-case.
- **`{item: X}` unwrap logic is dropped in Phase 1** alongside the coercion. If Mastra's `createTool` accepts the same envelopes, the `unwrapItemWrap` helper can be deleted; if not, Phase 0 surfaces the diff.
- **One MCP server becomes two surfaces under one Mastra app:** tools (procedural), agents (LLM-driven), workflows (multi-step). Each is registered on the same `MCPServer`.
- **Model selection becomes a per-deployment env var.** `MASTRA_AGENT_MODEL=anthropic/claude-sonnet-4-6` (or whatever) flips the model for all agents. Today, the model is implicitly the outer agent's model.

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

### 3.8 Bridge 5 (Approach 3) sequencing decision — ship before Mastra

**Status check (2026-06-11):** Bridge 5 is *partially* shipped. Per `AGENTS.md` § "What Has Happened Since (2026-06-05 update)":
- **Approach 2** (tool zod generated from JSON Schema via `core/schema-to-zod.js`) — **SHIPPED** for 4 record types (experiment, risk, decision, observation)
- **Approach 3** (full codegen for writers + validators) — **pending**, sequenced after SP3 schemas stabilize

The Bridges table in `AGENTS.md` § "The Six Bridges" inconsistently lists Bridge 5 as "Not shipped" — that table pre-dates the 2026-06-05 update. Approach 3 is the remaining work.

**The operator's concern (2026-06-11):** how should Bridge 5 Approach 3 be ordered relative to (a) the SQLite Storage Layer, (b) the Mastra migration?

**Decision (2026-06-11): ship Bridge 5 Approach 3 BEFORE the Mastra migration starts. Bridge 5 and Storage Layer are independent.**

Reasoning:

- **Mastra's `createTool({ inputSchema, outputSchema })` accepts Standard JSON Schema** (Zod, Valibot, ArkType, or any library implementing the spec). The current `core/schema-to-zod.js` already converts JSON Schema to Zod at runtime. **Bridge 5 Approach 3's output is exactly what Mastra's `createTool` consumes.** No translation layer is needed.
- **The hand-maintenance problem the trajectory doc names is 4 parallel field catalogues per record type today (JSON schema, tool zod, writer output, validator paths).** Shipping Mastra Phase 1 *before* Bridge 5 Approach 3 adds a **5th catalogue** — the Mastra tool's `inputSchema`/`outputSchema`. The 11 drift cells (8 in experiment, 3 in risk) grow. The original Bridge 5 problem gets *worse*, not better.
- **Mastra migration Phase 1 shrinks dramatically** with Bridge 5 done first. Each Mastra tool becomes a 3-line wrapper that pulls the Zod from `buildZodFor('<type>')`. The hand-maintenance surface for 4 record types drops from ~16 files to ~4 schema files + ~4 thin wrappers (50% reduction); the drift is *structurally impossible* (codegen runs at build, the `field-coverage.test.js` CI gate catches regressions).
- **Bridge 5 is independent of storage backend.** Approach 3 generates TypeScript code from JSON Schema; it doesn't care whether the registry lives in JSONL or SQLite. The two are orthogonal. Storage Layer stays deferred to Mastra Phase 3 (per §3.7).
- **The dependency that does matter is SP3 schema stability.** Approach 3 needs the meta-state / record schemas to be stable. SP3 shipped 2026-06-05. We need ~1 release cycle of post-SP3 schema immutability before Approach 3 ships. *Check the git diff on `schemas/*.schema.json` since 2026-06-05; if the diff is non-trivial, defer Approach 3.*

**Updated implementation order (replaces §3.4 Phasing for the Bridge 5 axis):**

1. **Declare SP3 schema stability.** Mechanical check + 1 release cycle.
2. **Bridge 5 Approach 3** — full codegen for writers + validators. Extends the existing `core/schema-to-zod.js`. Ships its own plan.
3. **Mastra migration Phase 0** — coexistence (no Bridge 5 dependency; just registers deterministic tools).
4. **Mastra migration Phase 1** — mastrafy deterministic tools. **Now this phase is dramatically smaller**: thin wrappers that consume the Bridge 5 output. No per-tool zod hand-written.
5. **Mastra migration Phase 2-3** — workflows + agents (Phase 3 is where Storage Layer folds in per §3.7).
6. **Mastra migration Phase 4-5** — cut over + embed in Mastra Code.

**Quantitative impact (per record type):**

| Record types | Hand-written files (today) | After Bridge 5 + Mastra (out of order) | After Bridge 5 + Mastra (in order) |
|---|---|---|---|
| 4 (current) | 16 | 16 + 4 Mastra wrappers = 20 | 8 + 4 Mastra wrappers = 12 |
| 10 (near-term growth) | 40 | 40 + 10 Mastra wrappers = 50 | 8 + 10 Mastra wrappers = 18 |
| 20 (long-term) | 80 | 80 + 20 Mastra wrappers = 100 | 8 + 20 Mastra wrappers = 28 |

**Sequencing decision rule (operator-stated, easy to revise):**

> **Bridge 5 Approach 3 ships before Mastra migration starts. The Mastra tool surface consumes Bridge 5's output. Storage Layer is deferred to Mastra Phase 3 (per §3.7).**

**Where this prediction is wrong — three failure modes:**

1. **SP3 schemas are still in flux.** The trajectory says Approach 3 is "sequenced after SP3 — SP3's schemas need to stabilize first." If the SP3 schemas are still being edited (e.g., new fields, status enum changes), Approach 3 will need to be redone as SP3 settles. *Test: check the git history on `schemas/*.schema.json` since 2026-06-05; if the diff is non-trivial, defer Approach 3.*
2. **The Mastra migration adds tools for record types not in the 4 covered by Bridge 5.** Today: experiment, risk, decision, observation are schema-derived. Claim, evidence, capability, index, observation-schema-override are not. If Phase 1 needs to mastrafy a tool for, say, `record_create_claim`, the 5th-field-catalogue problem returns *for that record type*. *Test: at Mastra Phase 0, audit which tools map to non-derived record types; either extend Bridge 5 first, or accept the drift for those types.*
3. **The operator values the Mastra destination (Bridge 6 alignment) over the Bridge 5 means (internal cleanup).** If the operator wants to ship the Mastra migration as a Bridge 6 deliverable, the order reverses and we accept the 5th-field-catalogue cost as the price of progress. *Test: confirm with operator whether Bridge 6 is a destination (Mastra) or a means (codegen + no-drift invariant). (Confirmed 2026-06-11: means matter; Bridge 5 ships first.)*

**Not captured as a meta-state finding** (per operator decision 2026-06-11). The decision lives in this research report only; can be promoted to a `meta_state_propose_design` or `meta_state_report` later if reaffirmed.

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
3. ~~Should the existing `coerceParamsToSchema` semantics be preserved 1-to-1 in Mastra, or is this the moment to clean them up?~~ **RESOLVED 2026-06-11**: drop the coercion in Phase 1, gated on the Phase 0 byte-for-byte parity test. Phase 0 runs the existing 675+ tests against the Mastra server; pass = coercion was dead code, drop it. Fail = surface the diffs and decide case-by-case. Trigger to revisit: any Phase 0 test failure.
4. ~~License compatibility.~~ **RESOLVED 2026-06-11**: no action. Apache-2.0 is permissive, compatible with private use, modification, and internal distribution. Record the adoption as a `meta_state_log_change` entry when Phase 0 lands (per Bridge 6 protocol). Revisit only if the loop is published.
5. ~~Phase 3 agents' memory.~~ **RESOLVED 2026-06-11**: defer to Phase 3 plan. Default backend: **LibSQL** (matches the Storage Layer target, Mastra Code's default, avoids Postgres/Mongo dependencies). Likely separate SQLite file from the meta-state registry, same engine. Mastra Code's free Observational Memory is a Phase 5 bonus, not a Phase 3 requirement. Trigger to revisit: at Phase 3 plan, audit whether the agents need cross-session memory that single-session `Memory` doesn't provide.
6. ~~Mastra Code integration mode (Phase 5).~~ **RESOLVED 2026-06-11**: **Mode 1 (peer MCP servers) ships first.** Mode 2 (same Mastra instance via `createMastraCode({...})`) is deferred. Mode 1 is the safe, reversible integration: Droid and Mastra Code both connect to the loop's `MCPServer` via MCP. Mode 2 follows only if the operator's "final Mastra-fy" vision requires single-app coupling. Trigger to revisit: operator's vision requires single-app coupling, OR the Phase 5 surface area is dominated by cross-loop/coding-workflow state that Mode 1's MCP boundary makes awkward.
7. ~~Is `MastraServer` (HTTP, OpenAPI) in scope?~~ **RESOLVED 2026-06-11**: out of scope. The loop's primary surface is MCP (Droid, Mastra Code, any future MCP client). `MastraServer` is a parallel HTTP/OpenAPI surface for non-terminal clients; there's no concrete need today. Add it only if a non-MCP client (web UI, IDE plugin) appears. Trigger to revisit: a concrete non-MCP client requirement surfaces.

**All 7 open questions resolved 2026-06-11.** No questions remain.

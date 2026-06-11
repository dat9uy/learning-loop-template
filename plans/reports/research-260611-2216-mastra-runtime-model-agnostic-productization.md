# Research: Mastra-Based Runtime/Model-Agnostic Productization

**Type:** research
**Date:** 2026-06-11
**Slug:** mastra-runtime-model-agnostic-productization
**Work context:** learning-loop-template
**Aligned to:** Bridge 6 (self-model as product) per `docs/trajectory.md`

## TL;DR

The current `learning-loop-mcp` is **already runtime-agnostic at the MCP transport layer** (Droid CLI connects via stdio to the same server). The runtime-coupling the user perceives is at the *agent-loop coupling* level — the agent that runs the loop must know which MCP server to call, but it doesn't know the underlying runtime.

The main target is **Droid + a Mastra-fy of the whole agentic coding setup + learning loop** (per operator clarification 2026-06-11). The end-state is that the agentic coding workflow *and* the learning loop are both Mastra apps, sharing primitives, talking via MCP. "Mastra Code" is the operator's working name for the agentic-coding surface once it's Mastra-native.

Mastra gives us a higher-level framework (Agent / Tool / Workflow / MCPServer) that:

1. **Keeps the runtime-agnostic claim intact** — `MCPServer` exposes the same stdio/HTTP/SSE transports, so Droid (today) and Mastra Code (future) can both connect.
2. **Promotes the loop's own workflows to first-class objects** — `createWorkflow()` with `.then()/.commit()/.suspend()/.resume()` is more powerful than the current `workflow_*` MCP tools (which are one-shot planning calls, not state machines).
3. **Unifies the agentic coding workflow and the learning loop under one framework** — same `createTool`, same `Agent`, same `createWorkflow`. The learning loop stops being a bespoke MCP server and becomes one Mastra app among many.
4. **Maps cleanly onto Bridge 6's destination** — the loop's self-model (meta-state registry) becomes the substrate an Agent reasons about; the operator stops caring which runtime calls the loop.

**Model-agnosticism is a weaker concern** than runtime-agnosticism for this user (per operator clarification 2026-06-11). Droid already configures the model per-session via `/model`; the loop does not need to police which model is in use. The Mastra router's `"provider/model-name"` format is a free bonus, not a primary driver.

Recommended phasing: **coexistence → mastrafy-deterministic-tools → mastrafy-workflows → new-agents-on-top → unify-with-Mastra-Code**. Stop short of ripping out the existing server until the parallel Mastra server has full test parity and the operator has decided which surface is canonical.

## 1. Current State

### 1.1 What "runtime-agnostic" actually means today

The current setup is already runtime-agnostic at the IPC level:

```jsonc
// .mcp.json  (Claude Code)
{ "mcpServers": { "learning-loop-mcp": { "command": "node", "args": ["tools/learning-loop-mcp/server.js"] } } }
// .factory/mcp.json  (Droid CLI) — identical shape
```

Both surfaces spawn the same `server.js` over stdio. The `McpServer` from `@modelcontextprotocol/sdk@1.29.0` is the same SDK used by any MCP-compatible client. The end-state target is **Droid (today) + Mastra Code (future, the Mastra-fy of the whole agentic coding setup)** — both connect to the same MCP server.

"Pi" (`https://github.com/earendil-works/pi`) was mentioned as a placeholder for any future MCP-compatible runtime; it is not a concrete integration target. The runtime-agnostic claim is forward-looking: as long as the client speaks MCP, it works.

**What is NOT runtime-agnostic today:**

- The agent's *prompts and skill manifest* (`.factory/skills/**` vs `.claude/skills/**`) are duplicated per surface; the agent's prompt engineering assumes a specific Claude/Droid tool vocabulary (`Edit` vs `Create`, `Bash` vs `Execute`).
- The hook matrix (`.claude/coordination/**` vs `.factory/coordination/**`) is mirrored but the runtime hook surface differs.
- The agentic-coding workflow itself is hand-rolled and tightly coupled to the outer agent's tool grammar. This is the gap "Mastra Code" is meant to close.
- Some MCP-tool logic implicitly assumes the calling agent is a particular Claude/Droid class (e.g., `meta_state_relationships` was originally written to traverse fields Claude agents tend to ask about).

### 1.2 What "model-agnostic" currently means

There is **no model coupling at the MCP server level** — the server does no LLM work. Model coupling lives entirely in the agent runtime, where the agent picks a single model per session (Droid configures this via `/model` at session start) and the loop's tools assume that model's tool-use grammar.

**Model selection is a session-level concern, not a loop-level concern.** The operator picks the model once at the start of a Droid session; the loop's tools do not need to know or care which model is in use. This is a *weaker* claim than "the loop itself is model-agnostic" — it is "the loop is model-agnostic because it does not invoke models itself."

Mastra would add a *stronger* claim: the loop could host its own agents (`Agent` class) that themselves are model-agnostic via the model router:

```ts
new Agent({ model: "anthropic/claude-sonnet-4-6" })  // or any "provider/model"
```

For the current scope (Droid + Mastra Code), this is a **free bonus, not a primary driver**. The migration does not need to optimize for per-deployment model flips; the model's per-session choice in the outer agent is enough.

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
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐
│ Claude Code  │  │ Droid CLI    │  │ Pi (future)  │  │ Web UI   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬────┘
       │ MCP (stdio)     │ MCP (stdio)     │ MCP (HTTP)    │ MCP (HTTP)
       └────────────────┴─────────────────┴───────────────┘
                                │
                  ┌─────────────▼──────────────┐
                  │ Mastra MCPServer           │
                  │   tools: { ... }           │  ← productized loop
                  │   agents: { ... }          │
                  │   workflows: { ... }       │
                  └────────────────────────────┘
```

Runtime-agnostic at the MCP transport layer (today: ✅ ; after: ✅). The agent prompts inside Mastra are decoupled from the calling agent's vocabulary — Mastra's agents don't care whether their caller is Claude or Pi.

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

**Phase 5 — Unify with Mastra Code (long-term, post-Phase 4).**
- "Mastra Code" is the Mastra-native agentic coding surface (per operator's working definition 2026-06-11).
- Phase 5 explores how the learning loop's Mastra app and the agentic coding Mastra app share primitives — `createTool` definitions, `Agent` instructions, storage, etc.
- Out of scope for this research report. The boundary between "loop" and "agentic coding" is the largest open question (Q6 in §8).

Each phase is independently shippable. Phases 0–2 are pure refactors (no behavior change). Phases 3–5 are capability additions and require a new plan with separate review.

### 3.5 What does NOT change

- **The records model.** `records/<surface>/{decisions,experiments,risks}.yaml` and `records/observations/*.yaml` remain the source of truth. Mastra hosts the *access patterns*; it doesn't own the storage.
- **The gate logic.** The constraint patterns in `core/patterns.json` and the staleness check in `core/inbound-state.js` are runtime-agnostic by construction. They move into the Mastra tools unchanged.
- **The hooks.** `.claude/coordination/**` and `.factory/coordination/**` are still needed — they intercept tool calls *before* they reach MCP. Mastra doesn't replace the gate; it consumes the gate's decisions.
- **The meta-state registry.** `meta-state.jsonl` is the Bridge 6 product. Mastra hosts the `meta_state_*` tools; it doesn't replace the registry.
- **The MCP transport.** We still speak MCP to Claude/Droid. We just host the server differently.

### 3.6 What changes

- **Tool registration moves from `McpServer.tool()` to `MCPServer({ tools: { ... } })`.** Same wire format. Different in-process registration.
- **Wire format coercion logic moves into Mastra.** Today, `tool-registry.js#coerceParamsToSchema` does JSON-string-to-array/bool/number coercion. Mastra's `createTool` validates inputs via Zod and the input coercion is built in.
- **`{item: X}` unwrap logic moves into Mastra** (it was a workaround for our specific MCP SDK wire framing). If Mastra's `createTool` accepts the same envelopes, the `unwrapItemWrap` helper can be deleted.
- **One MCP server becomes two surfaces under one Mastra app:** tools (procedural), agents (LLM-driven), workflows (multi-step). Each is registered on the same `MCPServer`.
- **Model selection becomes a per-deployment env var.** `MASTRA_AGENT_MODEL=anthropic/claude-sonnet-4-6` (or whatever) flips the model for all agents. Today, the model is implicitly the outer agent's model.

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
- The "Mastra Code" unification (Phase 5) extends this further: the loop and the agentic-coding workflow share primitives, so the loop's self-model can influence the agentic-coding workflow and vice versa.

Concretely: today, "is this finding still valid?" requires the outer agent to read `meta-state.jsonl`, call `meta_state_derive_status`, interpret the result. With a Mastra Agent, the loop itself answers: "is finding X still valid?" returns `{ valid: true, reason: "...", evidence: [...] }` directly, and the outer agent just calls the `ask_self_model_agent` tool.

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
- `https://mastra.ai/reference/tools/mcp-server` — `MCPServer` reference (verified 2026-06-11)
- `https://mastra.ai/reference/tools/create-tool` — `createTool()` reference (verified 2026-06-11)
- `https://mastra.ai/reference/agents/agent` — `Agent` reference (verified 2026-06-11)
- `https://mastra.ai/reference/workflows/workflow` — `createWorkflow` reference (verified 2026-06-11)
- `https://mastra.ai/reference/tools/mcp-client` — `MCPClient` reference (verified 2026-06-11)
- `https://mastra.ai/guides/migrations/upgrade-to-v1/mcp` — v0.x→v1.x migration (verified 2026-06-11)
- `https://mastra.ai/guides/guide/publishing-mcp-server` — packaging + npm publish (verified 2026-06-11)
- `https://mastra.ai/guides/guide/notes-mcp-server` — end-to-end tutorial (verified 2026-06-11)

## 8. Unresolved Questions (post-clarification)

1. ~~What is "Pi"?~~ **RESOLVED 2026-06-11**: placeholder for any future MCP-compatible runtime. Concrete target is Droid + a future "Mastra Code" (Mastra-native agentic coding surface).
2. ~~Per-deployment model selection vs per-agent.~~ **RESOLVED 2026-06-11**: model selection is a session-level concern handled by Droid's `/model`. The loop does not need its own model config; per-agent config is unnecessary.
3. **Should the existing `coerceParamsToSchema` semantics be preserved 1-to-1 in Mastra, or is this the moment to clean them up?** The semantics were added to work around the raw SDK's wire format; Mastra may not need them. Recommend: drop them in Phase 1 and let the test suite catch any client that depends on the looseness.
4. **License compatibility.** `@mastra/mcp` is Apache-2.0. Our project is "private / not published." No conflict, but worth recording in `meta_state_log_change` once we adopt.
5. **Phase 3 agents' memory.** The `intakeAgent` and `selfImprovementAgent` benefit from memory (a thread that persists across the same conversation). Mastra's `Memory` requires a storage backend (Postgres/LibSQL/Mongo). Do we want to add a storage dependency? Or use `memory: false` and rely on the outer agent's context? Recommend defer to Phase 3 plan.
6. **Mastra Code scope.** What does "Mastra Code" actually contain? A separate Mastra app for agentic coding? A shared library that the loop depends on? The exact boundary between "learning loop" and "agentic coding workflow" is the largest open question and deserves its own brainstorm when Phase 0 is ready to start.
7. **Is `MastraServer` (HTTP, OpenAPI) in scope?** It would let us expose the loop to non-MCP clients (e.g., a future web UI). Out of scope for the loop today but worth a follow-up question to the operator.

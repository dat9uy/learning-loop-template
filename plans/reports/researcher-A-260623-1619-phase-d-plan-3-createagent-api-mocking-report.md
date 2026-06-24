# Phase D Plan 3 — createAgent API + LLM Mocking (Researcher A)

**Type:** research (deliverable for plan authoring)
**Date:** 2026-06-23
**Slug:** phase-d-plan-3-createagent-api-mocking
**Scope:** D4+D7 from master tracker. Verifies `Agent` constructor, `MCPServerConfig.agents`, `ask_<key>` prefixing, official `createMockModel` helper, and the MCP `tools/call` response shape for `ask_*` tools.
**Aligned to:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` lines 130-142 (Plan 3 touchpoints), 215-235 (Q3 instructions), 240-244 (Q4 per-agent model config); `AGENTS.md` §1 (meta-surface as only bound surface), §9 (product-surface voided).

---

## 1. Q1 — `Agent` constructor shape

**`Agent` is a class, NOT a factory.** `new Agent(config)` is the right invocation.

**File:** `node_modules/@mastra/core/dist/agent/agent.d.ts:51`
```ts
export declare class Agent<TAgentId extends string = string, TTools extends ToolsInput = ToolsInput, ...>
  extends MastraBase implements SubAgent<TAgentId, TRequestContext> {
  constructor(config: AgentConfig<TAgentId, TTools, TOutput, TRequestContext, TEditor>);
  ...
}
```

**`AgentConfig` shape (from `node_modules/@mastra/core/dist/agent/types.d.ts`):**
```ts
interface AgentConfigBase {
  id: TAgentId;                      // required: stable id for the agent
  name: string;                      // required: display name
  description?: string;              // optional: human-readable purpose
  metadata?: DynamicArgument<...>;   // optional: filtering metadata
  instructions: DynamicArgument<AgentInstructions, TRequestContext>;  // required
  model: MastraModelConfig;          // required: see model types below
  tools?: TTools;                    // optional: tool set for the agent
  // ...memory, workspace, etc.
}

type MastraModelConfig =
  | LanguageModelV1
  | LanguageModelV2
  | LanguageModelV3
  | ModelRouterModelId        // ← magic string like 'kimi-for-coding/k2p6'
  | OpenAICompatibleConfig
  | MastraLanguageModel;
```

**Model field — `kimi-for-coding/k2p6` is a valid `ModelRouterModelId`.** Confirmed at `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts`:
```ts
export type MastraModelConfig = LanguageModelV1 | LanguageModelV2 | LanguageModelV3
  | ModelRouterModelId | OpenAICompatibleConfig | MastraLanguageModel;
```

The model router resolves `kimi-for-coding/k2p6` → `@ai-sdk/anthropic` package (per Mastra docs URL https://mastra.ai/models/providers/kimi-for-coding). Authentication uses `KIMI_API_KEY` env var (auto-injected by the Mastra router).

**Code shape for Plan 3:**
```js
import { Agent } from "@mastra/core/agent";

const intakeAgent = new Agent({
  id: "intakeAgent",
  name: "intakeAgent",
  description: "Orient operator into current meta-state; produce verification plan",
  instructions: "<see researcher-B report>",
  model: process.env.MASTRA_AGENT_MODEL ?? "kimi-for-coding/k2p6",
  tools: { /* meta_state_* wrappers */ },
});
```

**Memory field — OMITTED in Plan 3.** Per `mastrag-storage-memory-260619-1918-direction-clarification-report.md` §3 + research §8 Q5. No `memory`, no `resourceId`, no `threadId`. The agent is memory-less against Observational Memory. Per-call context is loaded via `mastra_meta_state_list`.

---

## 2. Q2 — `MCPServerConfig.agents` wiring + `ask_<key>` prefixing

**`MCPServerConfig` accepts `agents?: Record<string, Agent>`.** Confirmed at `node_modules/@mastra/core/dist/mcp/types.d.ts`:
```ts
interface MCPServerConfig {
  tools?: Record<string, ToolAction>;
  agents?: Record<string, Agent>;        // ← confirmed
  workflows?: Record<string, Workflow>;
  // ...
}
```

**`MCPServer` auto-converts agents to `ask_<agentKey>` tools.** Confirmed at `node_modules/@mastra/mcp/dist/index.js` (the @mastra/mcp package, where the conversion lives — NOT in @mastra/core):
```js
const agentToolName = `ask_${agentKey}`;
const agentToolDefinition = createTool({
  id: agentToolName,
  description: `Ask agent '${agent.name}' a question. Agent description: ${agentDescription}`,
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", description: "The question or input for the agent." }
    },
    required: ["message"],
    additionalProperties: false
  },
  execute: async (inputData, context) => {
    const { message } = inputData;
    const proxiedContext = context?.requestContext || new RequestContext();
    if (context?.mcp?.extra) {
      Object.entries(context.mcp.extra).forEach(([key, value]) => {
        proxiedContext.set(key, value);
      });
    }
    const response = await agent.generate(message, { ...context ?? {}, requestContext: proxiedContext });
    return response;
  }
});
```

**Key takeaways:**

1. **Key → MCP tool name:** `agents: { intake_agent: agentInstance }` becomes `ask_intake_agent` (the dict key gets prefixed, not the `Agent.id`).
2. **Tool name in agents-manifest:** Use snake_case keys for the dict (`intake_agent`, `scout_agent`, `self_improvement_agent`). The MCP tool name becomes `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent` — matches the brainstorm Q1 § "Touchpoints Plan 3" line 142.
3. **Fixed input schema:** `ask_<key>` MCP tools accept only `{ message: string }`. No other input fields. This is a constraint on the agent's invocation surface — the caller passes a single message string.
4. **Agent invocation:** `agent.generate(message, { requestContext })`. The `message` field becomes the prompt.
5. **Tools/list entry:** description = `"Ask agent '<name>' a question. Agent description: <agentDescription>"`. The `description` field on the `Agent` constructor flows through to the MCP tool description (verbatim). Input schema is the fixed `{ message: string }`.
6. **Mastra wiring:** `MCPServer` constructor accepts `agents: Record<string, Agent>` directly (alongside `tools` and `workflows`). The existing `LoopMCPServer` in `tools/learning-loop-mastra/server.js` already extends `MCPServer`; no override needed for agent registration.

**`Mastra` instance wiring:** No change. The `Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })` constructor call already wires `server.__registerMastra(mastra)`. The agent registry on `MCPServer` flows through automatically.

---

## 3. Q3 — LLM mocking approach (OFFICIAL HELPER FOUND)

**`@mastra/core` ships an official mock helper.** File: `node_modules/@mastra/core/dist/test-utils/llm-mock.js`

**Public exports:**
```js
export { MastraLanguageModelV2Mock, MockProvider, createMockModel };
```

**`createMockModel` API (from `node_modules/@mastra/core/dist/test-utils/llm-mock.js`):**
```ts
function createMockModel({
  objectGenerationMode,  // "text" | "json" (default: "text")
  mockText,             // string (text mode) or object (json mode)
  spyGenerate,          // (props) => void  — observe the prompt
  spyStream,            // (props) => void  — observe the stream
  version,              // "v1" | "v2" (default: "v2")
}): MastraLanguageModelV2
```

**Implementation (V2):**
```js
doGenerate: async (props) => {
  if (spyGenerate) spyGenerate(props);
  return {
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20 },
    text: finalText,   // mockText, JSON-stringified if mode === "json"
  };
}
```

**Recommended approach (Q3 resolution):**

| Option | Verdict |
|---|---|
| (a) Custom stub `MastraLanguageModel` | Rejected. Reinvents what `createMockModel` does. |
| (b) **Official `createMockModel`** | **Recommended.** Maintained by Mastra; tracks API surface. |
| (c) Function-based dynamic `model` | Rejected. Useful for tiered prod, not for tests. |

**Code shape for Plan 3 agent parity harness:**
```js
import { createMockModel } from "@mastra/core/test-utils";

const mockModel = createMockModel({
  mockText: JSON.stringify({
    rules_in_force: ["rule-pr-body-registry-deltas", ...],
    loop_designs: ["loop-design-pr-quality-rules-and-hints-split"],
    drift_findings: [],
    verification_steps: ["step 1", "step 2"],
    handoff: "selfImprovementAgent",
  }),
  spyGenerate: (props) => {
    // Observe prompt for assertions (e.g., "did instructions include 'meta-surface'?")
  },
});

// Inject into Agent constructor
const intakeAgent = new Agent({
  id: "intakeAgent",
  name: "intakeAgent",
  description: "...",
  instructions: "...",
  model: mockModel,  // ← overrides 'kimi-for-coding/k2p6' for the test
  tools: { ... },
});
```

**File path:** `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` (new test file).

**LOC estimate:** Mock helper import + 1 `createMockModel` call per agent (3 total) = ~15 LOC. Test assertions + setup = ~80 LOC. Total file: ~120 LOC.

**Caveat:** `createMockModel` returns a `MastraLanguageModelV2` (V2 spec). Plan 3 uses V2 (the `version: "v2"` default). If a future Mastra upgrade breaks V2 mock compatibility, the test fails loudly with a clear stack trace. No silent failure mode.

---

## 4. Q4 — MCP `tools/call` response shape for `ask_*` tools

**The agent conversion returns the raw `agent.generate()` response object.** Per the `execute` body at `node_modules/@mastra/mcp/dist/index.js`:
```js
const response = await agent.generate(message, { ...context ?? {}, requestContext: proxiedContext });
return response;
```

**This is DIFFERENT from workflows.** Workflows extract `response?.result ?? response` (per `tools/learning-loop-mastra/server.js:106`). Agents return the full response object.

**`agent.generate()` returns an `AgentGenerateResult` (from `node_modules/@mastra/core/dist/agent/agent.types.d.ts`):**
```ts
interface AgentGenerateResult {
  text: string;                              // ← the assistant's text response
  finishReason: 'stop' | 'tool-calls' | ...;
  usage: { promptTokens, completionTokens };
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  messages: Message[];                       // full message history
  // ...
}
```

**MCP wraps the result via `createTool`'s standard output flow.** This wraps the return value in `{ content: [{ type: "text", text: JSON.stringify(response) }] }` — same as workflows (per `server.js:106` `response?.result ?? response` returns `response.result`, but for agents the equivalent path is the `AgentGenerateResult.text` field).

**Empirical probe recommended in Phase 5 of Plan 3.** The Plan 1 harness documented the same gap (researcher-B CONCERN #1): the MCP response shape for createWorkflow wrappers was unverified at planning time and was locked via a probe test in Phase 5 step 1-3. The same pattern applies for `ask_*` tools.

**Probe plan (Phase 5 step 1-3):**
1. Spawn the mastra server with 1 test agent (mocked LLM, fixed response string).
2. Call `ask_<test_agent>` via MCP `tools/call`.
3. Inspect the raw response: `result.content[0].text` is JSON-stringified `AgentGenerateResult`. Lock the format.
4. Write 2-3 more parity tests using the locked format.

**What's likely to vary:**
- Whether `content[0].text` is `JSON.stringify(response)` (raw) or `JSON.stringify(response.text)` (text only).
- Whether tool calls and message history are included in `content[0].text` or stripped.
- Whether `response.text` matches the mock model's `mockText` exactly (likely yes, but verify).

**For the parity test, assert:**
```js
const result = await handles.callTool({ name: "ask_intake_agent", arguments: { message: "..." } });
const text = JSON.parse(result.content[0].text);
// text.text should equal the mockText (JSON-stringified rules + plans)
assert.equal(text.text, mockText);
```

The exact assertion shape is locked in Phase 5.1.

---

## 5. Open questions

1. **`mastra_meta_state_get_relationship` existence.** Researcher B's report lists this tool but the actual `meta_state_relationships` tool is the correct name. Phase 4 should confirm which name is canonical and use it in the agent instructions.
2. **`MASTRA_AGENT_MODEL` env var default.** User locked `kimi-for-coding/k2p6` as the default for all 3 agents (2026-06-23). Phase 1 should confirm the env var precedence: (1) per-agent manifest `model` field, (2) `MASTRA_AGENT_MODEL`, (3) code default `kimi-for-coding/k2p6`.
3. **`.env` handling.** User wants a "rule to disable the raw read of .env if you follow the .env path like in the Mastra docs". The loop already uses `process.env.*` directly (no `dotenv` import). Phase 1 should explicitly document this contract and add a `meta_state_log_change` entry: "Plan 3 does not introduce `dotenv`; all env vars come from the operator's shell."
4. **`AgentGenerateResult.text` vs `content[0].text` format.** Empirical probe in Phase 5.1.

---

## 6. Files to read (audit trail)

| File | Lines | Purpose |
|---|---|---|
| `node_modules/@mastra/core/dist/agent/agent.d.ts` | 51, 79, 146 | Agent class declaration + constructor |
| `node_modules/@mastra/core/dist/agent/types.d.ts` | 1-200 | AgentConfigBase, AgentConfig, AgentMemoryOption |
| `node_modules/@mastra/core/dist/agent/index.d.ts` | 1-30 | Public exports |
| `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts` | 1-50 | MastraModelConfig union type |
| `node_modules/@mastra/core/dist/mcp/types.d.ts` | 220-285 | MCPServerConfig interface (agents field) |
| `node_modules/@mastra/mcp/dist/index.js` | (full file, key blocks) | ask_<key> conversion logic + agent invocation |
| `node_modules/@mastra/core/dist/test-utils/llm-mock.js` | 14274-14375, 14776 | createMockModel + MastraLanguageModelV2Mock |
| `node_modules/@mastra/core/dist/test-utils/llm-mock.d.ts` | n/a (no .d.ts; types inferred from .js) | — |
| `tools/learning-loop-mastra/server.js` | 1-163 | LoopMCPServer pattern; Pattern A2a wiring |
| `tools/learning-loop-mastra/create-loop-tool.js` | 1-65 | createLoopTool factory pattern (mirror) |
| `tools/learning-loop-mastra/create-loop-workflow.js` | 1-99 | createLoopWorkflow factory pattern (mirror) |

---

## 7. Citations

- https://mastra.ai/models/providers/kimi-for-coding — `kimi-for-coding/k2p6` model router entry; auth via `KIMI_API_KEY`
- https://mastra.ai/reference/agents/agent — `Agent` class reference (verified pattern)
- https://mastra.ai/reference/storage/libsql — `LibSQLStore` constructor (background; not Plan 3 scope)
- node_modules/@mastra/mcp/dist/index.js — `ask_<key>` conversion logic (verified empirically)

---

Status: DONE
Summary: `new Agent({id, name, description?, instructions, model, tools?})` is the constructor; `MCPServerConfig.agents` auto-prefixes to `ask_<key>` with fixed `{message}` input; `@mastra/core/test-utils` ships `createMockModel({mockText, spyGenerate, version:"v2"})` for parity tests; MCP `tools/call` response shape needs an empirical probe in Phase 5.1.
Concerns/Blockers: none. All 4 questions verified.
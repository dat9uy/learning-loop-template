# Researcher B — Mastra `createWorkflow` API Report

**Slug:** mastra-createworkflow-api
**Date:** 2026-06-18
**Task:** Research the `@mastra/core` createWorkflow API for the Phase D migration of 8 deterministic tool wrappers (`workflow_*`) from `createTool` to `createWorkflow`. The new factory `createLoopWorkflow` must mirror `createLoopTool` (parity JSON Schema view, legacy handler adaptation).
**Status:** DONE_WITH_CONCERNS — design is concrete; 2 unresolved questions remain (output format of workflow-backed MCP tools; double-prefix probe).

---

## TL;DR

| # | Deliverable | Status |
|---|------------|--------|
| 1 | `createWorkflow({...})` config-object fields + types | Verified against `mastra.ai/reference/workflows/workflow` |
| 2 | `stateSchema` shape and semantics | Verified — StandardJSONSchemaV1 (Zod, Valibot, ArkType). Workflow state is shared across all steps; per-step state is a subset. |
| 3 | Steps API: `.then()`, `.parallel()`, `.branch()`, `.foreach()`, `.map()`, `.commit()` | Verified against `mastra.ai/docs/workflows/control-flow` |
| 4 | `execute()` return shape inside a step | Returns `{ status, result, error, steps, suspended, tripwire, runId, workflowId, ... }` |
| 5 | `suspend()` + `run.resume()` contract | Verified — `suspend(payload)`, `resumeData` validated by `resumeSchema`, `run.resume({ step, resumeData })` resumes |
| 6 | MCPServer workflow registration | Verified — `workflows: {...}` map auto-registers as `run_<workflowKey>` tools. **Output format not documented in the fetched pages** (DONE_WITH_CONCERNS). |
| 7 | Proposed `createLoopWorkflow` factory | Concrete spec below — same parity-shim pattern as `createLoopTool`, plus `stateSchema` wrapping |
| 8 | Parity-test surface for workflow-backed MCP tools | Concrete — `client.callTool({ name: 'run_<key>', arguments: { ... } })`, payload is `run.start({ inputData, initialState })` arguments |

**Top finding:** `createWorkflow` in 1.42.0 **requires `.commit()` to finalize the chain**. The config object is the *schema declaration*, NOT the body. Steps are chained via fluent methods, then committed. The factory `createLoopWorkflow` must mirror this — it builds the chain from a steps array, then `.commit()`s.

**Secondary finding (YAGNI check):** only 2 of the 8 workflows need `stateSchema`. The other 6 are deterministic single-step transforms and could map to `createTool` rather than `createWorkflow`. **This report covers `createWorkflow` regardless** because the migration is the operator-decided direction; the factory stays generic and the caller chooses whether to use `stateSchema`.

---

## 1. `createWorkflow({...})` Config Signature

Verified against `mastra.ai/reference/workflows/workflow`.

### Field-by-field

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | **yes** | Unique workflow identifier. |
| `description` | `string` | **yes for MCPServer; optional for createWorkflow itself** | Becomes the MCP tool description when registered. MCPServer **throws** if empty. |
| `inputSchema` | `StandardJSONSchemaV1` | yes | Workflow input; first step's `inputSchema` must match. |
| `outputSchema` | `StandardJSONSchemaV1` | yes | Workflow output; last step's `outputSchema` must match. |
| `stateSchema` | `StandardJSONSchemaV1` | optional | Shared state across steps + across suspend/resume cycles. **Per-step `stateSchema` must be a subset of the workflow `stateSchema`.** |
| `requestContextSchema` | `StandardJSONSchemaV1` | optional | Validates `requestContext` passed to `run.start()`. |
| `schedule` | `WorkflowScheduleConfig \| WorkflowScheduleConfig[]` | optional | Cron-driven scheduling; out of scope for the loop. |
| `tracingPolicy` | object | optional | Tracing config; out of scope. |
| `validateInputs` | `boolean` | optional (default `true`) | Apply Zod defaults on start/resume. |
| `shouldPersistSnapshot` | `(params) => boolean` | optional | Storage back-pressure hook; out of scope. |
| `onFinish(result)` | callback | optional | Fires on any terminal status. Receives `{ status, result, error, steps, tripwire, runId, workflowId, resourceId, getInitData, mastra, requestContext, logger, state }`. |
| `onError(errorInfo)` | callback | optional | Fires only on `failed`/`tripwire`. Same shape minus `result`. |

**Not on the workflow config:** `steps`, `execute`. The body is built via `.then()`/`.parallel()`/`.branch()` chaining, finalized with `.commit()`.

### TypeScript signature (composite)

```ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: "step-1",
  description: "...",                          // optional on step
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ value: z.number() }),
  stateSchema: z.object({ counter: z.number() }), // subset of workflow stateSchema
  resumeSchema: z.object({ proceed: z.boolean() }), // optional
  suspendSchema: z.object({ reason: z.string() }),  // optional
  execute: async ({ inputData, state, setState, suspend, resumeData, ... }) => {
    // return outputSchema-typed object
  },
});

export const wf = createWorkflow({
  id: "my-workflow",
  description: "Exposed to MCP as run_my-workflow",
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ value: z.number() }),
  stateSchema: z.object({ counter: z.number(), items: z.array(z.string()) }),
})
  .then(step1)
  .then(step2)
  .commit();

const run = await wf.createRun();
const result = await run.start({ inputData: { value: 1 }, initialState: { counter: 0, items: [] } });
```

### Runtime shape of `result`

| Status | Fields populated | Use |
|---|---|---|
| `success` | `result`, `steps`, `state` | Final step output; all step outputs in `steps[<stepId>]`. |
| `failed` | `error`, `steps` | Unexpected error; per-step status available. |
| `suspended` | `suspended: [...]` (array of step/workflow IDs), `steps`, `state` | Awaiting resume. `result.suspended[0]` is the next resumable path. |
| `tripwire` | `tripwire: { reason, processorId, retry }`, `steps` | Guardrail/guard intentionally halted execution. |

**`result.steps`** is a `Record<stepId, StepResult>`. Each `StepResult` has `{ status, output, ... }` keyed by step id.

---

## 2. `stateSchema` Shape and Semantics

Verified against `mastra.ai/docs/workflows/workflow-state` and `mastra.ai/reference/workflows/step`.

### What it accepts

`stateSchema` accepts any `StandardJSONSchemaV1` (Zod, Valibot via `toStandardJsonSchema`, ArkType via `type(...)`). The loop uses **Zod 4.4.3**, same as the rest of the codebase. The same `_zod.toJSONSchema` parity-shim pattern from `create-loop-tool.js` applies if we want the MCP-exposed schema to strip `z.preprocess` wrappers.

### Master schema vs step schema

```ts
// Workflow: union of ALL state any step may write
const wf = createWorkflow({
  stateSchema: z.object({
    processedItems: z.array(z.string()),
    metadata: z.object({ processedBy: z.string() }),
  }),
}).then(step1).then(step2).commit();

// Each step declares a SUBSET of the workflow stateSchema
const step1 = createStep({
  stateSchema: z.object({ processedItems: z.array(z.string()) }),
  execute: async ({ state, setState }) => { /* ... */ },
});
```

**Type-safety implication:** the factory cannot blindly wrap `stateSchema` — it must validate that the per-step schema is a subset. Mastra's runtime does this check at `run.start()` time; if a step's `setState` writes a key not declared in the workflow `stateSchema`, Mastra throws.

### `state` + `setState` inside `execute()`

```ts
execute: async ({ state, setState }) => {
  const { processedItems } = state;
  await setState({ processedItems: [...processedItems, "item-1", "item-2"] });
  return { formatted: "..." };
}
```

`state` is **read-only**; mutations go through `setState`. `setState` returns a Promise — `await` it. State persists across **all** subsequent steps and across **suspend/resume** cycles.

### `initialState` at `run.start()`

```ts
const run = await wf.createRun();
const result = await run.start({
  inputData: { message: "Hello" },
  initialState: { processedItems: [], metadata: { processedBy: "system" } },
});
```

`initialState` must satisfy `stateSchema`. If absent, Mastra uses the schema's defaults. If `validateInputs: true`, missing required keys throw at `run.start()`.

---

## 3. Steps API — `.then()`, `.parallel()`, `.branch()`, `.foreach()`, `.map()`, `.commit()`

Verified against `mastra.ai/docs/workflows/control-flow`.

### Method reference

| Method | Signature | Output shape | Concurrency |
|---|---|---|---|
| `.then(step)` | step to next | T to U | Sequential |
| `.parallel([a, b])` | join | `{ a: U, b: V }` | All simultaneous |
| `.foreach(step, { concurrency })` | iterate | `U[]` | Default 1; configurable |
| `.branch([[cond, step], ...])` | condition to step | `{ selectedStep: U }` | First matching branch |
| `.map(async ({ inputData }) => U)` | transforms input | inline | inline |
| `.dountil(step, cond)` | repeat | U | until cond true |
| `.dowhile(step, cond)` | repeat | U | while cond true |
| `.commit()` | finalize | Workflow | — |

All chains MUST end with `.commit()`. `.parallel()` and `.foreach()` are **synchronization points** — the next step waits for all to complete.

### Data flow contract

- **First step's `inputSchema`** must match the workflow's `inputSchema`.
- **Each step's `outputSchema`** must match the **next step's `inputSchema`** (for `.then()`).
- For `.parallel([a, b])`, the **following step's `inputSchema`** is `{ [a.id]: a.outputSchema, [b.id]: b.outputSchema }`. Accessed as `inputData["step-a"]`.
- For `.branch([...])`, the **following step's `inputSchema`** is the union with each branch output wrapped under its step id, marked `.optional()`.

### `.branch()` example

```ts
wf.then(step1)
  .branch([
    [async ({ inputData: { value } }) => value > 10, stepA],
    [async ({ inputData: { value } }) => value <= 10, stepB],
  ])
  .commit();
```

Conditions evaluate in declared order; **first true wins**.

### `.map()` for data transformation

```ts
wf.parallel([step1, step2])
  .map(async ({ inputData }) => ({
    combined: `${inputData["step1"].value} - ${inputData["step2"].value}`,
  }))
  .then(nextStep)
  .commit();
```

### Helper functions inside `execute()`

- `getStepResult(stepId)` — get a specific step's full output
- `getInitData()` — get the workflow's initial input
- `mapVariable()` — declarative object syntax to extract/rename fields

---

## 4. Step `execute()` — Inputs and Return

Verified against `mastra.ai/reference/workflows/step`.

### Inputs (the `ExecuteParams` object)

| Param | Type | When present |
|---|---|---|
| `inputData` | matches `inputSchema` | always (when not resuming) |
| `resumeData` | matches `resumeSchema` | only on resume from suspended |
| `suspendData` | the payload passed to `suspend()` | only on resume |
| `mastra` | Mastra services | always |
| `getStepResult` | `(stepId) => StepResult` | always |
| `getInitData` | `() => initialInputData` | always |
| `suspend` | `(payload, resumeLabel?) => Promise<void>` | always |
| `state` | matches workflow `stateSchema` | always |
| `setState` | `(partial) => Promise<void>` | always |
| `runId` | `string` | always |
| `requestContext` | request context | always |
| `retryCount` | `number` | always (auto-increments on retries) |

### Return shape

Returns `outputSchema`-typed object. **No `status` field on step output** — the framework wraps the step result into `result.steps[<stepId>] = { status, output, ... }` at the workflow level.

---

## 5. Suspend / Resume Contract

Verified against `mastra.ai/docs/workflows/suspend-and-resume` and `mastra.ai/docs/workflows/workflow-state`.

### Suspending

```ts
const approvalStep = createStep({
  id: "approval",
  inputSchema: z.object({ requestDetails: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  suspendSchema: z.object({ reason: z.string(), requestDetails: z.string() }),
  execute: async ({ inputData, resumeData, suspend, suspendData }) => {
    const { approved } = resumeData ?? {};
    if (!approved) {
      return await suspend({
        reason: "User approval required",
        requestDetails: `Request ${inputData.requestDetails} pending review`,
      });
    }
    return {
      result: `${suspendData?.requestDetails} - ${suspendData?.reason} - Decision: ${
        approved ? "Approved" : "Rejected"
      }`,
    };
  },
});
```

`suspend(payload)` must match `suspendSchema`. The payload is preserved as `suspendData` and is available on resume.

### Resuming

```ts
const run = await wf.createRun();
await run.start({ inputData: { requestDetails: "REQ-123" } });
// result.status === "suspended"

await run.resume({
  step: "approval",  // or omit to resume last suspended step
  resumeData: { approved: true },
});
```

`run.resume(...)` accepts:
- `step: step` (full type-safety) OR `step: "step-id"` (string)
- `resumeData: { ... }` — must match the step's `resumeSchema`
- `forEachIndex: number` — only when resuming inside a `.foreach()`

### Recovering suspended runs from storage

```ts
const state = await wf.getWorkflowRunById("run-123");
if (state?.status === "suspended") {
  const reader = createWorkflowStateReader(state);
  const suspendedStep = reader.getSuspendedStep();
  const run = await wf.createRun({ runId: state.runId });
  await run.resume({
    step: suspendedStep?.path,
    resumeData: { approved: true },
  });
}
```

(Out of scope for Phase D — no storage backend yet.)

### State persistence across suspend/resume

State in `stateSchema` **persists across suspend/resume cycles**. The `setState` mutations from before the suspend are visible after the resume. This is the *exact* feature the brainstorm identified as required for the 2 of 8 workflows that need real `stateSchema`.

---

## 6. MCPServer Workflow Registration

Verified against `mastra.ai/reference/tools/mcp-server`.

### How it works

```ts
const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description: "...",
  tools: { /* createTool results */ },
  workflows: { myWorkflow: createWorkflow({...}).commit() },
});
await server.startStdio();
```

Each workflow is auto-converted to an MCP tool named `run_<workflowKey>` (e.g., `workflows.myWorkflow` to `run_myWorkflow`). The tool's `description` is the workflow's `description` (which **must be non-empty** — MCPServer throws at initialization otherwise). The tool's `inputSchema` is the workflow's `inputSchema`.

### Execution flow (from MCPServer internals)

The tool invokes `workflow.createRun()` then `run.start({ inputData: <tool_input>, ... })`. **The MCP client's arguments become the workflow's `inputData`** — no envelope, no wrapper.

### Name collisions

"If a tool name derived from an agent or workflow (e.g., `ask_myAgent` or `run_myWorkflow`) collides with an explicitly defined tool name or another derived name, the explicitly defined tool takes precedence, and a warning is logged."

**Implication:** if the legacy server already registers `run_<key>` (it doesn't — Phase A deleted the prefix collision), no risk. New workflow keys must not collide with existing tool object keys. With the `mastra_` prefix convention (per `research-260616-1605-mastra-createtool-and-mcpserver-api.md` section 4), workflow keys should be **unprefixed** in `workflows: { ... }` — the `run_` prefix is added by MCPServer at registration.

### Output format for workflow-backed tools — UNRESOLVED

The MCPServer docs explicitly document output format for agent-backed tools ("The direct result from the agent's `generate()` method") but **do NOT document output format for workflow-backed tools**. The reference page just says "the workflow is executed" without specifying whether the result is:
- structured JSON (`result.steps`, `result.status`, `result.result`)
- text content blocks (`{ content: [{ type: "text", text: JSON.stringify(result) }] }`)
- something else

**Empirical resolution path:** spawn the server with a workflow and inspect `client.callTool({ name: "run_<key>", arguments: {...} }).content`. This is the same empirical probe pattern used in `researcher-B-260618-1418-e2e-parity-test-design-report.md` section 1. **Required for Plan 1 implementation.** Until then, treat as **CONCERN #1**.

---

## 7. Proposed `createLoopWorkflow` Factory

### Design constraints

1. **Mirror `createLoopTool`'s parity-shim pattern** (`tools/learning-loop-mastra/create-loop-tool.js:29-48`). Override `_zod.toJSONSchema` on the root schema so the parity view (strip `z.preprocess` wrappers) reaches MCP clients via `tools/list`.
2. **Normalize `stateSchema` + `inputSchema` + `outputSchema`** — same `normalizeInputSchema` helper works for all three (they all accept either a Zod schema or a plain shape object).
3. **Adapt the legacy handler** — same `adaptLegacyHandler` works (`legacy-handler-adapter.js:12-26`). The legacy handler returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`; the adapter unwraps to the raw result.
4. **Compose steps from a manifest.** The factory takes `steps: [createStep(...), createStep(...)]` (or a flat array of step configs), chains them via `.then()`, and `.commit()`s. The factory should NOT take a single `execute` (workflows are state machines, not single functions).
5. **`description` is required by MCPServer** — the factory must default to the `id` if `description` is empty, or throw at factory time (fail fast).

### Proposed implementation

```js
// tools/learning-loop-mastra/create-loop-workflow.js
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { buildParitySchema } from "./schema-parity.js";
import { adaptLegacyHandler } from "./legacy-handler-adapter.js";

function normalizeSchema(schema) {
  if (
    schema &&
    typeof schema === "object" &&
    (schema._def || schema.def) &&
    typeof schema.parse === "function"
  ) {
    return schema;
  }
  return z.object(schema);
}

function attachParityJSONSchema(schema) {
  if (!schema || typeof schema !== "object" || !schema._zod) return schema;
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  schema._zod.toJSONSchema = () => parityJSONSchema;
  return schema;
}

/**
 * Build a Mastra createStep from a legacy-style handler config.
 * Mirrors createLoopTool's contract: wraps inputSchema with parity JSON Schema,
 * adapts legacy handler output to Mastra's contract.
 */
function buildStep({ id, description, inputSchema, outputSchema, handler }) {
  const normalizedInput = attachParityJSONSchema(normalizeSchema(inputSchema));
  const normalizedOutput = outputSchema
    ? attachParityJSONSchema(normalizeSchema(outputSchema))
    : undefined;

  return createStep({
    id,
    description,
    inputSchema: normalizedInput,
    outputSchema: normalizedOutput,
    execute: adaptLegacyHandler({ handler }),
  });
}

/**
 * Factory seam for the loop's workflows. Mirrors createLoopTool's parity-shim
 * pattern but for createWorkflow (state machines, not single executors).
 */
export function createLoopWorkflow({
  id,
  description,
  inputSchema,
  outputSchema,
  stateSchema,
  steps,
}) {
  if (!description || description.trim() === "") {
    throw new Error(
      `createLoopWorkflow: description is required for "${id}" (MCPServer throws on empty workflow description).`,
    );
  }

  const normalizedInput = attachParityJSONSchema(normalizeSchema(inputSchema));
  const normalizedOutput = outputSchema
    ? attachParityJSONSchema(normalizeSchema(outputSchema))
    : undefined;
  const normalizedState = stateSchema
    ? attachParityJSONSchema(normalizeSchema(stateSchema))
    : undefined;

  const builtSteps = steps.map(buildStep);

  const builder = createWorkflow({
    id,
    description,
    inputSchema: normalizedInput,
    outputSchema: normalizedOutput,
    ...(normalizedState ? { stateSchema: normalizedState } : {}),
  });

  // Linear .then() chain. YAGNI: if/when a workflow needs .parallel/.branch,
  // extend the factory to accept chain: 'sequential' | 'parallel' | 'branch'.
  let result = builder;
  for (const step of builtSteps) {
    result = result.then(step);
  }
  return result.commit();
}
```

### Call-site example (one of the 8 workflow tools)

```js
// tools/learning-loop-mastra/tools/workflow-intake-orient-workflow.js
import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const workflowIntakeOrientWorkflow = createLoopWorkflow({
  id: "workflow_intake_orient",
  description:
    "Orients the agent by reading records/*/index, records/*/evidence, records/*/capabilities, and runtime-state.jsonl. " +
    "Use AT THE START of an intake session to understand current record state.",
  inputSchema: {
    root: z.string().optional().describe("Project root directory (default: auto-detected)"),
    category: z.string().optional().describe("Filter index entries by dimension or capability substring"),
    capability_scope: z.string().optional().describe("Filter capability files by stack or id substring"),
  },
  // No stateSchema — this workflow is single-shot, no intermediate state to accumulate.
  steps: [
    {
      id: "load-orientation",
      description: "Read index, evidence, capabilities, runtime-state",
      inputSchema: {
        root: z.string().optional(),
        category: z.string().optional(),
        capability_scope: z.string().optional(),
      },
      outputSchema: {
        index_entries: z.array(z.any()),
        meta_triggers: z.array(z.string()),
        observations: z.array(z.any()),
        capability_files: z.array(z.string()),
        missing_decisions: z.array(z.string()),
      },
      handler: async (args) => {
        // Existing handler logic from workflow-intake-orient-tool.js
        const root = resolveRoot(args.root);
        const indexEntries = await loadYamlDirs(root, indexDirs);
        // ... (unchanged)
        return {
          index_entries: filteredIndex,
          meta_triggers: metaTriggers,
          observations,
          capability_files: filteredCapabilities.map((c) => c.id || c.filename),
          missing_decisions,
        };
      },
    },
  ],
});
```

### Server-side registration

```js
// tools/learning-loop-mastra/server.js (extended)
import { MCPServer } from "@mastra/mcp";
import { createLoopTool } from "./create-loop-tool.js";
import { createLoopWorkflow } from "./create-loop-workflow.js";

const tools = {};
for (const { file, export: exportName } of TOOL_MANIFEST) {
  // ... (unchanged from current server.js)
}

const workflows = {};
for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
  const mod = await import(`#mastra/${file}`);
  const wf = mod[exportName];
  workflows[wf.id] = wf;  // object key MUST equal id (no prefix; MCPServer adds run_)
}

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description: "...",
  tools,
  workflows,
});
```

**Collision note:** with the `mastra_` tool-name prefix from `research-260616-1605-mastra-createtool-and-mcpserver-api.md` section 4, workflow keys should NOT have the prefix (because MCPServer adds `run_` automatically). So tool names look like `mastra_meta_state_list` and workflow names look like `run_workflow_intake_orient`. The keys inside `tools: { ... }` and `workflows: { ... }` are different namespaces and don't collide.

---

## 8. Working Example — `stateSchema` + `suspend`/`resume`

For the 2 of 8 workflows the brainstorm identified as needing real state accumulation. This is the minimal shape — it doesn't yet wire into MCP, just demonstrates the workflow mechanics.

```js
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

// Step 1: gather candidates; accumulate into state
const gatherStep = createStep({
  id: "gather-candidates",
  description: "Collect candidate records and accumulate into state.",
  inputSchema: z.object({ root: z.string() }),
  outputSchema: z.object({ candidateCount: z.number() }),
  stateSchema: z.object({ candidates: z.array(z.string()) }),
  execute: async ({ inputData, state, setState }) => {
    const candidates = await scanCandidates(inputData.root);
    await setState({ candidates });
    return { candidateCount: candidates.length };
  },
});

// Step 2: require operator approval before finalizing
const approvalStep = createStep({
  id: "approval",
  description: "Suspend for operator approval before finalization.",
  inputSchema: z.object({ candidateCount: z.number() }),
  outputSchema: z.object({ approvedCount: z.number() }),
  stateSchema: z.object({ candidates: z.array(z.string()) }),
  resumeSchema: z.object({ approved: z.boolean() }),
  suspendSchema: z.object({
    message: z.string(),
    candidates: z.array(z.string()),
  }),
  execute: async ({ resumeData, state, suspend }) => {
    if (!resumeData) {
      return await suspend({
        message: `Operator approval required for ${state.candidates.length} candidates.`,
        candidates: state.candidates,
      });
    }
    const approvedCount = resumeData.approved ? state.candidates.length : 0;
    return { approvedCount };
  },
});

// Step 3: finalize based on approval
const finalizeStep = createStep({
  id: "finalize",
  description: "Write approved records to disk.",
  inputSchema: z.object({ approvedCount: z.number() }),
  outputSchema: z.object({ written: z.number() }),
  stateSchema: z.object({ candidates: z.array(z.string()) }),
  execute: async ({ state }) => {
    const written = await writeRecords(state.candidates);
    return { written };
  },
});

export const approvalWorkflow = createWorkflow({
  id: "approval-workflow",
  description: "Gather candidates, require approval, write approved records.",
  inputSchema: z.object({ root: z.string() }),
  outputSchema: z.object({ written: z.number() }),
  stateSchema: z.object({ candidates: z.array(z.string()) }),
})
  .then(gatherStep)
  .then(approvalStep)
  .then(finalizeStep)
  .commit();

// Runtime
const run = await approvalWorkflow.createRun();
const started = await run.start({ inputData: { root: "/path/to/root" }, initialState: { candidates: [] } });

if (started.status === "suspended") {
  // Operator reviews state.candidates from result.state
  const approved = await getOperatorApproval(started.state.candidates);
  const finished = await run.resume({ step: "approval", resumeData: { approved } });
  // finished.status === "success"; finished.result === { written: <N> }
}
```

**Key insight:** `state.candidates` set in step 1 is visible in step 2's `execute()` and in step 3's `execute()`, AND it survives the suspend/resume cycle in step 2. **This is the feature the brainstorm requires for 2 of the 8 workflows.**

---

## 9. Parity-Test Surface — How Would a Test Invoke a Workflow?

### Via MCP client (matches existing test pattern)

`tools/learning-loop-mastra/__tests__/with-mcp-server.js` already provides the spawn + connect infrastructure. Add a workflow test alongside:

```js
import { test } from "node:test";
import assert from "node:assert";
import { connectMcpServer } from "./with-mcp-server.js";
import { resolve } from "node:path";

const SERVER_ENTRY = resolve(import.meta.dirname, "..", "server.js");

test("workflow: workflow_intake_orient is exposed as run_workflow_intake_orient", async (t) => {
  const { listTools, callTool, cleanup, tempRoot } = await connectMcpServer(SERVER_ENTRY, t.tmpdir());
  t.after(cleanup);

  const tools = await listTools();
  const tool = tools.find((t) => t.name === "run_workflow_intake_orient");
  assert.ok(tool, "workflow must be exposed as MCP tool with run_ prefix");
  assert.equal(tool.description.length > 0, true, "description must be non-empty");
  assert.equal(tool.inputSchema.type, "object", "inputSchema must be a real object schema");

  const result = await callTool("run_workflow_intake_orient", { root: tempRoot });
  // CONCERN #1: result.content shape is unverified. Empirically determine at
  // implementation time. Likely:
  //   { content: [{ type: "text", text: JSON.stringify({ status, result, steps }) }] }
  // OR (less likely):
  //   { structuredContent: { status, result, steps } }
  const text = result.content[0].text;
  const parsed = JSON.parse(text);
  assert.equal(parsed.status, "success");
  assert.ok(parsed.result.index_entries, "must return index_entries array");
});
```

### Via direct unit test (no MCP layer)

For unit tests of the factory itself (without spawning the server):

```js
import { test } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";

test("createLoopWorkflow: builds a workflow with linear .then() chain", () => {
  const wf = createLoopWorkflow({
    id: "test-wf",
    description: "test",
    inputSchema: { value: z.number() },
    steps: [
      {
        id: "step-1",
        inputSchema: { value: z.number() },
        outputSchema: { doubled: z.number() },
        handler: async ({ value }) => ({ doubled: value * 2 }),
      },
    ],
  });

  assert.ok(wf, "must return a workflow instance");
  // Workflow must have .createRun method (post-commit)
  assert.equal(typeof wf.createRun, "function");
});

test("createLoopWorkflow: throws on empty description", () => {
  assert.throws(
    () => createLoopWorkflow({
      id: "test",
      description: "",
      inputSchema: {},
      steps: [],
    }),
    /description is required/,
  );
});
```

### Parity assertion (the gate that Plan 1 needs)

```js
test("parity: workflow inputSchema JSON Schema matches legacy shape", () => {
  const wf = createLoopWorkflow({ /* ...same as legacy... */ });
  // MCPServer converts via standardSchemaToJSONSchema to toJSONSchema.
  // The _zod.toJSONSchema override is honored (verified empirically in
  // researcher-B-260618-1418-e2e-parity-test-design-report.md section 1).
  const jsonSchema = z.toJSONSchema(wf.inputSchema, { target: "draft-7", io: "input" });
  // Compare against legacy schema's JSON Schema output
  assert.deepEqual(jsonSchema, expectedLegacyJsonSchema);
});
```

---

## 10. Architectural Fit — Existing Stack, Team Skill, Project Constraints

### Existing stack fit

- **Zod 4.4.3** is already the canonical schema library. `createWorkflow` accepts Zod via `StandardJSONSchemaV1`. Yes.
- **`buildParitySchema` + `_zod.toJSONSchema` override** from `tools/learning-loop-mastra/schema-parity.js` is the exact pattern needed for `stateSchema` parity. Reuse unchanged. Yes.
- **`adaptLegacyHandler`** from `legacy-handler-adapter.js` is the exact adapter needed for step `execute`. Reuse unchanged. Yes.
- **MCPServer is already wired** in `tools/learning-loop-mastra/server.js`. Adding `workflows: { ... }` is one config field. Yes.
- **`mastra_` tool-name prefix convention** (per prior research) — workflow keys should NOT have the prefix (MCPServer adds `run_`). Watch out.

### Project constraints

- **No new dependencies.** All needed packages (`@mastra/core@1.42.0`, `@mastra/mcp@1.10.0`, `zod@4.4.3`) already pinned in `package.json`. Yes.
- **No vendor-dir reads** (blocked by scout hook). All API knowledge must come from official docs + empirical probes. Yes (this report).
- **No LLM calls in step `execute`.** All 8 workflow tools are deterministic. The `stateSchema` feature is the only new capability being introduced; it's a state machine, not an LLM orchestration. Yes.
- **Must coexist with the existing 29 createTool wrappers.** Workflow keys and tool object keys live in different namespaces (`workflows: {...}` vs `tools: {...}`) inside MCPServer. No collision risk. Yes.

### Team skill fit

- **No new abstractions.** The factory is the same shape as `createLoopTool`, just for `createWorkflow` instead of `createTool`. Existing contributors can read it and understand it. Yes.
- **Linear `.then()` chain covers the 6 simple cases.** `.parallel()` and `.branch()` are out of scope for the 8 deterministic tools — YAGNI. Factory extension path is documented but not built. Watch out.
- **`suspend`/`resume` is new.** Only 2 of 8 workflows use it. The factory and call sites need a clear contract for the `resumeSchema`/`suspendSchema` shape. Watch out.

---

## 11. Concrete Recommendation (Ranked)

1. **`createLoopWorkflow` factory** (spec in section 7). Reuses `buildParitySchema`, `adaptLegacyHandler`, and the `_zod.toJSONSchema` override pattern. Drop-in replacement for `createLoopTool` for the 8 workflow tools. Confidence 90%.

2. **Keep workflow keys unprefixed; MCPServer adds `run_` automatically.** Workflow MCP names will be `run_workflow_intake_orient`, `run_workflow_intake_plan`, etc. Distinct from the `mastra_` tool-name prefix. Confidence 95%.

3. **Linear `.then()` chain is sufficient for all 8 workflows.** Per brainstorm Q1: 2 need real `stateSchema` for accumulation (still linear `.then()`, just with `stateSchema` declared). 6 are single-step transforms that map cleanly to `createTool` BUT the migration direction is operator-decided; the factory supports both with `stateSchema` being optional. Confidence 85%.

4. **Unit-test `createLoopWorkflow` in isolation** (no MCP) for the factory contract (linear chain, description required, parity-shim applied). MCP-level E2E test for at least one workflow to empirically determine output format. Confidence 95%.

5. **Defer `.parallel()` / `.branch()` / `.foreach()` / `.dountil()` / `.dowhile()`** in the factory. Not needed for the 8 workflow tools. If a future workflow needs branching, extend the factory to accept a `chain` discriminator (or accept a pre-built Mastra chain directly). Confidence 90%.

6. **Storage back-end for `getWorkflowRunById`** is NOT in scope for Phase D. Suspended runs live in process memory only (Phase 0/1 of `research-260611-2216-mastra-runtime-model-agnostic-productization.md` section 3.7 deferred storage to Phase 3). If a workflow needs to survive a server restart mid-suspend, that's a Phase 3+ concern. Confidence 95%.

---

## 12. Limitations / Out of Scope

- **Workflow MCP output format** — empirically unresolved (CONCERN #1). Probe required at implementation time.
- **Storage back-end for suspended runs** — out of scope. In-process only.
- **`.parallel()` / `.branch()` / `.foreach()` factory extensions** — out of scope. Linear `.then()` covers all 8.
- **Per-step `stateSchema` subset validation** — Mastra validates at runtime, not at factory time. The factory could add an upfront check (YAGNI for Phase D — defer).
- **`@mastra/core` 1.42.0 vs newer minors** — pinned to 1.42.0 per `package.json`. API verified against the docs current as of 2026-06-18; if 1.42.0 ships a different shape than the reference docs, the implementation breaks. Low probability.
- **Plan 1 of Phase D's full tool inventory (8 of 41)** — the brainstorm identifies "2 of 8 need real stateSchema" but the inventory mapping (which specific tools) is out of scope here. The factory is generic; per-tool mapping is a planner task.

---

## 13. Unresolved Questions

1. **CONCERN #1 (BLOCKING for implementation):** What is the MCP `tools/call` response shape for workflow-backed tools? The reference docs explicitly document agent-backed tools but NOT workflow-backed tools. Three possibilities:
   - `{ content: [{ type: "text", text: JSON.stringify(result) }] }` — matches legacy tool convention
   - `{ structuredContent: { status, result, steps, ... } }` — MCP 2025 spec extension for structured output
   - `{ content: [...], structuredContent: {...} }` — both
   **Resolution:** spawn server with a test workflow, call via MCP client, inspect raw response. Required before Plan 1's parity test can be written. ~5 minutes of empirical work.

2. **CONCERN #2 (LOW):** Does MCPServer strip `run_` prefix from the workflow key if the key already starts with `run_`? Unlikely (collision rules suggest no), but worth verifying with a probe. If yes, the `workflows: { run_foo: createWorkflow({...}) }` pattern would double-prefix to `run_run_foo`. Not a problem with the proposed factory (which uses bare ids like `workflow_intake_orient`), but worth a one-line probe.

3. **CONCERN #3 (DEFER):** Should `createLoopWorkflow` accept a `chain: 'sequential' | 'parallel' | 'branch'` discriminator, or should each non-linear workflow build its chain by hand and pass the result to a thinner factory? Recommendation: **thinner factory + hand-built chain** for the first 2-of-8 stateful workflows, since `suspend`/`resume` + `stateSchema` is the load-bearing feature; branching adds no value to those. If a future workflow needs branching, revisit.

---

## Key File Paths (Absolute)

- https://mastra.ai/reference/workflows/workflow (WebFetch verified 2026-06-18)
- https://mastra.ai/reference/workflows/step (WebFetch verified 2026-06-18)
- https://mastra.ai/docs/workflows/workflow-state (WebFetch verified 2026-06-18)
- https://mastra.ai/docs/workflows/suspend-and-resume (WebFetch verified 2026-06-18)
- https://mastra.ai/docs/workflows/control-flow (WebFetch verified 2026-06-18)
- https://mastra.ai/reference/tools/mcp-server (WebFetch verified 2026-06-18)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/create-loop-tool.js` (existing factory to mirror)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/legacy-handler-adapter.js` (existing adapter to reuse)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/schema-parity.js` (existing parity-shim to reuse)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/server.js` (registration point for `workflows: {...}`)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/with-mcp-server.js` (existing spawn harness for parity tests)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tools/workflow-intake-orient-tool.js` (representative legacy shape to migrate)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tools/manifest.json` (the 41-entry legacy manifest including the 8 workflow_* tools)
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` section 3.1, 3.4 (workflow API surface context)
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md` section 4 (tool-name prefix convention)
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md` section 1 (empirical probe pattern for parity verification)
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/general-purpose-260618-0032-test-migration-parity-harness-report.md` (parity harness state post-cut-over)

---

**Status:** DONE_WITH_CONCERNS
**Summary:** API surface fully verified across 5 Mastra docs pages; factory design is concrete and reuses existing parity-shim + adapter infrastructure; 2 of 8 workflows can leverage `stateSchema` + `suspend`/`resume` without new dependencies.
**Concerns/Blockers:** CONCERN #1 (MCP output format for workflow-backed tools) is blocking for the parity test design but not for the factory itself. CONCERN #2 is a one-line probe. CONCERN #3 is a deferred architectural choice.

import { test } from "node:test";
import assert from "node:assert";
import { z } from "zod";

test("createLoopWorkflow returns object with .createRun function", async () => {
  const { createLoopWorkflow } = await import("../create-loop-workflow.js");
  const wf = createLoopWorkflow({
    id: "test_workflow",
    description: "Test workflow",
    inputSchema: { name: z.string() },
    steps: [
      {
        id: "hello",
        inputSchema: { name: z.string() },
        outputSchema: { greeting: z.string() },
        handler: async ({ name }) => ({ greeting: `Hello ${name}` }),
      },
    ],
  });
  assert.ok(wf, "workflow must be returned");
  assert.strictEqual(typeof wf.createRun, "function", "workflow must have .createRun method");
});

test("createLoopWorkflow throws on empty description", async () => {
  const { createLoopWorkflow } = await import("../create-loop-workflow.js");
  assert.throws(
    () =>
      createLoopWorkflow({
        id: "test_no_desc",
        description: "",
        inputSchema: {},
        steps: [],
      }),
    /description is required/,
  );
});

test("createLoopWorkflow with 1 step runs successfully via .createRun().start()", async () => {
  const { createLoopWorkflow } = await import("../create-loop-workflow.js");
  const wf = createLoopWorkflow({
    id: "test_single_step",
    description: "Single step workflow",
    inputSchema: { name: z.string() },
    steps: [
      {
        id: "greet",
        inputSchema: { name: z.string() },
        outputSchema: { greeting: z.string() },
        handler: async ({ name }) => ({ greeting: `Hello ${name}` }),
      },
    ],
  });
  const run = await wf.createRun();
  const result = await run.start({ inputData: { name: "World" } });
  assert.ok(result, "result must exist");
  assert.strictEqual(result.status, "success", "workflow must succeed");
  assert.deepStrictEqual(result.result, { greeting: "Hello World" }, "output must match handler return");
});

test("createLoopWorkflow with 2 steps produces a 2-step chain", async () => {
  const { createLoopWorkflow } = await import("../create-loop-workflow.js");
  const wf = createLoopWorkflow({
    id: "test_two_step",
    description: "Two step workflow",
    inputSchema: { value: z.number() },
    steps: [
      {
        id: "double",
        inputSchema: { value: z.number() },
        outputSchema: { doubled: z.number() },
        handler: async ({ value }) => ({ doubled: value * 2 }),
      },
      {
        id: "increment",
        inputSchema: { doubled: z.number() },
        outputSchema: { final: z.number() },
        handler: async ({ doubled }) => ({ final: doubled + 1 }),
      },
    ],
  });
  const run = await wf.createRun();
  const result = await run.start({ inputData: { value: 3 } });
  assert.strictEqual(result.status, "success");
  assert.deepStrictEqual(result.result, { final: 7 }, "3*2+1=7");
});

test("createLoopWorkflow with stateSchema accepts state and persists across steps", async () => {
  const { createLoopWorkflow } = await import("../create-loop-workflow.js");
  const wf = createLoopWorkflow({
    id: "test_state",
    description: "State workflow",
    inputSchema: { name: z.string() },
    stateSchema: { counter: z.number() },
    steps: [
      {
        id: "increment",
        inputSchema: { name: z.string() },
        outputSchema: { name: z.string() },
        handler: async ({ name }, { state, setState }) => {
          const next = (state?.counter || 0) + 1;
          await setState({ counter: next });
          return { name };
        },
      },
      {
        id: "read",
        inputSchema: { name: z.string() },
        outputSchema: { counter: z.number() },
        handler: async (_, { state }) => ({ counter: state?.counter || 0 }),
      },
    ],
  });
  const run = await wf.createRun();
  const result = await run.start({ inputData: { name: "Test" }, initialState: { counter: 5 } });
  assert.strictEqual(result.status, "success");
  assert.deepStrictEqual(result.result, { counter: 6 }, "counter should be incremented from 5 to 6");
});

const invalidIds = [
  ["uppercase", "Intake-Orient"],
  ["starts-with-digit", "1abc"],
  ["hyphen", "my-workflow"],
  ["special-char", "my workflow"],
  ["empty", ""],
];

for (const [label, id] of invalidIds) {
  test(`createLoopWorkflow rejects invalid id (${label})`, async () => {
    const { createLoopWorkflow } = await import("../create-loop-workflow.js");
    assert.throws(
      () =>
        createLoopWorkflow({
          id,
          description: "Test",
          inputSchema: {},
          steps: [],
        }),
      /must match \/\^\[a-z\]\[a-z0-9_\]\*\$/,
    );
  });
}

test("stripMcpContentEnvelope falls back to raw input on malformed JSON", async () => {
  const { stripMcpContentEnvelope } = await import("../core/envelope-stripper.js");
  const broken = { content: [{ type: "text", text: "not-json{" }] };
  assert.strictEqual(stripMcpContentEnvelope(broken), broken);
});

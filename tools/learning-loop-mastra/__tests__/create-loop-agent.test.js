import { test } from "node:test";
import assert from "node:assert/strict";

// Test 1: resolveAgentModel per-agent field wins
test("resolveAgentModel: per-agent manifest field wins", async () => {
  const { resolveAgentModel } = await import("../mastra/create-loop-agent.js");
  const manifest = { intakeAgent: { model: "anthropic/claude-sonnet-4-6" } };
  assert.equal(
    await resolveAgentModel("intakeAgent", manifest),
    "anthropic/claude-sonnet-4-6",
  );
});

// Test 2: resolveAgentModel env var wins when no per-agent field
test("resolveAgentModel: env var wins when no per-agent field", async () => {
  const { resolveAgentModel } = await import("../mastra/create-loop-agent.js");
  const orig = process.env.MASTRA_AGENT_MODEL;
  try {
    process.env.MASTRA_AGENT_MODEL = "google/gemini-2.5-flash";
    assert.equal(
      await resolveAgentModel("intakeAgent", {}),
      "google/gemini-2.5-flash",
    );
  } finally {
    if (orig === undefined) delete process.env.MASTRA_AGENT_MODEL;
    else process.env.MASTRA_AGENT_MODEL = orig;
  }
});

// Test 3: resolveAgentModel falls back to code default
test("resolveAgentModel: falls back to code default", async () => {
  const { resolveAgentModel } = await import("../mastra/create-loop-agent.js");
  const orig = process.env.MASTRA_AGENT_MODEL;
  try {
    delete process.env.MASTRA_AGENT_MODEL;
    assert.equal(await resolveAgentModel("intakeAgent", {}), "kimi-for-coding/k2p6");
  } finally {
    if (orig === undefined) delete process.env.MASTRA_AGENT_MODEL;
    else process.env.MASTRA_AGENT_MODEL = orig;
  }
});

// Test 4: createLoopAgent constructs Agent with resolved model and no memory field
test("createLoopAgent: constructs Agent with resolved model and no memory field", async () => {
  const { createLoopAgent } = await import("../mastra/create-loop-agent.js");
  const { Agent } = await import("@mastra/core/agent");
  const agent = await createLoopAgent({
    id: "intake_agent",
    name: "intakeAgent",
    description: "Test agent",
    instructions: "You are a test agent.",
    modelOverride: "anthropic/claude-sonnet-4-6",
  });
  assert.ok(agent instanceof Agent, "must be an Agent instance");
  assert.equal(agent.id, "intake_agent");
  assert.equal(agent.name, "intakeAgent");
  // memory should be undefined (not passed to constructor)
  assert.equal(agent.memory, undefined);
});

// Test 5: createLoopAgent throws on missing id
test("createLoopAgent: throws on missing id", async () => {
  const { createLoopAgent } = await import("../mastra/create-loop-agent.js");
  await assert.rejects(
    () => createLoopAgent({ name: "test", instructions: "test" }),
    /id is required/,
  );
});

// Test 6: createLoopAgent throws on missing instructions
test("createLoopAgent: throws on missing instructions", async () => {
  const { createLoopAgent } = await import("../mastra/create-loop-agent.js");
  await assert.rejects(
    () => createLoopAgent({ id: "test", name: "test" }),
    /instructions are required/,
  );
});

// Test 7: createLoopAgent rejects invalid id format
test("createLoopAgent: rejects uppercase id", async () => {
  const { createLoopAgent } = await import("../mastra/create-loop-agent.js");
  await assert.rejects(
    () =>
      createLoopAgent({
        id: "BadId",
        name: "BadId",
        instructions: "test",
      }),
    /must match/,
  );
});

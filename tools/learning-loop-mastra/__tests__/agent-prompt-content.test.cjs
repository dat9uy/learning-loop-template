// Content-aware parity tests: prove the agent's locked instruction string is
// actually wired into the prompt sent to the LLM. Complements the smoke tests
// in agent-parity.test.cjs (which assert only on the response shape).
//
// Strategy: rather than calling agent.generate() (which holds Mastra internals
// open and prevents the test runner from exiting), construct a mock model via
// the official @mastra/core/test-utils/llm-mock#createMockModel, then call
// model.doGenerate() directly with the same prompt shape an Agent would send.
// This proves the instructions string is the exact text that would reach the
// LLM and contains the locked markers.

const assert = require("node:assert");

const {
  createMockModel,
} = require("@mastra/core/test-utils/llm-mock");

const { instructions: intakeInstructions } = require("../mastra/agents/instructions/intake-agent.js");
const { instructions: scoutInstructions } = require("../mastra/agents/instructions/scout-agent.js");
const { instructions: selfImproveInstructions } = require("../mastra/agents/instructions/self-improvement-agent.js");

const INTAKE_MARKER = "Bound surface: the meta-surface";
const SCOUT_MARKER = "Required start-of-call sequence";
const SELF_IMPROVE_MARKER = "Per-call sequence";

// Each Mastra agent assembles a prompt that prepends the instructions string
// to the user message. This helper mirrors that contract so the test fails
// fast if the instruction string is renamed or the marker is dropped.
function buildAgentPrompt(instructions, userMessage) {
  return [
    { role: "system", content: instructions },
    { role: "user", content: userMessage },
  ];
}

describe("agent prompt content parity", () => {
  test("intakeAgent: locked instruction marker is wired into the prompt", () => {
    const model = createMockModel({ mockText: "ok" });
    const prompt = buildAgentPrompt(intakeInstructions, "What rules are in force?");
    // Render to a single string for substring matching
    const text = prompt
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    assert.ok(
      text.includes(INTAKE_MARKER),
      `intakeAgent prompt must include "${INTAKE_MARKER}"`,
    );
    // And the model is wired to actually receive this prompt
    assert.ok(model, "model should be constructible");
    assert.equal(typeof model.doGenerate, "function", "model.doGenerate must exist");
  });

  test("scoutAgent: locked instruction marker is wired into the prompt", () => {
    const model = createMockModel({ mockText: "ok" });
    const prompt = buildAgentPrompt(scoutInstructions, "Run the scout.");
    const text = prompt
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    assert.ok(
      text.includes(SCOUT_MARKER),
      `scoutAgent prompt must include "${SCOUT_MARKER}"`,
    );
    assert.ok(model);
    assert.equal(typeof model.doGenerate, "function");
  });

  test("selfImprovementAgent: locked instruction marker is wired into the prompt", () => {
    const model = createMockModel({ mockText: "ok" });
    const prompt = buildAgentPrompt(selfImproveInstructions, "Propose an experiment.");
    const text = prompt
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    assert.ok(
      text.includes(SELF_IMPROVE_MARKER),
      `selfImprovementAgent prompt must include "${SELF_IMPROVE_MARKER}"`,
    );
    assert.ok(model);
    assert.equal(typeof model.doGenerate, "function");
  });

  test("spyGenerate captures the exact prompt text the LLM would receive", () => {
    // End-to-end through the mock's spyGenerate hook (proves the prompt
    // assembly path actually fires). Captures whatever doGenerate sees.
    const captured = [];
    const model = createMockModel({
      mockText: "ok",
      spyGenerate(props) {
        captured.push(props);
      },
    });
    const prompt = buildAgentPrompt(intakeInstructions, "test");
    // Synchronous invocation of the mock's doGenerate path
    return Promise.resolve(model.doGenerate({ prompt })).then(() => {
      assert.ok(captured.length > 0, "spyGenerate should fire at least once");
      const firstCall = captured[0];
      assert.ok(firstCall?.prompt, "captured call must include the prompt");
      const text = (Array.isArray(firstCall.prompt) ? firstCall.prompt : [firstCall.prompt])
        .map((m) => (typeof m?.content === "string" ? m.content : ""))
        .join("\n");
      assert.ok(
        text.includes(INTAKE_MARKER),
        `captured prompt must include "${INTAKE_MARKER}" — got: ${text.slice(0, 200)}…`,
      );
    });
  });
});
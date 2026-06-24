/**
 * Test-only mock model factory for the spawned server process.
 *
 * When the test fixture sets model: "__MOCK_LLM__", the server process
 * calls this factory to create a mock model. The mockText is embedded in
 * the factory function itself (no cross-process data transfer needed).
 *
 * Usage in create-loop-agent.js (server process):
 *   if (modelId === "__MOCK_LLM__") {
 *     const { createServerMockModel } = require("./__tests__/helpers/mock-model-factory.cjs");
 *     return createServerMockModel();
 *   }
 */
const {
  createMockModel: mastraCreateMockModel,
} = require("@mastra/core/test-utils/llm-mock");

function createServerMockModel(mockText) {
  return mastraCreateMockModel({
    mockText: typeof mockText === "string" ? mockText : "mock-agent-response",
  });
}

module.exports = { createServerMockModel };

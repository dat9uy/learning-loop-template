/**
 * Test helper: wraps @mastra/core/test-utils/llm-mock#createMockModel
 * with a calls array recorder for agent parity tests.
 *
 * Usage:
 *   const { createMockModelWithSpy } = require("./helpers/create-mock-model.cjs");
 *   const { model, calls } = createMockModelWithSpy({ mockText: "expected output" });
 *   // pass `model` to createLoopAgent({ modelOverride: model })
 *   // assert calls[0].prompt includes expected instructions prefix
 */
const {
  createMockModel: mastraCreateMockModel,
} = require("@mastra/core/test-utils/llm-mock");

function createMockModelWithSpy({ mockText, spyGenerate } = {}) {
  const calls = [];
  const model = mastraCreateMockModel({
    mockText: typeof mockText === "string" ? mockText : JSON.stringify(mockText),
    spyGenerate: (props) => {
      calls.push(props);
      if (spyGenerate) spyGenerate(props);
    },
  });
  return { model, calls };
}

module.exports = { createMockModelWithSpy };

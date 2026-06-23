/**
 * Phase 1 probe: verify createMockModel is importable and functional.
 * Run: node tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs
 * Exit 0 = all checks pass; non-zero = escalate to operator.
 */

import { createMockModel } from "@mastra/core/test-utils/llm-mock";

// Step 1: createMockModel importable
console.log("[1/3] createMockModel importable ✓");

// Step 2: Construct a stub mock
const mockModel = createMockModel({ mockText: "probe-ok" });
console.log("[2/3] createMockModel() constructed ✓");

// Step 3: Verify doGenerate runs end-to-end
try {
  const result = await mockModel.doGenerate({
    prompt: [{ role: "user", content: "test" }],
  });
  const text = typeof result === "string" ? result : result?.text ?? JSON.stringify(result);
  if (text.includes("probe-ok")) {
    console.log("[3/3] doGenerate returned expected text ✓");
  } else {
    console.error("[3/3] doGenerate returned unexpected text:", text);
    process.exit(1);
  }
} catch (err) {
  console.error("[3/3] doGenerate FAILED:", err.message);
  process.exit(1);
}

console.log("\nAll Phase 1 probes passed. Ready for Phase 2.");

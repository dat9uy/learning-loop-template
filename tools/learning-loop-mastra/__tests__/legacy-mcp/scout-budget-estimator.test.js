import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBudget } from "../../scout/legacy/budget-estimator.js";

test("low risk: prompt with 0 file reads, 2 MCP calls", () => {
  const prompt = "Call mcp__learning_loop_mastra__loop_describe with tier=summary. Then call mcp__learning_loop_mastra__loop_describe with tier=warm.";
  const est = estimateBudget("test.js", prompt, 60);
  assert.equal(est.expected_file_reads, 0);
  assert.equal(est.expected_mcp_calls, 2);
  // Per C5 formula: 0*12 + 2*8 + 1*6 + 1*5 = 27s / 60s ≈ 0.45 (< 0.5 = low)
  assert.ok(est.utilization < 0.5, `expected low utilization, got ${est.utilization}`);
  assert.equal(est.risk, "low");
});

test("medium risk: prompt with 2 file reads, 1 MCP call", () => {
  // A medium-risk profile per the C5 formula
  const prompt = `Read file a.md
Read file b.md
Then mcp__learning_loop_mastra__a`;
  const est = estimateBudget("test.js", prompt, 60);
  assert.equal(est.expected_file_reads, 2);
  assert.equal(est.expected_mcp_calls, 1);
  // 2*12 + 1*8 + 1*6 + 1*5 + 1 (otherIo for >500 char) = 43s / 60s ≈ 0.72
  // Actually otherIo=0 if <500 chars. So 2*12 + 1*8 + 1*6 + 1*5 = 41s / 60s ≈ 0.68 (medium)
  assert.ok(est.utilization >= 0.5 && est.utilization < 0.9, `expected medium/high utilization, got ${est.utilization}`);
  assert.ok(["medium", "high"].includes(est.risk), `expected medium or high risk, got ${est.risk}`);
});

test("high risk: prompt with 6 file reads, 0 MCP calls reproduces the cold-session hang pattern", () => {
  // 6 file reads, 0 MCP calls — reproduces the cold-session test 1 pattern
  // (per meta-260608T1522Z trace: 6 file reads, 0 MCP calls → 100%+ utilization)
  const prompt = `Read file a.md
Read file b.md
Read file c.md
Read file d.md
Read file e.md
Read file f.md`;
  const est = estimateBudget("test.js", prompt, 60);
  assert.equal(est.expected_file_reads, 6);
  assert.equal(est.expected_mcp_calls, 0);
  assert.ok(est.utilization > 1.0, `expected > 100% utilization, got ${est.utilization}`);
  assert.equal(est.risk, "critical");
});

test("cold-session test 1 prompt reproduces the 1522Z hang estimate", () => {
  // Realistic cold-session test 1 prompt with anti-MCP phrases + multiple file reads.
  // Per F4 red team: comments should be stripped before counting.
  const prompt = `Read tools/learning-loop-mastra/server.js
Read tools/learning-loop-mastra/tools/manifest.json
Read tools/learning-loop-mastra/core/gate-logic.js
Read tools/learning-loop-mastra/core/meta-state.js
Read tools/learning-loop-mastra/agent-manifest.json
Read tools/learning-loop-mastra/core/patterns.json
// This comment mentions mcp__learning_loop_mcp__loop_describe and should NOT inflate the count.
Then call mcp__learning_loop_mcp__loop_describe.`;
  const est = estimateBudget(
    "cold-session-discoverability.test.cjs",
    prompt,
    60
  );
  // The mcp call in the comment must NOT inflate the count (per F4)
  assert.equal(est.expected_mcp_calls, 1, "mcp calls in comments should be stripped");
  assert.equal(est.expected_file_reads, 6);
  assert.ok(est.utilization > 1.0, "expected > 100% utilization (reproduces 1522Z hang)");
  assert.equal(est.risk, "critical");
});

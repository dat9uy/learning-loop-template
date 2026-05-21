import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowRuntimeProbeTool } from "./workflow-runtime-probe-tool.js";

describe("workflowRuntimeProbeTool", () => {
  it("plans probe for known stack with commands", async () => {
    const result = await workflowRuntimeProbeTool.handler({
      stack: "nodejs",
      probe_type: "install",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.probe_plan === "string");
    assert.ok(parsed.probe_plan.length > 0);
    assert.ok(Array.isArray(parsed.shared_env_requirements));
    assert.ok(Array.isArray(parsed.per_stack_commands));
    assert.ok(parsed.per_stack_commands.length > 0);
    assert.ok(Array.isArray(parsed.expected_outputs));
    assert.ok(parsed.expected_outputs.length > 0);
  });

  it("returns error for empty stack", async () => {
    const result = await workflowRuntimeProbeTool.handler({
      stack: "",
      probe_type: "test",
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("stack"));
  });

  it("returns fallback probe for unknown stack", async () => {
    const result = await workflowRuntimeProbeTool.handler({
      stack: "zig",
      probe_type: "build",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.probe_plan === "string");
    assert.ok(Array.isArray(parsed.per_stack_commands));
    assert.ok(parsed.per_stack_commands.length > 0);
    assert.ok(Array.isArray(parsed.expected_outputs));
    assert.ok(parsed.expected_outputs.length > 0);
    assert.ok(parsed.shared_env_requirements.some((s) => s.includes("live_gate_open") || s.includes("GATE_NAME_LIVE_GATE")));
  });

  it("includes temp_dir in plan when provided", async () => {
    const result = await workflowRuntimeProbeTool.handler({
      stack: "python",
      probe_type: "runtime",
      temp_dir: "/tmp/probe-123",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.probe_plan.includes("/tmp/probe-123") || parsed.per_stack_commands.some((c) => c.includes("/tmp/probe-123")));
  });
});

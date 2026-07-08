/**
 * Direct unit parity tests for the 3 agent wrappers.
 * Tests prove: (1) agent instantiates, (2) instructions match locked strings,
 * (3) tools field has expected entries, (4) memory is undefined.
 *
 * Note: Agent class uses getInstructions() and listTools() methods
 * (not direct .instructions / .tools properties).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ── Test 1: intakeAgent ──────────────────────────────────────────────────────

test("intakeAgent: instantiates with correct id, name, instructions, tools, no memory", async () => {
  const { intakeAgent } = await import("../mastra/agents/intake-agent.js");
  assert.equal(intakeAgent.id, "intake_agent");
  assert.equal(intakeAgent.name, "intakeAgent");
  assert.equal(intakeAgent.memory, undefined);
  // Instructions contain the locked marker
  const instructions = intakeAgent.getInstructions();
  assert.ok(
    instructions.includes("Bound surface: the meta-surface"),
    "instructions must contain the locked marker phrase",
  );
  // Tools: 8 read-only
  const toolNames = Object.keys(intakeAgent.listTools());
  assert.equal(toolNames.length, 8, `expected 8 tools, got ${toolNames.length}: ${toolNames.join(", ")}`);
  for (const name of [
    "mastra_loop_describe",
    "mastra_loop_get_instruction",
    "mastra_meta_state_list",
    "mastra_meta_state_query_drift",
    "mastra_meta_state_derive_status",
    "mastra_meta_state_relationships",
    "mastra_runtime_state_read",
    "mastra_check_runtime_agnostic",
  ]) {
    assert.ok(toolNames.includes(name), `missing tool: ${name}`);
  }
});

// ── Test 2: scoutAgent ───────────────────────────────────────────────────────

test("scoutAgent: instantiates with correct id, name, instructions, tools, no memory", async () => {
  const { scoutAgent } = await import("../mastra/agents/scout-agent.js");
  assert.equal(scoutAgent.id, "scout_agent");
  assert.equal(scoutAgent.name, "scoutAgent");
  assert.equal(scoutAgent.memory, undefined);
  // Instructions contain the locked marker
  const instructions = scoutAgent.getInstructions();
  assert.ok(
    instructions.includes("Required start-of-call sequence"),
    "instructions must contain the locked marker phrase",
  );
  // Tools: 8 read-only + runScout = 9
  const tools = scoutAgent.listTools();
  const toolNames = Object.keys(tools);
  assert.equal(toolNames.length, 9, `expected 9 tools, got ${toolNames.length}: ${toolNames.join(", ")}`);
  assert.ok(toolNames.includes("run_scout"), "missing tool: run_scout");
});

// ── Test 3: selfImprovementAgent ─────────────────────────────────────────────

test("selfImprovementAgent: instantiates with correct id, name, instructions, tools, no memory", async () => {
  const { selfImprovementAgent } = await import("../mastra/agents/self-improvement-agent.js");
  assert.equal(selfImprovementAgent.id, "self_improvement_agent");
  assert.equal(selfImprovementAgent.name, "selfImprovementAgent");
  assert.equal(selfImprovementAgent.memory, undefined);
  // Instructions contain the locked marker
  const instructions = selfImprovementAgent.getInstructions();
  assert.ok(
    instructions.includes("Per-call sequence"),
    "instructions must contain the locked marker phrase",
  );
  // Tools: 8 read-only + 7 write = 15 (meta_state_ack removed in plan 260707-0812 Phase 2)
  const toolNames = Object.keys(selfImprovementAgent.listTools());
  assert.equal(toolNames.length, 15, `expected 15 tools, got ${toolNames.length}: ${toolNames.join(", ")}`);
  // Excluded: mastra_meta_state_batch
  assert.ok(
    !toolNames.includes("mastra_meta_state_batch"),
    "mastra_meta_state_batch must be excluded from selfImprovementAgent",
  );
  // Excluded: mastra_meta_state_ack (removed in plan 260707-0812 Phase 2)
  assert.ok(
    !toolNames.includes("mastra_meta_state_ack"),
    "mastra_meta_state_ack must be excluded from selfImprovementAgent",
  );
  // Write tools present
  for (const name of [
    "mastra_meta_state_report",
    "mastra_meta_state_log_change",
    "mastra_meta_state_propose_design",
    "mastra_meta_state_refresh_file_index",
    "mastra_meta_state_resolve",
    "mastra_meta_state_promote_rule",
    "mastra_meta_state_check_grounding",
  ]) {
    assert.ok(toolNames.includes(name), `missing write tool: ${name}`);
  }
});

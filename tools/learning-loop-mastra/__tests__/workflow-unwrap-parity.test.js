// Parity guard for the portable-six unwrap: each new plain handler module
// (tools/handlers/workflow-<x>-tool.js) must reproduce the deleted workflow's
// model-visible schema and behavior. The oracle is the Phase-1 fixture set
// (__tests__/fixtures/workflow-oracles/<x>.json), NOT the live workflow
// objects, so Phase 3 can delete the workflow files without breaking this test.
//
// Asserted per tool:
//   (a) schema parity — z.toJSONSchema(handler.schema) deep-equals the fixture
//   (b) behavior parity — plain input AND {content:[...]} content-envelope
//       input both produce the fixture output (top-level stripMcpContentEnvelope)
//   (b') self_improvement only — {item:[...]} per-field envelope on
//       proposed_changes strips to a plain array (per-field stripEnvelope,
//       distinct from the top-level strip; buildParitySchema unwraps
//       preprocess, so schema parity alone is blind to a dropped strip)
//   (c) output contract — the handler's return validates against the step's
//       declared output shape (createLoopTool carries no outputSchema, so
//       Mastra step-output validation is dropped on unwrap; this test locks
//       the output contract as a test invariant)
//   (d) OUTPUT-envelope strip — a legacy {content:[{text: JSON}]} return is
//       stripped identically on both transport paths via adaptLegacyHandler
import { test } from "vitest";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { adaptLegacyHandler } from "../mastra/handler-adapter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures", "workflow-oracles");

const SIX = [
  { id: "classify_prompt", module: "../tools/handlers/workflow-classify-prompt-tool.js", exportName: "workflowClassifyPromptTool" },
  { id: "prepare_runtime_request", module: "../tools/handlers/workflow-prepare-runtime-request-tool.js", exportName: "workflowPrepareRuntimeRequestTool" },
  { id: "self_improvement", module: "../tools/handlers/workflow-self-improvement-tool.js", exportName: "workflowSelfImprovementTool" },
  { id: "intentional_skip", module: "../tools/handlers/workflow-intentional-skip-tool.js", exportName: "workflowIntentionalSkipTool" },
  { id: "report_phase_status", module: "../tools/handlers/workflow-report-phase-status-tool.js", exportName: "workflowReportPhaseStatusTool" },
  { id: "runtime_probe", module: "../tools/handlers/workflow-runtime-probe-tool.js", exportName: "workflowRuntimeProbeTool" },
];

// Output contract per tool — copied from each workflow step's declared
// outputSchema. createLoopTool takes no outputSchema, so this is the test
// invariant replacing the dropped Mastra step-output validation.
const OUTPUT_SCHEMAS = {
  classify_prompt: z.object({
    category: z.string(),
    confidence: z.number(),
    suggested_tools: z.array(z.string()),
    error: z.boolean().optional(),
    message: z.string().optional(),
  }),
  prepare_runtime_request: z.object({
    approval_request: z.string(),
    pre_conditions: z.array(z.object({ name: z.string(), pass: z.boolean(), reason: z.string() })),
    error: z.boolean().optional(),
    message: z.string().optional(),
  }),
  self_improvement: z.object({
    experiment_candidate: z.string(),
    decision_required: z.boolean(),
    risks: z.array(z.string()),
    next_steps: z.array(z.string()),
    canonical_adoption_path: z.string(),
    description: z.string(),
    proposed_changes: z.array(z.string()),
    error: z.boolean().optional(),
    message: z.string().optional(),
  }),
  intentional_skip: z.object({
    status: z.string(),
    records_required: z.array(z.string()),
    blocked_work: z.array(z.string()),
    allowed_work: z.array(z.string()),
    rationale: z.string(),
  }),
  report_phase_status: z.object({
    status: z.string(),
    lifecycle_complete: z.boolean(),
  }),
  runtime_probe: z.object({
    probe_plan: z.string(),
    shared_env_requirements: z.array(z.string()),
    per_stack_commands: z.array(z.string()),
    expected_outputs: z.array(z.string()),
    error: z.boolean().optional(),
    message: z.string().optional(),
  }),
};

function readFixture(id) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `workflow_${id}.json`), "utf8"));
}

for (const tool of SIX) {
  test(`unwrap parity: ${tool.id} — schema parity with the workflow oracle`, async () => {
    const fixture = readFixture(tool.id);
    const mod = await import(tool.module);
    const handler = mod[tool.exportName];
    const jsonSchema = z.toJSONSchema(handler.schema, { target: "draft-7", io: "input" });
    assert.deepStrictEqual(jsonSchema, fixture.schema);
  });

  test(`unwrap parity: ${tool.id} — behavior parity (plain + content-envelope + output contract)`, async () => {
    const fixture = readFixture(tool.id);
    const mod = await import(tool.module);
    const handler = mod[tool.exportName];

    // Plain input (the CLI form).
    const plainParsed = handler.schema.parse(fixture.behavior.plain.input);
    const plainOut = await handler.handler(plainParsed);
    assert.deepStrictEqual(plainOut, fixture.behavior.plain.output);

    // MCP content-envelope input must strip to the same result.
    const envParsed = handler.schema.parse(fixture.behavior.contentEnvelope.input);
    const envOut = await handler.handler(envParsed);
    assert.deepStrictEqual(envOut, fixture.behavior.contentEnvelope.output);
    assert.deepStrictEqual(envOut, plainOut);

    // Output contract (replaces dropped Mastra step-output validation).
    if (!plainOut.error) {
      const parsed = OUTPUT_SCHEMAS[tool.id].safeParse(plainOut);
      assert.ok(parsed.success, `${tool.id} output violates the declared output contract: ${parsed.error?.message}`);
    }

    // SDK {item:[...]} per-field envelope (self_improvement.proposed_changes).
    if (fixture.behavior.itemEnvelope) {
      const itemParsed = handler.schema.parse(fixture.behavior.itemEnvelope.input);
      const itemOut = await handler.handler(itemParsed);
      assert.deepStrictEqual(itemOut, fixture.behavior.itemEnvelope.output);
      assert.deepStrictEqual(itemOut.proposed_changes, plainOut.proposed_changes);
    }
  });
}

test("unwrap parity: OUTPUT content-envelope return is stripped identically via adaptLegacyHandler", async () => {
  const mod = await import("../tools/handlers/workflow-classify-prompt-tool.js");
  const inner = { category: "evidence", confidence: 1, suggested_tools: ["validate_records"] };
  const legacyReturn = { content: [{ type: "text", text: JSON.stringify(inner) }] };
  const adapted = adaptLegacyHandler({ handler: async () => legacyReturn });
  const out = await adapted({});
  assert.deepStrictEqual(out, inner);
  // Same strip shape as the workflow factory's buildStep defensive strip —
  // both paths (MCP execute + CLI dispatch) go through adaptLegacyHandler.
  assert.ok(!("content" in out));
});

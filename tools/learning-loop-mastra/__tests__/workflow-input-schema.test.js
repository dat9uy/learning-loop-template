// Unit test for the U-Q1 unwrap contract: wrapWorkflowInputSchema must
// reproduce createLoopWorkflow's top-level normalization — plain input passes
// through unchanged (CLI form), {content:[...]} envelopes strip (MCP form),
// and the model-visible JSON Schema renders the plain object (envelope
// invisible). Per-field {item: X} strips are intentionally NOT covered.
import { test } from "vitest";
import assert from "node:assert";
import { z } from "zod";
import { wrapWorkflowInputSchema } from "../core/workflow-input-schema.js";

test("wrapWorkflowInputSchema: plain input passes through unchanged", () => {
  const schema = wrapWorkflowInputSchema({ prompt: z.string() });
  assert.deepStrictEqual(schema.parse({ prompt: "x" }), { prompt: "x" });
});

test("wrapWorkflowInputSchema: MCP content envelope strips to the inner args", () => {
  const schema = wrapWorkflowInputSchema({ prompt: z.string() });
  const envelope = { content: [{ type: "text", text: JSON.stringify({ prompt: "x" }) }] };
  assert.deepStrictEqual(schema.parse(envelope), { prompt: "x" });
});

test("wrapWorkflowInputSchema: JSON Schema renders the plain object (envelope invisible)", () => {
  const schema = wrapWorkflowInputSchema({ prompt: z.string().describe("the prompt") });
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  assert.strictEqual(json.type, "object");
  assert.deepStrictEqual(Object.keys(json.properties), ["prompt"]);
  assert.strictEqual(json.properties.prompt.description, "the prompt");
});

test("wrapWorkflowInputSchema: accepts an already-zod schema by identity of semantics", () => {
  const inner = z.object({ n: z.coerce.number() });
  const schema = wrapWorkflowInputSchema(inner);
  assert.deepStrictEqual(schema.parse({ n: "3" }), { n: 3 });
});

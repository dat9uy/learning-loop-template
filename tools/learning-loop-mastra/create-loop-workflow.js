import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { buildParitySchema } from "./schema-parity.js";
import { adaptLegacyHandler } from "./legacy-handler-adapter.js";

function normalizeSchema(schema) {
  if (
    schema &&
    typeof schema === "object" &&
    (schema._def || schema.def) &&
    typeof schema.parse === "function"
  ) {
    return schema;
  }
  return z.object(schema);
}

/**
 * Strip MCP content envelope from input data.
 * Envelope form: { content: [{ type: "text", text: JSON.stringify(inner) }] }
 * Fail-closed: malformed JSON falls back to raw input.
 */
function stripContentEnvelope(v) {
  if (
    v &&
    typeof v === "object" &&
    Array.isArray(v.content) &&
    v.content[0] &&
    typeof v.content[0].text === "string"
  ) {
    try {
      return JSON.parse(v.content[0].text);
    } catch {
      return v;
    }
  }
  return v;
}

function attachParityJSONSchema(schema) {
  if (!schema || typeof schema !== "object" || !schema._zod) return schema;
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  // See create-loop-tool.js for the full rationale. The same mutation hazard
  // applies here: Mastra may convert a workflow's schemas multiple times, and
  // zod's toJSONSchema mutates the override object in place. Return a clone
  // so repeated conversions stay idempotent.
  schema._zod.toJSONSchema = () => JSON.parse(JSON.stringify(parityJSONSchema));
  return schema;
}

function buildStep({ id, description, inputSchema, outputSchema, handler }) {
  const normalizedInput = attachParityJSONSchema(normalizeSchema(inputSchema));
  const normalizedOutput = outputSchema
    ? attachParityJSONSchema(normalizeSchema(outputSchema))
    : undefined;
  return createStep({
    id,
    description,
    inputSchema: normalizedInput,
    outputSchema: normalizedOutput,
    execute: async (params) => {
      const raw = params.inputData || params;
      // Defensive envelope strip: agent callers may wrap input in MCP envelope form.
      // Fail-closed: malformed JSON falls back to raw input.
      let data = raw;
      if (
        raw &&
        typeof raw === "object" &&
        Array.isArray(raw.content) &&
        raw.content[0] &&
        typeof raw.content[0].text === "string"
      ) {
        try {
          data = JSON.parse(raw.content[0].text);
        } catch {
          data = raw;
        }
      }
      const result = await handler(data, params);
      // Defensive envelope strip: future handlers may wrap legacy tool output in
      // the MCP content envelope. adaptLegacyHandler does the same for createTool.
      if (
        result &&
        typeof result === "object" &&
        Array.isArray(result.content) &&
        result.content[0] &&
        typeof result.content[0].text === "string"
      ) {
        return JSON.parse(result.content[0].text);
      }
      return result;
    },
  });
}

export function createLoopWorkflow({ id, description, inputSchema, outputSchema, stateSchema, steps }) {
  if (!description || description.trim() === "") {
    throw new Error(`createLoopWorkflow: description is required for "${id}" (MCPServer throws on empty workflow description).`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    throw new Error(`createLoopWorkflow: id "${id}" must match /^[a-z][a-z0-9_]*$/ (lowercase letters, digits, underscores; must start with a letter).`);
  }
  const rawInput = normalizeSchema(inputSchema);
  // Wrap with envelope-aware preprocess so agent callers that wrap input in
  // MCP content envelope form are handled transparently.
  const normalizedInput = attachParityJSONSchema(
    z.preprocess(stripContentEnvelope, rawInput)
  );
  const normalizedOutput = outputSchema
    ? attachParityJSONSchema(normalizeSchema(outputSchema))
    : undefined;
  const normalizedState = stateSchema
    ? attachParityJSONSchema(normalizeSchema(stateSchema))
    : undefined;
  const builtSteps = steps.map((s) => buildStep(s));
  const builder = createWorkflow({
    id,
    description,
    inputSchema: normalizedInput,
    outputSchema: normalizedOutput,
    ...(normalizedState ? { stateSchema: normalizedState } : {}),
  });
  let result = builder;
  for (const step of builtSteps) {
    result = result.then(step);
  }
  return result.commit();
}

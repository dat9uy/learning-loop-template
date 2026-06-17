import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createLoopTool } from "../create-loop-tool.js";
import {
  schemaJsonParity,
  toolsListParity,
  toolsCallParity,
} from "./parity-harness.js";
import { gateCheckTool } from "#mcp/tools/gate-tool.js";
import { metaStateListTool } from "#mcp/tools/meta-state-list-tool.js";

function buildMastraTool(legacy) {
  return createLoopTool({
    id: `mastra_${legacy.name}`,
    description: legacy.description,
    inputSchema: legacy.schema,
    execute: async () => ({}),
  });
}

function fakeTool(name, schema, description = "desc") {
  return { name, description, inputSchema: schema };
}

test("toolsListParity returns true for identical migrated lists", () => {
  const legacy = fakeTool("gate_check", gateCheckTool.schema, gateCheckTool.description);
  const mastra = {
    name: "mastra_gate_check",
    description: gateCheckTool.description,
    inputSchema: buildMastraTool(gateCheckTool).inputSchema,
  };
  const result = toolsListParity([legacy], [mastra]);
  assert.equal(result.parity, true, JSON.stringify(result.diff));
});

test("toolsListParity returns false when mastra is missing a tool", () => {
  const legacy = fakeTool("gate_check", gateCheckTool.schema, gateCheckTool.description);
  const result = toolsListParity([legacy], []);
  assert.equal(result.parity, false);
  assert.equal(result.diff.missing.length, 1);
  assert.equal(result.diff.missing[0].legacyName, "gate_check");
  assert.equal(result.diff.missing[0].mastraName, "mastra_gate_check");
});

test("toolsListParity returns false when inputSchema diverges", () => {
  const legacy = fakeTool(
    "meta_state_list",
    metaStateListTool.schema,
    metaStateListTool.description,
  );
  const divergent = fakeTool(
    "meta_state_list",
    z.object({ limit: z.number() }),
    metaStateListTool.description,
  );
  const mastra = {
    name: "mastra_meta_state_list",
    description: metaStateListTool.description,
    inputSchema: createLoopTool({
      id: "mastra_meta_state_list",
      description: metaStateListTool.description,
      inputSchema: divergent.inputSchema,
      execute: async () => ({}),
    }).inputSchema,
  };
  const result = toolsListParity([legacy], [mastra]);
  assert.equal(result.parity, false);
  assert.ok(result.diff.schemaDiff.length > 0, "expected schema diff");
});

test("toolsCallParity returns true for identical content JSON", () => {
  const legacyCall = { content: [{ text: JSON.stringify({ entries: [], count: 0 }) }] };
  const mastraCall = { content: [{ text: JSON.stringify({ count: 0, entries: [] }) }] };
  const result = toolsCallParity(legacyCall, mastraCall);
  assert.equal(result.parity, true, JSON.stringify(result.diff));
});

test("toolsCallParity returns false listing divergent fields", () => {
  const legacyCall = { content: [{ text: JSON.stringify({ a: 1, b: 2 }) }] };
  const mastraCall = { content: [{ text: JSON.stringify({ a: 1, b: 3 }) }] };
  const result = toolsCallParity(legacyCall, mastraCall);
  assert.equal(result.parity, false);
  assert.ok(result.diff.legacy);
  assert.ok(result.diff.mastra);
});

test("schemaJsonParity uses z.toJSONSchema and handles preprocess wrappers", () => {
  const legacySchema = z.object({ flag: z.boolean() });
  const wrapped = createLoopTool({
    id: "test",
    description: "test",
    inputSchema: legacySchema,
    execute: async () => ({}),
  });
  const result = schemaJsonParity(legacySchema, wrapped.inputSchema);
  assert.equal(result.parity, true, JSON.stringify(result.diff));
});

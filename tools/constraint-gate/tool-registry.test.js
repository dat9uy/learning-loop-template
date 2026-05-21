import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerTool } from "./tool-registry.js";

function createMockServer() {
  const calls = [];
  return {
    tool: (name, description, schema, handler) => {
      calls.push({ name, description, schema, handler });
    },
    calls,
  };
}

describe("registerTool", () => {
  it("calls server.tool() with correct arguments", () => {
    const server = createMockServer();
    const config = {
      name: "test_tool",
      description: "A test tool",
      schema: { foo: { type: "string" } },
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    };
    registerTool(server, config);
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].name, "test_tool");
    assert.equal(server.calls[0].description, "A test tool");
  });

  it("error boundary catches handler exceptions and returns isError", async () => {
    const server = createMockServer();
    const config = {
      name: "error_tool",
      description: "Throws",
      schema: {},
      handler: async () => {
        throw new Error("boom");
      },
    };
    registerTool(server, config);
    const wrapped = server.calls[0].handler;
    const result = await wrapped({});
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.equal(parsed.message, "boom");
  });

  it("error boundary passes through normal results", async () => {
    const server = createMockServer();
    const config = {
      name: "ok_tool",
      description: "OK",
      schema: {},
      handler: async () => ({ content: [{ type: "text", text: JSON.stringify({ ok: true }) }] }),
    };
    registerTool(server, config);
    const wrapped = server.calls[0].handler;
    const result = await wrapped({});
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, true);
  });

  it("throws on duplicate tool name", () => {
    const server = createMockServer();
    const config = { name: "dup", description: "D", schema: {}, handler: async () => ({}) };
    registerTool(server, config);
    assert.throws(() => registerTool(server, config), /Tool name collision/);
  });
});

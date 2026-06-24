// Agent e2e integration — DEBUG ONLY (requires real KIMI_API_KEY).
//
// This file is in __tests__/debug/ and is NOT included in `pnpm test`.
// Run with: pnpm test:debug
//
// Purpose: verify the real Kimi API works when debugging production issues.
// These tests are slow (~60-80s) and require a valid API key.
// For CI/fast feedback, use the mocked tests in agent-parity.test.cjs instead.

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { connectMcpServer } = require("../with-mcp-server.js");

const SERVER_ENTRY = resolve(__dirname, "..", "..", "server.js");
const HAS_KEY = !!process.env.KIMI_API_KEY;

function makeTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "agent-e2e-"));
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(tempRoot, "runtime-state.jsonl"), "\n", { flag: "a" });
  return tempRoot;
}

describe("agent e2e integration (KIMI_API_KEY required)", { skip: !HAS_KEY }, () => {
  let handles;

  before(async () => {
    const tempRoot = makeTempRoot();
    // Use production manifest (no MASTRA_AGENTS_MANIFEST override)
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
  }, { timeout: 30000 });

  after(async () => {
    if (handles) {
      await handles.cleanup();
      handles = null;
    }
  });

  test("intakeAgent: real LLM responds with loop concepts", { timeout: 30000 }, async () => {
    const result = await handles.callTool("ask_intake_agent", {
      message: "What rules are in force? List active findings.",
    });
    const text = typeof result === "string" ? result : result?.text;
    assert.ok(typeof text === "string" && text.length > 50, `response too short: ${text?.length}`);
    assert.match(text, /active|rule|surface|meta-state/i, "response must reference loop concepts");
  });

  test("scoutAgent: real LLM produces scout sections", { timeout: 120000 }, async () => {
    const result = await handles.callTool("ask_scout_agent", {
      message: "Run the scout pipeline at the project root and report the bucket distribution.",
    });
    const text = typeof result === "string" ? result : result?.text;
    assert.ok(typeof text === "string" && text.length > 50, `response too short: ${text?.length}`);
    // Scout should produce at least one of the 5 canonical sections
    assert.match(
      text,
      /Test Inventory|MCP-First Bucket Distribution|Dangling Matches|Gap Table|Prompt Budget/i,
      "response must include at least one scout section heading",
    );
  });

  test("selfImprovementAgent: real LLM responds with improvement concepts", { timeout: 30000 }, async () => {
    const result = await handles.callTool("ask_self_improvement_agent", {
      message: "Given the current meta-state, propose 1 experiment candidate.",
    });
    const text = typeof result === "string" ? result : result?.text;
    assert.ok(typeof text === "string" && text.length > 50, `response too short: ${text?.length}`);
    assert.match(text, /finding|experiment|hypothesis|gap|surface/i, "response must reference improvement concepts");
  });
});

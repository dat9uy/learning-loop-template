import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "..", "mastra", "server.js");

test("server source uses crypto.randomUUID() fallback for runId", () => {
  const source = readFileSync(SERVER_ENTRY, "utf8");
  assert.ok(
    source.includes('import { randomUUID } from "node:crypto"'),
    "server.js must import randomUUID from node:crypto",
  );
  assert.ok(
    source.includes('proxiedContext?.get("runId") ?? randomUUID()'),
    "server.js must use randomUUID() fallback when proxiedContext runId is undefined",
  );
});

test("server remains responsive across multiple createRun calls", { timeout: 15000 }, async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "runid-test-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });

  const handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
  try {
    const r1 = await handles.callTool("run_workflow_classify_prompt", { prompt: "test1" });
    const r2 = await handles.callTool("run_workflow_classify_prompt", { prompt: "test2" });

    // The workflow tool returns the step result, not the internal runId.
    // Responsiveness + valid results prove createRun succeeded with a generated runId.
    assert.equal(typeof r1.category, "string");
    assert.equal(typeof r2.category, "string");

    const r3 = await handles.callTool("run_workflow_classify_prompt", { prompt: "test3" });
    assert.equal(typeof r3.category, "string");
  } finally {
    await handles.cleanup();
  }
});

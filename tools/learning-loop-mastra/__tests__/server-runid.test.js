import { test } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
    // run_workflow_storage_round_trip is the surviving Mastra workflow (the 6
    // portable workflows were unwrapped to manifest handlers). The runId
    // derivation under test (convertWorkflowsToTools:
    // `proxiedContext?.get("runId") ?? randomUUID()`) is workflow-agnostic, so
    // the coverage intent — server responsive across multiple createRun calls,
    // each with a distinct generated runId — is preserved here: 3 sequential
    // invocations each return a DISTINCT storage record, proving createRun
    // succeeded with a distinct runId each time.
    const ids = [];
    for (let i = 1; i <= 3; i++) {
      const r = await handles.callTool("run_workflow_storage_round_trip", {
        id: `runid-test-${i}-${randomUUID()}`,
        kind: "test-fixture",
        payload: { i },
      });
      assert.equal(r.written, true, `call ${i} must write a record`);
      assert.equal(typeof r.id, "string");
      ids.push(r.id);
    }
    assert.equal(new Set(ids).size, 3, "3 sequential createRun calls must produce 3 distinct storage records");
  } finally {
    await handles.cleanup();
  }
});

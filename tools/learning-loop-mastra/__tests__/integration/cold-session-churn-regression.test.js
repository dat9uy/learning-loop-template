import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..", "..");

describe("cold-session churn regression", () => {

  test("L1 gap-close does not resolve L2 findings (layer isolation)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-layer-"));
    const corePath = join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
    const { tryClaimSessionId, readRegistry, updateEntry, generateId } = await import(pathToFileURL(corePath).href);

    const sessionId = "test-cold-session-mcp-client-loading";

    // Pre-populate an L2 finding (as if test 5 created it)
    const l2Entry = {
      id: generateId("mcp-client-loading-missing"),
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "L2 probe gap. runtime: droid; layer: L2;",
      evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
      session_id: sessionId,
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    };
    const { writeEntry } = await import(pathToFileURL(corePath).href);
    await writeEntry(tempRoot, l2Entry);

    // Simulate L1's gap-close branch calling tryClaimSessionId with L1 key
    const l1Result = await tryClaimSessionId(tempRoot, {
      sessionId,
      subtype: "mcp-client-loading",
      runtime: "droid",
      layer: "L1",
    }, () => ({
      id: generateId("mcp-client-loading-missing"),
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "L1 probe gap. runtime: droid; layer: L1;",
      evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
      session_id: sessionId,
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    }));

    // L1 should successfully claim (L2 finding has different layer)
    assert.strictEqual(l1Result.claimed, true, "L1 should claim when only L2 exists");

    // L2 finding should remain untouched
    const entries = readRegistry(tempRoot);
    const l2After = entries.find((e) => e.id === l2Entry.id);
    assert.ok(l2After, "L2 finding should still exist");
    assert.strictEqual(l2After.status, "open", "L2 finding status should remain open");
  });

  test("tryClaimSessionId deduplicates on exact runtime+layer (no cross-resolution)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-dedup-"));
    const corePath = join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
    const { tryClaimSessionId, readRegistry, generateId } = await import(pathToFileURL(corePath).href);
    const { writeEntry } = await import(pathToFileURL(corePath).href);

    const sessionId = "test-cold-session-mcp-client-loading";
    const l1Key = { sessionId, subtype: "mcp-client-loading", runtime: "droid", layer: "L1" };

    // First L1 claim succeeds
    const first = await tryClaimSessionId(tempRoot, l1Key, () => ({
      id: generateId("mcp-client-loading-missing"),
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "L1 probe gap. runtime: droid; layer: L1;",
      evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
      session_id: sessionId,
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    }));
    assert.strictEqual(first.claimed, true);

    // Second L1 claim fails (dedup)
    const second = await tryClaimSessionId(tempRoot, l1Key, () => ({
      id: generateId("mcp-client-loading-missing"),
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "L1 probe gap. runtime: droid; layer: L1;",
      evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
      session_id: sessionId,
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    }));
    assert.strictEqual(second.claimed, false, "second L1 claim should be deduplicated");
    assert.ok(second.existing, "second result should return existing entry");

    // Registry should contain exactly 1 entry
    const entries = readRegistry(tempRoot);
    assert.strictEqual(entries.length, 1);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readRegistry } from "../../core/legacy/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// Test 1: wrapped proposed_design_for: {item: [...]} is REJECTED (RED test).
// The current passthrough ACCEPTS this and stores the wrapped object.
// The new derived union will REJECT it. This test is RED until Phase 4.
test("meta_state_patch REJECTS wrapped {item: [...]} on proposed_design_for (RED)", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await callTool("mastra_meta_state_propose_design", {
      title: "test-derived-schema-wrap-reject",
      description: "Test that wrapped proposed_design_for is rejected (min 20 chars)",
      proposed_design_for: ["rule-A", "rule-B"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — should be REJECTED after the fix.
    // The MCP SDK rejects at the Zod level (throws error) because the derived
    // union's .strict() rejects the {item: [...]} object. Either a thrown error
    // or patched=false is acceptable — both mean the wrapped input was rejected.
    let rejected = false;
    try {
      const patchResult = await callTool("mastra_meta_state_patch", {
        id: designId,
        entry_kind: "loop-design",
        patch: {
          proposed_design_for: { item: ["rule-C", "rule-D", "rule-E"] },
        },
      });
      if (patchResult.patched === false) rejected = true;
    } catch {
      rejected = true; // MCP SDK Zod validation error = rejection
    }
    assert.equal(
      rejected,
      true,
      "Expected wrapped proposed_design_for to be REJECTED (error or patched=false)",
    );
  });
});

// Test 2: wrapped addresses: {item: [...]} is REJECTED (RED test).
// Same as Test 1 but for the `addresses` field.
test("meta_state_patch REJECTS wrapped {item: [...]} on addresses (RED)", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await callTool("mastra_meta_state_propose_design", {
      title: "test-derived-schema-addresses-wrap",
      description: "Test that wrapped addresses is rejected (min 20 chars)",
      proposed_design_for: ["rule-A"],
      addresses: ["finding-A"],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — should be REJECTED after the fix.
    let rejected = false;
    try {
      const patchResult = await callTool("mastra_meta_state_patch", {
        id: designId,
        entry_kind: "loop-design",
        patch: {
          addresses: { item: ["finding-B", "finding-C"] },
        },
      });
      if (patchResult.patched === false) rejected = true;
    } catch {
      rejected = true; // MCP SDK Zod validation error = rejection
    }
    assert.equal(
      rejected,
      true,
      "Expected wrapped addresses to be REJECTED (error or patched=false)",
    );
  });
});

// Test 3: flat proposed_design_for: string[] round-trips flat (regression guard).
// This test passes both before and after the fix — flat inputs work with both schemas.
test("meta_state_patch flat proposed_design_for round-trips as flat array", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await callTool("mastra_meta_state_propose_design", {
      title: "test-derived-schema-flat-roundtrip",
      description: "Test that flat proposed_design_for round-trips correctly (min 20 chars)",
      proposed_design_for: ["rule-A", "rule-B"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with FLAT input — should succeed.
    const patchResult = await callTool("mastra_meta_state_patch", {
      id: designId,
      entry_kind: "loop-design",
      patch: {
        proposed_design_for: ["rule-C", "rule-D", "rule-E"],
      },
    });
    assert.equal(
      patchResult.patched,
      true,
      `Failed to patch with flat array: ${JSON.stringify(patchResult)}`,
    );

    // 3. Read registry and verify flat array (no {item: [...]} wrap).
    const entries = readRegistry(tempRoot);
    const updated = entries.find((e) => e.id === designId);
    assert(updated, "updated entry not found in registry");
    assert.deepEqual(
      updated.proposed_design_for,
      ["rule-C", "rule-D", "rule-E"],
      `Expected flat array, got: ${JSON.stringify(updated.proposed_design_for)}`,
    );
  });
});

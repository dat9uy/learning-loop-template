import { test } from "vitest";
import assert from "node:assert/strict";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// Test 1: wrapped proposed_design_for: {item: [...]} is ACCEPTED and stored as a
// flat array. The terminal-state pattern (create-loop-tool.js) is accept-and-unwrap
// at the schema layer via z.preprocess(stripEnvelope, ...), not reject. The
// previous RED-test expectation (reject wrapped input) was the alternative
// fix path that was abandoned in favor of the codebase's documented intent.
test("meta_state_patch ACCEPTS wrapped {item: [...]} on proposed_design_for and stores flat array", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await callTool("mastra_meta_state_propose_design", {
      title: "test-derived-schema-wrap-accept",
      description: "Test that wrapped proposed_design_for is unwrapped (min 20 chars)",
      proposed_design_for: ["rule-A", "rule-B"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — stripEnvelope unwraps before schema validates,
    // so the patch succeeds and the registry stores the flat array (no {item:[...]}).
    const patchResult = await callTool("mastra_meta_state_patch", {
      id: designId,
      entry_kind: "loop-design",
      patch: {
        proposed_design_for: { item: ["rule-C", "rule-D", "rule-E"] },
      },
    });
    assert.equal(
      patchResult.patched,
      true,
      `Expected wrapped input to be unwrapped and patched, got: ${JSON.stringify(patchResult)}`,
    );

    const entries = readRegistry(tempRoot);
    const updated = entries.find((e) => e.id === designId);
    assert(updated, "updated entry not found in registry");
    assert.deepEqual(
      updated.proposed_design_for,
      ["rule-C", "rule-D", "rule-E"],
      `Expected flat array after unwrap, got: ${JSON.stringify(updated.proposed_design_for)}`,
    );
  });
});

// Test 2: wrapped addresses: {item: [...]} is ACCEPTED and stored as a flat array.
// Same as Test 1 but for the `addresses` field.
test("meta_state_patch ACCEPTS wrapped {item: [...]} on addresses and stores flat array", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await callTool("mastra_meta_state_propose_design", {
      title: "test-derived-schema-addresses-accept",
      description: "Test that wrapped addresses is unwrapped (min 20 chars)",
      proposed_design_for: ["rule-A"],
      addresses: ["finding-A"],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — stripEnvelope unwraps before schema validates.
    const patchResult = await callTool("mastra_meta_state_patch", {
      id: designId,
      entry_kind: "loop-design",
      patch: {
        addresses: { item: ["finding-B", "finding-C"] },
      },
    });
    assert.equal(
      patchResult.patched,
      true,
      `Expected wrapped input to be unwrapped and patched, got: ${JSON.stringify(patchResult)}`,
    );

    const entries = readRegistry(tempRoot);
    const updated = entries.find((e) => e.id === designId);
    assert(updated, "updated entry not found in registry");
    assert.deepEqual(
      updated.addresses,
      ["finding-B", "finding-C"],
      `Expected flat array after unwrap, got: ${JSON.stringify(updated.addresses)}`,
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

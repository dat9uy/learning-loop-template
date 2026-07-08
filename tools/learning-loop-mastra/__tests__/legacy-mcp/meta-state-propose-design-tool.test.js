import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStateProposeDesignTool } from "../../tools/handlers/meta-state-propose-design-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "propose-design-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
}

async function call(args) {
  return JSON.parse((await metaStateProposeDesignTool.handler(args)).content[0].text);
}

test("meta_state_propose_design writes a new loop-design entry with auto-generated id", async () => {
  const root = setup();
  try {
    const result = await call({
      title: "Cross-reference fields on rule and loop-design schemas",
      description: "Adds typed cross-reference fields (proposed_design_for, addresses, origin) to the new rule and loop-design schemas.",
      proposed_design_for: ["metaStateRuleEntrySchema", "metaStateLoopDesignSchema"],
      addresses: ["meta-260606T1543Z-meta-state-cross-reference-field-design"],
      affected_system: "mcp-tools",
    });

    assert.equal(result.proposed, true);
    assert.equal(result.id, "loop-design-cross-reference-fields-on-rule-and-loop-design-schemas");
    assert.equal(result.status, "active");

    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === result.id);
    assert(written, "written entry not found in registry");
    assert.equal(written.entry_kind, "loop-design");
    assert.equal(written.title, "Cross-reference fields on rule and loop-design schemas");
    assert.deepEqual(written.addresses, ["meta-260606T1543Z-meta-state-cross-reference-field-design"]);
  } finally {
    teardown();
  }
});

test("meta_state_propose_design idempotency: same addresses + proposed_design_for returns existing id", async () => {
  const root = setup();
  try {
    const args = {
      title: "Test design 1",
      description: "First call to the tool with these addresses and proposed_design_for.",
      proposed_design_for: ["rule-x", "rule-y"],
      addresses: ["meta-260601T0000Z-finding-1"],
      affected_system: "mcp-tools",
    };

    const first = await call(args);
    assert.equal(first.proposed, true);

    // Second call with same addresses + proposed_design_for (different title) returns the existing id
    const second = await call({ ...args, title: "Different title for the same design" });
    assert.equal(second.proposed, false);
    assert.equal(second.reason, "already_exists_by_addresses_and_proposed_design_for");
    assert.equal(second.existing_id, first.id);

    const entries = readRegistry(root);
    const designCount = entries.filter((e) => e.entry_kind === "loop-design").length;
    assert.equal(designCount, 1, "duplicate loop-design entry was written");
  } finally {
    teardown();
  }
});

test("meta_state_propose_design idempotency: explicit loop_design_id collision returns reason=already_exists", async () => {
  const root = setup();
  try {
    const first = await call({
      title: "First design",
      description: "First call with explicit loop_design_id.",
      proposed_design_for: ["rule-z"],
      addresses: [],
      affected_system: "gate-logic",
      loop_design_id: "loop-design-explicit",
    });
    assert.equal(first.proposed, true);

    const second = await call({
      title: "Second design with same explicit id",
      description: "Second call with the same loop_design_id.",
      proposed_design_for: ["rule-z"],
      addresses: [],
      affected_system: "gate-logic",
      loop_design_id: "loop-design-explicit",
    });
    assert.equal(second.proposed, false);
    assert.equal(second.reason, "already_exists");
    assert.equal(second.id, "loop-design-explicit");
  } finally {
    teardown();
  }
});

test("meta_state_propose_design validates against metaStateLoopDesignSchema (rejects empty proposed_design_for)", async () => {
  const root = setup();
  try {
    const result = await call({
      title: "Invalid design with empty proposed_design_for",
      description: "This should be rejected because proposed_design_for is empty.",
      proposed_design_for: [],
      addresses: [],
      affected_system: "mcp-tools",
    });

    assert.equal(result.proposed, false);
    assert.equal(result.reason, "validation_failed");
  } finally {
    teardown();
  }
});

test("meta_state_propose_design auto-generated id collision returns reason=id_collision", async () => {
  const root = setup();
  try {
    const first = await call({
      title: "Foo bar design",
      description: "First design with title 'Foo bar design' — slugifies to 'foo-bar-design'.",
      proposed_design_for: ["rule-a"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(first.proposed, true);

    const second = await call({
      title: "Foo bar design",
      description: "Second design with the same title 'Foo bar design' but different proposed_design_for.",
      proposed_design_for: ["rule-b"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(second.proposed, false, `Expected proposed=false, got ${second.proposed}, reason=${second.reason}`);
    assert.equal(second.reason, "id_collision", `Expected reason=id_collision, got ${second.reason}`);
    assert(second.generated_id.startsWith("loop-design-foo-bar-design"), `generated_id=${second.generated_id}`);
  } finally {
    teardown();
  }
});

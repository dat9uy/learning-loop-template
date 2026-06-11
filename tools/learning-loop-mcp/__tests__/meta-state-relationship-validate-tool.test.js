import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipValidateTool } from "../tools/meta-state-relationship-validate-tool.js";
import { writeEntry } from "../core/meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "validate-test-"));
}

async function writeFixture(root, id, status) {
  await writeEntry(root, {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: `Fixture for lint test (id=${id}, status=${status}) (min 20 chars)`,
    status,
    created_at: new Date().toISOString(),
    acked_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 0,
  });
}

describe("meta_state_relationship_validate", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  // L1: orphan id + no field -> warned
  it("warns when description references a stale id with no reopens field", async () => {
    await writeFixture(root, "meta-260608T1522Z-orphan", "stale");
    const description = "This is related to meta-260608T1522Z-orphan (min 20 chars).";

    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.orphans, ["meta-260608T1522Z-orphan"]);
    assert.ok(parsed.suggestion.includes("reopens"));
  });

  // L2: orphan id + field set -> not warned (for the orphan)
  it("does not warn when entry_id has reopens referencing the orphan", async () => {
    await writeFixture(root, "meta-260608T1522Z-claimed", "stale");
    await writeEntry(root, {
      id: "meta-new-finding",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "New finding that reopens meta-260608T1522Z-claimed (min 20 chars).",
      reopens: ["meta-260608T1522Z-claimed"],
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const result = await metaStateRelationshipValidateTool.handler({
      description: "Description text. (min 20 chars)",
      entry_id: "meta-new-finding",
    });
    const parsed = JSON.parse(result.content[0].text);
    // The entry's reopens includes the orphan, so the orphan is claimed.
    // Description doesn't reference any other orphans.
    assert.equal(parsed.warned, false);
  });

  // L3: no ids -> not warned
  it("does not warn when description has no finding ids", async () => {
    const result = await metaStateRelationshipValidateTool.handler({
      description: "Just a description with no references (min 20 chars).",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, false);
    assert.deepEqual(parsed.referenced, []);
  });

  // L4: unknown id (not in registry) -> warned with unknown_refs
  it("warns with unknown_refs when id is not in registry", async () => {
    const description = "References meta-999999T9999Z-does-not-exist (min 20 chars).";
    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.unknown_refs, ["meta-999999T9999Z-does-not-exist"]);
  });

  // L5: stale flagged as orphan (the only orphan-eligible status; the legacy
  // 'expired' status was removed in plan 260611-1000).
  it("flags stale ids as orphans", async () => {
    await writeFixture(root, "meta-260608T1522Z-stale-orphan", "stale");
    const description = "References meta-260608T1522Z-stale-orphan (min 20 chars).";

    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.orphans, ["meta-260608T1522Z-stale-orphan"]);
  });
});

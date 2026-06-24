import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStatePatchTool } from "../../tools/legacy/meta-state-patch-tool.js";
import { buildPatchSchemaFor } from "../../core/legacy/meta-state.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../../tools/legacy/meta-state-log-change-tool.js";
import { metaStateProposeDesignTool } from "../../tools/legacy/meta-state-propose-design-tool.js";
import { readRegistry } from "../../core/legacy/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "patch-passthrough-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  process.env.GATE_ROOT = originalEnv;
}

async function patchCall(args) {
  return JSON.parse((await metaStatePatchTool.handler(args)).content[0].text);
}

async function reportCall(args) {
  return JSON.parse((await metaStateReportTool.handler(args)).content[0].text);
}

async function proposeDesignCall(args) {
  return JSON.parse((await metaStateProposeDesignTool.handler(args)).content[0].text);
}

test("meta_state_patch forwards tool-level mechanism_check into patch for findings", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for mechanism_check passthrough (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      mechanism_check: true,
    });

    assert.equal(result.patched, true, `expected patched=true, got ${JSON.stringify(result)}`);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert(updated, "updated entry not found");
    assert.equal(updated.mechanism_check, true);
    assert.equal(updated.evidence_journal, "docs/journals/test.md");
  } finally {
    teardown();
  }
});

test("meta_state_patch rejects tool-level code_fingerprint for findings as immutable", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for code_fingerprint passthrough (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      code_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "immutable_field");
    assert.ok(Array.isArray(result.denied_fields));
    assert.ok(result.denied_fields.includes("code_fingerprint"));
  } finally {
    teardown();
  }
});

test("meta_state_patch normal finding patch still works without script-caller fields", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for normal patch path (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
    });

    assert.equal(result.patched, true);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert.equal(updated.evidence_journal, "docs/journals/test.md");
  } finally {
    teardown();
  }
});

test("meta_state_patch still rejects unknown fields inside patch", () => {
  // The handler is not responsible for schema validation; the MCP SDK validates
  // against the tool schema before calling the handler. Assert the schema itself
  // rejects unknown fields inside the patch object (B2 invariant).
  const findingPatchSchema = buildPatchSchemaFor("finding");
  const result = findingPatchSchema.safeParse({ unknown_field: "should fail" });

  assert.equal(result.success, false, "patch schema should reject unknown fields");
});

test("meta_state_patch ignores tool-level script-caller fields for non-finding entries", async () => {
  const root = setup();
  try {
    const proposeResult = await proposeDesignCall({
      title: "Test design for passthrough scope",
      description: "A test design to verify script-caller fields are ignored for non-finding entries.",
      proposed_design_for: ["rule-x"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(proposeResult.proposed, true);
    const id = proposeResult.id;

    const result = await patchCall({
      id,
      entry_kind: "loop-design",
      patch: { description: "Updated description that is still long enough." },
      mechanism_check: true,
      code_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    assert.equal(result.patched, true, `expected patched=true, got ${JSON.stringify(result)}`);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert.equal(updated.mechanism_check, undefined, "mechanism_check should not be forwarded to non-finding entries");
    assert.equal(updated.code_fingerprint, undefined, "code_fingerprint should not be forwarded to non-finding entries");
  } finally {
    teardown();
  }
});

test("meta_state_patch nested array field inside patch still round-trips", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for nested array round-trip (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { reopens: ["meta-260601T0000Z-stale"] },
    });

    assert.equal(result.patched, true);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert.deepEqual(updated.reopens, ["meta-260601T0000Z-stale"]);
  } finally {
    teardown();
  }
});

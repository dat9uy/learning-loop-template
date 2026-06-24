import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStatePatchTool } from "../../tools/legacy/meta-state-patch-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../../tools/legacy/meta-state-log-change-tool.js";
import { metaStateResolveTool } from "../../tools/legacy/meta-state-resolve-tool.js";
import { metaStateAckTool } from "../../tools/legacy/meta-state-ack-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "patch-test-"));
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

async function logChangeCall(args) {
  return JSON.parse((await metaStateLogChangeTool.handler(args)).content[0].text);
}

async function resolveCall(args) {
  return JSON.parse((await metaStateResolveTool.handler(args)).content[0].text);
}

async function ackCall(args) {
  return JSON.parse((await metaStateAckTool.handler(args)).content[0].text);
}

test("meta_state_patch happy path patches a finding's evidence_journal with CAS", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for patch tool happy path (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      _expected_version: 0,
    });

    assert.equal(result.patched, true);
    assert.equal(result.version, 1);
    assert.equal(result.id, id);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert(updated, "updated entry not found in registry");
    assert.equal(updated.evidence_journal, "docs/journals/test.md");
    assert.equal(updated.version, 1);
  } finally {
    teardown();
  }
});

test("meta_state_patch CAS mismatch returns version_mismatch", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for CAS mismatch (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      _expected_version: 99,
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "version_mismatch");
    assert.equal(result.id, id);
    assert.equal(result.current_version, 0);
  } finally {
    teardown();
  }
});

test("meta_state_patch not found returns not_found", async () => {
  const root = setup();
  try {
    const result = await patchCall({
      id: "nonexistent-id-12345",
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "not_found");
    assert.equal(result.id, "nonexistent-id-12345");
  } finally {
    teardown();
  }
});

test("meta_state_patch change-log immutable returns change_log_immutable", async () => {
  const root = setup();
  try {
    const logResult = await logChangeCall({
      change_dimension: "surface",
      change_target: "tools/test.js",
      change_diff: { added: ["test"], removed: [], changed: [] },
      reason: "Test change-log for immutability check (min 20 chars)",
    });
    assert.equal(logResult.logged, true);
    const id = logResult.id;

    const result = await patchCall({
      id,
      entry_kind: "change-log",
      patch: { reason: "should not work" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "change_log_immutable");
    assert.equal(result.id, id);
  } finally {
    teardown();
  }
});

test("meta_state_patch branch mismatch returns branch_mismatch", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for branch mismatch (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "loop-design",
      patch: { title: "wrong kind" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "branch_mismatch");
    assert.equal(result.id, id);
    assert.equal(result.expected, "loop-design");
    assert.equal(result.actual, "finding");
  } finally {
    teardown();
  }
});

test("meta_state_patch full lifecycle: create -> patch -> resolve", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for full lifecycle (min 20 chars)",
    });
    const id = reportResult.id;

    const patchResult = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_code_ref: "tools/test.js:42" },
    });
    assert.equal(patchResult.patched, true);
    assert.equal(patchResult.version, 1);

    const ackResult = await ackCall({ id });
    assert.equal(ackResult.acked, true);

    const resolveResult = await resolveCall({
      id,
      resolution: "Resolved via patch tool lifecycle test",
    });
    assert.equal(resolveResult.resolved, true);

    const entries = readRegistry(root);
    const final = entries.find((e) => e.id === id);
    assert.equal(final.status, "resolved");
    assert.equal(final.evidence_code_ref, "tools/test.js:42");
  } finally {
    teardown();
  }
});

test("meta_state_patch deny-list rejects identity/audit-trail field mutations", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for deny-list check (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { id: "new-id", created_at: "fake", resolved_at: "fake" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "immutable_field");
    assert.equal(result.id, id);
    assert.ok(Array.isArray(result.denied_fields));
    assert.ok(result.denied_fields.includes("id"));
    assert.ok(result.denied_fields.includes("created_at"));
    assert.ok(result.denied_fields.includes("resolved_at"));
  } finally {
    teardown();
  }
});

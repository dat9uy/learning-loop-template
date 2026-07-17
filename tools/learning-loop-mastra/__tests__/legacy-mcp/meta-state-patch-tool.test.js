import { test } from "vitest";
import assert from "node:assert/strict";
import { metaStatePatchTool } from "../../tools/handlers/meta-state-patch-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";
import { metaStateResolveTool } from "../../tools/handlers/meta-state-resolve-tool.js";
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
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
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

    // Plan 260707-0812 Phase 2: ack removed; report writes status:"open" directly,
    // so we skip the ack step and resolve the open finding directly.
    const patchResult = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_code_ref: "tools/test.js:42" },
    });
    assert.equal(patchResult.patched, true);
    assert.equal(patchResult.version, 1);

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

// CV-B: code_fingerprint is a deprecated back-door write to the per-record
// baseline. It must be blocked (no-op) with a deprecation note pointing at the
// authoritative refresh path (meta_state_refresh_file_index).
test("meta_state_patch blocks code_fingerprint with a deprecation note pointing at refresh_file_index (CV-B)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for code_fingerprint patch block (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      code_fingerprint: "sha256:" + "a".repeat(64),
    });

    assert.equal(result.patched, false, "code_fingerprint patch must be a no-op");
    assert.equal(result.reason, "immutable_field");
    assert.ok(result.denied_fields.includes("code_fingerprint"));
    assert.ok(
      typeof result.deprecation_note === "string" && result.deprecation_note.includes("meta_state_refresh_file_index"),
      "denial must point the caller at meta_state_refresh_file_index",
    );
    // The registry entry must be unchanged (no code_fingerprint written).
    const entry = readRegistry(root).find((e) => e.id === id);
    assert.equal(entry.code_fingerprint, undefined);
  } finally {
    teardown();
  }
});

// meta-260717T1026Z-...empty-patch: empty patches must NOT return patched:true.
// Two flavors cover the exposure surface: literal empty object, and
// immutable-fields-only (where every field is in the deny-list, leaving
// the effective patch empty after stripping).
test("meta_state_patch rejects empty patch object with reason empty_patch (meta-260717T1026Z)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for empty-patch rejection (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: {},
      _expected_version: 0,
    });

    assert.equal(result.patched, false, "empty patch must NOT report patched:true");
    assert.equal(result.reason, "empty_patch");
    assert.equal(result.id, id);
    assert.equal(result.entry_kind, "finding");
    assert.ok(
      typeof result.hint === "string" && result.hint.includes("meta_state_supersede") && result.hint.includes("meta_state_resolve"),
      "empty_patch rejection must point the caller at the right alternative tools",
    );

    // Registry unchanged: no version bump, no new line.
    const entries = readRegistry(root);
    const matching = entries.filter((e) => e.id === id);
    assert.equal(matching.length, 1, "empty patch must not append a new line");
    assert.equal(matching[0].version, 0, "version must not bump on empty patch");
  } finally {
    teardown();
  }
});

test("meta_state_patch never mutates when patch contains only immutable fields (meta-260717T1026Z)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for immutable-only patch rejection (min 20 chars)",
    });
    const id = reportResult.id;

    // All four fields are immutable / identity — every field is stripped,
    // so the effective patch would be empty.
    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: {
        id: "meta-999999T9999Z-attempted-identity-override",
        version: 99,
        status: "resolved",
        resolved_at: "2099-01-01T00:00:00.000Z",
      },
      _expected_version: 0,
    });

    // The fields trigger immutable_field (deny-list catches them first).
    // The point of this test is that no mutation lands regardless of path.
    assert.equal(result.patched, false);
    assert.ok(
      result.reason === "immutable_field" || result.reason === "empty_patch",
      `expected immutable_field or empty_patch, got ${result.reason}`,
    );

    // Registry unchanged: no version bump.
    const entries = readRegistry(root);
    const matching = entries.filter((e) => e.id === id);
    assert.equal(matching.length, 1, "no mutation line may be appended");
    assert.equal(matching[0].version, 0, "version must not bump on this path");
    assert.equal(matching[0].id, id, "id must not be replaced via the patch path");
    assert.equal(matching[0].status, "open", "status must not be flipped via the patch path");
  } finally {
    teardown();
  }
});

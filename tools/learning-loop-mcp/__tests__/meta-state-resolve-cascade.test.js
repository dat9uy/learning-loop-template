import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(process.cwd());

async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")).href;
  return await import(corePath);
}

async function importMetaStateResolveTool() {
  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/tools/meta-state-resolve-tool.js")).href;
  return await import(toolPath);
}

test("cascade_from delegates to migrate and produces stale status (2-step path)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");
  const childId = core.generateId("child-reopens");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A child finding that reopens the parent.",
    status: "active",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    // New behavior (post-relationship-modeling): 2-step path, migrated to stale
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.status, "stale");
    assert.strictEqual(parsed.migrated_via_cascade, true);

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "stale");
    assert.strictEqual(parent.expires_at, null);
    assert.ok(parent.last_verified_at);
    assert.strictEqual(parent.resolved_at, undefined);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from with missing child returns cascade_child_not_found", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: ["nonexistent-child"],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.reason, "cascade_child_not_found");
    assert.deepStrictEqual(parsed.missing_ids, ["nonexistent-child"]);

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "expired");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from with child not reopening parent returns cascade_child_not_reopening", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");
  const childId = core.generateId("child-other");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A child finding that reopens a different parent.",
    status: "active",
    reopens: ["some-other-parent"],
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.reason, "cascade_child_not_reopening");
    assert.ok(parsed.bad_children);
    assert.strictEqual(parsed.bad_children[0].child_id, childId);
    assert.strictEqual(parsed.bad_children[0].expected_reopens, parentId);
    assert.deepStrictEqual(parsed.bad_children[0].actual_reopens, ["some-other-parent"]);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from with unresolved child returns cascade_child_unresolved", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");

  for (const badStatus of ["reported", "expired", "stale", "superseded"]) {
    const childId = core.generateId(`child-${badStatus}`);

    // Clear registry for each iteration
    const metaStatePath = join(tempRoot, "meta-state.jsonl");
    writeFileSync(metaStatePath, "", { flag: "w" });

    await core.writeEntry(tempRoot, {
      id: parentId,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A parent finding that has expired.",
      status: "expired",
      created_at: new Date().toISOString(),
      version: 0,
    });
    await core.writeEntry(tempRoot, {
      id: childId,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: `A child finding with status ${badStatus}.`,
      status: badStatus,
      reopens: [parentId],
      created_at: new Date().toISOString(),
      version: 0,
    });

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
    try {
      const { metaStateResolveTool } = await importMetaStateResolveTool();
      const result = await metaStateResolveTool.handler({
        id: parentId,
        cascade_from: [childId],
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.resolved, false, `status=${badStatus}`);
      assert.strictEqual(parsed.reason, "cascade_child_unresolved", `status=${badStatus}`);
      assert.ok(parsed.bad_children, `status=${badStatus}`);
      assert.strictEqual(parsed.bad_children[0].child_id, childId, `status=${badStatus}`);
      assert.strictEqual(parsed.bad_children[0].child_status, badStatus, `status=${badStatus}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  }
});

test("cascade_from with multiple children migrates to stale (2-step path)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");
  const childA = core.generateId("child-a");
  const childB = core.generateId("child-b");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childA,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "Child A that reopens the parent.",
    status: "resolved",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childB,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "Child B that reopens the parent.",
    status: "resolved",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childA, childB],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    // New behavior: 2-step path, migrated to stale, not resolved
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.status, "stale");
    assert.strictEqual(parsed.migrated_via_cascade, true);

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "stale");
    assert.strictEqual(parent.expires_at, null);
    assert.ok(parent.last_verified_at);
    assert.strictEqual(parent.resolved_at, undefined);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from fails the operator gate before child validation", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");
  const childId = core.generateId("child-valid");
  const blockingId = core.generateId("blocking-finding");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A valid child that reopens the parent.",
    status: "active",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: blockingId,
    entry_kind: "finding",
    category: "mcp-tool-missing",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "mcp-client-loading",
    description: "Blocking finding for resolution evidence test.",
    session_id: "test-session-id",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: "rule-cold-session-test-must-pass-before-resolution",
    entry_kind: "rule",
    origin: parentId,
    enforcement: "gate",
    pattern_type: "resolution-evidence-required",
    pattern: "test-session-id",
    applies_to_resolution: parentId,
    description: "Rule entry for resolution evidence test.",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.reason, "resolution_evidence_required");

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "expired");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on non-expired parent falls through to normal resolution", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-active");
  const childId = core.generateId("child-valid");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that is active.",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  });
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A child that reopens the parent.",
    status: "active",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.resolved, true);
    assert.strictEqual(parsed.status, "resolved");
    assert.strictEqual(parsed.cascade_resolved_by, undefined);

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("meta_state_resolve with no cascade_from and expired status still returns already_terminal", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-expired");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that has expired.",
    status: "expired",
    created_at: new Date().toISOString(),
    version: 0,
  });

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    const result = await metaStateResolveTool.handler({
      id: parentId,
      resolved_by: "operator",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.reason, "already_terminal");
    assert.strictEqual(parsed.current_status, "expired");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Plan 260611-1000 retargeted the cascade to a 1-step path. Stale parents
// (the legacy 'expired' status was removed) are closed in 1 call.

const projectRoot = resolve(process.cwd());

async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")).href;
  return await import(corePath);
}

async function importMetaStateResolveTool() {
  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/tools/meta-state-resolve-tool.js")).href;
  return await import(toolPath);
}

async function writeStaleParent(core, tempRoot, id, opts = {}) {
  await core.writeEntry(tempRoot, {
    id,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that is past its staleness window.",
    status: "stale",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    last_verified_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    version: 0,
    ...opts,
  });
}

async function writeChild(core, tempRoot, childId, parentId, status = "active") {
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A child finding that reopens the parent.",
    status,
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });
}

test("cascade_from on stale parent closes in 1 step (no 2-step migrate)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale");
  const childId = core.generateId("child-reopens");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, parentId);

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
    assert.strictEqual(parsed.migrated_via_cascade, undefined, "2-step shape must be gone");

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
    assert.ok(parent.resolved_at);
    assert.strictEqual(parent.resolved_by, "operator");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from with missing child returns cascade_child_not_found", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-missing-child");

  await writeStaleParent(core, tempRoot, parentId);

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
    assert.strictEqual(parent.status, "stale");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from with child not reopening parent returns cascade_child_not_reopening", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-not-reopening");
  const childId = core.generateId("child-other");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, "some-other-parent");

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

  // After plan 260611-1000, only `stale`, `reported`, and `superseded` are
  // non-validating statuses. The legacy `expired` was removed.
  for (const badStatus of ["reported", "stale", "superseded"]) {
    const parentId = core.generateId(`parent-stale-${badStatus}`);
    const childId = core.generateId(`child-${badStatus}`);

    // Clear registry for each iteration
    const metaStatePath = join(tempRoot, "meta-state.jsonl");
    writeFileSync(metaStatePath, "", { flag: "w" });

    await writeStaleParent(core, tempRoot, parentId);
    await writeChild(core, tempRoot, childId, parentId, badStatus);

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

test("cascade_from with multiple stale-parent children closes in 1 step (multi-reopens)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-multi");
  const childA = core.generateId("child-a");
  const childB = core.generateId("child-b");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childA, parentId, "resolved");
  await writeChild(core, tempRoot, childB, parentId, "resolved");

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
    assert.strictEqual(parsed.resolved, true);
    assert.strictEqual(parsed.status, "resolved");
    assert.strictEqual(parsed.migrated_via_cascade, undefined);

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
    assert.ok(parent.resolved_at);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from fails the operator gate before child validation (consult-gate fires first)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-gated");
  const childId = core.generateId("child-valid");
  const blockingId = core.generateId("blocking-finding");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, parentId);
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
    assert.strictEqual(parent.status, "stale");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on active parent closes in 1 step (sanity check)", async () => {
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
  await writeChild(core, tempRoot, childId, parentId);

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
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on reported parent returns cascade_parent_is_reported (preserves ack flow)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-reported-cascade");
  const childId = core.generateId("child-of-reported");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent in the 24h TTL reported window.",
    status: "reported",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    version: 0,
  });
  await writeChild(core, tempRoot, childId, parentId);

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
    assert.strictEqual(parsed.reason, "cascade_parent_is_reported");
    assert.ok(parsed.hint);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

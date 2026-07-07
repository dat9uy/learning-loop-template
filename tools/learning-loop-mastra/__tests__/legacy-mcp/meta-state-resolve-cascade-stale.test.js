import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(process.cwd());

async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js")).href;
  return await import(corePath);
}

async function importMetaStateResolveTool() {
  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/tools/legacy/meta-state-resolve-tool.js")).href;
  return await import(toolPath);
}

async function writeStaleParent(core, tempRoot, id) {
  await core.writeEntry(tempRoot, {
    id,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that is past its staleness window.",
    status: "open",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    last_verified_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    version: 0,
  });
}

async function writeChild(core, tempRoot, childId, parentId) {
  await core.writeEntry(tempRoot, {
    id: childId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A child finding that reopens the parent.",
    status: "open",
    reopens: [parentId],
    created_at: new Date().toISOString(),
    version: 0,
  });
}

test("cascade_from on stale parent closes the parent in 1 step (no migrate)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-stale-"));
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
    assert.strictEqual(parsed.resolved, true, "expected resolved=true in 1 step");
    assert.strictEqual(parsed.status, "resolved");
    assert.strictEqual(parsed.resolved_by, "operator");
    assert.strictEqual(parsed.migrated_via_cascade, undefined, "2-step shape must be gone");

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
    assert.ok(parent.resolved_at, "resolved_at must be set");
    assert.strictEqual(parent.resolved_by, "operator");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on stale parent updates the parent registry entry to resolved", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-stale-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-registry");
  const childId = core.generateId("child-registry");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, parentId);

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
    assert.ok(parent.resolved_at, "resolved_at must be set on the registry entry");
    assert.strictEqual(parent.resolved_by, "operator");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from leaves the child registry entry unchanged", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-stale-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-child-unchanged");
  const childId = core.generateId("child-unchanged");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, parentId);

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const { metaStateResolveTool } = await importMetaStateResolveTool();
    await metaStateResolveTool.handler({
      id: parentId,
      cascade_from: [childId],
      resolved_by: "operator",
    });
    const after = core.readRegistry(tempRoot);
    const child = after.find((e) => e.id === childId);
    assert.strictEqual(child.status, "active", "child must remain active after cascade");
    assert.strictEqual(child.resolved_at, undefined);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on reported parent returns cascade_parent_is_reported (preserves ack flow)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-stale-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-reported");
  const childId = core.generateId("child-reported-parent");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that is still in the 24h TTL reported window.",
    status: "open",
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
    assert.strictEqual(parsed.resolved, false);
    assert.strictEqual(parsed.reason, "cascade_parent_is_reported");
    assert.strictEqual(parsed.id, parentId);
    assert.ok(parsed.hint, "expected a hint to ack the parent first");

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "reported", "parent must remain reported (not cascade-resolved)");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("cascade_from on active parent closes in 1 step (sanity check: active path still works)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-stale-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-active-sanity");
  const childId = core.generateId("child-active-sanity");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A parent finding that is active.",
    status: "open",
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

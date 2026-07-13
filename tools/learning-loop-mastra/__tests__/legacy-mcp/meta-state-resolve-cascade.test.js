import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Plan 260611-1000 retargeted the cascade to a 1-step path. Stale parents
// (the legacy 'expired' status was removed) are closed in 1 call.

const projectRoot = resolve(process.cwd());

async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js")).href;
  return await import(corePath);
}

async function importMetaStateResolveTool() {
  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js")).href;
  return await import(toolPath);
}

async function writeStaleParent(core, tempRoot, id, opts = {}) {
  // Plan 260707-0812 Phase 2: `stale` is no longer a status. The "stale parent"
  // is modeled as an aged open finding (backdated created_at so isStaleView
  // returns true). This preserves the cascade semantics — the parent is
  // open-eligible but surfaced in the derived stale view.
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
    ...opts,
  });
}

async function writeChild(core, tempRoot, childId, parentId, status = "open") {
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
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
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
    assert.strictEqual(parent.status, "open", "failed cascade must leave parent status unchanged");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
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
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  }
});

test("cascade_from with unresolved child returns cascade_child_unresolved", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);

  // After plan 260707-0812, only `superseded` and the runtime-applied
  // `archived` are non-cascade-eligible child statuses. `resolved` is now
  // explicitly accepted as a valid child (the cascade is the canonical way
  // to close the parent once the underlying issue is resolved).
  for (const badStatus of ["superseded"]) {
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
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
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
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
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
    status: "open",
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
    status: "active", // rule status: rule entries use the rule enum (active/inactive), unchanged by Phase 2
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
    assert.strictEqual(parent.status, "open", "failed cascade must leave parent status unchanged");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
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
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  }
});

test("cascade_from on terminal parent returns already_terminal", async () => {
  // Plan 260707-0812 Phase 2: ack removed; the legacy `cascade_parent_is_reported`
  // branch is gone. Terminal parents (resolved/superseded/archived) hit the
  // early-return `already_terminal` guard before the cascade branch — so the
  // cascade branch is never reached for terminal parents. This test asserts
  // the reachable behavior.
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-terminal-cascade");
  const childId = core.generateId("child-of-terminal");

  await core.writeEntry(tempRoot, {
    id: parentId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A terminal parent (resolved) — already_terminal fires before cascade.",
    status: "resolved",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 60_000).toISOString(),
    resolved_by: "operator",
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
    assert.strictEqual(parsed.reason, "already_terminal");
    assert.strictEqual(parsed.current_status, "resolved");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  }
});

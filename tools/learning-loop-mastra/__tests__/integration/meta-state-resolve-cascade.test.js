import { test } from "vitest";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The cascade branch was removed from meta_state_resolve. The `cascade_from`
// arg is no longer in the tool schema and is silently stripped by zod; the
// handler resolves the parent directly. Stale parents (the legacy 'expired'
// status was removed) are closed in a single explicit resolve call.

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
  // `stale` is no longer a status. The "stale parent" is modeled as an aged
  // open finding (backdated created_at so isStaleView returns true). This
  // preserves the cascade semantics — the parent is open-eligible but
  // surfaced in the derived stale view.
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

test("cascade_from is ignored: missing child no longer blocks resolve (parent resolves directly)", async () => {
  // The cascade branch was removed; `cascade_from` is stripped by zod and
  // never reaches the handler. A previously "missing child" no longer fails
  // cascade validation — the parent resolves directly.
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
      process.env.GATE_ROOT = originalEnv;
    }
  }
});

test("cascade_from is ignored: child not reopening parent no longer blocks resolve (parent resolves directly)", async () => {
  // The cascade branch was removed; `cascade_from` is stripped by zod and
  // never reaches the handler. A child that does not reopen the parent no
  // longer fails cascade validation — the parent resolves directly.
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-not-reopening");
  const childId = core.generateId("child-other");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, "meta-some-other-parent");

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

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalEnv;
    }
  }
});

test("cascade_from is ignored: child status no longer blocks resolve (parent resolves directly)", async () => {
  // The cascade branch was removed; `cascade_from` is stripped by zod and
  // never reaches the handler. The child's status (previously the
  // non-cascade-eligible gate) is no longer inspected — the parent resolves
  // directly regardless of the child's state.
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-cascade-"));
  const core = await importCore(tempRoot);
  const parentId = core.generateId("parent-stale-child-open");
  const childId = core.generateId("child-open");

  await writeStaleParent(core, tempRoot, parentId);
  await writeChild(core, tempRoot, childId, parentId, "open");

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

    const after = core.readRegistry(tempRoot);
    const parent = after.find((e) => e.id === parentId);
    assert.strictEqual(parent.status, "resolved");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
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
  mkdirSync(join(tempRoot, "tools/learning-loop-mastra/core"), { recursive: true });
  writeFileSync(
    join(tempRoot, "tools/learning-loop-mastra/core/gate-logic.js"),
    "export function checkResolutionEvidence() {}\n",
  );
  await core.writeEntry(tempRoot, {
    id: "rule-cold-session-test-must-pass-before-resolution",
    entry_kind: "rule",
    origin: parentId,
    internalization_level: "I3",
    evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#checkResolutionEvidence",
    pattern_type: "determinism-checklist",
    pattern: "test-session-id",
    applies_to_resolution: parentId,
    description: "Rule entry for resolution evidence test.",
    status: "active", // rule entries use the rule enum (active/inactive), separate from finding status
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
  // Terminal parents (resolved/accepted/archived) hit the early-return
  // `already_terminal` guard before any cascade handling — so the cascade
  // arg is irrelevant for terminal parents. This test asserts the reachable
  // behavior.
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

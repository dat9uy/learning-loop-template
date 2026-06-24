import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(process.cwd());

async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/legacy/meta-state.js")).href;
  return await import(corePath);
}

test("immutable_field error response includes full IMMUTABLE_PATCH_FIELDS list", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-patch-"));
  const core = await importCore(tempRoot);
  const findingId = core.generateId("patch-test");

  await core.writeEntry(tempRoot, {
    id: findingId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A finding for patch immutable fields test.",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  });

  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/tools/legacy/meta-state-patch-tool.js")).href;
  const { metaStatePatchTool, IMMUTABLE_PATCH_FIELDS } = await import(toolPath);

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const result = await metaStatePatchTool.handler({
      id: findingId,
      entry_kind: "finding",
      patch: { id: "different-id" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.patched, false);
    assert.strictEqual(parsed.reason, "immutable_field");
    assert.deepStrictEqual(parsed.denied_fields, ["id"]);
    assert.ok(Array.isArray(parsed.immutable_fields), "immutable_fields must be an array (wire-format safe)");
    assert.deepStrictEqual(
      [...parsed.immutable_fields].sort(),
      [...IMMUTABLE_PATCH_FIELDS].sort(),
      "immutable_fields must match the exported IMMUTABLE_PATCH_FIELDS Set"
    );
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

test("immutable_field error response still includes denied_fields (backward compat)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-patch-"));
  const core = await importCore(tempRoot);
  const findingId = core.generateId("patch-test");

  await core.writeEntry(tempRoot, {
    id: findingId,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: "A finding for patch backward compat test.",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  });

  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/tools/legacy/meta-state-patch-tool.js")).href;
  const { metaStatePatchTool } = await import(toolPath);

  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const result = await metaStatePatchTool.handler({
      id: findingId,
      entry_kind: "finding",
      patch: { resolved_at: "2026-01-01T00:00:00.000Z" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.patched, false);
    assert.strictEqual(parsed.reason, "immutable_field");
    assert.ok(Array.isArray(parsed.denied_fields));
    assert.ok(parsed.denied_fields.includes("resolved_at"));
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

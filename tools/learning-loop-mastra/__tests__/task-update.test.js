import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";

const CACHE_PATH = ".claude/task-status-cache.json";

function cleanupCache() {
  try { rmSync(CACHE_PATH); } catch { /* ignore */ }
}

function makeFakeClaude(t, behavior = "success") {
  const binDir = mkdtempSync(join(tmpdir(), "task-update-fake-claude-"));
  const binPath = join(binDir, "claude");

  if (behavior === "success") {
    writeFileSync(
      binPath,
      `#!/usr/bin/env node\nprocess.exit(0);\n`,
      { mode: 0o755 },
    );
  } else if (behavior === "fail") {
    writeFileSync(
      binPath,
      `#!/usr/bin/env node\nconsole.error("claude not found");\nprocess.exit(1);\n`,
      { mode: 0o755 },
    );
  }
  chmodSync(binPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${delimiter}${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
  });
  return binDir;
}

test("taskUpdate: real change (pending -> completed) returns changed=true", async (t) => {
  cleanupCache();
  makeFakeClaude(t, "success");

  const { taskUpdate } = await import("#mcp/tools/task-update.js");
  const result = await taskUpdate.execute({
    taskId: "task-001",
    status: "completed",
  });

  assert.equal(result.changed, true);
  assert.equal(result.previous, null);
  assert.equal(result.current, "completed");
  assert.ok(typeof result.runAt === "string");
});

test("taskUpdate: no-op (completed -> completed) returns changed=false", async (t) => {
  cleanupCache();
  makeFakeClaude(t, "success");

  const { taskUpdate } = await import("#mcp/tools/task-update.js");
  await taskUpdate.execute({ taskId: "task-002", status: "completed" });
  const result = await taskUpdate.execute({ taskId: "task-002", status: "completed" });

  assert.equal(result.changed, false);
  assert.equal(result.previous, "completed");
  assert.equal(result.current, "completed");
});

test("taskUpdate: native failure returns error", async (t) => {
  cleanupCache();
  makeFakeClaude(t, "fail");

  const { taskUpdate } = await import("#mcp/tools/task-update.js");
  const result = await taskUpdate.execute({
    taskId: "task-003",
    status: "completed",
  });

  assert.equal(result.changed, false);
  assert.ok(result.error.includes("native TaskUpdate failed"));
});

test("taskUpdate: missing taskId returns error", async () => {
  cleanupCache();
  const { taskUpdate } = await import("#mcp/tools/task-update.js");

  const result = await taskUpdate.execute({
    taskId: "",
    status: "completed",
  });

  assert.equal(result.changed, false);
  assert.equal(result.error, "taskId required");
});

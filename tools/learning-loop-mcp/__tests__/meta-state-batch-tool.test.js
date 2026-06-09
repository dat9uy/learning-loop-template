import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { metaStateBatchTool } from "../tools/meta-state-batch-tool.js";
import { readRegistry } from "../core/meta-state.js";

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "batch-test-"));
  return tmp;
}

function sha256File(path) {
  const raw = readFileSync(path, "utf8");
  return createHash("sha256").update(raw).digest("hex");
}

describe("meta_state_batch", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    // Seed with 3 baseline findings
    const lines = [
      JSON.stringify({ id: "batch-base-1", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 1 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "batch-base-2", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 2 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "batch-base-3", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 3 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  it("write+update+delete atomic", async () => {
    const ops = [
      {
        op: "write",
        entry: {
          id: "batch-new-1",
          entry_kind: "finding",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "New entry for atomic batch test (min 20 chars)",
          status: "reported",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        op: "update",
        id: "batch-new-1",
        description: "Updated description for atomic batch test",
      },
      {
        op: "delete",
        id: "batch-base-3",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 3, "all 3 ops must be applied");
    assert.equal(parsed.failed_at, null, "no failure expected");

    const entries = readRegistry(root);
    assert.equal(entries.length, 3, "3 baseline + 1 new - 1 deleted = 3");
    assert.ok(entries.find((e) => e.id === "batch-new-1"), "new entry must exist");
    assert.ok(entries.find((e) => e.id === "batch-new-1").description.includes("Updated"), "new entry must be updated");
    assert.ok(!entries.find((e) => e.id === "batch-base-3"), "deleted entry must not exist");
  });

  it("archive op supported", async () => {
    const ops = [
      {
        op: "archive",
        id: "batch-base-1",
        reason: "batch archive test",
        archived_by: "test-runner",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "archive op must be applied");

    const entries = readRegistry(root);
    const archived = entries.find((e) => e.id === "batch-base-1");
    assert.equal(archived.status, "archived", "must be archived");
    assert.ok(archived.archived_at, "archived_at must be set");
    assert.equal(archived.archived_by, "test-runner", "archived_by must be set");
  });

  it("partial-failure rollback leaves file unchanged", async () => {
    const registryPath = join(root, "meta-state.jsonl");
    const beforeHash = sha256File(registryPath);

    const ops = [
      {
        op: "write",
        entry: {
          id: "batch-rollback-a",
          entry_kind: "finding",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Entry A for rollback test (min 20 chars)",
          status: "reported",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        op: "update",
        id: "nonexistent-id-xyz",
        description: "This update must fail",
      },
      {
        op: "write",
        entry: {
          id: "batch-rollback-c",
          entry_kind: "finding",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Entry C for rollback test (min 20 chars)",
          status: "reported",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 0, "0 ops applied after rollback");
    assert.equal(parsed.failed_at, 1, "must fail at op index 1");
    assert.ok(parsed.reason, "must include failure reason");

    const afterHash = sha256File(registryPath);
    assert.equal(afterHash, beforeHash, "file must be byte-identical after rollback");

    const entries = readRegistry(root);
    assert.ok(!entries.find((e) => e.id === "batch-rollback-a"), "entry A must not exist after rollback");
    assert.ok(!entries.find((e) => e.id === "batch-rollback-c"), "entry C must not exist after rollback");
  });

  it("500-op ceiling enforced", async () => {
    const ops = Array.from({ length: 501 }, (_, i) => ({
      op: "write",
      entry: {
        id: `batch-ceiling-${i}`,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Ceiling entry ${i} for batch test (min 20 chars)`,
        status: "reported",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    }));

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 0, "must reject oversized batch");
    assert.equal(parsed.failed_at, 0, "failed at entry 0");
    assert.ok(parsed.reason.includes("batch_size_exceeded") || parsed.reason.includes("size"), `reason must indicate size exceeded, got: ${parsed.reason}`);
  });

  it("concurrent batches are serialized", async () => {
    const batch1Ops = [
      {
        op: "write",
        entry: {
          id: "batch-concurrent-x",
          entry_kind: "finding",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Concurrent entry X for serialization test (min 20 chars)",
          status: "reported",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    ];
    const batch2Ops = [
      {
        op: "write",
        entry: {
          id: "batch-concurrent-y",
          entry_kind: "finding",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Concurrent entry Y for serialization test (min 20 chars)",
          status: "reported",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    ];

    const [result1, result2] = await Promise.all([
      metaStateBatchTool.handler({ operations: batch1Ops }),
      metaStateBatchTool.handler({ operations: batch2Ops }),
    ]);

    const parsed1 = JSON.parse(result1.content[0].text);
    const parsed2 = JSON.parse(result2.content[0].text);
    assert.equal(parsed1.applied, 1, "batch 1 must succeed");
    assert.equal(parsed2.applied, 1, "batch 2 must succeed");

    const entries = readRegistry(root);
    assert.ok(entries.find((e) => e.id === "batch-concurrent-x"), "entry X must exist");
    assert.ok(entries.find((e) => e.id === "batch-concurrent-y"), "entry Y must exist");
  });
});

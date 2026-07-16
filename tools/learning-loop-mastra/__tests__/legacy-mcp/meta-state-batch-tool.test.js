import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { metaStateBatchTool } from "../../tools/handlers/meta-state-batch-tool.js";
import { readRegistry } from "../../core/meta-state.js";

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

  beforeAll(() => {
    root = makeTempRoot();
    // Seed with 3 baseline findings
    const lines = [
      JSON.stringify({ id: "batch-base-1", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 1 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "batch-base-2", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 2 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "batch-base-3", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Baseline 3 for batch test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
    process.env.GATE_ROOT = root;
  });

  afterAll(() => {
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
          status: "open",
          created_at: new Date().toISOString(),
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
        reason: "batch delete test",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 3, "all 3 ops must be applied");
    assert.equal(parsed.failed_at, null, "no failure expected");

    // Plan 260716-1101 Tier 2 Phase B: readRegistry returns the projection
    // (last-wins-by-max-version per id). The delete op produced an
    // `archived` tombstone line — that line is the max-version for
    // batch-base-3 and is what the projection returns. Hard-delete is gone
    // (union-safety forbids line removal); the tombstone is the audit record.
    // meta_state_list (the public surface) hides it via status filter.
    const entries = readRegistry(root);
    assert.equal(entries.length, 4, "3 baseline + 1 new (batch-base-3 = tombstone line, projected as 1 entry)");

    const newEntry = entries.find((e) => e.id === "batch-new-1");
    assert.ok(newEntry, "new entry must exist");
    assert.ok(newEntry.description.includes("Updated"), "new entry must be updated");
    assert.equal(newEntry.version, 1, "update bumped version to 1");

    const tombstoned = entries.find((e) => e.id === "batch-base-3");
    assert.ok(tombstoned, "deleted entry's tombstone line must still be present in registry");
    assert.equal(tombstoned.status, "archived", "delete produced an archived tombstone");
    assert.equal(tombstoned.tombstone_kind, "delete", "tombstone_kind discriminator = delete");
    assert.equal(tombstoned.version, 1, "tombstone is the new max-version");
    assert.match(tombstoned.archived_reason, /^deleted:/);
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
          status: "open",
          created_at: new Date().toISOString(),
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
          status: "open",
          created_at: new Date().toISOString(),
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
        status: "open",
        created_at: new Date().toISOString(),
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
          status: "open",
          created_at: new Date().toISOString(),
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
          status: "open",
          created_at: new Date().toISOString(),
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

  it("update op with code_fingerprint in patch is rejected (immutable_field deny-list)", async () => {
    // Regression: metaStateBatch's update op used to do raw Object.assign,
    // letting callers pin a finding's code_fingerprint to a stale hash and
    // suppress future drift detection. The IMMUTABLE_PATCH_FIELDS deny-list
    // is now consulted by both meta_state_patch AND meta_state_batch.
    const registryPath = join(root, "meta-state.jsonl");
    const beforeHash = sha256File(registryPath);

    const ops = [
      {
        op: "update",
        id: "batch-base-1",
        code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 0, "denied op must not be applied");
    assert.equal(parsed.failed_at, 0, "must fail at op index 0");
    assert.equal(parsed.reason, "immutable_field", "must surface immutable_field reason");
    assert.ok(Array.isArray(parsed.denied_fields), "must include denied_fields array");
    assert.ok(
      parsed.denied_fields.includes("code_fingerprint"),
      `denied_fields must include code_fingerprint; got: ${JSON.stringify(parsed.denied_fields)}`
    );

    // The registry must be byte-identical after the failed batch.
    const afterHash = sha256File(registryPath);
    assert.equal(afterHash, beforeHash, "file must be byte-identical after rollback");

    // The entry's code_fingerprint (if any) must NOT have been overwritten.
    const entries = readRegistry(root);
    const target = entries.find((e) => e.id === "batch-base-1");
    assert.ok(target, "entry must still exist");
    assert.notEqual(
      target.code_fingerprint,
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "code_fingerprint must not be overwritten"
    );
  });

  it("update op with any IMMUTABLE_PATCH_FIELDS key is rejected (deny-list is exhaustive)", async () => {
    // Sanity: the deny-list covers all of {id, version, created_at, created_by,
    // code_fingerprint, consolidated_into, resolved_at, resolved_by, resolution}.
    // We test a non-code_fingerprint field to confirm the list is enforced
    // broadly, not just for code_fingerprint.
    const ops = [
      {
        op: "update",
        id: "batch-base-1",
        resolved_at: "2026-01-01T00:00:00.000Z",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 0, "denied op must not be applied");
    assert.equal(parsed.reason, "immutable_field");
    assert.ok(parsed.denied_fields.includes("resolved_at"));
  });

  it("update op on a change-log id is rejected (change_log_immutable)", async () => {
    // Plan 260715-1608 Phase 1 step 4 (red-team F14): metaStateBatch's update
    // op used to silently no-op on change-log entries — the table persist
    // strips change-logs before writing, so the mutation was discarded while
    // `applied: N` reported success. The new guard mirrors the delete op's
    // assertinvariant and surfaces the rejection explicitly.
    //
    // Seed a change-log entry in the registry first.
    const seedOp = [
      {
        op: "write",
        entry: {
          id: "batch-cl-immutable",
          entry_kind: "change-log",
          change_dimension: "semantic",
          change_target: "tools/learning-loop-mastra/core/meta-state.js",
          change_diff: { added: [], removed: [], changed: [] },
          reason: "Seeded change-log for change_log_immutable guard test (min 20 chars)",
          created_at: new Date().toISOString(),
        },
      },
    ];
    const seedResult = await metaStateBatchTool.handler({ operations: seedOp });
    const seedParsed = JSON.parse(seedResult.content[0].text);
    assert.equal(seedParsed.applied, 1, "seed must succeed");

    // Now try to update the change-log — must fail loud.
    const registryPath = join(root, "meta-state.jsonl");
    const beforeHash = sha256File(registryPath);

    const ops = [
      {
        op: "update",
        id: "batch-cl-immutable",
        reason: "Attempt to mutate a change-log (must be rejected)",
      },
    ];

    const result = await metaStateBatchTool.handler({ operations: ops });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 0, "must not apply the change-log update");
    assert.equal(parsed.failed_at, 0, "must fail at op index 0");
    assert.equal(parsed.reason, "change_log_immutable", `must surface change_log_immutable, got: ${parsed.reason}`);

    const afterHash = sha256File(registryPath);
    assert.equal(afterHash, beforeHash, "file must be byte-identical after rejected batch");

    const entries = readRegistry(root);
    const target = entries.find((e) => e.id === "batch-cl-immutable");
    assert.ok(target, "entry must still exist (registry unchanged)");
    assert.equal(
      target.reason,
      "Seeded change-log for change_log_immutable guard test (min 20 chars)",
      "change-log reason must NOT be overwritten"
    );
  });

  // --- Coercion regression: MCP wire layer coerces arrays to {item: [...]} ---
  // Recursive envelope-strip on `operations` unwraps both the top-level array
  // AND nested arrays inside each entry (change_diff.added/removed/changed,
  // loop-design.addresses, etc.). See plan 260709-1032.

  it("accepts top-level operations coerced as {item: [...]} envelope", async () => {
    // Wire-form: agents passing operations through MCP SDK get {item: ops} coercion.
    const writeOp = {
      op: "write",
      entry: {
        id: "batch-coerce-top",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Top-level coerced operations envelope test (min 20 chars)",
        status: "open",
        created_at: new Date().toISOString(),
      },
    };
    const result = await metaStateBatchTool.handler({
      operations: { item: [writeOp] },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "top-level envelope must unwrap and apply");
    assert.equal(parsed.failed_at, null, "no failure expected");

    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === "batch-coerce-top");
    assert.ok(written, "entry must persist after envelope unwrap");
  });

  it("accepts nested change_diff.added/removed coerced as {item: [...]} envelope", async () => {
    // Wire-form: arrays inside change_diff (and other array-typed fields)
    // arrive as {item: [...]}. metaStateEntrySchema.safeParse would reject
    // them, but deepStripEnvelope unwraps before validation.
    const changeLogOp = {
      op: "write",
      entry: {
        id: "batch-coerce-nested",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js",
        change_diff: {
          added: { item: ["core/envelope-stripper.js#deepStripEnvelope"] },
          removed: { item: [] },
          changed: { item: ["operations schema preprocess"] },
        },
        reason: "Nested envelope coercion test (min 20 chars): batch tool accepts wire-coerced arrays",
        created_at: new Date().toISOString(),
      },
    };
    const result = await metaStateBatchTool.handler({
      operations: [changeLogOp],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "nested envelope must unwrap and entry must validate");
    assert.equal(parsed.failed_at, null, "no validation_failed expected");

    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === "batch-coerce-nested");
    assert.ok(written, "change-log must persist");
    assert.deepEqual(
      written.change_diff.added,
      ["core/envelope-stripper.js#deepStripEnvelope"],
      "added must be unwrapped to plain array"
    );
    assert.deepEqual(written.change_diff.removed, [], "empty {item:[]} must unwrap to []");
    assert.deepEqual(
      written.change_diff.changed,
      ["operations schema preprocess"],
      "changed must be unwrapped to plain array"
    );
  });

  it("parity: same change-log body accepted by both meta_state_batch and meta_state_log_change", async () => {
    // Repro from finding meta-260709T1017Z-…-batch: a body accepted by
    // meta_state_log_change must also be accepted by meta_state_batch's
    // write op after the deepStripEnvelope fix.
    const entryBody = {
      id: "batch-coerce-parity",
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js",
      change_diff: {
        added: ["a"],
        removed: [],
        changed: ["b"],
      },
      reason: "Parity repro from finding: same body must validate via batch and log_change (min 20 chars)",
      created_at: new Date().toISOString(),
    };

    // Direct schema validation (mirrors what log_change does internally).
    const { metaStateChangeEntrySchema } = await import("../../core/meta-state.js");
    const direct = metaStateChangeEntrySchema.safeParse(entryBody);
    assert.ok(direct.success, `direct schema must accept the body, got: ${direct.success ? "" : JSON.stringify(direct.error.issues)}`);

    // Wire-coerced variant (top-level + nested arrays wrapped): what an agent
    // actually sends when MCP wire-layer coercion applies.
    const wireForm = {
      operations: {
        item: [{
          op: "write",
          entry: {
            ...entryBody,
            change_diff: {
              added: { item: ["a"] },
              removed: { item: [] },
              changed: { item: ["b"] },
            },
          },
        }],
      },
    };
    const result = await metaStateBatchTool.handler(wireForm);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "wire-coerced body must apply");
    assert.equal(parsed.failed_at, null, "no failure expected");
  });

  it("fail-closed: non-envelope nested objects pass through unchanged", async () => {
    // An entry whose change_diff already has native arrays must validate
    // identically — no spurious unwrap of legitimate single-item objects.
    const entryOp = {
      op: "write",
      entry: {
        id: "batch-coerce-failclosed",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js",
        change_diff: {
          added: ["only-this"],
          removed: [],
          changed: [],
        },
        reason: "Fail-closed repro: native array payload must not be mutated (min 20 chars)",
        created_at: new Date().toISOString(),
      },
    };
    const result = await metaStateBatchTool.handler({ operations: [entryOp] });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "native arrays must validate unchanged");
    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === "batch-coerce-failclosed");
    assert.deepEqual(written.change_diff.added, ["only-this"], "added must NOT be unwrapped");
  });

  it("deep envelope: operations:{item:{item:[op]}} double-nested also unwraps", async () => {
    // Defensive: some agent paths wrap twice. deepStripEnvelope must
    // recurse so that both envelope levels flatten.
    const writeOp = {
      op: "write",
      entry: {
        id: "batch-coerce-double",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Double-envelope regression test (min 20 chars)",
        status: "open",
        created_at: new Date().toISOString(),
      },
    };
    const result = await metaStateBatchTool.handler({
      operations: { item: { item: [writeOp] } },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 1, "double envelope must unwrap recursively");
  });
});

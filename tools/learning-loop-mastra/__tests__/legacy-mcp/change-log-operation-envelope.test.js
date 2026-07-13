/**
 * Plan 260712-0300 Phase 1 — MCP-layer schema tests for `operation_envelope`
 * on change-log entries. Goes through `withMcpServer`/`callTool` so the
 * Zod union validation at the MCP layer fires. Direct handler calls bypass
 * Zod and cannot reproduce the schema rejection shape.
 *
 * Harness behavior (verified with-mcp-server.js:88-101): callTool does
 * JSON.parse(result.content[0].text) with no isError check. When the MCP SDK
 * rejects invalid args, it returns {isError:true, content:[{text:"Tool
 * validation failed..."}]} (non-JSON) -> callTool throws SyntaxError from
 * JSON.parse. Tests that expect rejection MUST wrap callTool in try/catch
 * and assert the REGISTRY STATE as the primary check, not the callTool
 * return value.
 *
 * Phase 1 portion: schema-layer tests (a) round-trip + (b) unknown-kind reject.
 * Phase 2 (added later in this same file): batch integration + assertWriteVisible
 * + deny-list + write-path reject + target validation + kind × op compatibility
 * + fixture-based fresh-assertion.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// (a) meta_state_log_change accepts operation_envelope field; registry round-trips it.
test("(a) meta_state_log_change accepts operation_envelope field; registry round-trips it", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const envelope = {
      kind: "migration",
      target: "test-target",
      pre_count: {
        total: 3,
        by_status: { open: 3, resolved: 0, superseded: 0, archived: 0 },
        by_kind: { finding: 3, "change-log": 0, rule: 0, "loop-design": 0 },
      },
      post_count: {
        total: 1,
        by_status: { open: 1, resolved: 0, superseded: 0, archived: 0 },
        by_kind: { finding: 1, "change-log": 0, rule: 0, "loop-design": 0 },
      },
      content_hash: "sha256:" + "0".repeat(64),
    };

    const result = await callTool("mastra_meta_state_log_change", {
      change_dimension: "mechanical",
      change_target: "test-target",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Phase 1 schema round-trip test: operation_envelope field must round-trip (min 20 chars)",
      operation_envelope: envelope,
    });

    assert.equal(result.logged, true);
    const entry = readRegistry(tempRoot).find((e) => e.id === result.id);
    assert.ok(entry, "change-log must persist");
    assert.equal(entry.entry_kind, "change-log");
    assert.deepEqual(entry.operation_envelope, envelope, "operation_envelope must round-trip via MCP wire layer");
    assert.equal(entry.operation_envelope.kind, "migration");
    assert.equal(entry.operation_envelope.target, "test-target");
    assert.match(entry.operation_envelope.content_hash, /^sha256:[a-f0-9]{64}$/);
  });
});

// (b) meta_state_log_change rejects operation_envelope with unknown kind.
// callTool THROWS SyntaxError on the non-JSON MCP validation error — assert
// registry state as the primary check.
test("(b) meta_state_log_change rejects operation_envelope with unknown kind; registry state unchanged", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const badEnvelope = {
      kind: "unknown-kind-not-in-enum",
      target: "test-target",
      pre_count: {
        total: 0,
        by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 },
        by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 },
      },
      post_count: {
        total: 0,
        by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 },
        by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 },
      },
      content_hash: "sha256:" + "0".repeat(64),
    };

    await assert.rejects(
      callTool("mastra_meta_state_log_change", {
        change_dimension: "mechanical",
        change_target: "test-target",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Phase 1 unknown-kind rejection test (min 20 chars)",
        operation_envelope: badEnvelope,
      }),
      // Accept any rejection (SyntaxError from JSON.parse, or thrown Zod error).
    );

    // Registry must be unchanged — no change-log persisted with the bad envelope.
    const entries = readRegistry(tempRoot);
    const withBadEnvelope = entries.find((e) => e.operation_envelope?.kind === "unknown-kind-not-in-enum");
    assert.equal(withBadEnvelope, undefined, "no change-log with unknown-kind envelope must persist");
  });
});

// ===========================================================================
// Phase 2 — batch integration + deny-list extension + assertWriteVisible
// ===========================================================================

// (e) meta_state_batch accepts envelope field; auto-emits an envelope-annotated
// change-log AFTER the batch lands. Registry state must include both the batch
// mutations AND the auto-emit change-log.
test("(e) meta_state_batch accepts envelope; auto-emits envelope-annotated change-log", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // Seed 2 baseline findings
    await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Phase 2 batch test finding A (min 20 chars)",
    });
    await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Phase 2 batch test finding B (min 20 chars)",
    });

    const ops = [
      { op: "delete", id: "phase2-batch-test-a" }, // sentinel; will use actual id
    ];

    // Resolve actual seeded ids
    const beforeEntries = readRegistry(tempRoot);
    const ids = beforeEntries.filter((e) => e.entry_kind === "finding").map((e) => e.id);
    ops[0] = { op: "delete", id: ids[0] };

    const result = await callTool("mastra_meta_state_batch", {
      operations: ops,
      envelope: { kind: "sweep", target: "phase2-batch-test" },
    });

    assert.equal(result.applied, 1);
    assert.equal(result.failed_at, null);

    const entries = readRegistry(tempRoot);
    const envelopeLog = entries.find(
      (e) => e.entry_kind === "change-log" && e.operation_envelope?.kind === "sweep",
    );
    assert.ok(envelopeLog, "auto-emit envelope-annotated change-log must persist");
    assert.equal(envelopeLog.operation_envelope.kind, "sweep");
    assert.equal(envelopeLog.operation_envelope.target, "phase2-batch-test");
    assert.match(envelopeLog.operation_envelope.content_hash, /^sha256:[a-f0-9]{64}$/);
    // pre_count.total includes the 2 seeded findings + any earlier artifacts
    // already in the registry (per-test tempRoot starts empty, so total = 2).
    assert.equal(envelopeLog.operation_envelope.pre_count.total, 2);
    // post_count.total = pre - 1 deleted = 1
    assert.equal(envelopeLog.operation_envelope.post_count.total, 1);
    assert.equal(envelopeLog.operation_envelope.pre_count.by_kind.finding, 2);
    assert.equal(envelopeLog.operation_envelope.post_count.by_kind.finding, 1);
  });
});

// (e2) envelope.kind === "sweep" with 0 delete ops is rejected with
// `kind_op_incompatible`. The MCP SDK wraps buildEnvelope throws as
// TOOL_EXECUTION_FAILED with the original `message` preserved.
test("(e2) envelope.kind='sweep' with 0 delete ops is rejected with kind_op_incompatible", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Phase 2 kind-compat test finding (min 20 chars)",
    });

    // Use a real id (the update op succeeds) so the batch reaches the
    // buildEnvelope kind-compat check; sweep requires at least 1 delete op.
    const result = await callTool("mastra_meta_state_batch", {
      operations: [
        { op: "update", id: report.id, description: "update that succeeds (min 20 chars)" },
      ],
      envelope: { kind: "sweep", target: "bad-sweep" },
    });

    // Mastra MCP SDK wraps buildEnvelope's throw in TOOL_EXECUTION_FAILED,
    // preserving the original `kind_op_incompatible` message. Assert on the
    // message directly; the registry-state check below is the load-bearing one.
    assert.equal(result.code, "TOOL_EXECUTION_FAILED");
    assert.match(result.message, /kind_op_incompatible/);

    // Registry state: no envelope-annotated change-log; the seeded update
    // was also rolled back (buildEnvelope throws AFTER the ops loop, so the
    // batch in-memory state is restored to the preBatchContent via withRegistryLock
    // not writing — the registry file is byte-identical to pre-batch).
    const entries = readRegistry(tempRoot);
    const envelopeLog = entries.find((e) => e.operation_envelope?.kind === "sweep");
    assert.equal(envelopeLog, undefined, "no envelope-annotated change-log must persist on kind mismatch");
    // The original finding is still present and unchanged (the ops loop ran
    // in-memory but the file was never written).
    const original = entries.find((e) => e.id === report.id);
    assert.ok(original, "original finding must still exist");
    // Description NOT updated — the batch rolled back.
    assert.equal(
      original.description,
      "Phase 2 kind-compat test finding (min 20 chars)",
      "description must not be updated when kind_compat fails",
    );
  });
});

// (e-target-injection) target with control chars or '..' is rejected with
// `target_invalid` at the Zod layer.
test("(e-target-injection) target with control chars is rejected", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    await assert.rejects(
      callTool("mastra_meta_state_batch", {
        operations: [{ op: "delete", id: "x" }],
        envelope: { kind: "sweep", target: "a\x00b" },
      }),
    );
    const entries = readRegistry(tempRoot);
    const envelopeLog = entries.find((e) => e.operation_envelope);
    assert.equal(envelopeLog, undefined, "no envelope must persist on target injection");
  });
});

test("(e-target-injection) target with '..' is rejected", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    await assert.rejects(
      callTool("mastra_meta_state_batch", {
        operations: [{ op: "delete", id: "x" }],
        envelope: { kind: "sweep", target: "../../../etc/passwd" },
      }),
    );
    const entries = readRegistry(tempRoot);
    const envelopeLog = entries.find((e) => e.operation_envelope);
    assert.equal(envelopeLog, undefined, "no envelope must persist on ..-path target");
  });
});

// (f) when the batch fails (op-level error), NO envelope-annotated change-log
// is emitted. The audit trail records the failure via gate-log, not change-log.
test("(f) batch failure rolls back; no envelope-annotated change-log emitted", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Phase 2 rollback test finding (min 20 chars)",
    });

    const result = await callTool("mastra_meta_state_batch", {
      operations: [
        {
          op: "update",
          id: "nonexistent-id-xyz",
          description: "This update must fail (min 20 chars)",
        },
      ],
      envelope: { kind: "sweep", target: "phase2-rollback" },
    });

    assert.equal(result.applied, 0);
    assert.equal(result.failed_at, 0);

    const entries = readRegistry(tempRoot);
    const envelopeLog = entries.find(
      (e) => e.operation_envelope?.target === "phase2-rollback",
    );
    assert.equal(envelopeLog, undefined, "no envelope must persist when batch fails");
  });
});

// (g) meta_state_batch.update with operation_envelope field is rejected with
// `immutable_field` (deny-list extension).
test("(g) meta_state_batch.update with operation_envelope field is rejected with immutable_field", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Phase 2 deny-list test finding (min 20 chars)",
    });

    const ids = readRegistry(tempRoot).filter((e) => e.entry_kind === "finding").map((e) => e.id);
    const targetId = ids[0];

    const result = await callTool("mastra_meta_state_batch", {
      operations: [
        {
          op: "update",
          id: targetId,
          operation_envelope: {
            kind: "migration",
            target: "forge-attempt",
            pre_count: { total: 0, by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
            post_count: { total: 0, by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
            content_hash: "sha256:" + "0".repeat(64),
          },
        },
      ],
    });

    assert.equal(result.applied, 0);
    assert.equal(result.reason, "immutable_field");
    assert.ok(
      Array.isArray(result.denied_fields) && result.denied_fields.includes("operation_envelope"),
      `denied_fields must include operation_envelope, got: ${JSON.stringify(result.denied_fields)}`,
    );

    // The target entry's operation_envelope must NOT be set
    const entries = readRegistry(tempRoot);
    const target = entries.find((e) => e.id === targetId);
    assert.equal(target.operation_envelope, undefined, "operation_envelope must not be set via patch");
  });
});

// (g-write-reject) direct write op with operation_envelope on a change-log
// entry is rejected with `immutable_field` (red-team finding 6 fix).
test("(g-write-reject) write op with operation_envelope on change-log entry is rejected", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const result = await callTool("mastra_meta_state_batch", {
      operations: [
        {
          op: "write",
          entry: {
            id: "phase2-write-reject",
            entry_kind: "change-log",
            change_dimension: "mechanical",
            change_target: "test-target",
            change_diff: { added: [], removed: [], changed: [] },
            reason: "Forge attempt via write op with envelope (min 20 chars)",
            created_at: new Date().toISOString(),
            operation_envelope: {
              kind: "migration",
              target: "forge-write",
              pre_count: { total: 0, by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
              post_count: { total: 0, by_status: { open: 0, resolved: 0, superseded: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
              content_hash: "sha256:" + "0".repeat(64),
            },
          },
        },
      ],
    });

    assert.equal(result.applied, 0);
    assert.equal(result.reason, "immutable_field");
    assert.ok(
      Array.isArray(result.denied_fields) && result.denied_fields.includes("operation_envelope"),
      `denied_fields must include operation_envelope, got: ${JSON.stringify(result.denied_fields)}`,
    );

    const entries = readRegistry(tempRoot);
    const forged = entries.find((e) => e.id === "phase2-write-reject");
    assert.equal(forged, undefined, "forged change-log must not persist");
  });
});

// (h-fresh-assertion) NEW forward-looking test asserts EXACT deepEqual of
// pre/post counts against a deterministic 22-entry migration fixture
// (red-team finding 7 fix — rejected loose-bound rewrite).
//
// File header note (red-team finding 3): the legacy
// `lifecycle-migration-finalize.test.js` already removed brittle count
// assertions per meta-state.jsonl:271. This is a NEW forward-looking
// assertion with a fixture-computed expected count, NOT a rewrite of the
// legacy file.
//
// Implementation note: `status` is in IMMUTABLE_PATCH_FIELDS for findings
// (rule/loop-design deactivation only — see Plan 260712-0109 Fix A), so the
// fixture uses `archive` ops to flip 2 findings from `open` to `archived`.
// `archive` doesn't go through the patch deny-list (it's its own branch)
// and reliably produces a `by_status.archived` delta for the post_count check.
test("(h-fresh-assertion) deterministic fixture: exact deepEqual on pre/post counts", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // Seed a deterministic 22-entry migration fixture: 20 open findings +
    // 2 change-logs (each with status "active", normalized to "open" via
    // buildEnvelope's normalizeLegacyStatus).
    const seedOps = [];
    for (let i = 0; i < 20; i++) {
      seedOps.push({
        op: "write",
        entry: {
          id: `phase2-mig-f-${i}`,
          entry_kind: "finding",
          status: "open",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: `Migration fixture finding ${i} (min 20 chars)`,
          created_at: new Date().toISOString(),
        },
      });
    }
    for (let i = 0; i < 2; i++) {
      seedOps.push({
        op: "write",
        entry: {
          id: `phase2-mig-c-${i}`,
          entry_kind: "change-log",
          change_dimension: "semantic",
          change_target: `fixture-c-${i}`,
          change_diff: { added: [], removed: [], changed: [] },
          reason: `Fixture change-log ${i} for migration test (min 20 chars)`,
          created_at: new Date().toISOString(),
        },
      });
    }

    const seedResult = await callTool("mastra_meta_state_batch", { operations: seedOps });
    assert.equal(seedResult.applied, 22, "fixture seed must apply all 22 entries");

    // Migration-kind batch: archive 2 findings (status flips from "open" to
    // "archived" via the archive branch — no patch deny-list check fires).
    const ops = [
      { op: "archive", id: "phase2-mig-f-0", reason: "fixture-archive-0" },
      { op: "archive", id: "phase2-mig-f-1", reason: "fixture-archive-1" },
    ];
    const result = await callTool("mastra_meta_state_batch", {
      operations: ops,
      envelope: { kind: "migration", target: "fixture-migration" },
    });
    assert.equal(result.applied, 2, `expected 2 applied, got ${result.applied}; reason: ${result.reason}`);
    assert.equal(result.failed_at, null);

    // Compute expected counts deterministically from the fixture.
    const entries = readRegistry(tempRoot);
    const migrationLog = entries.find(
      (e) => e.entry_kind === "change-log" && e.operation_envelope?.target === "fixture-migration",
    );
    assert.ok(migrationLog, "migration envelope-annotated change-log must persist");

    const env = migrationLog.operation_envelope;
    // Fixture pre_count (before any archive op):
    //   total=22, by_status={open:22, resolved:0, superseded:0, archived:0}
    //   by_kind={finding:20, change-log:2, rule:0, loop-design:0}
    // post_count (after 2 archives flip from open → archived):
    //   total=22, by_status={open:20, resolved:0, superseded:0, archived:2}
    //   by_kind={finding:20, change-log:2, rule:0, loop-design:0}
    const expectedPre = {
      total: 22,
      by_status: { open: 22, resolved: 0, superseded: 0, archived: 0 },
      by_kind: { finding: 20, "change-log": 2, rule: 0, "loop-design": 0 },
    };
    const expectedPost = {
      total: 22,
      by_status: { open: 20, resolved: 0, superseded: 0, archived: 2 },
      by_kind: { finding: 20, "change-log": 2, rule: 0, "loop-design": 0 },
    };
    assert.deepEqual(env.pre_count, expectedPre, "pre_count must match fixture");
    assert.deepEqual(env.post_count, expectedPost, "post_count must match fixture");
    assert.match(env.content_hash, /^sha256:[a-f0-9]{64}$/);
  });
});

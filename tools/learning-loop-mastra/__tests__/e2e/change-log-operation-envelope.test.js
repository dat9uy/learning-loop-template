/**
 * Schema + registry tests for `operation_envelope` on change-log entries.
 *
 * All calls ride the CLI (bin/loop.mjs + adaptLegacyHandler) — the single
 * record surface. Zod validation fires identically to the former MCP layer.
 * Where the MCP SDK threw a non-JSON TOOL_EXECUTION_FAILED, the CLI exits
 * non-zero with a JSON error on stderr; the registry-state check remains the
 * load-bearing assertion in both shapes.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readRegistry } from "../../core/meta-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(dirname(__dirname))));
const LOOP_BIN = join(projectRoot, "tools", "learning-loop-mastra", "bin", "loop.mjs");

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "change-log-env-cli-"));
  mkdirSync(join(root, "records", "meta", "decisions"), { recursive: true });
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(root, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) copyFileSync(join(schemasSrc, f), join(schemasDst, f));
  }
  return root;
}

/** Run a CLI tool that MUST exit 0 and parse its stdout JSON. */
function runCli(tool, args, tempRoot) {
  const proc = spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
    env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.strictEqual(proc.status, 0, `cli ${tool} must exit 0; stderr=${proc.stderr}`);
  return JSON.parse((proc.stdout ?? "").trim());
}

/** Run a CLI tool expecting a non-zero exit (validation rejection). */
function runCliReject(tool, args, tempRoot) {
  const proc = spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
    env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.notStrictEqual(proc.status, 0, `cli ${tool} must reject with non-zero exit; stdout=${proc.stdout}`);
  return proc;
}

// (a) meta_state_log_change accepts operation_envelope field; registry round-trips it.
test("(a) meta_state_log_change accepts operation_envelope field; registry round-trips it", () => {
  const tempRoot = makeRoot();
  const envelope = {
    kind: "migration",
    target: "test-target",
    pre_count: {
      total: 3,
      by_status: { open: 3, resolved: 0, accepted: 0, archived: 0 },
      by_kind: { finding: 3, "change-log": 0, rule: 0, "loop-design": 0 },
    },
    post_count: {
      total: 1,
      by_status: { open: 1, resolved: 0, accepted: 0, archived: 0 },
      by_kind: { finding: 1, "change-log": 0, rule: 0, "loop-design": 0 },
    },
    content_hash: "sha256:" + "0".repeat(64),
  };

  const result = runCli("meta_state_log_change", {
    change_dimension: "mechanical",
    change_target: "test-target",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "Phase 1 schema round-trip test: operation_envelope field must round-trip (min 20 chars)",
    operation_envelope: envelope,
  }, tempRoot);

  assert.equal(result.logged, true);
  const entry = readRegistry(tempRoot).find((e) => e.id === result.id);
  assert.ok(entry, "change-log must persist");
  assert.equal(entry.entry_kind, "change-log");
  assert.deepEqual(entry.operation_envelope, envelope, "operation_envelope must round-trip via CLI wire layer");
  assert.equal(entry.operation_envelope.kind, "migration");
  assert.equal(entry.operation_envelope.target, "test-target");
  assert.match(entry.operation_envelope.content_hash, /^sha256:[a-f0-9]{64}$/);
});

// (b) meta_state_log_change rejects operation_envelope with unknown kind.
// The CLI exits non-zero on the Zod union rejection — assert registry state
// as the primary check.
test("(b) meta_state_log_change rejects operation_envelope with unknown kind; registry state unchanged", () => {
  const tempRoot = makeRoot();
  const badEnvelope = {
    kind: "unknown-kind-not-in-enum",
    target: "test-target",
    pre_count: {
      total: 0,
      by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 },
      by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 },
    },
    post_count: {
      total: 0,
      by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 },
      by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 },
    },
    content_hash: "sha256:" + "0".repeat(64),
  };

  runCliReject("meta_state_log_change", {
    change_dimension: "mechanical",
    change_target: "test-target",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "Phase 1 unknown-kind rejection test (min 20 chars)",
    operation_envelope: badEnvelope,
  }, tempRoot);

  // Registry must be unchanged — no change-log persisted with the bad envelope.
  const entries = readRegistry(tempRoot);
  const withBadEnvelope = entries.find((e) => e.operation_envelope?.kind === "unknown-kind-not-in-enum");
  assert.equal(withBadEnvelope, undefined, "no change-log with unknown-kind envelope must persist");
});

// (e) meta_state_batch accepts envelope field; auto-emits an envelope-annotated
// change-log AFTER the batch lands. Registry state must include both the batch
// mutations AND the auto-emit change-log.
test("(e) meta_state_batch accepts envelope; auto-emits envelope-annotated change-log", () => {
  const tempRoot = makeRoot();
  // Seed 2 baseline findings
  runCli("meta_state_report", {
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Phase 2 batch test finding A (min 20 chars)",
  }, tempRoot);
  runCli("meta_state_report", {
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Phase 2 batch test finding B (min 20 chars)",
  }, tempRoot);

  // Resolve actual seeded ids
  const beforeEntries = readRegistry(tempRoot);
  const ids = beforeEntries.filter((e) => e.entry_kind === "finding").map((e) => e.id);
  const ops = [{ op: "delete", id: ids[0] }];

  const result = runCli("meta_state_batch", {
    operations: ops,
    envelope: { kind: "sweep", target: "phase2-batch-test" },
  }, tempRoot);

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
  assert.equal(envelopeLog.operation_envelope.pre_count.total, 2);
  // Hard-delete is GONE — the delete op appends an archived tombstone
  // (tombstone_kind: "delete") with the same entry_kind as the target. The
  // in-memory entries[] projection view counts the tombstone as a `finding`
  // entry; total stays at 2. The semantic delta surfaces via by_status.
  assert.equal(envelopeLog.operation_envelope.post_count.total, 2, "tombstone keeps total at 2 (hard-delete gone)");
  assert.equal(envelopeLog.operation_envelope.pre_count.by_kind.finding, 2);
  assert.equal(envelopeLog.operation_envelope.post_count.by_kind.finding, 2, "tombstone has same entry_kind as target");
  assert.equal(envelopeLog.operation_envelope.post_count.by_status.archived, 1, "tombstone flips status to archived");
});

// (e2) envelope.kind === "sweep" with 0 delete ops is rejected with
// `kind_op_incompatible`. The CLI surfaces this as exit 1 with
// {error:"InternalError", reason:"kind_op_incompatible"}.
test("(e2) envelope.kind='sweep' with 0 delete ops is rejected with kind_op_incompatible", () => {
  const tempRoot = makeRoot();
  const report = runCli("meta_state_report", {
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Phase 2 kind-compat test finding (min 20 chars)",
  }, tempRoot);

  // Use a real id (the update op succeeds) so the batch reaches the
  // buildEnvelope kind-compat check; sweep requires at least 1 delete op.
  const proc = spawnSync(
    "node",
    [LOOP_BIN, "meta_state_batch", JSON.stringify({
      operations: [
        { op: "update", id: report.id, description: "update that succeeds (min 20 chars)" },
      ],
      envelope: { kind: "sweep", target: "bad-sweep" },
    })],
    {
      env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.strictEqual(proc.status, 1, `kind-op-incompatible must exit 1; stdout=${proc.stdout}`);
  const parsed = JSON.parse((proc.stderr ?? "").trim());
  assert.equal(parsed.error, "InternalError");
  assert.match(parsed.reason, /kind_op_incompatible/);

  // Registry state: no envelope-annotated change-log; the seeded update was
  // also rolled back (buildEnvelope throws AFTER the ops loop, so the batch
  // in-memory state is restored and the registry file is byte-identical).
  const entries = readRegistry(tempRoot);
  const envelopeLog = entries.find((e) => e.operation_envelope?.kind === "sweep");
  assert.equal(envelopeLog, undefined, "no envelope-annotated change-log must persist on kind mismatch");
  const original = entries.find((e) => e.id === report.id);
  assert.ok(original, "original finding must still exist");
  assert.equal(
    original.description,
    "Phase 2 kind-compat test finding (min 20 chars)",
    "description must not be updated when kind_compat fails",
  );
});

// (e-target-injection) target with control chars or '..' is rejected with
// `target_invalid` at the Zod layer.
test("(e-target-injection) target with control chars is rejected", () => {
  const tempRoot = makeRoot();
  const proc = spawnSync(
    "node",
    [LOOP_BIN, "meta_state_batch", JSON.stringify({
      operations: [{ op: "delete", id: "x" }],
      envelope: { kind: "sweep", target: "a\x00b" },
    })],
    {
      env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.notStrictEqual(proc.status, 0, "control-char target must reject");
  const entries = readRegistry(tempRoot);
  const envelopeLog = entries.find((e) => e.operation_envelope);
  assert.equal(envelopeLog, undefined, "no envelope must persist on target injection");
});

test("(e-target-injection) target with '..' is rejected", () => {
  const tempRoot = makeRoot();
  const proc = spawnSync(
    "node",
    [LOOP_BIN, "meta_state_batch", JSON.stringify({
      operations: [{ op: "delete", id: "x" }],
      envelope: { kind: "sweep", target: "../../../etc/passwd" },
    })],
    {
      env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.notStrictEqual(proc.status, 0, "..-path target must reject");
  const entries = readRegistry(tempRoot);
  const envelopeLog = entries.find((e) => e.operation_envelope);
  assert.equal(envelopeLog, undefined, "no envelope must persist on ..-path target");
});

// (f) when the batch fails (op-level error), NO envelope-annotated change-log
// is emitted. The audit trail records the failure via gate-log, not change-log.
test("(f) batch failure rolls back; no envelope-annotated change-log emitted", () => {
  const tempRoot = makeRoot();
  runCli("meta_state_report", {
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Phase 2 rollback test finding (min 20 chars)",
  }, tempRoot);

  const result = runCli("meta_state_batch", {
    operations: [
      {
        op: "update",
        id: "nonexistent-id-xyz",
        description: "This update must fail (min 20 chars)",
      },
    ],
    envelope: { kind: "sweep", target: "phase2-rollback" },
  }, tempRoot);

  assert.equal(result.applied, 0);
  assert.equal(result.failed_at, 0);

  const entries = readRegistry(tempRoot);
  const envelopeLog = entries.find(
    (e) => e.operation_envelope?.target === "phase2-rollback",
  );
  assert.equal(envelopeLog, undefined, "no envelope must persist when batch fails");
});

// (g) meta_state_batch.update with operation_envelope field is rejected with
// `immutable_field` (deny-list extension).
test("(g) meta_state_batch.update with operation_envelope field is rejected with immutable_field", () => {
  const tempRoot = makeRoot();
  runCli("meta_state_report", {
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Phase 2 deny-list test finding (min 20 chars)",
  }, tempRoot);

  const ids = readRegistry(tempRoot).filter((e) => e.entry_kind === "finding").map((e) => e.id);
  const targetId = ids[0];

  const result = runCli("meta_state_batch", {
    operations: [
      {
        op: "update",
        id: targetId,
        operation_envelope: {
          kind: "migration",
          target: "forge-attempt",
          pre_count: { total: 0, by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
          post_count: { total: 0, by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
          content_hash: "sha256:" + "0".repeat(64),
        },
      },
    ],
  }, tempRoot);

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

// (g-write-reject) direct write op with operation_envelope on a change-log
// entry is rejected with `immutable_field` (red-team finding 6 fix).
test("(g-write-reject) write op with operation_envelope on change-log entry is rejected", () => {
  const tempRoot = makeRoot();
  const result = runCli("meta_state_batch", {
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
          created_at: "2026-08-01T00:00:00.000Z",
          operation_envelope: {
            kind: "migration",
            target: "forge-write",
            pre_count: { total: 0, by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
            post_count: { total: 0, by_status: { open: 0, resolved: 0, accepted: 0, archived: 0 }, by_kind: { finding: 0, "change-log": 0, rule: 0, "loop-design": 0 } },
            content_hash: "sha256:" + "0".repeat(64),
          },
        },
      },
    ],
  }, tempRoot);

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

// (h-fresh-assertion) NEW forward-looking test asserts EXACT deepEqual of
// pre/post counts against a deterministic 22-entry migration fixture
// (red-team finding 7 fix — rejected loose-bound rewrite).
//
// `status` is in IMMUTABLE_PATCH_FIELDS for findings (rule/loop-design
// deactivation only), so the fixture uses `archive` ops to flip 2 findings
// from `open` to `archived`.
test("(h-fresh-assertion) deterministic fixture: exact deepEqual on pre/post counts", () => {
  const tempRoot = makeRoot();
  // Seed a deterministic 22-entry migration fixture: 20 open findings +
  // 2 change-logs.
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
        created_at: "2026-08-01T00:00:00.000Z",
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
        created_at: "2026-08-01T00:00:00.000Z",
      },
    });
  }

  const seedResult = runCli("meta_state_batch", { operations: seedOps }, tempRoot);
  assert.equal(seedResult.applied, 22, "fixture seed must apply all 22 entries");

  // Migration-kind batch: archive 2 findings (status flips from "open" to
  // "archived" via the archive branch — no patch deny-list check fires).
  const ops = [
    { op: "archive", id: "phase2-mig-f-0", reason: "fixture-archive-0" },
    { op: "archive", id: "phase2-mig-f-1", reason: "fixture-archive-1" },
  ];
  const result = runCli("meta_state_batch", {
    operations: ops,
    envelope: { kind: "migration", target: "fixture-migration" },
  }, tempRoot);
  assert.equal(result.applied, 2, `expected 2 applied, got ${result.applied}; reason: ${result.reason}`);
  assert.equal(result.failed_at, null);

  // Compute expected counts deterministically from the fixture.
  const entries = readRegistry(tempRoot);
  const migrationLog = entries.find(
    (e) => e.entry_kind === "change-log" && e.operation_envelope?.target === "fixture-migration",
  );
  assert.ok(migrationLog, "migration envelope-annotated change-log must persist");

  const env = migrationLog.operation_envelope;
  const expectedPre = {
    total: 22,
    by_status: { open: 22, resolved: 0, accepted: 0, archived: 0 },
    by_kind: { finding: 20, "change-log": 2, rule: 0, "loop-design": 0 },
  };
  const expectedPost = {
    total: 22,
    by_status: { open: 20, resolved: 0, accepted: 0, archived: 2 },
    by_kind: { finding: 20, "change-log": 2, rule: 0, "loop-design": 0 },
  };
  assert.deepEqual(env.pre_count, expectedPre, "pre_count must match fixture");
  assert.deepEqual(env.post_count, expectedPost, "post_count must match fixture");
  assert.match(env.content_hash, /^sha256:[a-f0-9]{64}$/);
});

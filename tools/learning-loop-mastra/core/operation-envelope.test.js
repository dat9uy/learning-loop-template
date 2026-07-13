/**
 * Plan 260712-0300 Phase 1: pure-function tests for core/operation-envelope.js.
 * Asserts the locked shape returned by buildEnvelope, the kind × op-type
 * compatibility rules, content-hash stability + sensitivity to input changes,
 * legacy-status normalization, and validateEnvelope shape-check.
 */
import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  OPERATION_ENVELOPE_KINDS,
  KIND_OP_COMPATIBILITY,
  buildEnvelope,
  validateEnvelope,
  normalizeLegacyStatus,
} from "./operation-envelope.js";

const now = "2026-07-12T03:00:00.000Z";

function fixtureFinding(id, status = "open") {
  return {
    id,
    entry_kind: "finding",
    status,
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: `Test finding ${id} (min 20 chars)`,
    created_at: now,
  };
}

function fixtureChangeLog(id) {
  return {
    id,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: `target-${id}`,
    change_diff: { added: [], removed: [], changed: [] },
    reason: "Change-log fixture for envelope tests (min 20 chars)",
    status: "active",
    created_at: now,
  };
}

// SHA-256 of "test-target:" + canonical empty op-list + empty id-sets — used
// as a stable expected hash for re-run tests where the input is fully empty.
function emptyHash(kind, target) {
  const payload = [kind, target, "[]", "", ""].join(":");
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

describe("operation_envelope OPERATION_ENVELOPE_KINDS", () => {
  test("contains exactly the 8 documented kinds", () => {
    assert.equal(OPERATION_ENVELOPE_KINDS.length, 8);
    assert.deepEqual(
      [...OPERATION_ENVELOPE_KINDS],
      [
        "migration",
        "sweep",
        "closeout",
        "consolidation",
        "backfill",
        "archive-wave",
        "escalation-batch",
        "manual-batch",
      ],
    );
  });

  test("is frozen (callers cannot mutate the canonical list)", () => {
    assert.equal(Object.isFrozen(OPERATION_ENVELOPE_KINDS), true);
  });
});

describe("buildEnvelope — shape and counts", () => {
  test("returns locked shape with correct total + by_status + by_kind on a 3-finding registry", () => {
    const preRegistry = [fixtureFinding("f-1"), fixtureFinding("f-2"), fixtureFinding("f-3")];
    const postRegistry = [fixtureFinding("f-1"), fixtureFinding("f-2")]; // f-3 deleted

    const envelope = buildEnvelope({
      kind: "manual-batch",
      target: "test-target",
      ops: [{ op: "delete", id: "f-3" }],
      preRegistry,
      postRegistry,
    });

    assert.equal(envelope.kind, "manual-batch");
    assert.equal(envelope.target, "test-target");
    assert.deepEqual(envelope.pre_count, {
      total: 3,
      by_status: { open: 3, resolved: 0, superseded: 0, archived: 0 },
      by_kind: { finding: 3, "change-log": 0, rule: 0, "loop-design": 0 },
    });
    assert.deepEqual(envelope.post_count, {
      total: 2,
      by_status: { open: 2, resolved: 0, superseded: 0, archived: 0 },
      by_kind: { finding: 2, "change-log": 0, rule: 0, "loop-design": 0 },
    });
    assert.match(envelope.content_hash, /^sha256:[a-f0-9]{64}$/);
  });

  test("by_status / by_kind contain ONLY canonical keys (no legacy drift)", () => {
    // Pre-migration registries may carry status: "active" / "reported" / "stale".
    // The envelope must collapse all of them into the `open` bucket.
    const preRegistry = [
      fixtureFinding("f-active", "active"),
      fixtureFinding("f-reported", "reported"),
      fixtureFinding("f-stale", "stale"),
      fixtureFinding("f-open", "open"),
      { ...fixtureChangeLog("c-1"), status: "active" },
    ];
    const postRegistry = preRegistry.filter((e) => e.id !== "f-stale");

    const envelope = buildEnvelope({
      kind: "manual-batch",
      target: "legacy-status-test",
      ops: [{ op: "delete", id: "f-stale" }],
      preRegistry,
      postRegistry,
    });

    // by_status keys are exactly the canonical 4 — no "active" / "reported" / "stale" leakage
    assert.deepEqual(
      Object.keys(envelope.pre_count.by_status).sort(),
      ["archived", "open", "resolved", "superseded"],
    );
    assert.equal(envelope.pre_count.by_status.open, 5, "5 entries collapsed to open (4 findings + 1 change-log)");
    assert.equal(envelope.pre_count.by_status.archived, 0);
    assert.equal(envelope.pre_count.by_status.resolved, 0);
    assert.equal(envelope.pre_count.by_status.superseded, 0);
    assert.deepEqual(
      Object.keys(envelope.pre_count.by_kind).sort(),
      ["change-log", "finding", "loop-design", "rule"],
    );
    assert.equal(envelope.pre_count.by_kind.finding, 4);
    assert.equal(envelope.pre_count.by_kind["change-log"], 1);
  });

  test("counts an empty registry snapshot as {total:0, by_status:..., by_kind:...}", () => {
    const envelope = buildEnvelope({
      kind: "manual-batch",
      target: "empty-test",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    });
    assert.equal(envelope.pre_count.total, 0);
    assert.equal(envelope.post_count.total, 0);
    assert.equal(envelope.pre_count.by_status.open, 0);
    assert.equal(envelope.pre_count.by_kind.finding, 0);
  });
});

describe("buildEnvelope — content_hash stability and sensitivity", () => {
  test("content_hash is identical for two identical inputs", () => {
    const args = {
      kind: "migration",
      target: "stable-test",
      ops: [{ op: "write", entry: { id: "w-1", entry_kind: "finding" } }],
      preRegistry: [fixtureFinding("f-1")],
      postRegistry: [fixtureFinding("f-1"), fixtureFinding("f-2")],
    };
    const a = buildEnvelope(args);
    const b = buildEnvelope(args);
    assert.equal(a.content_hash, b.content_hash);
  });

  test("content_hash differs when ops change", () => {
    const base = {
      kind: "migration",
      target: "ops-sensitivity",
      preRegistry: [fixtureFinding("f-1")],
      postRegistry: [fixtureFinding("f-1"), fixtureFinding("f-2")],
    };
    const a = buildEnvelope({ ...base, ops: [{ op: "write", entry: { id: "w-1", entry_kind: "finding" } }] });
    const b = buildEnvelope({ ...base, ops: [{ op: "write", entry: { id: "w-2", entry_kind: "finding" } }] });
    assert.notEqual(a.content_hash, b.content_hash);
  });

  test("content_hash differs when kind changes (same ops + same registry)", () => {
    // Red-team finding 6 fix: hash includes kind so a 'migration' and a
    // 'manual-batch' with otherwise-identical input produce distinct hashes.
    const args = {
      target: "kind-sensitivity",
      ops: [{ op: "write", entry: { id: "w-1", entry_kind: "finding" } }],
      preRegistry: [fixtureFinding("f-1")],
      postRegistry: [fixtureFinding("f-1"), fixtureFinding("f-2")],
    };
    const migration = buildEnvelope({ ...args, kind: "migration" });
    const manual = buildEnvelope({ ...args, kind: "manual-batch" });
    assert.notEqual(migration.content_hash, manual.content_hash);
  });

  test("content_hash differs when target changes", () => {
    const args = {
      kind: "migration",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    };
    const a = buildEnvelope({ ...args, target: "alpha" });
    const b = buildEnvelope({ ...args, target: "beta" });
    assert.notEqual(a.content_hash, b.content_hash);
  });

  test("content_hash matches a hand-computed SHA-256 of (kind + target + canonicalized ops + id-sets)", () => {
    // Hand-compute: buildEnvelope uses ["kind","target",JSON(canonicalOps),preIds.join(","),postIds.join(",")].join(":")
    const args = {
      kind: "manual-batch",
      target: "deterministic",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    };
    const envelope = buildEnvelope(args);
    const expectedPayload = ["manual-batch", "deterministic", "[]", "", ""].join(":");
    const expected = `sha256:${createHash("sha256").update(expectedPayload).digest("hex")}`;
    assert.equal(envelope.content_hash, expected);
  });

  test("op order does not affect content_hash (sorts before hashing)", () => {
    const preRegistry = [fixtureFinding("f-1"), fixtureFinding("f-2")];
    const postRegistry = [fixtureFinding("f-1"), fixtureFinding("f-2")];
    const opsForward = [
      { op: "delete", id: "f-1" },
      { op: "delete", id: "f-2" },
    ];
    const opsReverse = [...opsForward].reverse();
    const a = buildEnvelope({
      kind: "sweep",
      target: "order-test",
      ops: opsForward,
      preRegistry,
      postRegistry,
    });
    const b = buildEnvelope({
      kind: "sweep",
      target: "order-test",
      ops: opsReverse,
      preRegistry,
      postRegistry,
    });
    assert.equal(a.content_hash, b.content_hash);
  });
});

describe("buildEnvelope — kind × op-type compatibility (red-team finding 9)", () => {
  test("sweep with 0 delete ops throws kind_op_incompatible", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "sweep",
          target: "bad-sweep",
          ops: [{ op: "update", id: "f-1" }],
          preRegistry: [fixtureFinding("f-1")],
          postRegistry: [fixtureFinding("f-1")],
        }),
      (err) => err.code === "kind_op_incompatible" && err.missing.includes("delete"),
    );
  });

  test("sweep with at least 1 delete op is accepted", () => {
    const env = buildEnvelope({
      kind: "sweep",
      target: "good-sweep",
      ops: [{ op: "delete", id: "f-1" }],
      preRegistry: [fixtureFinding("f-1")],
      postRegistry: [],
    });
    assert.equal(env.kind, "sweep");
  });

  test("consolidation with 0 update ops throws kind_op_incompatible", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "consolidation",
          target: "bad-consolidation",
          ops: [{ op: "write", entry: { id: "w-1", entry_kind: "finding" } }],
          preRegistry: [],
          postRegistry: [],
        }),
      (err) => err.code === "kind_op_incompatible" && err.missing.includes("update"),
    );
  });

  test("backfill with 0 write ops throws kind_op_incompatible", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "backfill",
          target: "bad-backfill",
          ops: [{ op: "update", id: "f-1" }],
          preRegistry: [fixtureFinding("f-1")],
          postRegistry: [fixtureFinding("f-1")],
        }),
      (err) => err.code === "kind_op_incompatible" && err.missing.includes("write"),
    );
  });

  test("archive-wave with 0 archive ops throws kind_op_incompatible", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "archive-wave",
          target: "bad-archive-wave",
          ops: [{ op: "delete", id: "f-1" }],
          preRegistry: [fixtureFinding("f-1")],
          postRegistry: [],
        }),
      (err) => err.code === "kind_op_incompatible" && err.missing.includes("archive"),
    );
  });

  test("closeout with 0 update ops throws kind_op_incompatible", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "closeout",
          target: "bad-closeout",
          ops: [{ op: "delete", id: "f-1" }],
          preRegistry: [fixtureFinding("f-1")],
          postRegistry: [],
        }),
      (err) => err.code === "kind_op_incompatible" && err.missing.includes("update"),
    );
  });

  test("manual-batch accepts any ops (no required-op restriction)", () => {
    const env = buildEnvelope({
      kind: "manual-batch",
      target: "manual",
      ops: [{ op: "delete", id: "f-1" }],
      preRegistry: [fixtureFinding("f-1")],
      postRegistry: [],
    });
    assert.equal(env.kind, "manual-batch");
  });

  test("KIND_OP_COMPATIBILITY table is frozen and matches OPERATION_ENVELOPE_KINDS", () => {
    assert.equal(Object.isFrozen(KIND_OP_COMPATIBILITY), true);
    for (const kind of OPERATION_ENVELOPE_KINDS) {
      assert.ok(KIND_OP_COMPATIBILITY[kind], `KIND_OP_COMPATIBILITY missing entry for ${kind}`);
    }
  });
});

describe("buildEnvelope — input validation", () => {
  test("throws on unknown kind", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "unknown-kind",
          target: "t",
          ops: [],
          preRegistry: [],
          postRegistry: [],
        }),
      /unknown kind/,
    );
  });

  test("throws on empty target", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "manual-batch",
          target: "",
          ops: [],
          preRegistry: [],
          postRegistry: [],
        }),
      /non-empty/,
    );
  });

  test("throws on target with control chars", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "manual-batch",
          target: "a\x00b",
          ops: [],
          preRegistry: [],
          postRegistry: [],
        }),
      /control chars/,
    );
  });

  test("throws on target with '..' path segments", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "manual-batch",
          target: "../etc/passwd",
          ops: [],
          preRegistry: [],
          postRegistry: [],
        }),
      /\.\./,
    );
  });

  test("throws on target > 200 chars", () => {
    assert.throws(
      () =>
        buildEnvelope({
          kind: "manual-batch",
          target: "a".repeat(201),
          ops: [],
          preRegistry: [],
          postRegistry: [],
        }),
      /<= 200/,
    );
  });
});

describe("normalizeLegacyStatus", () => {
  test("maps active/reported/stale to open", () => {
    assert.equal(normalizeLegacyStatus("active"), "open");
    assert.equal(normalizeLegacyStatus("reported"), "open");
    assert.equal(normalizeLegacyStatus("stale"), "open");
  });
  test("returns canonical statuses unchanged", () => {
    assert.equal(normalizeLegacyStatus("open"), "open");
    assert.equal(normalizeLegacyStatus("resolved"), "resolved");
    assert.equal(normalizeLegacyStatus("superseded"), "superseded");
    assert.equal(normalizeLegacyStatus("archived"), "archived");
  });
});

describe("validateEnvelope", () => {
  test("returns {ok:true, envelope} for a valid envelope", () => {
    const env = buildEnvelope({
      kind: "manual-batch",
      target: "validate-test",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    });
    const result = validateEnvelope(env);
    assert.equal(result.ok, true);
    assert.deepEqual(result.envelope, env);
  });

  test("returns {ok:false} for missing kind", () => {
    const result = validateEnvelope({ target: "x", pre_count: { total: 0, by_status: {}, by_kind: {} }, post_count: { total: 0, by_status: {}, by_kind: {} }, content_hash: "sha256:" + "0".repeat(64) });
    assert.equal(result.ok, false);
    assert.match(result.reason, /kind/);
  });

  test("returns {ok:false} for non-canonical by_status key", () => {
    const env = buildEnvelope({
      kind: "manual-batch",
      target: "validate-bad-status",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    });
    const tampered = {
      ...env,
      pre_count: {
        ...env.pre_count,
        by_status: { open: 0, resolved: 0, superseded: 0, archived: 0, active: 0 },
      },
    };
    const result = validateEnvelope(tampered);
    assert.equal(result.ok, false);
    assert.match(result.reason, /invalid_status_key:active/);
  });

  test("returns {ok:false} for malformed content_hash", () => {
    const env = buildEnvelope({
      kind: "manual-batch",
      target: "validate-bad-hash",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    });
    const tampered = { ...env, content_hash: "not-a-hash" };
    const result = validateEnvelope(tampered);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_content_hash");
  });

  test("returns {ok:false} when target has '..'", () => {
    const env = buildEnvelope({
      kind: "manual-batch",
      target: "validate-bad-target",
      ops: [],
      preRegistry: [],
      postRegistry: [],
    });
    const tampered = { ...env, target: "../x" };
    const result = validateEnvelope(tampered);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_target_chars");
  });
});

// Tests for the one-time migration of committed `gate-verb:*` budget-state
// rows into the session-local substrate.
//
// The migration script (scripts/migrate-runtime-state-ephemeral-rows.mjs):
//   - partitions `affected_system.startsWith("gate-verb:") && kind === "budget-state"`
//     (kind-gated — a durable ledger-event under gate-verb: stays);
//   - runs under `withRegistryLock` (no concurrent append clobber);
//   - rewrites the committed file via `.tmp + renameSync` (atomic);
//   - writes a `.bak-<ts>` backup before the rewrite;
//   - is idempotent (re-run is a no-op);
//   - back-fills `durability:"ephemeral"` and bumps versions past any
//     same-id rows already in the local substrate (no same-id/same-version
//     duplicates);
//   - recomputes the fingerprint (identity — the hash covers a fixed field
//     subset that excludes `durability` and `version`).
//
// Note: the test lives under tools/learning-loop-mastra/__tests__/ (not
// scripts/__tests__/) because the vitest config discovers
// `tools/learning-loop-mastra/**/*.test.js` but NOT `scripts/__tests__/`.

import { describe, test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNTIME_STATE_FILENAME, RUNTIME_STATE_LOCAL_FILENAME, verifyRow } from "../core/runtime-state.js";
import { runtimeStateStopTool } from "../tools/handlers/runtime-state-stop-tool.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(PROJECT_ROOT, "scripts", "migrate-runtime-state-ephemeral-rows.mjs");

function makeRoot(prefix = "migrate-ephemeral-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runMigration(root) {
  return execFileSync("node", [SCRIPT], {
    cwd: root,
    env: { ...process.env, GATE_ROOT: root },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeCommitted(root, rows) {
  const path = join(root, RUNTIME_STATE_FILENAME);
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

function readJsonl(root, file) {
  if (!existsSync(join(root, file))) return [];
  return readFileSync(join(root, file), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

function gateVerbRow(affectedSystem, overrides = {}) {
  return {
    affected_system: affectedSystem,
    kind: "budget-state",
    id: affectedSystem,
    value: null,
    delta: null,
    source_ref: "local:meta-state:gate-verb-allowance",
    timestamp: "2026-08-08T04:05:12Z",
    status: "active",
    metadata: {},
    version: 0,
    ...overrides,
  };
}

let root;
beforeEach(() => {
  root = makeRoot();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("migration partitions gate-verb budget-state rows (kind-gated)", () => {
  test("migrates gate-verb:* budget-state rows to local; leaves durable + gate-verb ledger-event committed", () => {
    writeCommitted(root, [
      gateVerbRow("gate-verb:bash"),
      gateVerbRow("gate-verb:node", { timestamp: "2026-08-08T13:13:00Z" }),
      // Durable budget-state lifecycle — stays.
      { ...gateVerbRow("vnstock", { source_ref: "local:meta-state:rule-test" }), affected_system: "vnstock", id: "vnstock" },
      // Defensive: a durable ledger-event under gate-verb:* stays committed.
      { ...gateVerbRow("gate-verb:bash"), kind: "ledger-event", status: "active", id: "gate-verb:audit" },
    ]);

    const out = runMigration(root);
    assert.ok(out.includes("migrated 2"), `expected 2 rows migrated; got: ${out}`);

    const committed = readJsonl(root, RUNTIME_STATE_FILENAME);
    assert.strictEqual(committed.filter((r) => r.affected_system.startsWith("gate-verb:") && r.kind === "budget-state").length, 0,
      "committed file must have zero gate-verb budget-state rows");
    assert.strictEqual(committed.find((r) => r.affected_system === "vnstock")?.kind, "budget-state",
      "durable vnstock lifecycle stays");
    assert.strictEqual(committed.find((r) => r.id === "gate-verb:audit")?.kind, "ledger-event",
      "gate-verb ledger-event stays (kind-gated predicate)");

    const local = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME);
    assert.strictEqual(local.length, 2, "both gate-verb rows land in local");
    assert.ok(local.every((r) => r.durability === "ephemeral"), "durability back-filled");
    assert.ok(local.every((r) => verifyRow(r)), "fingerprints recomputed and verify");
  });

  test("migrated versions bump past same-id rows already in the local substrate", () => {
    writeCommitted(root, [gateVerbRow("gate-verb:node", { timestamp: "2026-08-08T13:13:00Z" })]);
    // The record tool wrote a same-id allowance to local BEFORE the migration
    // ran (the phase window between the routing shipping and the migration).
    mkdirSync(dirname(join(root, RUNTIME_STATE_LOCAL_FILENAME)), { recursive: true });
    appendFileSync(
      join(root, RUNTIME_STATE_LOCAL_FILENAME),
      JSON.stringify(gateVerbRow("gate-verb:node", { timestamp: "2026-08-08T18:34:40Z", version: 0 })) + "\n",
      "utf8",
    );

    runMigration(root);

    const local = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME).filter((r) => r.id === "gate-verb:node");
    assert.strictEqual(local.length, 2, "pre-existing + migrated row both present");
    const versions = local.map((r) => r.version).sort((a, b) => a - b);
    assert.deepStrictEqual(versions, [0, 1], "no same-id/same-version duplicate; migrated row bumps past existing");
    const migrated = local.find((r) => r.version === 1);
    assert.ok(verifyRow(migrated), "migrated row's fingerprint verifies after the version bump");
  });

  test("backup equals the pre-migration committed file", () => {
    writeCommitted(root, [gateVerbRow("gate-verb:bash"), gateVerbRow("gate-verb:node")]);
    const before = readFileSync(join(root, RUNTIME_STATE_FILENAME), "utf8");
    runMigration(root);
    const backups = readdirSync(root).filter((f) => f.startsWith("runtime-state.jsonl.bak-"));
    assert.strictEqual(backups.length, 1, "one backup written");
    assert.strictEqual(readFileSync(join(root, backups[0]), "utf8"), before, "backup matches pre-migration committed file");
  });

  test("atomic: no .tmp left after the rewrite", () => {
    writeCommitted(root, [gateVerbRow("gate-verb:bash")]);
    runMigration(root);
    assert.strictEqual(existsSync(join(root, RUNTIME_STATE_FILENAME + ".tmp")), false, "no .tmp residue");
  });

  test("idempotent: second run is a no-op (no rewrite, no second backup)", () => {
    writeCommitted(root, [gateVerbRow("gate-verb:bash")]);
    runMigration(root);
    const backupsAfterFirst = readdirSync(root).filter((f) => f.startsWith("runtime-state.jsonl.bak-")).length;
    const localAfterFirst = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME).length;
    const out = runMigration(root);
    assert.ok(out.includes("no-op"), `second run must be a no-op; got: ${out}`);
    const backupsAfterSecond = readdirSync(root).filter((f) => f.startsWith("runtime-state.jsonl.bak-")).length;
    assert.strictEqual(backupsAfterSecond, backupsAfterFirst, "no second backup");
    assert.strictEqual(readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME).length, localAfterFirst, "no duplicate local rows");
  });
});

describe("stop-tool durability derivation", () => {
  function writePreflightMarker(root, name) {
    const dir = join(root, ".claude", "coordination");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
  }

  test("runtime_state_stop on gate-verb:* surface routes the stopped closure to local substrate", async () => {
    writePreflightMarker(root, ".loop-preflight-runtime-tracking");
    // An active gate-verb allowance in local (so stop has something to retire).
    mkdirSync(dirname(join(root, RUNTIME_STATE_LOCAL_FILENAME)), { recursive: true });
    appendFileSync(join(root, RUNTIME_STATE_LOCAL_FILENAME), JSON.stringify(gateVerbRow("gate-verb:bash")) + "\n", "utf8");

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      const res = await runtimeStateStopTool.handler({ surface: "gate-verb:bash", confirm: true });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true, `stop should succeed; got: ${JSON.stringify(parsed)}`);
      assert.strictEqual(parsed.status, "stopped");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }

    const committed = readJsonl(root, RUNTIME_STATE_FILENAME);
    assert.strictEqual(committed.length, 0, "gate-verb closure must NOT land in committed");
    const local = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME);
    const stopped = local.filter((r) => r.status === "stopped" && r.affected_system === "gate-verb:bash");
    assert.strictEqual(stopped.length, 1, "stopped closure lands in local");
    assert.strictEqual(stopped[0].durability, "ephemeral");
  });

  test("runtime_state_stop on a durable surface routes the closure to committed substrate", async () => {
    writePreflightMarker(root, ".loop-preflight-runtime-tracking");
    writeCommitted(root, [{ ...gateVerbRow("vnstock", { source_ref: "local:meta-state:rule-test" }), affected_system: "vnstock", id: "vnstock" }]);

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      const res = await runtimeStateStopTool.handler({ surface: "vnstock", confirm: true });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.status, "stopped");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }

    const committed = readJsonl(root, RUNTIME_STATE_FILENAME);
    const stopped = committed.filter((r) => r.status === "stopped" && r.affected_system === "vnstock");
    assert.strictEqual(stopped.length, 1, "durable closure lands in committed");
    assert.strictEqual(stopped[0].durability, "durable");
  });

  test("runtime_state_pause on a gate-verb:* surface routes the paused closure to local substrate", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    writePreflightMarker(root, ".loop-preflight-runtime-tracking");
    mkdirSync(dirname(join(root, RUNTIME_STATE_LOCAL_FILENAME)), { recursive: true });
    appendFileSync(join(root, RUNTIME_STATE_LOCAL_FILENAME), JSON.stringify(gateVerbRow("gate-verb:bash")) + "\n", "utf8");

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      const res = await runtimeStatePauseTool.handler({ surface: "gate-verb:bash" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true, `pause should succeed; got: ${JSON.stringify(parsed)}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }

    const committed = readJsonl(root, RUNTIME_STATE_FILENAME);
    assert.strictEqual(committed.length, 0, "gate-verb pause must NOT land in committed");
    const local = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME);
    const paused = local.filter((r) => r.status === "paused" && r.affected_system === "gate-verb:bash");
    assert.strictEqual(paused.length, 1, "paused closure lands in local");
    assert.strictEqual(paused[0].durability, "ephemeral");
  });

  test("runtime_state_resume on a gate-verb:* surface routes the resumed closure to local substrate", async () => {
    const { runtimeStateResumeTool } = await import("../tools/handlers/runtime-state-resume-tool.js");
    writePreflightMarker(root, ".loop-preflight-runtime-tracking");
    // Resume only transitions from `paused` — seed a paused gate-verb row in local.
    mkdirSync(dirname(join(root, RUNTIME_STATE_LOCAL_FILENAME)), { recursive: true });
    appendFileSync(
      join(root, RUNTIME_STATE_LOCAL_FILENAME),
      JSON.stringify(gateVerbRow("gate-verb:bash", { status: "paused" })) + "\n",
      "utf8",
    );

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      const res = await runtimeStateResumeTool.handler({ surface: "gate-verb:bash" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true, `resume should succeed; got: ${JSON.stringify(parsed)}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }

    const committed = readJsonl(root, RUNTIME_STATE_FILENAME);
    assert.strictEqual(committed.length, 0, "gate-verb resume must NOT land in committed");
    const local = readJsonl(root, RUNTIME_STATE_LOCAL_FILENAME);
    const resumed = local.filter((r) => r.status === "active" && r.affected_system === "gate-verb:bash");
    assert.strictEqual(resumed.length, 1, "resumed closure lands in local");
    assert.strictEqual(resumed[0].durability, "ephemeral");
  });
});

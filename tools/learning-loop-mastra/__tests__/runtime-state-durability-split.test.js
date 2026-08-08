// Tests for the runtime-state durability split.
//
// The L1 durability axis distinguishes durable rows (ledger logs + the
// budget-tracking lifecycle) from ephemeral TTL'd allowance rows
// (`gate-verb:*`). The mechanism realizes the contract:
//
//   - `runtime_state_record` accepts optional `durability` (default durable);
//     `appendLedgerEvent` routes ephemeral → `.loop/runtime-state-local.jsonl`,
//     durable → `runtime-state.jsonl`.
//   - The write-path version scan is DESTINATION-scoped (reads only the
//     destination file, not the merged union).
//   - The read path (`readRuntimeStateRows` / `readRuntimeObservations`)
//     merges both substrates; a fresh clone with no local file loses only
//     the session-scoped allowances (correct, by contract).
//   - A symmetric namespace↔durability guard at the record-tool boundary
//     rejects `gate-verb:*` ⟺ non-ephemeral and non-`gate-verb` ⟺ ephemeral.
//   - A malformed line in the local file does NOT poison durable writes;
//     a malformed line in the committed file DOES.
//   - The gate-verb block-message incantation emits `durability:"ephemeral"`
//     so a copied allowance records to the local substrate.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendLedgerEvent,
  readRuntimeStateRows,
  readRuntimeStateRowsForFile,
  RUNTIME_STATE_FILENAME,
  RUNTIME_STATE_LOCAL_FILENAME,
} from "../core/runtime-state.js";
import { runtimeStateRecordTool } from "../tools/handlers/runtime-state-record-tool.js";
import { readRuntimeObservations } from "../core/file-readers.js";
import { evaluateBashGate } from "../core/evaluate-bash-gate.js";

const LOCAL_PATH = join(".loop", RUNTIME_STATE_LOCAL_FILENAME.split("/").pop());

function makeRoot(prefix = "durability-split-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createPreflightMarker(root, name = ".loop-preflight-runtime-state") {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(
    join(markerDir, name),
    JSON.stringify({ completed_at: new Date().toISOString() }),
    "utf8",
  );
}

async function recordWith(root, args) {
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    const res = await runtimeStateRecordTool.handler(args);
    return JSON.parse(res.content[0].text);
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
}

const GATE_VERB_NODE_ROW = {
  affected_system: "gate-verb:node",
  kind: "budget-state",
  id: "gate-verb:node",
  source_ref: "local:meta-state:gate-verb-allowance",
  timestamp: "2026-08-09T00:00:00Z",
};

describe("runtime_state_record durability routing", () => {
  test("gate-verb:node ephemeral row → local substrate, never committed", async () => {
    const root = makeRoot();
    createPreflightMarker(root);
    const parsed = await recordWith(root, { ...GATE_VERB_NODE_ROW, durability: "ephemeral" });
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(
      existsSync(join(root, RUNTIME_STATE_FILENAME)),
      false,
      "committed file must not exist after an ephemeral-only record",
    );
    const localRows = readRuntimeStateRowsForFile(root, RUNTIME_STATE_LOCAL_FILENAME).rows;
    assert.strictEqual(localRows.length, 1);
    assert.strictEqual(localRows[0].affected_system, "gate-verb:node");
    assert.strictEqual(localRows[0].durability, "ephemeral");
  });

  test("vnstock record without durability → committed substrate (back-compat)", async () => {
    const root = makeRoot();
    createPreflightMarker(root);
    const parsed = await recordWith(root, {
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "vnstock-1",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
    });
    assert.strictEqual(parsed.ok, true);
    const committedRows = readRuntimeStateRowsForFile(root, RUNTIME_STATE_FILENAME).rows;
    assert.strictEqual(committedRows.length, 1);
    assert.strictEqual(committedRows[0].affected_system, "vnstock");
    assert.strictEqual(
      existsSync(join(root, LOCAL_PATH)),
      false,
      "a durable record must not create the local substrate",
    );
  });
});

describe("symmetric namespace↔durability guard", () => {
  test("gate-verb:* with durability durable → rejected durability_namespace_mismatch", async () => {
    const root = makeRoot();
    createPreflightMarker(root);
    const parsed = await recordWith(root, { ...GATE_VERB_NODE_ROW, durability: "durable" });
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.reason, "durability_namespace_mismatch");
    assert.strictEqual(
      existsSync(join(root, RUNTIME_STATE_FILENAME)),
      false,
      "rejected durable gate-verb row must not be written",
    );
  });

  test("non-gate-verb with durability ephemeral → rejected durability_namespace_mismatch", async () => {
    const root = makeRoot();
    createPreflightMarker(root);
    const parsed = await recordWith(root, {
      affected_system: "vnstock",
      kind: "budget-state",
      id: "vnstock",
      durability: "ephemeral",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
    });
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.reason, "durability_namespace_mismatch");
    assert.strictEqual(
      existsSync(join(root, LOCAL_PATH)),
      false,
      "rejected ephemeral vnstock row must not be written",
    );
  });
});

describe("destination-scoped version scan", () => {
  test("durable and ephemeral ids version independently per substrate", async () => {
    const root = makeRoot();
    await appendLedgerEvent(root, {
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "x",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
      status: "active",
      durability: "durable",
    });
    await appendLedgerEvent(root, {
      ...GATE_VERB_NODE_ROW,
      id: "y",
      timestamp: "2026-08-09T00:00:00Z",
      status: "active",
      durability: "ephemeral",
    });
    const second = await appendLedgerEvent(root, {
      ...GATE_VERB_NODE_ROW,
      id: "y",
      timestamp: "2026-08-09T01:00:00Z",
      status: "active",
      durability: "ephemeral",
    });
    assert.strictEqual(second.version, 1, "second ephemeral row under same id must version 1 in local");

    const committed = readRuntimeStateRowsForFile(root, RUNTIME_STATE_FILENAME).rows;
    const local = readRuntimeStateRowsForFile(root, RUNTIME_STATE_LOCAL_FILENAME).rows;
    assert.strictEqual(committed.find((r) => r.id === "x").version, 0, "durable row version unaffected by local scan");
    // `.find` returns the first match (version 0); the destination-scoped
    // scan must have assigned the second ephemeral row version 1 in local.
    const localVersions = local.filter((r) => r.id === "y").map((r) => r.version);
    assert.deepStrictEqual(localVersions, [0, 1], "ephemeral rows version independently in local");
  });
});

describe("read merge (read-side only)", () => {
  test("readRuntimeObservations projects committed durable + local ephemeral from one merged view", async () => {
    const root = makeRoot();
    await appendLedgerEvent(root, {
      affected_system: "vnstock",
      kind: "budget-state",
      id: "vnstock",
      status: "active",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
      durability: "durable",
    });
    await appendLedgerEvent(root, {
      affected_system: "gate-verb:bash",
      kind: "budget-state",
      id: "gate-verb:bash",
      status: "active",
      source_ref: "local:meta-state:gate-verb-allowance",
      timestamp: "2026-08-09T00:00:00Z",
      durability: "ephemeral",
    });
    const obs = readRuntimeObservations(root);
    const surfaces = new Set(obs.map((o) => o.affected_system));
    assert.ok(surfaces.has("vnstock"), "durable lifecycle row must project");
    assert.ok(surfaces.has("gate-verb:bash"), "ephemeral allowance row must project");
  });

  test("fresh clone (no local file) → only committed rows, no throw", async () => {
    const root = makeRoot();
    await appendLedgerEvent(root, {
      affected_system: "vnstock",
      kind: "budget-state",
      id: "vnstock",
      status: "active",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
      durability: "durable",
    });
    // No .loop/runtime-state-local.jsonl exists.
    assert.strictEqual(existsSync(join(root, LOCAL_PATH)), false);
    const rows = readRuntimeStateRows(root);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].affected_system, "vnstock");
  });
});

describe("per-substrate malformed handling", () => {
  test("malformed local line does NOT block durable writes; committed malformed DOES", async () => {
    // Local malformed → vnstock record still succeeds.
    const root = makeRoot();
    createPreflightMarker(root);
    mkdirSync(join(root, ".loop"), { recursive: true });
    writeFileSync(join(root, LOCAL_PATH), "not-json\n", "utf8");
    const okParsed = await recordWith(root, {
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "vnstock-ok",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
    });
    assert.strictEqual(okParsed.ok, true, "durable write must not fail on a malformed local line");

    // Committed malformed → vnstock record fails closed (corrupt_state).
    const root2 = makeRoot();
    createPreflightMarker(root2);
    writeFileSync(join(root2, RUNTIME_STATE_FILENAME), "not-json\n", "utf8");
    const badParsed = await recordWith(root2, {
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "vnstock-bad",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-08-09T00:00:00Z",
    });
    assert.strictEqual(badParsed.ok, false);
    assert.strictEqual(badParsed.error, "corrupt_state");
  });
});

describe("record-tool zod schema", () => {
  test("durability enum accepts durable/ephemeral, rejects unknown; absent validates", () => {
    const schema = runtimeStateRecordTool.schema.durability;
    assert.strictEqual(schema.safeParse("ephemeral").success, true);
    assert.strictEqual(schema.safeParse("durable").success, true);
    assert.strictEqual(schema.safeParse("bogus").success, false);
    assert.strictEqual(schema.safeParse(undefined).success, true, "optional — absent must validate");
  });
});

describe("gate-verb incantation carries durability", () => {
  test("gate-verb:bash block-message incantation includes durability:ephemeral", () => {
    const root = makeRoot();
    const result = evaluateBashGate({ command: "bash -c 'echo hi'", root });
    assert.strictEqual(result.decision, "block");
    assert.strictEqual(result.constraint_type, "gate-verb:bash");
    assert.ok(
      result.reason.includes('durability:"ephemeral"'),
      `incantation must route the allowance to the local substrate; got: ${result.reason}`,
    );
  });

  test("gate-verb:node block-message incantation substitutes the matched verb with durability", () => {
    const root = makeRoot();
    const result = evaluateBashGate({ command: 'node -e "1"', root });
    assert.strictEqual(result.decision, "block");
    assert.strictEqual(result.constraint_type, "gate-verb:node");
    assert.ok(result.reason.includes('affected_system:"gate-verb:node"'));
    assert.ok(result.reason.includes('durability:"ephemeral"'));
  });
});

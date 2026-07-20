// Plan 260720-1112 Phase 1: RED→GREEN regression for the B-widening onto
// `readRuntimeStateRows` (core/runtime-state.js:27-38).
//
// Before consolidation, `readRuntimeObservations` (core/file-readers.js:41-122)
// had its own per-line `JSON.parse` (try/catch continue) inside an outer try/catch.
// A "null" line (`JSON.parse("null") → null`) escaped the inner try and tripped
// the outer catch → return []. A malformed JSON line was skipped by the inner
// catch (so it survived the outer) but the projection only ran for successfully-
// parsed entries.
//
// After consolidation: readRuntimeObservations calls readRuntimeStateRows, which
// maps parse errors → null and `.filter(Boolean)`s them out. Null lines and
// malformed lines both survive at the parse layer; the projection sees only
// valid row objects.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuntimeObservations } from "../../core/file-readers.js";

describe("file-readers: malformed-line + null-line crash regression", () => {
  let tempRoot;

  test("setup: temp root + runtime-state.jsonl isolated", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "file-readers-malformed-"));
    process.env.GATE_ROOT = tempRoot;
  });

  test("null line + valid active vnstock row → projection survives (RED→GREEN for Phase 1 B-widening)", () => {
    const validLine = JSON.stringify({
      id: "obs-valid",
      status: "active",
      affected_system: "vnstock",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    // Null literal: JSON.parse("null") → null. Pre-consolidation, this tripped
    // the outer try/catch and wiped to [].
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), `null\n${validLine}\n`, "utf8");

    const obs = readRuntimeObservations(tempRoot);
    assert.ok(Array.isArray(obs), "must return an array");
    assert.ok(
      obs.some((o) => o.constraint_type === "vendor-api"),
      `must produce a vendor-api observation; got: ${JSON.stringify(obs.map((o) => o.constraint_type))}`
    );
  });

  test("malformed JSON line + valid active vnstock row → projection survives (skip-not-wipe)", () => {
    const validLine = JSON.stringify({
      id: "obs-valid",
      status: "active",
      affected_system: "vnstock",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    writeFileSync(
      join(tempRoot, "runtime-state.jsonl"),
      `{ this is not valid JSON\n${validLine}\n`,
      "utf8"
    );

    const obs = readRuntimeObservations(tempRoot);
    assert.ok(Array.isArray(obs), "must return an array");
    assert.ok(
      obs.some((o) => o.constraint_type === "vendor-api"),
      `must produce a vendor-api observation; got: ${JSON.stringify(obs.map((o) => o.constraint_type))}`
    );
  });

  test("happy path unchanged: all-valid sidecar → identical projection to pre-consolidation", () => {
    const line = JSON.stringify({
      id: "obs-happy",
      status: "active",
      affected_system: "vnstock",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), line + "\n", "utf8");

    const obs = readRuntimeObservations(tempRoot);
    assert.ok(Array.isArray(obs));
    assert.equal(obs.filter((o) => o.constraint_type === "vendor-api").length, 1);
  });

  test("teardown", () => {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });
});

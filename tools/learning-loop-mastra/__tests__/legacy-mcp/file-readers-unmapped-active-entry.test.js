// Plan 260712-0724 (Implementation 3) Phase 2 step 1 — RED→GREEN regression
// for the `core/file-readers.js#L47-48` unmapped-active-entry surface.
//
// Before: an active runtime-state.jsonl entry with `affected_system` NOT in
// `AFFECTED_SYSTEM_TO_CONSTRAINTS` was silently skipped (silent `continue`).
// Closes finding `meta-260630T2110Z`.
//
// After: `readRuntimeObservations` returns an observation with
// `constraint_type: "unmapped-active-entry"` for the unmapped entry so
// downstream consumers can flag the schema-vs-implementation drift.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuntimeObservations } from "../../core/file-readers.js";

describe("file-readers: unmapped-active-entry surface", () => {
  let tempRoot;

  test("setup: temp root + seeded runtime-state.jsonl", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "file-readers-unmapped-"));
    process.env.GATE_ROOT = tempRoot;
  });

  test("active entry with mapped affected_system (vnstock) → produces mapped observation", () => {
    const line = JSON.stringify({
      id: "obs-1",
      status: "active",
      affected_system: "vnstock",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), line + "\n", "utf8");

    const obs = readRuntimeObservations(tempRoot);
    assert.ok(Array.isArray(obs), "must return an array");
    assert.ok(
      obs.some((o) => o.constraint_type === "vendor-api"),
      "must produce a vendor-api observation for the mapped affected_system"
    );
  });

  test("active entry with unmapped affected_system (runtime-state) → emits unmapped-active-entry (RED→GREEN for meta-260630T2110Z)", () => {
    const line = JSON.stringify({
      id: "obs-unmapped-1",
      status: "active",
      affected_system: "runtime-state",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), line + "\n", "utf8");

    const obs = readRuntimeObservations(tempRoot);
    assert.ok(Array.isArray(obs), "must return an array");
    assert.ok(
      obs.some((o) => o.constraint_type === "unmapped-active-entry"),
      `must emit unmapped-active-entry observation; got: ${JSON.stringify(obs.map(o => o.constraint_type))}`
    );
    const unmapped = obs.find((o) => o.constraint_type === "unmapped-active-entry");
    assert.equal(unmapped.affected_system, "runtime-state");
    assert.equal(unmapped.id, "obs-unmapped-1");
    assert.ok(unmapped.escalation_reason, "escalation_reason must be populated");
  });

  test("non-active (terminal) entry with unmapped affected_system → not surfaced", () => {
    const line = JSON.stringify({
      id: "obs-terminal",
      status: "resolved",
      affected_system: "runtime-state",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), line + "\n", "utf8");

    const obs = readRuntimeObservations(tempRoot);
    // Terminal entries are filtered out by the existing `if (entry.status !== "active") continue;`
    // before the wrapper fires; non-active entries are not surfaced.
    assert.equal(
      obs.filter((o) => o.constraint_type === "unmapped-active-entry").length,
      0,
      "terminal entries must not produce unmapped-active-entry observations"
    );
  });

  test("teardown", () => {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });
});

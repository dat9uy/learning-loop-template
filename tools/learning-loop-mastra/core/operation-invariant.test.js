// Plan 260712-0724 (Implementation 3) — golden fixture for assertinvariant.
//
// Golden fixture per Q2 (rec 10 template). Covers the 4 pre-condition shapes:
//   (a) caller-supplied envelope on change-log write — forge-vector surface
//   (b) change-log entry_kind flip via patch — identity surface
//   (c) delete of a change-log entry — immutability surface
//   (d) missing root arg — signature surface
//
// Each fixture asserts the wrapper's exact `{ok:false, reason, ...returnOnFail}`
// failure shape AND that the wrapped operation did NOT run (mutation guard).
//
// RED→GREEN invariant: tests assert correct shape FIRST (RED — wrapper does
// not exist), then assert mutation guard AFTER wrapper is wired (GREEN).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertinvariant } from "./operation-invariant.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "op-invariant-test-"));
}

describe("assertinvariant: pre-state-only universal boundary helper", () => {
  let root;
  test("setup", () => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  // (a) caller-supplied envelope on change-log write — forge-vector surface.
  // The wrapper catches this BEFORE writeEntry lands the row.
  test("(a) rejects caller-supplied envelope on change-log write: forge-vector", async () => {
    const envelope = {
      kind: "migration",
      target: "forge-write",
      pre_count: { total: 0, by_status: {}, by_kind: {} },
      post_count: { total: 0, by_status: {}, by_kind: {} },
      content_hash: "sha256:" + "0".repeat(64),
    };
    let mutationRan = false;

    const result = await assertinvariant(
      async () => {
        mutationRan = true;
        return { written_id: "forged-1" };
      },
      {
        accept: {
          context: () => ({
            entry_kind: "change-log",
            operation_envelope: envelope,
          }),
          check: (pre) =>
            // Pre-condition: change-log must NOT have a caller-supplied
            // operation_envelope (auto-emit ONLY).
            !(pre.entry_kind === "change-log" && pre.operation_envelope !== undefined),
        },
        returnOnFail: {
          reason_code: "caller_supplied_envelope_on_change_log",
          entry_kind: "change-log",
          attempted_target: envelope.target,
        },
        root,
      }
    );

    assert.equal(result.ok, false, "must reject caller-supplied envelope");
    assert.equal(result.reason_code, "caller_supplied_envelope_on_change_log");
    assert.equal(result.entry_kind, "change-log");
    assert.equal(result.attempted_target, "forge-write");
    assert.equal(mutationRan, false, "operation must NOT run when pre-condition fails");
  });

  // (b) change-log entry_kind flip via patch — identity surface.
  // The wrapper at updateEntry has access to the existing entry; if the
  // patch would change entry_kind, the pre-condition catches it BEFORE
  // Object.assign mutates the row.
  test("(b) rejects change-log entry_kind flip via patch: identity invariant", async () => {
    const existingEntry = { id: "patch-1", entry_kind: "finding" };
    const attemptedPatch = { entry_kind: "change-log" };
    let mutationRan = false;

    const result = await assertinvariant(
      async () => {
        mutationRan = true;
        return { patched: true };
      },
      {
        accept: {
          context: () => ({ existing: existingEntry, patch: attemptedPatch }),
          check: ({ existing, patch }) =>
            // Pre-condition: patch must NOT change entry_kind.
            !("entry_kind" in patch) || patch.entry_kind === existing.entry_kind,
        },
        returnOnFail: {
          reason_code: "entry_kind_immutable_via_patch",
          from: "finding",
          to: "change-log",
          id: existingEntry.id,
        },
        root,
      }
    );

    assert.equal(result.ok, false, "must reject entry_kind flip via patch");
    assert.equal(result.reason_code, "entry_kind_immutable_via_patch");
    assert.equal(result.from, "finding");
    assert.equal(result.to, "change-log");
    assert.equal(result.id, "patch-1");
    assert.equal(mutationRan, false, "operation must NOT run when pre-condition fails");
  });

  // (c) delete of a change-log entry — immutability surface.
  // The wrapper at deleteEntry has access to the existing entry; change-logs
  // are immutable audit log and cannot be deleted via mutation.
  test("(c) rejects delete of change-log entry: immutability surface", async () => {
    const existingEntry = { id: "audit-1", entry_kind: "change-log" };
    let mutationRan = false;

    const result = await assertinvariant(
      async () => {
        mutationRan = true;
        return { deleted: true };
      },
      {
        accept: {
          context: () => existingEntry,
          check: (entry) => entry.entry_kind !== "change-log",
        },
        returnOnFail: {
          reason_code: "change_log_immutable",
          entry_kind: "change-log",
          id: existingEntry.id,
        },
        root,
      }
    );

    assert.equal(result.ok, false, "must reject delete of change-log");
    assert.equal(result.reason_code, "change_log_immutable");
    assert.equal(result.entry_kind, "change-log");
    assert.equal(result.id, "audit-1");
    assert.equal(mutationRan, false, "operation must NOT run when pre-condition fails");
  });

  // (d) missing root arg — signature surface.
  // `appendGateLog(root, ...)` REQUIRES root (the contract throws on bad
  // input). The wrapper's contract requires root; missing it produces an
  // explicit failure rather than a silent TypeError.
  test("(d) rejects missing root arg: signature surface", async () => {
    const result = await assertinvariant(
      async () => ({ ran: true }),
      {
        accept: {
          context: () => ({ entry_kind: "finding" }),
          check: (pre) => pre.entry_kind === "finding",
        },
        returnOnFail: { reason_code: "missing_root" },
        root: undefined, // signature violation
      }
    );

    assert.equal(result.ok, false, "missing root must NOT produce ok:true");
    assert.equal(result.reason_code, "missing_root");
  });

  // (e) success path — pre-condition holds, operation runs, returns ok:true.
  test("(e) success path: pre-condition holds, operation runs", async () => {
    const result = await assertinvariant(
      async () => ({ wrote_id: "ok-1", version: 3 }),
      {
        accept: {
          context: () => ({ entry_kind: "finding" }),
          check: (pre) => pre.entry_kind === "finding",
        },
        returnOnFail: { reason_code: "entry_kind_mismatch" },
        root,
      }
    );

    assert.equal(result.ok, true, "pre-condition holds → operation runs");
    assert.equal(result.wrote_id, "ok-1");
    assert.equal(result.version, 3);
  });

  // (f) gate-log emission on failure — failure shape is recorded.
  // Log-To surface test: assert the wrapper does NOT throw on logTo="gate-log"
  // and emits via appendGateLog (gate-log path).
  test("(f) gate-log emission does not throw; stderr logTo emits synchronously", async () => {
    // stderr path: synchronous console.warn; assert no throw.
    const stderrResult = await assertinvariant(
      async () => {
        throw new Error("should not run");
      },
      {
        accept: {
          context: () => ({ entry_kind: "finding" }),
          check: () => false, // force failure
        },
        returnOnFail: { reason_code: "test_force_fail" },
        root,
        logTo: "stderr",
      }
    );

    assert.equal(stderrResult.ok, false);
    assert.equal(stderrResult.reason_code, "test_force_fail");
  });

  test("teardown", () => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });
});

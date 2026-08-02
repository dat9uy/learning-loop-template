import { test, describe } from "vitest";
import assert from "node:assert";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,
} from "../../core/meta-state.js";

describe("meta-state schema stale-only", () => {
  test("finding status enum is {open, resolved, accepted, archived}; legacy + superseded rejected", () => {
    // `superseded` collapsed into `resolved` + a citation; it is no longer in
    // the writeable enum. Historical on-disk `superseded` is read-tolerant
    // (JSON.parse) and treated as terminal by `constants.TERMINAL_STATUSES`,
    // but the schema enum rejects it on the write path.
    for (const status of ["open", "resolved", "accepted", "archived"]) {
      const result = metaStateFindingEntrySchema.safeParse({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Probe entry used to assert that a given status string is accepted by the schema.",
        status,
      });
      assert.strictEqual(result.success, true, `status "${status}" should be accepted`);
    }

    for (const status of ["reported", "active", "stale", "auto-resolved", "expired", "superseded"]) {
      const result = metaStateFindingEntrySchema.safeParse({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Probe entry used to assert that a legacy or retired status string is rejected by the schema.",
        status,
      });
      assert.strictEqual(result.success, false, `status "${status}" should be rejected by the writeable enum`);
    }
  });

  test("TERMINAL_STATUSES is {resolved, accepted}; legacy + superseded-from-this-set absent", () => {
    // `core/meta-state.js` TERMINAL_STATUSES is {resolved, accepted}.
    // `superseded` is NOT in this set (it collapsed to `resolved`); the
    // historical `superseded` read-tolerance lives in `core/constants.js`
    // TERMINAL_STATUSES (which keeps it for backward-compat with on-disk data).
    assert.strictEqual(TERMINAL_STATUSES.has("resolved"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("accepted"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("superseded"), false, "'superseded' collapsed to 'resolved' in this set");
    assert.strictEqual(TERMINAL_STATUSES.has("expired"), false, "'expired' is not a terminal status");
    assert.strictEqual(TERMINAL_STATUSES.has("auto-resolved"), false, "'auto-resolved' is not a terminal status");
  });

  test("'stale' is not a status (derived view, not in TERMINAL_STATUSES)", () => {
    assert.strictEqual(
      TERMINAL_STATUSES.has("stale"),
      false,
      "'stale' is a derived evidence-freshness view, not a persisted status",
    );
  });
});
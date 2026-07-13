import { test, describe } from "vitest";
import assert from "node:assert";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,
} from "../../core/meta-state.js";

describe("meta-state schema stale-only (plan 260611-1000 phase 1)", () => {
  test("finding status enum is {open, resolved, superseded}; legacy statuses rejected", () => {
    for (const status of ["open", "resolved", "superseded"]) {
      const result = metaStateFindingEntrySchema.safeParse({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Probe entry used to assert that a given status string is accepted by the schema.",
        status,
      });
      assert.strictEqual(result.success, true, `status "${status}" should be accepted`);
    }

    for (const status of ["reported", "active", "stale", "auto-resolved", "expired"]) {
      const result = metaStateFindingEntrySchema.safeParse({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Probe entry used to assert that a legacy status string is rejected by the schema.",
        status,
      });
      assert.strictEqual(result.success, false, `legacy status "${status}" should be rejected (enum collapsed in plan 260707-0812)`);
    }
  });

  test("TERMINAL_STATUSES is {resolved, superseded}; legacy statuses absent", () => {
    assert.strictEqual(TERMINAL_STATUSES.has("resolved"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("superseded"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("expired"), false, "'expired' removed in plan 260611-1000");
    assert.strictEqual(TERMINAL_STATUSES.has("auto-resolved"), false, "'auto-resolved' removed in plan 260707-0812");
  });

  test("'stale' is not a status (derived view, not in TERMINAL_STATUSES)", () => {
    assert.strictEqual(
      TERMINAL_STATUSES.has("stale"),
      false,
      "'stale' is a derived evidence-freshness view (plan 260707-0812), not a persisted status",
    );
  });
});
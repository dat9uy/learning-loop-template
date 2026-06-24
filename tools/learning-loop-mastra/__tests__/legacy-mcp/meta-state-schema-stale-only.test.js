import { test, describe } from "node:test";
import assert from "node:assert";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,
} from "../../core/legacy/meta-state.js";

describe("meta-state schema stale-only (plan 260611-1000 phase 1)", () => {
  test("status enum does not include 'expired' (was legacy TTL status, removed)", () => {
    for (const status of ["reported", "active", "resolved", "superseded", "auto-resolved", "stale"]) {
      const result = metaStateFindingEntrySchema.safeParse({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Probe entry used to assert that a given status string is accepted by the schema.",
        status,
      });
      assert.strictEqual(result.success, true, `status "${status}" should be accepted`);
    }

    const expiredResult = metaStateFindingEntrySchema.safeParse({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Probe entry used to assert that 'expired' is no longer a valid status.",
      status: "expired",
    });
    assert.strictEqual(expiredResult.success, false, "status 'expired' should be rejected by the schema");
  });

  test("TERMINAL_STATUSES does not include 'expired'", () => {
    assert.strictEqual(
      TERMINAL_STATUSES.has("expired"),
      false,
      "TERMINAL_STATUSES should not contain 'expired' (legacy status removed in plan 260611-1000)"
    );
    assert.strictEqual(TERMINAL_STATUSES.has("resolved"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("superseded"), true);
    assert.strictEqual(TERMINAL_STATUSES.has("auto-resolved"), true);
  });

  test("'stale' is non-terminal (cascade retarget relies on this)", () => {
    assert.strictEqual(
      TERMINAL_STATUSES.has("stale"),
      false,
      "'stale' must NOT be in TERMINAL_STATUSES — it is the modern non-terminal past-TTL state that cascade-resolves to 'resolved' in 1 step"
    );
  });
});

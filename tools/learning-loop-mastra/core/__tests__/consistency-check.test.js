// Tests: consistencyCheck pure function — status/audit-field drift detector.
//
// The function asserts that each entry's `status` field is consistent
// with its audit-trail fields (e.g., status=open must not carry
// resolved_at).

import { describe, test } from "vitest";
import assert from "node:assert";
import {
  consistencyCheck,
  META_STATE_CONSISTENCY_INVARIANTS,
} from "../consistency-check.js";
import { IMMUTABLE_PATCH_FIELDS } from "../meta-state.js";

// ---------------------------------------------------------------------------
// Test helpers — mirror the pattern at meta-state.test.js:18-39
// ---------------------------------------------------------------------------

function makeEntry(overrides = {}) {
  return {
    id: "meta-260601T0000Z-test-entry",
    entry_kind: "finding",
    status: "open",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C-1 through C-16: Per the researcher's Section 4.1 test plan.
// ---------------------------------------------------------------------------

describe("consistencyCheck pure function", () => {
  // C-1: Empty registry → no drift
  test("C-1: empty registry returns 0 drift", () => {
    const result = consistencyCheck([]);
    assert.deepStrictEqual(result, { drift_count: 0, drift_events: [] });
  });

  // C-2: All-clean registry (no invariant breaches)
  test("C-2: clean registry (open + no audit fields) returns 0 drift", () => {
    const entries = [
      makeEntry({ id: "meta-260601T0000Z-clean-1" }),
      makeEntry({
        id: "meta-260601T0000Z-clean-2",
        status: "resolved",
        resolved_at: "2026-06-01T00:00:00.000Z",
        resolved_by: "operator",
      }),
    ];
    const result = consistencyCheck(entries);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-3: F-1 breach — active + resolved_at
  test("C-3: F-1 breach (status=open carries resolved_at) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-open-resolved-at",
      status: "open",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.id, entry.id);
    assert.strictEqual(ev.entry_kind, "finding");
    assert.strictEqual(ev.status, "open");
    assert.strictEqual(ev.invariant_id, "F-1");
    assert.deepStrictEqual(ev.forbidden_fields, ["resolved_at", "resolved_by"]);
    assert.deepStrictEqual(ev.present_fields, ["resolved_at", "resolved_by"]);
  });

  // C-4: F-1 with `resolution` field (one of the F-1 forbidden fields)
  test("C-4: F-1 breach (status=open carries resolution field) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-open-resolution",
      status: "open",
      resolution: "operator-supplied content",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, ["resolution"]);
  });

  // C-5: F-2 breach — archived without archived_at
  test("C-5: F-2 breach (status=archived missing archived_at) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f2-archived-missing-fields",
      status: "archived",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-2");
    assert.deepStrictEqual(result.drift_events[0].missing_fields, [
      "archived_at",
      "archived_by",
      "archived_reason",
    ]);
    assert.strictEqual(result.drift_events[0].present_fields.length, 0);
  });

  // C-6: F-2 satisfied — archived + all required fields present
  test("C-6: F-2 satisfied (status=archived with archived_at/archived_by/archived_reason) emits 0 drift", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f2-archived-clean",
      status: "archived",
      archived_at: "2026-06-01T00:00:00.000Z",
      archived_by: "operator",
      archived_reason: "compaction",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-7: F-3 breach — resolved without resolved_by
  test("C-7: F-3 breach (status=resolved missing resolved_by) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f3-resolved-no-by",
      status: "resolved",
      resolved_at: "2026-06-01T00:00:00.000Z",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-3");
    assert.deepStrictEqual(result.drift_events[0].missing_fields, ["resolved_by"]);
  });

  // C-8 (removed): F-4 retired when `superseded` was collapsed into
  // `resolved` + a citation row; the F-4 invariant (which required
  // `consolidated_into` on `superseded`) is no longer needed and is
  // removed from META_STATE_CONSISTENCY_INVARIANTS.

  // C-9: F-1 breach — open + resolved_marker fields. The forbid list
  // dropped `consolidated_into` + `superseded_at` (inert-historical); the
  // test exercises a still-forbidden pair.
  test("C-9: F-1 breach (status=open carries resolved_at + resolved_by) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-open-resolved-fields",
      status: "open",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, [
      "resolved_at",
      "resolved_by",
    ]);
  });

  // C-10: F-1 breach — open + archive-marker fields
  test("C-10: F-1 breach (status=open carries archived_*) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-open-archive-fields",
      status: "open",
      archived_at: "2026-06-01T00:00:00.000Z",
      archived_by: "operator",
      archived_reason: "compaction",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, [
      "archived_at",
      "archived_by",
      "archived_reason",
    ]);
  });

  // C-10b: F-1 breach — open + accepted-marker fields. `accepted_*` are stamped
  // only by `meta_state_accept`; an open finding carrying them has a forged or
  // contradictory accept audit trail (status stayed open → no accept happened
  // through the sanctioned lifecycle tool, yet the stamps are present).
  test("C-10b: F-1 breach (status=open carries accepted_*) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-open-accepted-fields",
      status: "open",
      accepted_at: "2026-06-01T00:00:00.000Z",
      accepted_by: "operator",
      accepted_reason: "standing trade-off",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, [
      "accepted_at",
      "accepted_by",
      "accepted_reason",
    ]);
  });

  // C-11: Multiple breaches on a single entry → one event per breach
  test("C-11: single entry breaching F-1 (open + resolved_at + resolution) emits 1 event (F-1 covers both)", () => {
    // F-1 is a single invariant that forbids both resolved_at AND resolution.
    // The forbidden_fields array lists both present fields.
    const entry = makeEntry({
      id: "meta-260601T0000Z-multi-f1",
      status: "open",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      resolution: "operator narrative",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, [
      "resolved_at",
      "resolved_by",
      "resolution",
    ]);
  });

  // C-12: Deterministic sort order — by (entry_kind, id, invariant_id)
  test("C-12: drift events are sorted by (entry_kind, id, invariant_id)", () => {
    const entries = [
      makeEntry({ id: "meta-260601T0000Z-zeta", status: "open", resolved_at: "2026-06-01T00:00:00.000Z" }),
      makeEntry({ id: "meta-260601T0000Z-alpha", status: "open", resolved_at: "2026-06-01T00:00:00.000Z" }),
      // `superseded` was retired; use `resolved` instead.
      makeEntry({
        id: "meta-260601T0000Z-beta",
        status: "resolved",
      }),
    ];
    const result = consistencyCheck(entries);
    const ids = result.drift_events.map((e) => e.id);
    assert.deepStrictEqual(ids, [
      "meta-260601T0000Z-alpha",
      "meta-260601T0000Z-beta",
      "meta-260601T0000Z-zeta",
    ]);
  });

  // C-13: rule entries are skipped in v1 (deferred to v2)
  test("C-13: rule entries are skipped (v1 scope = finding + change-log only)", () => {
    const entry = {
      id: "rule-no-test-isolation",
      entry_kind: "rule",
      status: "inactive",
      // carries lots of stale fields that would breach any rule-branch invariants
      resolved_at: "2026-06-01T00:00:00.000Z",
      consolidated_into: "old-target",
    };
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-14: loop-design entries are skipped in v1
  test("C-14: loop-design entries are skipped (v1 scope = finding + change-log only)", () => {
    const entry = {
      id: "loop-design-example",
      entry_kind: "loop-design",
      status: "inactive",
      resolved_at: "2026-06-01T00:00:00.000Z",
    };
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-15: isSet semantics — null and undefined treated as missing
  test("C-15: null audit fields treated as missing (F-1 satisfied when resolved_at is null)", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-null-fields",
      status: "open",
      resolved_at: null,
      resolved_by: null,
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-16: invariant registry contract — exactly 3 invariants with stable ids
  // (F-4 was removed when `superseded` was collapsed into `resolved` + a
  // citation row; the `superseded`-keyed detector is retired).
  test("C-16: META_STATE_CONSISTENCY_INVARIANTS has exactly 3 entries with ids [F-1, F-2, F-3]", () => {
    assert.strictEqual(META_STATE_CONSISTENCY_INVARIANTS.length, 3);
    assert.deepStrictEqual(
      META_STATE_CONSISTENCY_INVARIANTS.map((inv) => inv.id),
      ["F-1", "F-2", "F-3"]
    );
  });

  // C-17: `meta_state_patch` deny-list covers the accepted_* stamps. The
  // patch handler rejects any patch key present in `IMMUTABLE_PATCH_FIELDS`
  // with `reason: "immutable_field"` (meta-state-patch-tool.js), so set
  // membership is the load-bearing assertion. Without it, a patch could forge
  // `accepted_at`/`accepted_by`/`accepted_reason` on an open finding (status
  // stays open → contradictory state) since `status` itself is already denied
  // but the audit stamps were not.
  test("C-17: IMMUTABLE_PATCH_FIELDS denies accepted_at/accepted_by/accepted_reason (meta_state_patch reject)", () => {
    assert.ok(IMMUTABLE_PATCH_FIELDS.has("accepted_at"), "accepted_at must be in IMMUTABLE_PATCH_FIELDS");
    assert.ok(IMMUTABLE_PATCH_FIELDS.has("accepted_by"), "accepted_by must be in IMMUTABLE_PATCH_FIELDS");
    assert.ok(IMMUTABLE_PATCH_FIELDS.has("accepted_reason"), "accepted_reason must be in IMMUTABLE_PATCH_FIELDS");
    const f1 = META_STATE_CONSISTENCY_INVARIANTS.find((inv) => inv.id === "F-1");
    assert.ok(f1 && f1.forbid, "F-1 invariant must exist with a forbid list");
    for (const field of ["accepted_at", "accepted_by", "accepted_reason"]) {
      assert.ok(f1.forbid.includes(field), `F-1 forbid list must include ${field}`);
    }
  });
});
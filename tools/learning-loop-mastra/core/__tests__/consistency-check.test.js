// Phase 1 tests: consistencyCheck pure function — status/audit-field drift detector.
//
// Implements the remediation from finding meta-260614T1236Z
// (no automated registry consistency check exists). The function asserts
// that each entry's `status` field is consistent with its audit-trail
// fields (e.g., status=active must not carry resolved_at).
//
// TDD: this file is created BEFORE the implementation. Tests are initially
// RED (failing — Cannot find module) and turn GREEN after the function in
// core/consistency-check.js is implemented.

import { describe, test } from "vitest";
import assert from "node:assert";
import {
  consistencyCheck,
  META_STATE_CONSISTENCY_INVARIANTS,
} from "../consistency-check.js";

// ---------------------------------------------------------------------------
// Test helpers — mirror the pattern at meta-state.test.js:18-39
// ---------------------------------------------------------------------------

function makeEntry(overrides = {}) {
  return {
    id: "meta-260601T0000Z-test-entry",
    entry_kind: "finding",
    status: "active",
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
  test("C-2: clean registry (active + no audit fields) returns 0 drift", () => {
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
  test("C-3: F-1 breach (status=active carries resolved_at) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-active-resolved-at",
      status: "active",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.id, entry.id);
    assert.strictEqual(ev.entry_kind, "finding");
    assert.strictEqual(ev.status, "active");
    assert.strictEqual(ev.invariant_id, "F-1");
    assert.deepStrictEqual(ev.forbidden_fields, ["resolved_at", "resolved_by"]);
    assert.deepStrictEqual(ev.present_fields, ["resolved_at", "resolved_by"]);
  });

  // C-4: F-1 with `resolution` field (one of the F-1 forbidden fields)
  test("C-4: F-1 breach (status=active carries resolution field) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f1-active-resolution",
      status: "active",
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

  // C-8: F-4 breach — superseded without consolidated_into
  test("C-8: F-4 breach (status=superseded missing consolidated_into) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-f4-superseded-no-target",
      status: "superseded",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "F-4");
    assert.deepStrictEqual(result.drift_events[0].missing_fields, ["consolidated_into"]);
  });

  // C-9: NEW-1 breach — reported + resolved_at/resolved_by
  test("C-9: NEW-1 breach (status=reported carries resolved_at + resolved_by) emits 1 drift event", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-new1-reported-resolved",
      status: "reported",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].invariant_id, "NEW-1");
    assert.deepStrictEqual(result.drift_events[0].forbidden_fields, [
      "resolved_at",
      "resolved_by",
    ]);
  });

  // C-10: NEW-1 clean — reported without resolved_*
  test("C-10: NEW-1 satisfied (status=reported without resolved_*) emits 0 drift", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-new1-reported-clean",
      status: "reported",
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-11: Multiple breaches on a single entry → one event per breach
  test("C-11: single entry breaching F-1 (active + resolved_at + resolution) emits 1 event (F-1 covers both)", () => {
    // F-1 is a single invariant that forbids both resolved_at AND resolution.
    // The forbidden_fields array lists both present fields.
    const entry = makeEntry({
      id: "meta-260601T0000Z-multi-f1",
      status: "active",
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
      makeEntry({ id: "meta-260601T0000Z-zeta", status: "active", resolved_at: "2026-06-01T00:00:00.000Z" }),
      makeEntry({ id: "meta-260601T0000Z-alpha", status: "active", resolved_at: "2026-06-01T00:00:00.000Z" }),
      makeEntry({
        id: "meta-260601T0000Z-beta",
        status: "superseded",
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
  test("C-15: null audit fields treated as missing (NEW-1 satisfied when resolved_at is null)", () => {
    const entry = makeEntry({
      id: "meta-260601T0000Z-new1-null-fields",
      status: "reported",
      resolved_at: null,
      resolved_by: null,
    });
    const result = consistencyCheck([entry]);
    assert.strictEqual(result.drift_count, 0);
  });

  // C-16: invariant registry contract — exactly 5 invariants with stable ids
  test("C-16: META_STATE_CONSISTENCY_INVARIANTS has exactly 5 entries with ids [F-1, F-2, F-3, F-4, NEW-1]", () => {
    assert.strictEqual(META_STATE_CONSISTENCY_INVARIANTS.length, 5);
    assert.deepStrictEqual(
      META_STATE_CONSISTENCY_INVARIANTS.map((inv) => inv.id),
      ["F-1", "F-2", "F-3", "F-4", "NEW-1"]
    );
  });
});
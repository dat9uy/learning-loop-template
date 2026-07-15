/**
 * Unit tests for the post-merge registry-ref validator's pure functions.
 *
 * Covers every `entry_kind` branch of `outboundRefsOf`, the age/status
 * predicate in `isStaleViewLike`, and the missing/stale/superseded/resolved
 * classification in `computeDanglingRefs` (including the legacy CSV-string
 * `consolidates` form shared with `core/entry/change-log.js`). The functions
 * are imported in-process so istanbul attributes coverage (the `.js`
 * extension is in the coverage include glob) — this is what drops the
 * high-CRAP findings fallow flagged on the previously-untested CLI script.
 */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  isStaleViewLike,
  outboundRefsOf,
  computeDanglingRefs,
} from "../../scripts/validate-registry-refs.js";

const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

describe("isStaleViewLike", () => {
  test("terminal statuses are not stale-view", () => {
    for (const status of ["resolved", "superseded", "archived"]) {
      assert.equal(isStaleViewLike({ status, created_at: iso(30 * DAY) }), false, status);
    }
  });
  test("non-object / missing created_at are not stale-view", () => {
    assert.equal(isStaleViewLike(null), false);
    assert.equal(isStaleViewLike(undefined), false);
    assert.equal(isStaleViewLike({ status: "open" }), false);
    assert.equal(isStaleViewLike({ status: "open", created_at: 123 }), false);
  });
  test("open entry older than 7 days is stale-view", () => {
    assert.equal(isStaleViewLike({ status: "open", created_at: iso(10 * DAY) }), true);
  });
  test("open entry younger than 7 days is not stale-view", () => {
    assert.equal(isStaleViewLike({ status: "open", created_at: iso(2 * DAY) }), false);
  });
});

describe("outboundRefsOf", () => {
  test("finding: consolidated_into + reopens + promoted_to_rule", () => {
    assert.deepEqual(
      outboundRefsOf({
        entry_kind: "finding",
        consolidated_into: "meta-cl1",
        reopens: ["meta-old1", "meta-old2"],
        promoted_to_rule: "rule-x",
      }),
      [
        { kind: "change-log", id: "meta-cl1", field: "consolidated_into" },
        { kind: "finding", id: "meta-old1", field: "reopens" },
        { kind: "finding", id: "meta-old2", field: "reopens" },
        { kind: "rule", id: "rule-x", field: "promoted_to_rule" },
      ],
    );
  });
  test("finding: defaults when entry_kind absent", () => {
    assert.deepEqual(
      outboundRefsOf({ consolidated_into: "meta-cl1" }),
      [{ kind: "change-log", id: "meta-cl1", field: "consolidated_into" }],
    );
  });
  test("change-log: supersedes + consolidates array form", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "change-log", supersedes: "meta-cl0", consolidates: ["meta-f1", "meta-f2"] }),
      [
        { kind: "change-log", id: "meta-cl0", field: "supersedes" },
        { kind: "finding", id: "meta-f1", field: "consolidates" },
        { kind: "finding", id: "meta-f2", field: "consolidates" },
      ],
    );
  });
  test("change-log: legacy CSV-string consolidates tolerated", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "change-log", consolidates: "meta-f1, meta-f2 ,, meta-f3" }),
      [
        { kind: "finding", id: "meta-f1", field: "consolidates" },
        { kind: "finding", id: "meta-f2", field: "consolidates" },
        { kind: "finding", id: "meta-f3", field: "consolidates" },
      ],
    );
  });
  test("rule: origin", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "rule", origin: "meta-f1" }),
      [{ kind: "finding", id: "meta-f1", field: "origin" }],
    );
  });
  test("loop-design: proposed_design_for (rule- and meta-) + addresses", () => {
    assert.deepEqual(
      outboundRefsOf({
        entry_kind: "loop-design",
        proposed_design_for: ["rule-x", "meta-y"],
        addresses: ["meta-f1"],
      }),
      [
        { kind: "rule", id: "rule-x", field: "proposed_design_for" },
        { kind: "meta", id: "meta-y", field: "proposed_design_for" },
        { kind: "finding", id: "meta-f1", field: "addresses" },
      ],
    );
  });
  test("unknown entry_kind yields no refs", () => {
    assert.deepEqual(outboundRefsOf({ entry_kind: "mystery", origin: "x" }), []);
  });
});

describe("computeDanglingRefs", () => {
  const entries = [
    // finding pointing at a missing change-log
    { id: "f-missing", entry_kind: "finding", consolidated_into: "cl-gone" },
    // finding pointing at a stale-view finding
    { id: "f-stale-src", entry_kind: "finding", reopens: ["f-old"] },
    { id: "f-old", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
    // change-log consolidating a resolved finding (informational)
    { id: "cl-resolved", entry_kind: "change-log", consolidates: ["f-done"] },
    { id: "f-done", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
    // change-log superseding a superseded change-log (informational)
    { id: "cl-sup", entry_kind: "change-log", supersedes: "cl-old" },
    { id: "cl-old", entry_kind: "change-log", status: "superseded", created_at: iso(2 * DAY) },
    // healthy ref: finding -> rule present and active
    { id: "f-ok", entry_kind: "finding", promoted_to_rule: "rule-ok" },
    { id: "rule-ok", entry_kind: "rule", status: "active", created_at: iso(2 * DAY) },
  ];

  test("missing target -> blocking", () => {
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "f-missing" && d.reason === "missing" && d.target_id === "cl-gone"));
  });
  test("stale-view target -> blocking", () => {
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "f-stale-src" && d.reason === "stale" && d.target_id === "f-old"));
  });
  test("resolved/superseded targets -> informational only", () => {
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.ok(informational.some((d) => d.target_id === "f-done" && d.reason === "resolved"));
    assert.ok(informational.some((d) => d.target_id === "cl-old" && d.reason === "superseded"));
    assert.equal(blocking.some((d) => d.target_id === "f-done" || d.target_id === "cl-old"), false);
  });
  test("healthy ref is neither blocking nor informational", () => {
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "rule-ok"), false);
    assert.equal(informational.some((d) => d.target_id === "rule-ok"), false);
  });
  test("empty union -> no orphans", () => {
    assert.deepEqual(computeDanglingRefs([]), { blocking: [], informational: [] });
  });
});
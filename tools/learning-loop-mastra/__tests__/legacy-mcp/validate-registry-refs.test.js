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
  test("stale-view target -> informational (downgraded; freshness signal only)", () => {
    // Plan 260715-1608 Phase 1 (red-team F3): stale-view is now informational,
    // not blocking. See also the new "stale target -> informational" test in
    // the 3-bucket classification block below for explicit coverage.
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.source_id === "f-stale-src" && d.target_id === "f-old"), false);
    assert.ok(informational.some((d) => d.source_id === "f-stale-src" && d.reason === "stale" && d.target_id === "f-old"));
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
    const out = computeDanglingRefs([]);
    assert.deepEqual(out.blocking, [], "blocking must be empty");
    assert.deepEqual(out.historical, [], "historical must be empty");
    assert.deepEqual(out.informational, [], "informational must be empty");
  });
});

describe("computeDanglingRefs — 3-bucket classification (Phase 1)", () => {
  // Plan 260715-1608 Phase 1: refine validator to 3 buckets (blocking /
  // historical / informational). Pure function; the CLI prints counts and
  // exits 1 only when blocking > 0.

  test("returns the 3-bucket shape", () => {
    const out = computeDanglingRefs([]);
    assert.ok(Array.isArray(out.blocking), "blocking must be an array");
    assert.ok(Array.isArray(out.historical), "historical must be an array");
    assert.ok(Array.isArray(out.informational), "informational must be an array");
  });

  test("missing from change-log's `consolidates` -> historical (immutable source)", () => {
    const entries = [
      { id: "cl-cl", entry_kind: "change-log", consolidates: ["meta-gone"] },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.equal(informational.length, 0);
    assert.ok(historical.some((d) => d.source_id === "cl-cl" && d.field === "consolidates" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("missing from change-log's `supersedes` -> historical (immutable source)", () => {
    const entries = [
      { id: "cl-cl", entry_kind: "change-log", supersedes: "meta-gone" },
    ];
    const { blocking, historical } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.ok(historical.some((d) => d.source_id === "cl-cl" && d.field === "supersedes" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("missing from a superseded finding's `reopens` -> historical (terminal source)", () => {
    const entries = [
      { id: "f-superseded", entry_kind: "finding", status: "superseded", created_at: iso(2 * DAY), reopens: ["meta-gone"] },
    ];
    const { blocking, historical } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.ok(historical.some((d) => d.source_id === "f-superseded" && d.field === "reopens" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("missing from an inactive RULE's `origin` -> historical (terminal source for rule)", () => {
    // Red-team F7a: rules use status:enum(["active","inactive"]); an
    // inactive rule with a dangling origin is historical, not blocking.
    const entries = [
      { id: "rule-old", entry_kind: "rule", status: "inactive", origin: "meta-gone" },
    ];
    const { blocking, historical } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.ok(historical.some((d) => d.source_id === "rule-old" && d.field === "origin" && d.reason === "missing"));
  });

  test("missing from an inactive LOOP-DESIGN's `addresses` -> historical", () => {
    const entries = [
      { id: "ld-old", entry_kind: "loop-design", status: "inactive", addresses: ["meta-gone"] },
    ];
    const { blocking, historical } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.ok(historical.some((d) => d.source_id === "ld-old" && d.field === "addresses" && d.reason === "missing"));
  });

  test("missing from ACTIVE loop-design's `addresses` -> blocking", () => {
    const entries = [
      { id: "ld-active", entry_kind: "loop-design", status: "active", addresses: ["meta-gone"] },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
    assert.ok(blocking.some((d) => d.source_id === "ld-active" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("missing from ACTIVE rule's `origin` -> blocking", () => {
    const entries = [
      { id: "rule-active", entry_kind: "rule", status: "active", origin: "meta-gone" },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "rule-active" && d.field === "origin" && d.reason === "missing"));
  });

  test("missing from OPEN finding's `consolidated_into` -> blocking (active mutable source)", () => {
    const entries = [
      { id: "f-open", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), consolidated_into: "cl-gone" },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "f-open" && d.field === "consolidated_into" && d.reason === "missing"));
  });

  test("missing from a legacy entry (no entry_kind AND no status) -> blocking", () => {
    // Red-team F7c: legacy entries with neither entry_kind nor status are
    // treated as active/open. Their missing refs block.
    const entries = [
      { id: "legacy-1", consolidated_into: "cl-gone" },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "legacy-1" && d.reason === "missing" && d.target_id === "cl-gone"));
  });

  test("stale-view target (open + >7d) -> informational (downgraded from blocking)", () => {
    // Red-team F3: stale-view is a freshness signal, not ref corruption;
    // surfaced as informational only.
    const entries = [
      { id: "f-stale-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["f-old"] },
      { id: "f-old", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "f-old"), false);
    assert.ok(informational.some((d) => d.source_id === "f-stale-src" && d.target_id === "f-old" && d.reason === "stale"));
  });

  test("resolved target -> informational (regression guard)", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["f-done"] },
      { id: "f-done", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "f-done"), false);
    assert.ok(informational.some((d) => d.reason === "resolved" && d.target_id === "f-done"));
  });

  test("superseded target -> informational (regression guard)", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), consolidated_into: "cl-old" },
      { id: "cl-old", entry_kind: "change-log", status: "superseded", created_at: iso(2 * DAY) },
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "cl-old"), false);
    assert.ok(informational.some((d) => d.reason === "superseded" && d.target_id === "cl-old"));
  });

  test("duplicate id across the union -> blocking (duplicate_id reason)", () => {
    // Red-team F8: an appended change-log line with an existing open
    // finding's id + status:superseded would overwrite the open entry via
    // last-write-wins in entryById Map. Surface the collision as blocking.
    const entries = [
      { id: "dup-id", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "dup-id", entry_kind: "change-log", status: "active", created_at: iso(2 * DAY) },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "dup-id" && d.reason === "duplicate_id"));
    // No other dangling refs: neither entry has outbound refs to other ids.
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
  });

  test("same-kind duplicate id, different version (versioned append) -> NOT blocking", () => {
    // Tier 2 Phase B: a patch/refinement appends a new versioned line with
    // the same id + same entry_kind; the read projection dedupes by
    // max-version. The validator must NOT block this — it is the intended
    // representation of a mutated entry, not corruption. Only cross-kind
    // masking blocks.
    const entries = [
      { id: "rule-va", entry_kind: "rule", status: "active", version: 0, created_at: iso(2 * DAY) },
      { id: "rule-va", entry_kind: "rule", status: "active", version: 1, created_at: iso(1 * DAY) },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.source_id === "rule-va"), false);
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
  });

  test("same-kind duplicate id, same version (merge collision) -> NOT blocking", () => {
    // A parallel-merge same-version same-kind collision is resolved by the
    // projection's created_at tie-break ("no data loss, just audit
    // ambiguity" — WARNING-only, never BLOCK).
    const entries = [
      { id: "rule-mc", entry_kind: "rule", status: "active", version: 1, created_at: iso(2 * DAY) },
      { id: "rule-mc", entry_kind: "rule", status: "active", version: 1, created_at: iso(1 * DAY) },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.source_id === "rule-mc"), false);
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
  });

  test("composite: historical + informational only -> 0 blocking", () => {
    // Mixed registry: only historical + informational orphans, no active
    // mutable missing — must yield 0 blocking (so BLOCK-mode is viable).
    const entries = [
      // historical: change-log with missing consolidates
      { id: "cl-historical", entry_kind: "change-log", consolidates: ["meta-gone"] },
      // historical: inactive rule with missing origin
      { id: "rule-inactive", entry_kind: "rule", status: "inactive", origin: "meta-gone-2" },
      // informational: stale-view target
      { id: "f-stale-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["f-stale"] },
      { id: "f-stale", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
      // informational: resolved target
      { id: "f-resolved-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), consolidated_into: "f-resolved" },
      { id: "f-resolved", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0, "must yield 0 blocking");
    assert.ok(historical.length >= 2);
    assert.ok(informational.length >= 2);
  });

  test("composite: one active missing -> 1 blocking", () => {
    const entries = [
      // historical
      { id: "cl-historical", entry_kind: "change-log", consolidates: ["meta-gone"] },
      // active missing -> blocking
      { id: "ld-active", entry_kind: "loop-design", status: "active", addresses: ["meta-active-gone"] },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0].source_id, "ld-active");
  });
});

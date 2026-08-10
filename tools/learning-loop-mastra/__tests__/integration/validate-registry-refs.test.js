/**
 * Unit tests for the post-merge registry-ref validator's pure functions.
 *
 * Covers every `entry_kind` branch of `outboundRefsOf`, the age/status
 * predicate in `isStaleViewLike`, and the missing/stale/superseded/resolved
 * classification in `computeDanglingRefs`. The functions are imported
 * in-process so istanbul attributes coverage (the `.js` extension is in the
 * coverage include glob) — this is what drops the high-CRAP findings fallow
 * flagged on the previously-untested CLI script.
 *
 * The migrated relationship edges (consolidated_into / origin / supersedes /
 * promoted_to_rule / consolidates) were de-routed from `CROSS_REFS` and now
 * live as citation rows in `citations.jsonl`. The validator unions
 * `citations.jsonl` into its entry set and `forwardRefs` emits a citation's
 * `source`/`target` as forward refs, so a dangling citation target is flagged
 * as blocking. The on-record fields stay `.optional()` on the schema
 * (inert-historical; old version lines still parse) but produce NO outbound
 * refs. Tests below cover both the inert-historical on-record fields and the
 * canonical citation edges.
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

// Citation fixture helper. Citations are the canonical carrier for the
// migrated relationship edges; `source`/`target` are the endpoints and the
// citation's own id is the audit record.
function citation({ id, source, target, rationale = "edge", status = "active" }) {
  return {
    id,
    entry_kind: "citation",
    source,
    target,
    rationale,
    recorded_at: iso(1 * DAY),
    recorded_by: "agent",
    status,
  };
}

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
  test("finding: reopens is the only forward ref (consolidated_into + promoted_to_rule are inert-historical)", () => {
    // consolidated_into and promoted_to_rule were de-routed from CROSS_REFS;
    // the canonical consolidated / promotion edges now live as citation rows.
    assert.deepEqual(
      outboundRefsOf({
        entry_kind: "finding",
        consolidated_into: "meta-cl1",
        reopens: ["meta-old1", "meta-old2"],
        promoted_to_rule: "rule-x",
      }),
      [
        { kind: "finding", id: "meta-old1", field: "reopens" },
        { kind: "finding", id: "meta-old2", field: "reopens" },
      ],
    );
  });
  test("finding: defaults when entry_kind absent — only reopens", () => {
    assert.deepEqual(
      outboundRefsOf({ reopens: ["meta-old1"] }),
      [{ kind: "finding", id: "meta-old1", field: "reopens" }],
    );
  });
  test("finding: inert-historical fields produce no refs", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "finding", consolidated_into: "meta-cl1", promoted_to_rule: "rule-x" }),
      [],
    );
  });
  test("change-log: no outbound refs (supersedes + consolidates are inert-historical)", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "change-log", supersedes: "meta-cl0", consolidates: ["meta-f1", "meta-f2"] }),
      [],
    );
  });
  test("change-log: legacy CSV-string consolidates is tolerated but inert", () => {
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "change-log", consolidates: "meta-f1, meta-f2 ,, meta-f3" }),
      [],
    );
  });
  test("rule: applies_to_resolution only (origin + supersedes are inert-historical)", () => {
    // applies_to_resolution is forwardOnly/riExempt but still emitted by
    // forwardRefs. origin and supersedes were de-routed; the canonical
    // promotion / supersession edges now live as citation rows.
    assert.deepEqual(
      outboundRefsOf({ entry_kind: "rule", origin: "meta-f1", supersedes: "rule-old", applies_to_resolution: "meta-f1" }),
      [{ kind: "finding", id: "meta-f1", field: "applies_to_resolution" }],
    );
  });
  test("citation: source + target are the two forward refs", () => {
    assert.deepEqual(
      outboundRefsOf({
        entry_kind: "citation",
        source: "meta-f1",
        target: "rule-x",
        rationale: "origin",
      }),
      [
        { kind: "finding", id: "meta-f1", field: "source" },
        { kind: "rule", id: "rule-x", field: "target" },
      ],
    );
  });
  test("loop-design: proposed_design_for (rule- and meta-) + addresses", () => {
    // meta-… prefix fallback returns `finding` (the canonical finding
    // prefix), not the legacy literal "meta". The validator delegates to
    // graph.forwardRefs, which uses kindForId: rule-x → rule (prefix);
    // meta-y → finding (canonical finding prefix).
    assert.deepEqual(
      outboundRefsOf({
        entry_kind: "loop-design",
        proposed_design_for: ["rule-x", "meta-y"],
        addresses: ["meta-f1"],
      }),
      [
        { kind: "rule", id: "rule-x", field: "proposed_design_for" },
        { kind: "finding", id: "meta-y", field: "proposed_design_for" },
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
    // citation pointing at a missing change-log (canonical consolidated edge)
    { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
    citation({ id: "cit-missing", source: "f-src", target: "cl-gone" }),
    // finding pointing at a stale-view finding (reopens — not migrated)
    { id: "f-stale-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["f-old"] },
    { id: "f-old", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
    // citation pointing at a resolved finding (informational)
    { id: "f-done", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
    citation({ id: "cit-resolved", source: "f-src", target: "f-done", rationale: "consolidated into" }),
    // citation pointing at a superseded change-log (informational)
    { id: "cl-old", entry_kind: "change-log", status: "superseded", created_at: iso(2 * DAY) },
    citation({ id: "cit-superseded", source: "f-src", target: "cl-old", rationale: "supersedes" }),
    // healthy citation: source + target both open-and-fresh
    { id: "f-fresh", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
    citation({ id: "cit-healthy", source: "f-src", target: "f-fresh", rationale: "origin" }),
  ];

  test("missing citation target -> blocking", () => {
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(
      blocking.some(
        (d) => d.source_id === "cit-missing" && d.field === "target" && d.reason === "missing" && d.target_id === "cl-gone",
      ),
    );
  });
  test("stale-view target -> informational (freshness signal only)", () => {
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.source_id === "f-stale-src" && d.target_id === "f-old"), false);
    assert.ok(informational.some((d) => d.source_id === "f-stale-src" && d.reason === "stale" && d.target_id === "f-old"));
  });
  test("resolved/superseded citation targets -> informational only", () => {
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.ok(informational.some((d) => d.source_id === "cit-resolved" && d.target_id === "f-done" && d.reason === "resolved"));
    assert.ok(informational.some((d) => d.source_id === "cit-superseded" && d.target_id === "cl-old" && d.reason === "superseded"));
    assert.equal(blocking.some((d) => d.target_id === "f-done" || d.target_id === "cl-old"), false);
  });
  test("healthy citation (open-and-fresh target) is neither blocking nor informational", () => {
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.source_id === "cit-healthy"), false);
    assert.equal(informational.some((d) => d.source_id === "cit-healthy"), false);
  });
  test("empty union -> no orphans", () => {
    const out = computeDanglingRefs([]);
    assert.deepEqual(out.blocking, [], "blocking must be empty");
    assert.deepEqual(out.historical, [], "historical must be empty");
    assert.deepEqual(out.informational, [], "informational must be empty");
  });
});

describe("computeDanglingRefs — 3-bucket classification", () => {
  test("returns the 3-bucket shape", () => {
    const out = computeDanglingRefs([]);
    assert.ok(Array.isArray(out.blocking), "blocking must be an array");
    assert.ok(Array.isArray(out.historical), "historical must be an array");
    assert.ok(Array.isArray(out.informational), "informational must be an array");
  });

  test("citation with missing target -> blocking (active source, not terminal, not change-log)", () => {
    // A citation's sourceKind is "citation"; it is neither a change-log nor a
    // terminal-status source, so a missing target is real corruption.
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      citation({ id: "cit-block", source: "f-src", target: "meta-gone" }),
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
    assert.ok(blocking.some((d) => d.source_id === "cit-block" && d.field === "target" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("citation with missing source -> blocking (symmetric endpoint)", () => {
    // The citation's source is also a forward ref; a missing source is
    // dangling corruption just like a missing target.
    const entries = [
      { id: "f-tgt", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      citation({ id: "cit-src-gone", source: "meta-gone", target: "f-tgt" }),
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "cit-src-gone" && d.field === "source" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("citation target resolved -> informational", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "f-done", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
      citation({ id: "cit-res", source: "f-src", target: "f-done", rationale: "consolidated into" }),
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "f-done"), false);
    assert.ok(informational.some((d) => d.source_id === "cit-res" && d.field === "target" && d.reason === "resolved" && d.target_id === "f-done"));
  });

  test("citation target superseded -> informational", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "cl-old", entry_kind: "change-log", status: "superseded", created_at: iso(2 * DAY) },
      citation({ id: "cit-sup", source: "f-src", target: "cl-old", rationale: "supersedes" }),
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "cl-old"), false);
    assert.ok(informational.some((d) => d.source_id === "cit-sup" && d.field === "target" && d.reason === "superseded" && d.target_id === "cl-old"));
  });

  test("citation target stale-view (open + >7d) -> informational", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "f-stale", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
      citation({ id: "cit-stale", source: "f-src", target: "f-stale" }),
    ];
    const { blocking, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.some((d) => d.target_id === "f-stale"), false);
    assert.ok(informational.some((d) => d.source_id === "cit-stale" && d.field === "target" && d.reason === "stale" && d.target_id === "f-stale"));
  });

  test("citation target open-and-fresh -> healthy (null bucket)", () => {
    const entries = [
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "f-fresh", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      citation({ id: "cit-ok", source: "f-src", target: "f-fresh" }),
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
  });

  test("missing from OPEN finding's `reopens` -> blocking (active mutable source)", () => {
    const entries = [
      { id: "f-open", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["meta-gone"] },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "f-open" && d.field === "reopens" && d.reason === "missing"));
  });

  test("missing from a superseded finding's `reopens` -> historical (terminal source)", () => {
    const entries = [
      { id: "f-superseded", entry_kind: "finding", status: "superseded", created_at: iso(2 * DAY), reopens: ["meta-gone"] },
    ];
    const { blocking, historical } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0);
    assert.ok(historical.some((d) => d.source_id === "f-superseded" && d.field === "reopens" && d.reason === "missing" && d.target_id === "meta-gone"));
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

  test("missing from a legacy entry (no entry_kind AND no status) -> blocking", () => {
    // Legacy entries with neither entry_kind nor status are treated as
    // active/open. Their missing refs block (reopens is the still-indexed
    // forward field for the default finding kind).
    const entries = [
      { id: "legacy-1", reopens: ["meta-gone"] },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "legacy-1" && d.reason === "missing" && d.target_id === "meta-gone"));
  });

  test("stale-view target (open + >7d) -> informational (downgraded from blocking)", () => {
    // stale-view is a freshness signal, not ref corruption; surfaced as
    // informational only.
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

  test("duplicate id across the union -> blocking (duplicate_id reason)", () => {
    // An appended change-log line with an existing open finding's id would
    // overwrite the open entry via last-write-wins in entryById Map. Surface
    // the collision as blocking.
    const entries = [
      { id: "dup-id", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "dup-id", entry_kind: "change-log", status: "active", created_at: iso(2 * DAY) },
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.ok(blocking.some((d) => d.source_id === "dup-id" && d.reason === "duplicate_id"));
    assert.equal(historical.length, 0);
    assert.equal(informational.length, 0);
  });

  test("same-kind duplicate id, different version (versioned append) -> NOT blocking", () => {
    // A patch/refinement appends a new versioned line with the same id +
    // same entry_kind; the read projection dedupes by max-version. The
    // validator must NOT block this — it is the intended representation of a
    // mutated entry, not corruption. Only cross-kind masking blocks.
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
      // historical: superseded finding with missing reopens
      { id: "f-sup", entry_kind: "finding", status: "superseded", created_at: iso(2 * DAY), reopens: ["meta-gone"] },
      // historical: inactive loop-design with missing addresses
      { id: "ld-inactive", entry_kind: "loop-design", status: "inactive", addresses: ["meta-gone-2"] },
      // informational: stale-view target via reopens
      { id: "f-stale-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY), reopens: ["f-stale"] },
      { id: "f-stale", entry_kind: "finding", status: "open", created_at: iso(10 * DAY) },
      // informational: resolved citation target
      { id: "f-src", entry_kind: "finding", status: "open", created_at: iso(2 * DAY) },
      { id: "f-resolved", entry_kind: "finding", status: "resolved", created_at: iso(2 * DAY) },
      citation({ id: "cit-res", source: "f-src", target: "f-resolved", rationale: "consolidated into" }),
    ];
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 0, "must yield 0 blocking");
    assert.ok(historical.length >= 2);
    assert.ok(informational.length >= 2);
  });

  test("composite: one active missing -> 1 blocking", () => {
    const entries = [
      // historical: superseded finding with missing reopens
      { id: "f-sup", entry_kind: "finding", status: "superseded", created_at: iso(2 * DAY), reopens: ["meta-gone"] },
      // active missing -> blocking
      { id: "ld-active", entry_kind: "loop-design", status: "active", addresses: ["meta-active-gone"] },
    ];
    const { blocking } = computeDanglingRefs(entries);
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0].source_id, "ld-active");
  });
});
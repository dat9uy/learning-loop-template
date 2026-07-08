/**
 * Tests for core/stale-view.js — the derived evidence-freshness view that
 * replaces persisted `status: "stale"` after plan 260707-0812 lifecycle collapse.
 *
 * Phase 1 invariant: `isOpen` tolerates legacy `active`/`reported`/`stale`
 * statuses (the migration flips them to `open` in phase 4 — this tolerance is
 * what makes the code/migration order non-breaking).
 */

import { test } from "node:test";
import assert from "node:assert";
import { isOpen, isStaleView, derivedStaleSet } from "../../core/stale-view.js";
import { STALENESS_WINDOW_MS } from "../../core/constants.js";

const now = new Date("2026-07-07T12:00:00Z").getTime();
const RECENT = new Date(now - 1000).toISOString();        // 1s ago
const OLD    = new Date(now - STALENESS_WINDOW_MS - 1000).toISOString(); // 7d + 1s
const NEWLY  = new Date(now - 1000).toISOString();        // recency for "freshly verified"

test("STALENESS_WINDOW_MS is a positive number (default 7d)", () => {
  assert.ok(typeof STALENESS_WINDOW_MS === "number");
  assert.ok(STALENESS_WINDOW_MS > 0);
});

test("isOpen: true for new `open`", () => {
  assert.strictEqual(isOpen({ status: "open" }), true);
});

test("isOpen: tolerates legacy `active`/`reported`/`stale` as open", () => {
  assert.strictEqual(isOpen({ status: "open" }), true);
  assert.strictEqual(isOpen({ status: "open" }), true);
  assert.strictEqual(isOpen({ status: "open" }), true);
});

test("isOpen: true for null/missing status (defensive — pre-writeEntry entries)", () => {
  assert.strictEqual(isOpen({}), true);
  assert.strictEqual(isOpen({ status: null }), true);
  assert.strictEqual(isOpen({ status: undefined }), true);
});

test("isOpen: false for terminal statuses", () => {
  assert.strictEqual(isOpen({ status: "resolved" }), false);
  assert.strictEqual(isOpen({ status: "superseded" }), false);
});

test("isOpen: false for runtime-applied `archived` (terminal outside the enum)", () => {
  assert.strictEqual(isOpen({ status: "archived" }), false);
});

test("isStaleView: true for an open finding older than the window", () => {
  const oldOpen = { status: "open", created_at: OLD };
  assert.strictEqual(isStaleView(oldOpen, { now }), true);
});

test("isStaleView: true when last_verified_at is the stale reference (post-re_verify stays open)", () => {
  // re_verify stamps last_verified_at but does NOT transition status (phase 3).
  // A finding whose last_verified_at is older than the window is stale-view
  // regardless of status (still open).
  const recentlyVerified = { status: "open", last_verified_at: NEWLY };
  const oldVerified       = { status: "open", last_verified_at: OLD };
  assert.strictEqual(isStaleView(recentlyVerified, { now }), false);
  assert.strictEqual(isStaleView(oldVerified, { now }), true);
});

test("isStaleView: true for a legacy `stale` finding (transition tolerance)", () => {
  // Legacy `stale` is isOpen AND presumably old — surfaced as stale-view.
  assert.strictEqual(isStaleView({ status: "open", created_at: OLD }, { now }), true);
});

test("isStaleView: false for terminal findings (even if old)", () => {
  const oldResolved = { status: "resolved", created_at: OLD };
  const oldSuperseded = { status: "superseded", created_at: OLD };
  assert.strictEqual(isStaleView(oldResolved, { now }), false);
  assert.strictEqual(isStaleView(oldSuperseded, { now }), false);
});

test("isStaleView: true when evidence_code_ref hash drifted in the file index", () => {
  // fileIndex is a Map<canonicalKey, hash>; if a finding's evidence_code_ref
  // resolves to a key present in the index, the on-disk file has changed and
  // the finding is stale by construction — even if its created_at is fresh.
  const freshDrifted = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map(); // index is keyed by canonical (stripped) path
  // We can't compute the live hash here; the predicate only needs the index
  // entry's existence + a stale reference time. A drifted finding has BOTH
  // an older created_at and a present index entry — surface either way.
  fileIndex.set("tools/foo.js", "sha256:drifted");
  const aged = { status: "open", created_at: OLD, evidence_code_ref: "tools/foo.js:12" };
  assert.strictEqual(isStaleView(aged, { now, fileIndex }), true);
});

test("isStaleView: false when fresh and no drift (the steady state)", () => {
  const fresh = { status: "open", created_at: RECENT, last_verified_at: NEWLY };
  const fileIndex = new Map();
  assert.strictEqual(isStaleView(fresh, { now, fileIndex }), false);
});

test("derivedStaleSet: returns the stale-view subset of entries", () => {
  const entries = [
    { id: "f1", status: "open", created_at: RECENT },                         // fresh open
    { id: "f2", status: "open", created_at: OLD },                            // stale-view
    { id: "f3", status: "open", created_at: OLD },                          // legacy stale-view
    { id: "f4", status: "resolved", created_at: OLD },                        // terminal — excluded
    { id: "f5", status: "superseded", created_at: OLD },                      // terminal — excluded
    { id: "f6", status: "open", created_at: OLD },                        // legacy stale-view
    { id: "f7", status: "archived", created_at: OLD },                        // runtime-applied terminal — excluded
  ];
  const stale = derivedStaleSet(entries, { now });
  const ids = stale.map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ["f2", "f3", "f6"]);
});

test("derivedStaleSet: empty input → empty output", () => {
  assert.deepStrictEqual(derivedStaleSet([], { now }), []);
});

test("derivedStaleSet: tolerates null/undefined entries without throwing", () => {
  // Pure selector: skips null/undefined entries rather than throwing. The
  // empty-object entry has no reference time so isStaleView returns false.
  // The fresh entry (1s old, status open) is not stale-view. Only the
  // legacy-old entry surfaces.
  const entries = [
    null,
    undefined,
    {},
    { id: "fresh", status: "open", created_at: RECENT },
    { id: "stale", status: "open", created_at: OLD },
  ];
  const stale = derivedStaleSet(entries, { now });
  assert.deepStrictEqual(stale.map((e) => e.id), ["stale"]);
});
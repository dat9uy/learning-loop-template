/**
 * Tests for core/stale-view.js — the derived evidence-freshness view that
 * replaces persisted `status: "stale"` after plan 260707-0812 lifecycle collapse.
 *
 * Phase 1 invariant: `isOpen` tolerates legacy `active`/`reported`/`stale`
 * statuses (the migration flips them to `open` in phase 4 — this tolerance is
 * what makes the code/migration order non-breaking).
 *
 * Plan 260716-0624 Phase 01: hash-aware `hasDrifted` matching SP2 semantics.
 * Drift = currentHash !== storedHash (with TERMINAL_HASH_REGEX chain on both
 * sides). The caller injects `codeHashes` via `computeCurrentHashes(entries, root)`
 * so `isStaleView` itself stays pure. Backward compat: missing `codeHashes`
 * → no drift signal (age-only).
 */

import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOpen, isStaleView, derivedStaleSet, computeCurrentHashes } from "../../core/stale-view.js";
import { STALENESS_WINDOW_MS } from "../../core/constants.js";

const now = new Date("2026-07-07T12:00:00Z").getTime();
const RECENT = new Date(now - 1000).toISOString();        // 1s ago
const OLD    = new Date(now - STALENESS_WINDOW_MS - 1000).toISOString(); // 7d + 1s
const NEWLY  = new Date(now - 1000).toISOString();        // recency for "freshly verified"

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "stale-view-"));
}

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

test("isStaleView: true when current bytes differ from stored hash (the bug fix)", () => {
  // Plan 260716-0624 Phase 01: drift = currentHash !== storedHash.
  // The pre-fix predicate was path-presence-only (any entry in the index
  // marked the finding stale). Post-fix: an entry is only stale-by-drift
  // when the on-disk file has actually changed since the baseline.
  const freshDrifted = {
    status: "open",
    created_at: RECENT, // fresh — age branch silent
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map([["tools/foo.js", "sha256:" + "a".repeat(64)]]);
  const codeHashes = new Map([["tools/foo.js", "sha256:" + "b".repeat(64)]]); // differs
  assert.strictEqual(isStaleView(freshDrifted, { now, fileIndex, codeHashes }), true);
});

test("isStaleView: false when current bytes equal stored hash (the fix)", () => {
  // Post-seed condition: index baseline equals current bytes (re-hashed).
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
  };
  const same = "sha256:" + "a".repeat(64);
  const fileIndex = new Map([["tools/foo.js", same]]);
  const codeHashes = new Map([["tools/foo.js", same]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: false when currentHash missing (no signal)", () => {
  // File doesn't exist or is unreadable — no current hash → no drift signal.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/missing.js:12",
  };
  const fileIndex = new Map([["tools/missing.js", "sha256:" + "a".repeat(64)]]);
  const codeHashes = new Map(); // empty — simulates missing file
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: backward compat — missing codeHashes → no drift (age-only)", () => {
  // derive-status.js calls isStaleView(entry) without opts. The drift branch
  // must short-circuit when codeHashes is undefined (age-only legacy behavior).
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map([["tools/foo.js", "sha256:" + "a".repeat(64)]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex }), false);
});

test("isStaleView: missing evidence_code_ref → never drifted", () => {
  const entry = { status: "open", created_at: RECENT };
  const fileIndex = new Map();
  const codeHashes = new Map();
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: per-record code_fingerprint fallback when index entry absent", () => {
  // Pre-sidecar entries: storedHash comes from entry.code_fingerprint.
  const baseline = "sha256:" + "a".repeat(64);
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/legacy.js:12",
    code_fingerprint: baseline,
  };
  const fileIndex = new Map(); // no index entry
  const codeHashes = new Map([["tools/legacy.js", baseline]]); // matches
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
  // and when current differs:
  const codeHashes2 = new Map([["tools/legacy.js", "sha256:" + "b".repeat(64)]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes: codeHashes2 }), true);
});

test("isStaleView: malformed per-record code_fingerprint → no signal (SP2 H-2 defense)", () => {
  // Replicate SP2's TERMINAL_HASH_REGEX chain. A malformed code_fingerprint
  // (legacy/corrupt) must NOT trigger drift — falls through to null.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/legacy.js:12",
    code_fingerprint: "sha256:not-a-valid-hash",
  };
  const fileIndex = new Map();
  const codeHashes = new Map([["tools/legacy.js", "sha256:" + "a".repeat(64)]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: malformed index entry → fall through to per-record baseline", () => {
  // Malformed index entry drops out; per-record field validates and becomes
  // the baseline. current differs from per-record → drift.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
    code_fingerprint: "sha256:" + "a".repeat(64), // valid per-record
  };
  const fileIndex = new Map([["tools/foo.js", "garbage-not-sha256"]]); // malformed
  const codeHashes = new Map([["tools/foo.js", "sha256:" + "b".repeat(64)]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), true);
});

test("isStaleView: false when fresh and no drift (the steady state)", () => {
  const fresh = { status: "open", created_at: RECENT, last_verified_at: NEWLY };
  const fileIndex = new Map();
  assert.strictEqual(isStaleView(fresh, { now, fileIndex }), false);
});

test("computeCurrentHashes: dedupes by canonical key, skips missing", () => {
  const root = makeTempRoot();
  writeFileSync(join(root, "src.js"), "// code");
  const entries = [
    { evidence_code_ref: "src.js:1" },
    { evidence_code_ref: "src.js:55" },
    { evidence_code_ref: "src.js#methodName" }, // same canonical key
    { evidence_code_ref: "nonexistent.js:1" },
  ];
  const result = computeCurrentHashes(entries, root);
  // Three entries resolve to one canonical key "src.js"; one is missing.
  assert.strictEqual(result.ok.size, 1);
  assert.match(result.ok.get("src.js"), /^sha256:[a-f0-9]{64}$/);
  // The missing file is reported as skipped (but the helper does not log
  // high-frequency "missing" — callers gate-log non-"missing" only).
  assert.strictEqual(result.skipped.length, 1);
  assert.strictEqual(result.skipped[0].canonical, "nonexistent.js");
  assert.strictEqual(result.skipped[0].reason, "missing");
});

test("computeCurrentHashes: rejects traversal/symlink escape via resolveSafePath", () => {
  // RT: M2 — verify the helper uses resolveSafePath, not isAbsolute+join.
  // Craft a finding with a traversal ref; the helper must skip (no entry)
  // rather than resolve outside the project root.
  const root = makeTempRoot();
  const entries = [
    { evidence_code_ref: "../../etc/passwd" },
    { evidence_code_ref: "/etc/shadow" },
    { evidence_code_ref: "tools/../../../etc/hosts" },
  ];
  const result = computeCurrentHashes(entries, root);
  assert.strictEqual(result.ok.size, 0);
  // All three should be reported as skipped with containment_violation reason.
  assert.strictEqual(result.skipped.length, 3);
  for (const s of result.skipped) {
    assert.ok(s.reason.startsWith("containment_violation") || s.reason.startsWith("fs_error") || s.reason === "missing",
      `unexpected reason: ${s.reason}`);
  }
});

test("computeCurrentHashes: returns empty map for non-array input", () => {
  const result = computeCurrentHashes(null, "/tmp");
  assert.deepStrictEqual([...result.ok.entries()], []);
  assert.deepStrictEqual(result.skipped, []);
});

test("computeCurrentHashes: skips entries without evidence_code_ref", () => {
  const root = makeTempRoot();
  const entries = [
    { id: "no-ref" },
    { evidence_code_ref: 42 }, // not a string
    { evidence_code_ref: null },
    { evidence_code_ref: "valid.js:1" },
  ];
  writeFileSync(join(root, "valid.js"), "//");
  const result = computeCurrentHashes(entries, root);
  assert.strictEqual(result.ok.size, 1);
  assert.ok(result.ok.has("valid.js"));
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
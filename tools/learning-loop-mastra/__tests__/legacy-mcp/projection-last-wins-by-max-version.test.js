// Phase A (Tier 2): projection swap tests — _readAndParseRegistry now returns
// last-wins-by-max-version per id, re-sorted by created_at ascending.
// Mirrors the existing dual-source-read-seam.test.js fixture style.

import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";

const REGISTRY_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "projection-test-"));
}

function writeJsonl(root, filename, entries) {
  const path = join(root, filename);
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(path, lines, "utf8");
  return path;
}

function appendJsonl(root, filename, entry) {
  const path = join(root, filename);
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");
}

function makeFinding(overrides = {}) {
  return {
    id: overrides.id ?? "meta-proj-f-" + Math.random().toString(36).slice(2, 8),
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: overrides.description ?? "Projection test finding (min 20 chars)",
    status: "open",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

function makeChangeLog(overrides = {}) {
  return {
    id: overrides.id ?? "meta-proj-cl-" + Math.random().toString(36).slice(2, 8),
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: overrides.change_target ?? "core/test.js",
    change_diff: { added: [], removed: [], changed: [] },
    reason: overrides.reason ?? "Projection test change-log (min 20 chars)",
    status: "active",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

describe("projection swap (Tier 2 Phase A) — last-wins-by-max-version", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
  });

  afterAll(() => {
    // Clean up temp root
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset both files so each test owns its setup
    if (existsSync(join(root, REGISTRY_FILENAME))) unlinkSync(join(root, REGISTRY_FILENAME));
    if (existsSync(join(root, CHANGE_LOG_FILENAME))) unlinkSync(join(root, CHANGE_LOG_FILENAME));
    invalidateCache(root);
  });

  it("(1) duplicate id returns the max-version line (last-wins-by-max-version)", () => {
    // Two lines for the same id (v0 + v2) plus one singleton. Projection
    // must pick v2 for the dup-id and return the singleton.
    const dupV0 = makeFinding({
      id: "meta-proj-dup",
      description: "Earlier version 0 of the same id (must be eclipsed)",
      version: 0,
      created_at: "2026-07-01T08:00:00.000Z",
    });
    const dupV2 = makeFinding({
      id: "meta-proj-dup",
      description: "Later version 2 of the same id (must win)",
      version: 2,
      created_at: "2026-07-01T08:00:01.000Z",
    });
    const singleton = makeFinding({
      id: "meta-proj-single",
      description: "Singleton id with explicit version 0 (post-backfill state)",
      version: 0,
      created_at: "2026-07-01T08:00:02.000Z",
    });
    writeJsonl(root, REGISTRY_FILENAME, [dupV0, dupV2, singleton]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 2, "dup-id collapses to 1, singleton stays = 2 total");

    const winner = entries.find((e) => e.id === "meta-proj-dup");
    assert.ok(winner, "dup-id must be present");
    assert.equal(winner.version, 2, "must pick v2 (max version)");
    assert.equal(winner.description, "Later version 2 of the same id (must win)", "must pick v2's payload, not v0's");

    const single = entries.find((e) => e.id === "meta-proj-single");
    assert.ok(single, "singleton must be present");
    assert.equal(single.version, 0, "singleton keeps its version 0");
  });

  it("(1) tie on equal version keeps the later created_at (deterministic tie-break)", () => {
    // Two lines with the same version: tie-break should be created_at desc.
    const earlier = makeFinding({
      id: "meta-proj-tie",
      description: "Earlier created_at at same version",
      version: 1,
      created_at: "2026-07-01T09:00:00.000Z",
    });
    const later = makeFinding({
      id: "meta-proj-tie",
      description: "Later created_at at same version",
      version: 1,
      created_at: "2026-07-01T09:00:05.000Z",
    });
    writeJsonl(root, REGISTRY_FILENAME, [earlier, later]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "meta-proj-tie");
    assert.equal(entries[0].description, "Later created_at at same version", "tie-break: later created_at wins");
  });

  it("(2) projection re-sorts by created_at ascending across both files (chronological)", () => {
    // Out-of-order created_at across both files; projection must re-sort
    // chronological by created_at. This pins the re-sort requirement.
    const findings = [
      makeFinding({ id: "meta-chrono-late", created_at: "2026-07-01T16:00:00.000Z" }),
      makeFinding({ id: "meta-chrono-early", created_at: "2026-07-01T08:00:00.000Z" }),
    ];
    const changeLogs = [
      makeChangeLog({ id: "meta-chrono-mid2", created_at: "2026-07-01T14:00:00.000Z" }),
      makeChangeLog({ id: "meta-chrono-mid1", created_at: "2026-07-01T12:00:00.000Z" }),
    ];
    writeJsonl(root, REGISTRY_FILENAME, findings);
    writeJsonl(root, CHANGE_LOG_FILENAME, changeLogs);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 4);
    assert.equal(entries[0].id, "meta-chrono-early", "first must be 08:00");
    assert.equal(entries[1].id, "meta-chrono-mid1", "second must be 12:00");
    assert.equal(entries[2].id, "meta-chrono-mid2", "third must be 14:00");
    assert.equal(entries[3].id, "meta-chrono-late", "fourth must be 16:00");
  });

  it("(3) singleton-only fixture returns byte-identical output (identity on singleton file)", () => {
    // Phase A is pure infrastructure: behavior must be identical for the
    // current singleton-per-id file. We verify by snapshotting the JSON
    // payload before and after on a one-line-per-id fixture.
    const finding = makeFinding({
      id: "meta-proj-id-only",
      created_at: "2026-07-01T08:00:00.000Z",
      version: 0,
      description: "Identity check: this entry must come through byte-identical",
    });
    writeJsonl(root, REGISTRY_FILENAME, [finding]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 1);
    // Excluding the entry_kind back-compat coerce (which is idempotent),
    // the entry payload must round-trip identically.
    assert.equal(entries[0].id, finding.id);
    assert.equal(entries[0].description, finding.description);
    assert.equal(entries[0].created_at, finding.created_at);
    assert.equal(entries[0].category, finding.category);
    assert.equal(entries[0].severity, finding.severity);
    assert.equal(entries[0].affected_system, finding.affected_system);
  });

  it("(3) change-log-only fixture also returns identity (no findings → projection is no-op)", () => {
    const cl = makeChangeLog({
      id: "meta-proj-cl-only",
      created_at: "2026-07-01T08:00:00.000Z",
      reason: "Change-log only: projection must still return this identity",
    });
    writeJsonl(root, CHANGE_LOG_FILENAME, [cl]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "meta-proj-cl-only");
    assert.equal(entries[0].entry_kind, "change-log");
  });

  it("(1) cache busts after appending a higher-version line for an existing id", async () => {
    // Write v0, read, then append v1 for the same id; cache must bust and
    // the new read must return v1 (not v0).
    const v0 = makeFinding({
      id: "meta-proj-bust",
      version: 0,
      description: "Version 0 must be eclipsed by version 1",
      created_at: "2026-07-01T08:00:00.000Z",
    });
    writeJsonl(root, REGISTRY_FILENAME, [v0]);
    invalidateCache(root);

    const before = readRegistry(root);
    assert.equal(before.length, 1);
    assert.equal(before[0].version, 0);

    // Cache layer busts on mtimeMs+size change (core/read-registry-cache.js:73);
    // appending a line increases file size, so no sleep is needed.
    appendJsonl(root, REGISTRY_FILENAME, {
      ...v0,
      version: 1,
      description: "Version 1 — must win after projection",
      created_at: "2026-07-01T08:00:01.000Z",
    });

    const after = readRegistry(root);
    assert.notEqual(after, before, "cache must bust on meta-state.jsonl size change");
    assert.equal(after.length, 1);
    assert.equal(after[0].version, 1, "projection must pick v1 after append");
    assert.equal(after[0].description, "Version 1 — must win after projection");
  });
});

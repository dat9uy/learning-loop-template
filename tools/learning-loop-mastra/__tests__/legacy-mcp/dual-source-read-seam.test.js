import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, appendFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeEntry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";
// persistRegistryAtomic is private to meta-state.js but reachable via the
// public mutation surface (writeEntry, updateEntry, archiveEntry, deleteEntry,
// metaStateBatch) — the guard test exercises it through metaStateBatch so we
// cover the integration path the guard exists to protect.
import { metaStateBatch } from "../../core/meta-state.js";
import { readColdTierCache, writeColdTierCache } from "../../core/loop-introspect-cache.js";

const REGISTRY_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "dual-source-test-"));
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
  return path;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFinding(overrides = {}) {
  return {
    id: overrides.id ?? "meta-test-finding-" + Math.random().toString(36).slice(2, 8),
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: overrides.description ?? "Test finding for dual-source read seam (min 20 chars)",
    status: "open",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

function makeChangeLog(overrides = {}) {
  return {
    id: overrides.id ?? "meta-test-cl-" + Math.random().toString(36).slice(2, 8),
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: overrides.change_target ?? "core/test.js",
    change_diff: { added: [], removed: [], changed: [] },
    reason: overrides.reason ?? "Test change-log for dual-source read seam (min 20 chars)",
    status: "active",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

describe("dual-source read seam (Tier 1)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear cache between tests so prior writes from earlier tests don't leak.
    invalidateCache(root);
  });

  it("(a) readRegistry returns the union of meta-state.jsonl + change-log.jsonl", () => {
    const f1 = makeFinding({ id: "meta-union-f1" });
    const f2 = makeFinding({ id: "meta-union-f2" });
    const c1 = makeChangeLog({ id: "meta-union-c1" });
    const c2 = makeChangeLog({ id: "meta-union-c2" });
    const c3 = makeChangeLog({ id: "meta-union-c3" });
    writeJsonl(root, REGISTRY_FILENAME, [f1, f2]);
    writeJsonl(root, CHANGE_LOG_FILENAME, [c1, c2, c3]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 5, "must return union of 2 findings + 3 change-logs");
    const ids = entries.map((e) => e.id).sort();
    assert.deepEqual(
      ids,
      ["meta-union-c1", "meta-union-c2", "meta-union-c3", "meta-union-f1", "meta-union-f2"].sort(),
      "must contain all ids from both files",
    );
  });

  it("(a) readRegistry returns chronological union sorted by created_at ascending", () => {
    // Findings and change-logs interleaved by created_at must sort by time, not by source file.
    const earlier = makeFinding({ id: "meta-chrono-1", created_at: "2026-07-01T08:00:00.000Z" });
    const middle = makeChangeLog({ id: "meta-chrono-2", created_at: "2026-07-01T12:00:00.000Z" });
    const later = makeFinding({ id: "meta-chrono-3", created_at: "2026-07-01T16:00:00.000Z" });
    writeJsonl(root, REGISTRY_FILENAME, [earlier, later]);
    writeJsonl(root, CHANGE_LOG_FILENAME, [middle]);
    invalidateCache(root);

    const entries = readRegistry(root);
    assert.equal(entries.length, 3);
    // Read order must be chronological (earlier < middle < later), not grouped by source file.
    assert.equal(entries[0].id, "meta-chrono-1");
    assert.equal(entries[1].id, "meta-chrono-2");
    assert.equal(entries[2].id, "meta-chrono-3");
  });

  it("(a) readRegistry treats a missing change-log.jsonl as empty (pre-split compat)", () => {
    // Pre-split state: change-log.jsonl must NOT exist. Earlier tests may have
    // created it in this shared root; remove explicitly so we test the real
    // pre-split condition.
    if (existsSync(join(root, CHANGE_LOG_FILENAME))) {
      unlinkSync(join(root, CHANGE_LOG_FILENAME));
    }
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-only-table" })]);
    invalidateCache(root);

    assert.ok(!existsSync(join(root, CHANGE_LOG_FILENAME)), "precondition: change-log.jsonl absent");
    const entries = readRegistry(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "meta-only-table");
  });

  it("(a) readRegistry treats a missing meta-state.jsonl as empty (cold-start compat)", () => {
    // Mirror of the pre-split case: meta-state.jsonl must NOT exist.
    if (existsSync(join(root, REGISTRY_FILENAME))) {
      unlinkSync(join(root, REGISTRY_FILENAME));
    }
    writeJsonl(root, CHANGE_LOG_FILENAME, [makeChangeLog({ id: "meta-only-stream" })]);
    invalidateCache(root);

    assert.ok(!existsSync(join(root, REGISTRY_FILENAME)), "precondition: meta-state.jsonl absent");
    const entries = readRegistry(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "meta-only-stream");
  });

  it("(b) LRU cache busts on change-log.jsonl mtime change with no meta-state.jsonl change", async () => {
    // Warm cache with both files present.
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-busytable-1" })]);
    writeJsonl(root, CHANGE_LOG_FILENAME, [makeChangeLog({ id: "meta-busycl-1" })]);
    invalidateCache(root);
    const before = readRegistry(root);
    assert.equal(before.length, 2);

    // Append to change-log.jsonl only. meta-state.jsonl is untouched.
    await sleep(1100); // bypass 1s mtime granularity on coarse filesystems
    appendJsonl(root, CHANGE_LOG_FILENAME, makeChangeLog({ id: "meta-busycl-2" }));

    // The cache must bust even though meta-state.jsonl mtime didn't change.
    const after = readRegistry(root);
    assert.notEqual(after, before, "must return a NEW array reference after change-log.jsonl append");
    assert.equal(after.length, 3, "must reflect the new change-log entry");
    assert.ok(after.find((e) => e.id === "meta-busycl-2"), "must find the appended change-log");
  });

  it("(b) LRU cache does not bust when neither file changed (cache stability)", () => {
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-stable-1" })]);
    writeJsonl(root, CHANGE_LOG_FILENAME, [makeChangeLog({ id: "meta-stable-2" })]);
    invalidateCache(root);

    const first = readRegistry(root);
    const second = readRegistry(root);
    assert.equal(first, second, "warm cache hit must return the SAME array reference");
    assert.equal(first.length, 2);
  });

  it("(c) cold-tier cache rebuilds after change-log.jsonl-only write (change_log_sha256 key)", () => {
    // Set up both files and warm the cold-tier cache with a known payload.
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-cold-f1" })]);
    writeJsonl(root, CHANGE_LOG_FILENAME, [makeChangeLog({ id: "meta-cold-c1" })]);
    const coldPayload = { test: "before-append", entries: 2 };
    writeColdTierCache(root, coldPayload);
    invalidateCache(root);

    // Verify the cache hits with the warm payload (all three SHAs match).
    const warm = readColdTierCache(root);
    assert.equal(warm.hit, true, "cache must hit when all SHAs match");
    assert.deepEqual(warm.payload, coldPayload, "cached payload must match what was written");

    // Append to change-log.jsonl only — change_log_sha256 must change.
    appendJsonl(root, CHANGE_LOG_FILENAME, makeChangeLog({ id: "meta-cold-c2" }));

    // Cache must miss (sha_mismatch) even though meta-state.jsonl didn't change.
    const cold = readColdTierCache(root);
    assert.equal(cold.hit, false, "cache must miss after change-log.jsonl append");
    assert.equal(cold.reason, "sha_mismatch", "miss reason must be sha_mismatch (change_log_sha256 changed)");
  });

  it("(c) cold-tier cache hits when change-log.jsonl is absent (pre-split backward compat)", () => {
    // Only meta-state.jsonl present — change_log_sha256 component is null, treated as a stable absent hash.
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-coldonly-1" })]);
    const coldPayload = { test: "no-change-log", entries: 1 };
    writeColdTierCache(root, coldPayload);
    invalidateCache(root);

    const warm = readColdTierCache(root);
    assert.equal(warm.hit, true, "cache must hit when only meta-state.jsonl is present");
    assert.deepEqual(warm.payload, coldPayload);

    // Verify the cache is keyed on change_log_sha256 === null consistently when change-log.jsonl remains absent.
    const warm2 = readColdTierCache(root);
    assert.equal(warm2.hit, true, "subsequent reads must continue to hit");
  });
});

describe("persist-site change-log leak guard (Tier 1 red-team F2)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    invalidateCache(root);
    // Reset to a clean state — both files absent so each test owns its setup.
    if (existsSync(join(root, REGISTRY_FILENAME))) unlinkSync(join(root, REGISTRY_FILENAME));
    if (existsSync(join(root, CHANGE_LOG_FILENAME))) unlinkSync(join(root, CHANGE_LOG_FILENAME));
  });

  it("guard is a no-op when change-log.jsonl is absent (pre-split backward compat)", async () => {
    // Pre-split: only meta-state.jsonl exists; the guard must NOT fire even
    // though the in-memory entries array may carry change-log-shaped objects.
    writeJsonl(root, REGISTRY_FILENAME, [makeFinding({ id: "meta-guard-pre-1" })]);

    // metaStateBatch with a write op for a table entry should succeed (no leak
    // because the persisted array is table-only).
    const result = await metaStateBatch(root, [
      {
        op: "write",
        entry: makeFinding({
          id: "meta-guard-pre-2",
          description: "Table entry written while change-log.jsonl is absent (no leak)",
        }),
      },
    ]);
    assert.equal(result.applied, 1, "pre-split write must succeed");
    assert.ok(!existsSync(join(root, CHANGE_LOG_FILENAME)), "change-log.jsonl must remain absent");
  });

  it("guard rejects a non-table-only persist once change-log.jsonl exists", async () => {
    // Post-split: change-log.jsonl exists. A persist path that includes a
    // change-log entry in the in-memory entries array would corrupt the
    // registry (change-log leaks into meta-state.jsonl, then merge=union
    // doubles it on the next parallel merge). The guard at persistRegistryAtomic
    // fires before the file write so the corruption never lands.
    writeJsonl(root, CHANGE_LOG_FILENAME, [
      makeChangeLog({ id: "meta-guard-existing-cl", reason: "Pre-existing change-log that establishes post-split state (min 20 chars)" }),
    ]);

    // Route a change-log through metaStateBatch's write op — with the dispatch
    // rolled back, the in-memory entries array still contains the change-log at
    // persist time. The guard must throw before the file write commits.
    await assert.rejects(
      () =>
        metaStateBatch(root, [
          {
            op: "write",
            entry: makeChangeLog({
              id: "meta-guard-leaky-cl",
              reason: "This change-log would leak into meta-state.jsonl if not guarded (min 20 chars)",
            }),
          },
        ]),
      /change_log_leak/,
      "persistRegistryAtomic must reject non-table-only writes once change-log.jsonl exists",
    );

    // The pre-existing change-log.jsonl must remain untouched (no half-written
    // meta-state.jsonl from the rolled-back attempt).
    const changeLogLines = readJsonlLines(root, CHANGE_LOG_FILENAME);
    assert.equal(changeLogLines.length, 1, "pre-existing change-log.jsonl must remain intact");
    assert.equal(changeLogLines[0].id, "meta-guard-existing-cl");
    // meta-state.jsonl may either be absent or remain in its pre-state — what
    // matters is that the leaked entry did NOT land in it.
    if (existsSync(join(root, REGISTRY_FILENAME))) {
      const tableIds = readJsonlLines(root, REGISTRY_FILENAME).map((e) => e.id);
      assert.ok(
        !tableIds.includes("meta-guard-leaky-cl"),
        "leaked change-log must NOT be in meta-state.jsonl after the rejected batch",
      );
    }
  });

  it("guard allows table-only persists once change-log.jsonl exists (post-split happy path)", async () => {
    // writeEntry uses appendRegistryEntryAtomic (reads ONLY meta-state.jsonl,
    // NOT the union), so the input to persistRegistryAtomic is guaranteed
    // table-only and the guard is a no-op. The guard fires only when the
    // in-memory entries array actually contains a change-log — a scenario
    // reachable via metaStateBatch (which reads the union) but not via
    // writeEntry (which doesn't).
    writeJsonl(root, CHANGE_LOG_FILENAME, [
      makeChangeLog({ id: "meta-guard-happy-cl", reason: "Pre-existing change-log for happy-path test (min 20 chars)" }),
    ]);

    await writeEntry(root, makeFinding({
      id: "meta-guard-happy-f",
      description: "Table entry written while change-log.jsonl exists — guard must allow this",
    }));
    assert.ok(existsSync(join(root, REGISTRY_FILENAME)), "meta-state.jsonl must exist after the persist");
    const tableLines = readJsonlLines(root, REGISTRY_FILENAME);
    assert.equal(tableLines.length, 1, "must contain only the new finding, not the change-log from change-log.jsonl");
    assert.equal(tableLines[0].id, "meta-guard-happy-f");
    assert.equal(tableLines[0].entry_kind, "finding");
  });
});

function readJsonlLines(root, filename) {
  const path = join(root, filename);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}
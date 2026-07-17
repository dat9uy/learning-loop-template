import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";
import { readRegistryWithCache } from "../../core/read-registry-cache.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "include-all-versions-test-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

function writeChangeLog(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "change-log.jsonl"), lines, "utf8");
}

function finding(overrides) {
  return {
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    ...overrides,
  };
}

// Versioned-append fixtures (Tier 2 Phase B shape: multi-line per id).
// hist-open-x: 3 versions, all status open — exercises history semantics
// without terminal-filter interference. v0 and v2 carry a `reopens` ref
// for the ref_by composition test.
// hist-term-y: v0 open → v1 resolved → v2 superseded → v3 archived
// (tombstone delete) — exercises composition with the terminal filters.
const T0 = "2026-07-17T10:00:00.000Z";
const T1 = "2026-07-17T10:01:00.000Z";
const T2 = "2026-07-17T10:02:00.000Z";
const T3 = "2026-07-17T10:03:00.000Z";

describe("meta_state_list include_all_versions", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    writeRegistry(root, [
      finding({
        id: "hist-open-x",
        status: "open",
        version: 0,
        description: "hist-open-x v0 open (min 20 chars)",
        created_at: T0,
        reopens: ["parent-p"],
      }),
      finding({
        id: "hist-open-x",
        status: "open",
        version: 1,
        description: "hist-open-x v1 open (min 20 chars)",
        created_at: T1,
      }),
      finding({
        id: "hist-open-x",
        status: "open",
        version: 2,
        description: "hist-open-x v2 open (min 20 chars)",
        created_at: T2,
        reopens: ["parent-p"],
      }),
      finding({
        id: "hist-term-y",
        status: "open",
        version: 0,
        description: "hist-term-y v0 open (min 20 chars)",
        created_at: T0,
      }),
      finding({
        id: "hist-term-y",
        status: "resolved",
        version: 1,
        description: "hist-term-y v1 resolved (min 20 chars)",
        created_at: T1,
      }),
      finding({
        id: "hist-term-y",
        status: "superseded",
        version: 2,
        description: "hist-term-y v2 superseded (min 20 chars)",
        created_at: T2,
      }),
      finding({
        id: "hist-term-y",
        status: "archived",
        version: 3,
        tombstone_kind: "delete",
        description: "hist-term-y v3 archived tombstone (min 20 chars)",
        created_at: T3,
      }),
      // Legacy pre-Phase-A shape: no version field at all.
      finding({
        id: "legacy-no-version",
        status: "open",
        description: "Legacy entry with no version field (min 20 chars)",
        created_at: T0,
      }),
      finding({
        id: "open-singleton-z",
        status: "open",
        version: 0,
        description: "Singleton open finding (min 20 chars)",
        created_at: T0,
      }),
      // Written LAST on disk but sorts FIRST by id — pins the (id asc)
      // primary sort key against raw disk order.
      finding({
        id: "aaa-early",
        status: "open",
        version: 0,
        description: "Out-of-disk-order id for cross-id sort pinning",
        created_at: T3,
      }),
    ]);
    writeChangeLog(root, [
      {
        id: "cl-hist-1",
        entry_kind: "change-log",
        status: "active",
        version: 0,
        change_dimension: "surface",
        change_target: "tools/example.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Change-log line for both-files read (min 20 chars)",
        created_at: T1,
      },
    ]);
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("include_all_versions: true returns every version line per id, sorted by version ascending", async () => {
    const result = await metaStateListTool.handler({
      id: "hist-open-x",
      include_all_versions: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 3);
    assert.deepStrictEqual(
      text.entries.map((e) => e.version),
      [0, 1, 2]
    );
    assert.ok(text.entries.every((e) => e.id === "hist-open-x"));
    assert.strictEqual(text.include_all_versions, true);
  });

  test("default (include_all_versions omitted) collapses to the max-version line per id", async () => {
    const result = await metaStateListTool.handler({
      id: "hist-open-x",
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].version, 2);
    assert.strictEqual(text.include_all_versions, false);
  });

  test("include_all_versions: true + include_archived: true returns the full history incl. terminal lines", async () => {
    const result = await metaStateListTool.handler({
      id: "hist-term-y",
      include_all_versions: true,
      include_archived: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 4);
    assert.deepStrictEqual(
      text.entries.map((e) => e.version),
      [0, 1, 2, 3]
    );
    assert.deepStrictEqual(
      text.entries.map((e) => e.status),
      ["open", "resolved", "superseded", "archived"]
    );
  });

  test("include_all_versions: true with default filters still hides terminal-status lines (orthogonal composition)", async () => {
    const result = await metaStateListTool.handler({
      id: "hist-term-y",
      include_all_versions: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    // Orthogonal composition: the terminal-status filters apply per line.
    // Only the v0 (open) line survives; resolved/superseded/archived lines
    // require include_archived: true (or an explicit status filter).
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].version, 0);
    assert.strictEqual(text.entries[0].status, "open");
  });

  test("legacy entry with no version field parses cleanly under the all-versions path", async () => {
    const result = await metaStateListTool.handler({
      id: "legacy-no-version",
      include_all_versions: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].version ?? 0, 0);
  });

  test("compact: true (default) retains the version field under include_all_versions", async () => {
    const result = await metaStateListTool.handler({
      id: "hist-open-x",
      include_all_versions: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.compact, true);
    assert.strictEqual(text.count, 3);
    assert.deepStrictEqual(
      text.entries.map((e) => e.version),
      [0, 1, 2]
    );
  });

  test("ref_by/ref_field composes: multi-version id appears once per line (N rows per id)", async () => {
    const allVersions = await metaStateListTool.handler({
      ref_by: "parent-p",
      ref_field: "reopens",
      include_all_versions: true,
      compact: false,
    });
    const allText = JSON.parse(allVersions.content[0].text);
    // matchingIds is a Set of ids; every line of a matching id is returned.
    assert.strictEqual(allText.count, 3);
    assert.ok(allText.entries.every((e) => e.id === "hist-open-x"));

    const projected = await metaStateListTool.handler({
      ref_by: "parent-p",
      ref_field: "reopens",
      compact: false,
    });
    const projText = JSON.parse(projected.content[0].text);
    assert.strictEqual(projText.count, 1);
    assert.strictEqual(projText.entries[0].version, 2);
  });

  test("all-versions output is sorted by id ascending across ids (not disk order)", async () => {
    const result = await metaStateListTool.handler({
      include_all_versions: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    const ids = text.entries.map((e) => e.id);
    // "aaa-early" is written last on disk but must sort first.
    assert.strictEqual(ids[0], "aaa-early");
    const sorted = [...ids].sort();
    assert.deepStrictEqual(ids, sorted);
  });

  test("all-versions path reads both files (meta-state.jsonl + change-log.jsonl)", async () => {
    const result = await metaStateListTool.handler({
      id: "cl-hist-1",
      include_all_versions: true,
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].entry_kind, "change-log");
  });
});

describe("read-registry cache dual-projection", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
    writeRegistry(root, [
      finding({
        id: "cache-shape-check",
        status: "open",
        version: 0,
        description: "Cache shape fixture (min 20 chars)",
        created_at: T0,
      }),
    ]);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("one cold miss computes both projections; subsequent reads hit the same cache entry", () => {
    let projectedCalls = 0;
    let allVersionsCalls = 0;
    const parseFns = {
      projected: () => {
        projectedCalls++;
        return ["p"];
      },
      allVersions: () => {
        allVersionsCalls++;
        return ["a"];
      },
    };
    const first = readRegistryWithCache(root, parseFns);
    const second = readRegistryWithCache(root, parseFns);
    assert.deepStrictEqual(first.projected, ["p"]);
    assert.deepStrictEqual(first.allVersions, ["a"]);
    // Single cold miss: each parseFn ran exactly once across both reads.
    assert.strictEqual(projectedCalls, 1);
    assert.strictEqual(allVersionsCalls, 1);
    assert.strictEqual(first, second);
  });
});

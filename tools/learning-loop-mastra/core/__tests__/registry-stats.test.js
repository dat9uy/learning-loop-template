// Unit tests for core/registry-stats.js (Tier 2 Phase C).
//
// Phase C ships a shared `computeRegistryStats(root)` helper consumed by both
// the `loop_describe` warm tier (avoids shell subprocess from MCP server) and
// `tools/scripts/compact-registry.sh` (when invoked via Node). Locks the
// 4-key shape consumed by the compaction signal + advisory:
//
//   raw_lines              (sum of non-blank lines across files)
//   deduped_ids            (last-wins-by-max-version projection count)
//   dead_version_lines     (raw_lines - deduped_ids)
//   compaction_eligible    (raw_lines >= COMPACTION_THRESHOLD)
//
// Plus a separate `findDuplicateVersionPerId(entries)` helper for the
// same-id-concurrent-mutation CI advisory (one warning per id).

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeRegistryStats, findDuplicateVersionPerId } from "../registry-stats.js";

function writeJsonl(path, lines) {
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

describe("computeRegistryStats", () => {
  test("returns the documented shape with 4 keys", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      const stats = computeRegistryStats(tmp);
      assert.deepStrictEqual(Object.keys(stats).sort(), [
        "compaction_eligible",
        "dead_version_lines",
        "deduped_ids",
        "raw_lines",
      ]);
      assert.strictEqual(typeof stats.raw_lines, "number");
      assert.strictEqual(typeof stats.deduped_ids, "number");
      assert.strictEqual(typeof stats.dead_version_lines, "number");
      assert.strictEqual(typeof stats.compaction_eligible, "boolean");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("empty registry: 0 raw, 0 deduped, 0 dead, ineligible", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 0);
      assert.strictEqual(stats.deduped_ids, 0);
      assert.strictEqual(stats.dead_version_lines, 0);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("one-line-per-id: raw == deduped; dead == 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      writeJsonl(join(tmp, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "b", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:01.000Z" },
        { id: "c", entry_kind: "change-log", version: 1, created_at: "2026-01-01T00:00:02.000Z" },
      ]);
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 3);
      assert.strictEqual(stats.deduped_ids, 3);
      assert.strictEqual(stats.dead_version_lines, 0);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("versioned: raw > deduped; dead == raw - deduped; last-wins per id", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      writeJsonl(join(tmp, "meta-state.jsonl"), [
        { id: "alpha", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 3, created_at: "2026-01-01T02:00:00.000Z" },
        { id: "beta", entry_kind: "finding", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
      ]);
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 4);
      assert.strictEqual(stats.deduped_ids, 2);
      assert.strictEqual(stats.dead_version_lines, 2);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("cross-file union (meta-state + change-log): deduped counts distinct ids across files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      writeJsonl(join(tmp, "meta-state.jsonl"), [
        { id: "shared", entry_kind: "finding", version: 2, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "shared", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:01.000Z" },
        { id: "f-only", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:02.000Z" },
      ]);
      writeJsonl(join(tmp, "change-log.jsonl"), [
        { id: "shared", entry_kind: "change-log", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
        { id: "cl-only", entry_kind: "change-log", version: 1, created_at: "2026-01-02T00:00:01.000Z" },
      ]);
      const stats = computeRegistryStats(tmp);
      // raw_lines = 3 + 2 = 5; deduped_ids = {shared, f-only, cl-only} = 3
      assert.strictEqual(stats.raw_lines, 5);
      assert.strictEqual(stats.deduped_ids, 3);
      assert.strictEqual(stats.dead_version_lines, 2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("compaction_eligible flips true at or above threshold (default 1000)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      // Generate 999 lines: 999 distinct ids, each one version → 999 raw, 999 deduped
      const lines = [];
      for (let i = 0; i < 999; i++) {
        lines.push({ id: `id-${i}`, entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" });
      }
      writeJsonl(join(tmp, "meta-state.jsonl"), lines);
      const statsBelow = computeRegistryStats(tmp);
      assert.strictEqual(statsBelow.raw_lines, 999);
      assert.strictEqual(statsBelow.compaction_eligible, false);

      // Add one more → 1000 → eligible.
      writeFileSync(join(tmp, "meta-state.jsonl"),
        readJsonl(join(tmp, "meta-state.jsonl")) +
        JSON.stringify({ id: "id-999", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" }) +
        "\n",
        "utf8",
      );
      const statsAt = computeRegistryStats(tmp);
      assert.strictEqual(statsAt.raw_lines, 1000);
      assert.strictEqual(statsAt.compaction_eligible, true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("threshold override via COMPACTION_THRESHOLD env var", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    const prev = process.env.COMPACTION_THRESHOLD;
    process.env.COMPACTION_THRESHOLD = "5";
    try {
      writeJsonl(join(tmp, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "b", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:01.000Z" },
        { id: "c", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:02.000Z" },
        { id: "d", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:03.000Z" },
        { id: "e", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:04.000Z" },
      ]);
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 5);
      assert.strictEqual(stats.compaction_eligible, true);
    } finally {
      if (prev === undefined) delete process.env.COMPACTION_THRESHOLD;
      else process.env.COMPACTION_THRESHOLD = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("tolerates absent change-log.jsonl (post-Tier-1-split trees may omit it)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      writeJsonl(join(tmp, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
      ]);
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 1);
      assert.strictEqual(stats.deduped_ids, 1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("skips blank lines (file ends with trailing newline)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-stats-"));
    try {
      // 2 entries + trailing newline (empty last line).
      writeFileSync(join(tmp, "meta-state.jsonl"),
        JSON.stringify({ id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" }) + "\n" +
        JSON.stringify({ id: "b", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:01.000Z" }) + "\n",
        "utf8",
      );
      const stats = computeRegistryStats(tmp);
      assert.strictEqual(stats.raw_lines, 2);
      assert.strictEqual(stats.deduped_ids, 2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("findDuplicateVersionPerId", () => {
  test("returns one entry per id that has > 1 lines (regardless of version equality)", () => {
    // Use case: after a parallel `merge=union` of two branches that each
    // appended a versioned line for the same id. Both lines retained;
    // advisory surfaces the per-id count.
    const entries = [
      { id: "alpha", version: 1 },
      { id: "alpha", version: 2 },
      { id: "alpha", version: 3 },
      { id: "beta", version: 1 },
      { id: "gamma", version: 1 },
      { id: "gamma", version: 2 },
    ];
    const dupes = findDuplicateVersionPerId(entries);
    const byId = Object.fromEntries(dupes.map((d) => [d.id, d.count]));
    assert.strictEqual(dupes.length, 2);
    assert.strictEqual(byId.alpha, 3);
    assert.strictEqual(byId.gamma, 2);
  });

  test("returns empty array when every id is a singleton", () => {
    const entries = [
      { id: "a", version: 1 },
      { id: "b", version: 1 },
      { id: "c", version: 1 },
    ];
    const dupes = findDuplicateVersionPerId(entries);
    assert.deepStrictEqual(dupes, []);
  });

  test("tolerates missing version field (treat as singleton warning only when 2+ lines)", () => {
    const entries = [
      { id: "no-version-1" },
      { id: "no-version-1" },
      { id: "versioned", version: 1 },
    ];
    const dupes = findDuplicateVersionPerId(entries);
    assert.strictEqual(dupes.length, 1);
    assert.strictEqual(dupes[0].id, "no-version-1");
    assert.strictEqual(dupes[0].count, 2);
  });

  test("skips entries with null/undefined id (defensive)", () => {
    const entries = [
      { version: 1 },
      { id: null, version: 1 },
      { id: "valid", version: 1 },
      { id: "valid", version: 2 },
    ];
    const dupes = findDuplicateVersionPerId(entries);
    assert.strictEqual(dupes.length, 1);
    assert.strictEqual(dupes[0].id, "valid");
    assert.strictEqual(dupes[0].count, 2);
  });
});

// Helper for the threshold-override test that re-reads the file.
function readJsonl(path) {
  return require("node:fs").readFileSync(path, "utf8");
}

import { describe, test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAllowlist, invalidateAllowlist, __clearCache } from "../../core/r2/allowlist-cache.js";

const SCHEMA_V1 = {
  version: 1,
  schema: "r2-allowlist/v1",
  "claude-code": { own: [".claude/**"], deny: [] },
  droid: { own: [".factory/**"], deny: [] },
  "mastra-code": { own: [".mastracode/**"], deny: [] },
  universal: ["records/**"],
};

describe("allowlist-cache", () => {
  let tempRoot;

  beforeEach(() => {
    __clearCache();
    tempRoot = mkdtempSync(join(tmpdir(), "r2-cache-"));
    mkdirSync(join(tempRoot, ".loop"), { recursive: true });
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify(SCHEMA_V1));
  });

  afterEach(() => {
    __clearCache();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("load_on_boot: reads and parses .loop/r2-allowlist.json", () => {
    const al = loadAllowlist(tempRoot);
    assert.equal(al.schema, "r2-allowlist/v1");
    assert.equal(al.version, 1);
    assert.deepEqual(al["claude-code"].own, [".claude/**"]);
  });

  test("cache_hit: second call returns the same cached object", () => {
    const first = loadAllowlist(tempRoot);
    const second = loadAllowlist(tempRoot);
    assert.strictEqual(first, second, "must return the cached object reference");
  });

  test("invalidation_via_update_tool: invalidateAllowlist forces re-read on next call", () => {
    const first = loadAllowlist(tempRoot);
    // Edit the file on disk (simulating the update_r2_allowlist tool's atomic write).
    const edited = { ...SCHEMA_V1, "claude-code": { own: [".claude/**", ".claude/extra/**"], deny: [] } };
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify(edited));
    // Without invalidation, the stale cache is returned.
    const stale = loadAllowlist(tempRoot);
    assert.strictEqual(stale, first, "cache must not re-read without invalidation");
    // Invalidate and re-read.
    invalidateAllowlist(tempRoot);
    const fresh = loadAllowlist(tempRoot);
    assert.notStrictEqual(fresh, first, "must return a fresh object after invalidation");
    assert.deepEqual(fresh["claude-code"].own, [".claude/**", ".claude/extra/**"]);
  });

  test("invalidateAllowlist() with no arg clears all roots", () => {
    loadAllowlist(tempRoot);
    invalidateAllowlist();
    // Next call re-reads from disk.
    const fresh = loadAllowlist(tempRoot);
    assert.ok(fresh, "must re-load after global invalidate");
  });

  test("missing file throws r2_allowlist_missing", () => {
    rmSync(join(tempRoot, ".loop", "r2-allowlist.json"), { force: true });
    assert.throws(
      () => loadAllowlist(tempRoot),
      /r2_allowlist_missing/,
    );
  });

  test("wrong schema marker throws r2_allowlist_invalid_schema", () => {
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify({ version: 1, schema: "other" }));
    assert.throws(
      () => loadAllowlist(tempRoot),
      /r2_allowlist_invalid_schema/,
    );
  });

  test("missing version throws r2_allowlist_invalid_schema", () => {
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify({ schema: "r2-allowlist/v1" }));
    assert.throws(
      () => loadAllowlist(tempRoot),
      /r2_allowlist_invalid_schema/,
    );
  });

  test("malformed JSON throws r2_allowlist_invalid_json", () => {
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), "{ not json");
    assert.throws(
      () => loadAllowlist(tempRoot),
      /r2_allowlist_invalid_json/,
    );
  });

  test("different roots are cached independently", () => {
    const other = mkdtempSync(join(tmpdir(), "r2-cache-other-"));
    try {
      mkdirSync(join(other, ".loop"), { recursive: true });
      const otherSchema = { ...SCHEMA_V1, version: 1 };
      writeFileSync(join(other, ".loop", "r2-allowlist.json"), JSON.stringify(otherSchema));
      const a = loadAllowlist(tempRoot);
      const b = loadAllowlist(other);
      assert.notStrictEqual(a, b, "different roots must cache independently");
    } finally {
      __clearCache();
      rmSync(other, { recursive: true, force: true });
    }
  });
});
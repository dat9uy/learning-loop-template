import { describe, test, beforeEach } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import {
  readFileIndex,
  upsertFileIndexEntry,
  canonicalIndexKey,
  getFileIndexPath,
  FILE_INDEX_FILENAME,
  _resetFileIndexCacheForTests,
} from "../../core/meta-state.js";

// upsertFileIndexEntry is queued per-root (mirrors writeEntry), so it returns a
// Promise<boolean>. Tests await it so the write completes before reads.
// A valid SHA-256 fingerprint (64 hex chars) used to exercise the index without
// hashing a real file. Matches check-grounding.js#TERMINAL_HASH_REGEX.
const VALID_HASH = `sha256:${"abcdef0123456789".repeat(4)}`;
const VALID_HASH_2 = `sha256:${"0123456789abcdef".repeat(4)}`;

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "file-index-test-"));
}

describe("file-index sidecar helpers", () => {
  beforeEach(() => {
    _resetFileIndexCacheForTests();
  });

  test("readFileIndex returns an empty Map when the sidecar is missing", () => {
    const root = makeRoot();
    const map = readFileIndex(root);
    assert.ok(map instanceof Map);
    assert.strictEqual(map.size, 0);
  });

  test("upsertFileIndexEntry then readFileIndex returns the hash at the canonical key", async () => {
    const root = makeRoot();
    const ok = await upsertFileIndexEntry(root, "tools/foo.js", VALID_HASH);
    assert.strictEqual(ok, true);
    const map = readFileIndex(root);
    assert.strictEqual(map.get("tools/foo.js"), VALID_HASH);
  });

  test("upsert overwrites — exactly one row per canonical path", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "tools/foo.js", VALID_HASH);
    await upsertFileIndexEntry(root, "tools/foo.js", VALID_HASH_2);
    const map = readFileIndex(root);
    assert.strictEqual(map.size, 1);
    assert.strictEqual(map.get("tools/foo.js"), VALID_HASH_2);
  });

  test("two distinct paths -> two rows; same path twice -> one row", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    await upsertFileIndexEntry(root, "b.js", VALID_HASH_2);
    await upsertFileIndexEntry(root, "a.js", VALID_HASH_2);
    const map = readFileIndex(root);
    assert.strictEqual(map.size, 2);
    assert.strictEqual(map.get("a.js"), VALID_HASH_2);
    assert.strictEqual(map.get("b.js"), VALID_HASH_2);
  });

  // Red-team F3: key divergence — lookup uses relative path, auto-populate must
  // NOT use absolute `absPath`. `:line` and `#anchor` collapse to the same key.
  test("key form: :line and #anchor collapse to the same canonical key (F3)", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "tools/core/gate-logic.js:638", VALID_HASH);
    const map = readFileIndex(root);
    // The stored key is the stripped relative path.
    assert.strictEqual(map.get("tools/core/gate-logic.js"), VALID_HASH);
    // A lookup via an anchor suffix hits the same key.
    assert.strictEqual(map.get(canonicalIndexKey("tools/core/gate-logic.js#checkResolutionEvidence")), VALID_HASH);
    assert.strictEqual(canonicalIndexKey("tools/core/gate-logic.js:638"), "tools/core/gate-logic.js");
    assert.strictEqual(canonicalIndexKey("tools/core/gate-logic.js#sym"), "tools/core/gate-logic.js");
  });

  // Red-team F3: no absolute path keys.
  test("absolute path rejected as a key — upsert returns false, file unchanged (F3)", async () => {
    const root = makeRoot();
    const abs = join(root, "tools/foo.js");
    const ok = await upsertFileIndexEntry(root, abs, VALID_HASH);
    assert.strictEqual(ok, false);
    assert.strictEqual(existsSync(getFileIndexPath(root)), false);
    assert.strictEqual(readFileIndex(root).size, 0);
  });

  test("corrupt hash input -> upsert returns false, file unchanged", async () => {
    const root = makeRoot();
    const ok = await upsertFileIndexEntry(root, "tools/foo.js", "not-a-hash");
    assert.strictEqual(ok, false);
    assert.strictEqual(existsSync(getFileIndexPath(root)), false);
    assert.strictEqual(readFileIndex(root).size, 0);
  });

  // Red-team F6: a corrupt index value (valid JSON, invalid hash) must not feed
  // a false baseline into checkGrounding — drop it on read.
  test("corrupt hash on read: a valid-JSON line with an invalid hash is dropped (F6)", async () => {
    const root = makeRoot();
    // Seed a good row first.
    await upsertFileIndexEntry(root, "good.js", VALID_HASH);
    // Append a corrupt row directly to the sidecar (simulates a poisoned index).
    const indexPath = getFileIndexPath(root);
    const corrupt = JSON.stringify({ path: "bad.js", code_fingerprint: "sha256:BAD", updated_at: "2026-07-02T00:00:00.000Z" });
    writeFileSync(indexPath, readFileSync(indexPath, "utf8") + corrupt + "\n", "utf8");
    _resetFileIndexCacheForTests();
    const map = readFileIndex(root);
    assert.strictEqual(map.get("good.js"), VALID_HASH, "valid row preserved");
    assert.strictEqual(map.has("bad.js"), false, "corrupt-hash row dropped");
  });

  test("malformed JSON line is skipped on read (NEW resilience — registry reader throws)", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "good.js", VALID_HASH);
    const indexPath = getFileIndexPath(root);
    writeFileSync(indexPath, readFileSync(indexPath, "utf8") + "{not valid json\n", "utf8");
    _resetFileIndexCacheForTests();
    const map = readFileIndex(root);
    assert.strictEqual(map.get("good.js"), VALID_HASH, "valid row preserved despite malformed sibling line");
    assert.strictEqual(map.size, 1);
  });

  // Red-team F11: readFileIndex is cached (mtime+size); upsert invalidates it.
  test("cached: second read with no intervening write hits the cache; upsert invalidates (F11)", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    const m1 = readFileIndex(root);
    const m2 = readFileIndex(root);
    assert.strictEqual(m1, m2, "second read returns the cached Map (same ref)");
    await upsertFileIndexEntry(root, "b.js", VALID_HASH_2);
    const m3 = readFileIndex(root);
    assert.notStrictEqual(m1, m3, "upsert invalidated the cache (new ref)");
    assert.strictEqual(m3.get("a.js"), VALID_HASH);
    assert.strictEqual(m3.get("b.js"), VALID_HASH_2);
  });

  test("FILE_INDEX_FILENAME is the documented sidecar name and getFileIndexPath joins root", () => {
    assert.strictEqual(FILE_INDEX_FILENAME, "file-index.jsonl");
    const root = makeRoot();
    assert.strictEqual(getFileIndexPath(root), join(root, "file-index.jsonl"));
  });

  // Cache-desync guard: readFileIndex returns its cached Map by reference, so
  // upsert must NOT mutate that shared object in place. A prior caller holding
  // the reference must not see a key it never observed. Cloning before the set
  // (plus invalidating in finally) keeps the cache honest on both success and
  // failure paths.
  test("upsert does not mutate a previously-returned readFileIndex Map (clone before mutate)", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    const before = readFileIndex(root); // cached reference
    assert.strictEqual(before.get("a.js"), VALID_HASH);
    await upsertFileIndexEntry(root, "b.js", VALID_HASH_2);
    assert.strictEqual(before.has("b.js"), false, "prior ref must not see the new key (clone, not in-place mutate)");
    const after = readFileIndex(root);
    assert.strictEqual(after.get("a.js"), VALID_HASH);
    assert.strictEqual(after.get("b.js"), VALID_HASH_2);
  });

  // Cache-desync guard on write failure: if the atomic write throws (disk full,
  // EACCES, etc.), the cache must NOT retain a phantom baseline for a key that
  // was never persisted. The finally-invalidate ensures the next read re-reads
  // the unchanged file instead of returning a poisoned Map.
  test("failed write does not leave a phantom baseline in the cache (finally invalidate)", async () => {
    const root = makeRoot();
    await upsertFileIndexEntry(root, "good.js", VALID_HASH);
    // Make the index directory read-only so the tmp write throws EACCES.
    chmodSync(root, 0o500);
    try {
      await assert.rejects(upsertFileIndexEntry(root, "phantom.js", VALID_HASH_2));
    } finally {
      chmodSync(root, 0o700);
    }
    const map = readFileIndex(root);
    assert.strictEqual(map.has("phantom.js"), false, "failed write must not poison the cache");
    assert.strictEqual(map.get("good.js"), VALID_HASH, "prior entries intact");
  });

  // True no-op: re-upserting an unchanged (key, hash) must touch NOTHING on
  // disk — same byte Buffer, same mtime, same cached Map ref. The cold-tier
  // cache key is sha256(contents) so a stable index keeps the cache warm;
  // per-row updated_at churn on every reseed invalidates it.
  test("re-upserting the same (key, hash) is a true no-op (no rewrite, cache preserved)", async () => {
    const root = makeRoot();
    const indexPath = getFileIndexPath(root);

    // First write — establishes baseline.
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    const bytes1 = readFileSync(indexPath);
    const mtime1 = statSync(indexPath).mtimeMs;
    const cachedBefore = readFileIndex(root); // populate the cache

    // Second write with the SAME (key, hash) — must be a no-op.
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    const bytes2 = readFileSync(indexPath);
    const mtime2 = statSync(indexPath).mtimeMs;
    const cachedAfter = readFileIndex(root);

    assert.strictEqual(
      Buffer.compare(bytes1, bytes2),
      0,
      "file bytes must be byte-identical on a no-op re-upsert",
    );
    assert.strictEqual(mtime2, mtime1, "mtimeMs must be unchanged on a no-op re-upsert");
    assert.strictEqual(
      cachedBefore,
      cachedAfter,
      "readFileIndex must return the same cached Map ref (no defensive invalidate)",
    );

    // Real writes still work — write a different key with a different hash.
    await upsertFileIndexEntry(root, "b.js", VALID_HASH_2);
    const map = readFileIndex(root);
    assert.strictEqual(map.get("b.js"), VALID_HASH_2, "changed-hash writes still land");

    // After an unrelated changed write, a no-op re-upsert of "a.js" stays a
    // no-op (the "a.js" row in the Buffer reflects the post-Phase-1 contract:
    // on a real write all rows get a fresh updated_at — the test does NOT assert
    // preservation here, it asserts the no-op on re-upsert after the write).
    const bytes3 = readFileSync(indexPath);
    await upsertFileIndexEntry(root, "a.js", VALID_HASH);
    const bytes4 = readFileSync(indexPath);
    assert.strictEqual(
      Buffer.compare(bytes3, bytes4),
      0,
      "no-op after an unrelated write must still leave bytes unchanged",
    );
  });
});

describe("canonicalIndexKey", () => {
  test("strips :line and #anchor suffixes (delegates to stripEvidenceAnchor)", () => {
    assert.strictEqual(canonicalIndexKey("a/b.js"), "a/b.js");
    assert.strictEqual(canonicalIndexKey("a/b.js:42"), "a/b.js");
    assert.strictEqual(canonicalIndexKey("a/b.js:12-34"), "a/b.js");
    assert.strictEqual(canonicalIndexKey("a/b.js#fn"), "a/b.js");
    assert.strictEqual(canonicalIndexKey("a/b.js:12-34#fn"), "a/b.js");
  });

  test("returns a relative key (never absolute) for relative input", () => {
    assert.ok(!isAbsolute(canonicalIndexKey("tools/foo.js")));
  });
});

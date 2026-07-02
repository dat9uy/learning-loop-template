import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, linkSync, closeSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveSafePath,
  PathContainmentError,
  clearRealpathCache,
  isHardlinked,
} from "../core/path-containment.js";

describe("resolveSafePath", () => {
  let tempRoot;

  function makeRoot(prefix = "path-containment-") {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  before(() => {
    tempRoot = makeRoot();
  });

  after(() => {
    clearRealpathCache();
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  test("traversal_relative: '../../../etc/passwd' throws outside_root", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, "../../../etc/passwd"),
      (err) => err instanceof PathContainmentError && err.reason === "outside_root",
    );
  });

  test("symlink_escape: symlink inside root to /etc/passwd throws outside_root", () => {
    const root = makeRoot("path-containment-sym-");
    try {
      // Create a symlink inside root pointing to /etc/passwd
      symlinkSync("/etc/passwd", join(root, "leak"));
      assert.throws(
        () => resolveSafePath(root, "leak"),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("legitimate_deep_path: 'foo/../bar' inside root resolves to root/bar", () => {
    const root = makeRoot("path-containment-deep-");
    try {
      writeFileSync(join(root, "bar"), "x");
      const resolved = resolveSafePath(root, "foo/../bar");
      assert.strictEqual(resolved, join(root, "bar"));
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("absolute_path_outside_root: '/etc/passwd' throws outside_root", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, "/etc/passwd"),
      (err) => err instanceof PathContainmentError && err.reason === "outside_root",
    );
  });

  test("root_equals_root: userPath '.' returns realpath(root)", () => {
    const resolved = resolveSafePath(tempRoot, ".");
    // realpath of tempRoot equals tempRoot (mkdtemp has no symlinks in chain on linux)
    assert.strictEqual(resolved, tempRoot);
  });

  test("hardlink_rejected: hardlink inside root throws hardlink_rejected", () => {
    const root = makeRoot("path-containment-hardlink-");
    try {
      // Create a temp file outside root (we own it), then hardlink into root.
      const externalTmp = join(tmpdir(), `hardlink-target-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      writeFileSync(externalTmp, "secret");
      const inRootLink = join(root, "leak");
      linkSync(externalTmp, inRootLink);
      // sanity: nlink > 1
      assert.ok(isHardlinked(inRootLink), "test setup: hardlink should have nlink > 1");
      assert.throws(
        () => resolveSafePath(root, "leak"),
        (err) => err instanceof PathContainmentError && err.reason === "hardlink_rejected",
      );
      rmSync(externalTmp, { force: true });
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("path_with_colon_suffix: 'tools/foo.js:../../etc/passwd' throws traversal_detected", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, "tools/foo.js:../../etc/passwd"),
      (err) => err instanceof PathContainmentError && err.reason === "traversal_detected",
    );
  });

  test("colon_symbol_ref_not_rejected_by_guard: bare :symbol (no ..) flows to realpath", () => {
    // Narrowed R15 guard: a bare `:symbol` ref (e.g. `audit_output.rs:build_audit_sarif`)
    // carries no `..`, so the colon guard passes it through. realpath of a non-existent
    // file throws ENOENT -> outside_root (missing-file semantics, which callers catch and
    // treat as a missing file). It MUST NOT be rejected as `traversal_detected`.
    assert.throws(
      () => resolveSafePath(tempRoot, "audit_output.rs:build_audit_sarif"),
      (err) => err instanceof PathContainmentError && err.reason === "outside_root",
    );
  });

  test("null_byte_throws: path with \\0 throws", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, "foo\0bar"),
      (err) => err instanceof PathContainmentError,
    );
  });

  test("empty_string_throws: empty userPath throws", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, ""),
      (err) => err instanceof PathContainmentError && err.reason === "traversal_detected",
    );
  });

  test("non_string_throws: non-string userPath throws", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, 42),
      (err) => err instanceof PathContainmentError && err.reason === "traversal_detected",
    );
  });

  test("cache_hit: second call for same root reuses cached realpath", () => {
    const root = makeRoot("path-containment-cache-");
    try {
      writeFileSync(join(root, "file.txt"), "x");
      clearRealpathCache();
      // First call populates the cache
      const r1 = resolveSafePath(root, "file.txt");
      assert.strictEqual(r1, join(root, "file.txt"));
      // Second call should still succeed (uses cached canonicalRoot)
      const r2 = resolveSafePath(root, "file.txt");
      assert.strictEqual(r2, join(root, "file.txt"));
      // Verify cache was populated by checking that clearRealpathCache empties it:
      // after clear, a re-call still works (re-resolves)
      clearRealpathCache();
      const r3 = resolveSafePath(root, "file.txt");
      assert.strictEqual(r3, join(root, "file.txt"));
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("clear_cache_test_helper: clearRealpathCache forces re-resolve", () => {
    const root = makeRoot("path-containment-clear-");
    try {
      writeFileSync(join(root, "f"), "x");
      clearRealpathCache();
      const r1 = resolveSafePath(root, "f");
      assert.strictEqual(r1, join(root, "f"));
      // After clearing, the cache map should be empty; re-call repopulates
      clearRealpathCache();
      const r2 = resolveSafePath(root, "f");
      assert.strictEqual(r2, join(root, "f"));
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("missing_file_throws_outside_root: ENOENT resolves to outside_root", () => {
    assert.throws(
      () => resolveSafePath(tempRoot, "does/not/exist/inside/root.js"),
      (err) => err instanceof PathContainmentError && err.reason === "outside_root",
    );
  });

  test("legitimate_nested_file: existing file inside root resolves correctly", () => {
    const root = makeRoot("path-containment-nested-");
    try {
      writeFileSync(join(root, "src.js"), "// code");
      const resolved = resolveSafePath(root, "src.js");
      assert.strictEqual(resolved, join(root, "src.js"));
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("isHardlinked", () => {
  test("returns false for a single-link file", () => {
    const root = mkdtempSync(join(tmpdir(), "ishardlinked-single-"));
    try {
      const f = join(root, "single");
      writeFileSync(f, "x");
      assert.strictEqual(isHardlinked(f), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns true for a hardlinked file", () => {
    const root = mkdtempSync(join(tmpdir(), "ishardlinked-multi-"));
    try {
      const externalTmp = join(tmpdir(), `hl-target-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      writeFileSync(externalTmp, "x");
      const inRoot = join(root, "linked");
      linkSync(externalTmp, inRoot);
      assert.strictEqual(isHardlinked(inRoot), true);
      rmSync(externalTmp, { force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns false for a missing file (caller decides)", () => {
    assert.strictEqual(isHardlinked("/nonexistent/path/here"), false);
  });

  test("returns false for a directory (directories have nlink >= 2 by default)", () => {
    const root = mkdtempSync(join(tmpdir(), "ishardlinked-dir-"));
    try {
      // A fresh empty directory has nlink === 2 (itself + `..`) but is NOT a
      // hardlink-escape threat (hardlinks to dirs are disallowed on Linux).
      assert.strictEqual(isHardlinked(root), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("directory target does not trigger hardlink_rejected in resolveSafePath", () => {
    const root = mkdtempSync(join(tmpdir(), "resolve-dir-target-"));
    try {
      // root itself is a directory; resolving '.' must NOT throw hardlink_rejected.
      const resolved = resolveSafePath(root, ".");
      assert.strictEqual(resolved, root);
    } finally {
      clearRealpathCache();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PathContainmentError", () => {
  test("carries reason, root, userPath, resolvedPath fields", () => {
    const err = new PathContainmentError("outside_root", {
      root: "/tmp/r",
      userPath: "../../etc/passwd",
      resolvedPath: "/etc/passwd",
    });
    assert.strictEqual(err.name, "PathContainmentError");
    assert.strictEqual(err.reason, "outside_root");
    assert.strictEqual(err.root, "/tmp/r");
    assert.strictEqual(err.userPath, "../../etc/passwd");
    assert.strictEqual(err.resolvedPath, "/etc/passwd");
    assert.ok(err.message.includes("outside_root"));
  });
});
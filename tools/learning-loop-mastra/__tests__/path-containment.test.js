import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  resolveInsideRoot,
  PathContainmentError,
} from "../core/path-containment.js";

describe("resolveInsideRoot — LIM-4 path containment", () => {
  function makeTempDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "file.js"), "module.exports = 1;\n");
    return dir;
  }

  // T-1: absolute outside → throws outside_root
  test("throws outside_root for absolute path outside root", () => {
    const root = makeTempDir("path-con-");
    assert.throws(
      () => resolveInsideRoot("/etc/passwd", root),
      (err) => err instanceof PathContainmentError && err.code === "outside_root"
    );
  });

  // T-2: traversal escapes → throws outside_root
  test("throws outside_root for traversal that escapes root", () => {
    const root = makeTempDir("path-con-");
    assert.throws(
      () => resolveInsideRoot("../../../etc/passwd", root),
      (err) => err instanceof PathContainmentError && err.code === "outside_root"
    );
  });

  // T-3: inside existing → returns resolved path
  test("returns absolute resolved path for an existing file inside root", () => {
    const root = makeTempDir("path-con-");
    const result = resolveInsideRoot("src/file.js", root);
    assert.strictEqual(result, join(root, "src", "file.js"));
  });

  // T-4: inside but symlink to outside → throws outside_root
  test("throws outside_root when an ancestor is a symlink pointing outside root", () => {
    const root = makeTempDir("path-con-");
    try {
      // Create a symlink inside the project pointing to /etc/hostname
      symlinkSync("/etc/hostname", join(root, "src", "link.txt"));
      assert.throws(
        () => resolveInsideRoot("src/link.txt", root),
        (err) => err instanceof PathContainmentError && err.code === "outside_root"
      );
    } catch (err) {
      // On systems that don't allow this symlink (Windows, restricted Linux), skip.
      if (err.code === "EPERM" || err.code === "EACCES") return;
      throw err;
    }
  });

  // T-5: inside non-existent leaf → returns candidate (no realpath on missing leaf)
  test("returns candidate path for an inside non-existing leaf", () => {
    const root = makeTempDir("path-con-");
    const result = resolveInsideRoot("nested/missing.md", root);
    assert.strictEqual(result, join(root, "nested", "missing.md"));
  });

  // T-6: empty / null → throws empty
  test("throws empty for an empty string", () => {
    const root = makeTempDir("path-con-");
    assert.throws(
      () => resolveInsideRoot("", root),
      (err) => err instanceof PathContainmentError && err.code === "empty"
    );
  });

  test("throws empty for a non-string input", () => {
    const root = makeTempDir("path-con-");
    assert.throws(
      () => resolveInsideRoot(null, root),
      (err) => err instanceof PathContainmentError && err.code === "empty"
    );
  });

  // T-7: ../ file outside via .. → throws outside_root
  test("throws outside_root when ../ escapes project root", () => {
    const root = makeTempDir("path-con-");
    assert.throws(
      () => resolveInsideRoot("../README.md", root),
      (err) => err instanceof PathContainmentError && err.code === "outside_root"
    );
  });

  // T-8: root equality (no trailing sep) → returns root
  test("returns root for an absolute path equal to root", () => {
    const root = makeTempDir("path-con-");
    const result = resolveInsideRoot(root, root);
    assert.strictEqual(result, root);
  });

  // Cross-cutting symlink test (already covered by T-4 but tested separately as integration)
  test("symlink inside project pointing outside is refused (integration)", () => {
    const root = makeTempDir("path-con-int-");
    try {
      symlinkSync("/etc/hostname", join(root, "link-to-outside"));
      assert.throws(
        () => resolveInsideRoot("link-to-outside", root),
        (err) => err instanceof PathContainmentError && err.code === "outside_root"
      );
    } catch (err) {
      if (err.code === "EPERM" || err.code === "EACCES") return;
      throw err;
    }
  });
});

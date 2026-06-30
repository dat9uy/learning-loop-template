import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripEvidenceAnchor } from "../../core/gate-logic.js";

describe("stripEvidenceAnchor", () => {
  test("strips single-line suffix", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js:12"), "tools/foo.js");
  });

  test("strips line-range suffix", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js:12-34"), "tools/foo.js");
  });

  test("strips #anchor suffix", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js#symbolName"), "tools/foo.js");
  });

  test("strips line range then anchor", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js:12-34#methodName"), "tools/foo.js");
  });

  test("strips single-line suffix then anchor", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js:42#functionName"), "tools/foo.js");
  });

  test("leaves bare paths unchanged", () => {
    assert.strictEqual(stripEvidenceAnchor("tools/foo.js"), "tools/foo.js");
  });

  test("leaves Windows-style absolute paths intact", () => {
    assert.strictEqual(stripEvidenceAnchor("C:\\path\\file.js"), "C:\\path\\file.js");
  });

  test("strips suffix from absolute path", () => {
    assert.strictEqual(stripEvidenceAnchor("/home/user/file.js:3-12"), "/home/user/file.js");
  });

  test("strips JSON key-path suffix (dotted word chain)", () => {
    assert.strictEqual(stripEvidenceAnchor("package.json:simple-git-hooks.pre-commit"), "package.json");
  });

  test("does not strip mixed colon/dot suffix (conservative)", () => {
    // A nested colon/dot chain is not a recognized suffix shape; the helper
    // returns the input unchanged so callers can spot the malformed ref.
    assert.strictEqual(stripEvidenceAnchor("tools/config.json:scripts.fallow:gate"), "tools/config.json:scripts.fallow:gate");
  });

  test("strips key-path suffix from Windows path", () => {
    assert.strictEqual(stripEvidenceAnchor("C:\\path\\file.json:top.level"), "C:\\path\\file.json");
  });

  test("preserves bare key without dot", () => {
    assert.strictEqual(stripEvidenceAnchor("package.json:foo"), "package.json:foo");
  });
});

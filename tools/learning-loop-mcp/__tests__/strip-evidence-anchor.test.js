import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripEvidenceAnchor } from "../core/gate-logic.js";

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
});

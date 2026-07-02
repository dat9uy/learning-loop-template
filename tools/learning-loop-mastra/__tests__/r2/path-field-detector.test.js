import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  detectPathFields,
  validateToolManifest,
} from "../../core/r2/path-field-detector.js";

describe("detectPathFields", () => {
  test("detect_top_level_path: single string path arg", () => {
    const out = detectPathFields({
      tool: { pathFields: ["file_path"] },
      args: { file_path: ".factory/x" },
    });
    assert.deepEqual([...out].sort(), [".factory/x"]);
  });

  test("detect_recursive_path: dotted pathField descends into nested object", () => {
    const out = detectPathFields({
      tool: { pathFields: ["metadata.file"] },
      args: { metadata: { file: ".claude/x" } },
    });
    assert.deepEqual([...out], [".claude/x"]);
  });

  test("detect_array_paths: array arg yields each string element", () => {
    const out = detectPathFields({
      tool: { pathFields: ["targets"] },
      args: { targets: [".factory/a", ".claude/b"] },
    });
    assert.deepEqual([...out].sort(), [".claude/b", ".factory/a"]);
  });

  test("detect_array_of_objects_with_path_key: each element's nested path key", () => {
    const out = detectPathFields({
      tool: { pathFields: ["items.path"] },
      args: { items: [{ path: ".factory/a" }, { path: ".claude/b" }] },
    });
    assert.deepEqual([...out].sort(), [".claude/b", ".factory/a"]);
  });

  test("detect_depth_limit: depth-4 declared pathField is NOT detected", () => {
    const out = detectPathFields({
      tool: { pathFields: ["a.b.c.d"] },
      args: { a: { b: { c: { d: ".factory/secret" } } } },
    });
    assert.equal(out.size, 0, "depth-4 pathFields must be ignored (limit is 3)");
  });

  test("no_pathfields_explicit_optout: empty array returns empty set", () => {
    const out = detectPathFields({
      tool: { pathFields: [] },
      args: { anything: { nested: ".factory/x" } },
    });
    assert.equal(out.size, 0);
  });

  test("missing_pathfields_throws_at_runtime: undefined pathFields throws", () => {
    assert.throws(
      () => detectPathFields({ tool: {}, args: { x: ".factory" } }),
      /path_fields_undefined_for_tool/,
    );
  });

  test("missing arg key returns empty (no throw)", () => {
    const out = detectPathFields({
      tool: { pathFields: ["file_path"] },
      args: { other: "value" },
    });
    assert.equal(out.size, 0);
  });

  test("null arg value returns empty (no throw)", () => {
    const out = detectPathFields({
      tool: { pathFields: ["file_path"] },
      args: { file_path: null },
    });
    assert.equal(out.size, 0);
  });

  test("non-string leaf value is ignored", () => {
    const out = detectPathFields({
      tool: { pathFields: ["file_path"] },
      args: { file_path: 42 },
    });
    assert.equal(out.size, 0);
  });
});

describe("validateToolManifest", () => {
  test("passes when every entry has pathFields", () => {
    validateToolManifest([
      { file: "tools/a.js", export: "a", pathFields: [] },
      { file: "tools/b.js", export: "b", pathFields: ["file_path"] },
    ]);
  });

  test("throws path_fields_undefined_for_tool when an entry lacks pathFields", () => {
    assert.throws(
      () => validateToolManifest([
        { file: "tools/a.js", export: "a", pathFields: [] },
        { file: "tools/b.js", export: "b" },
      ]),
      (err) => /path_fields_undefined_for_tool/.test(err.message) && err.message.includes("tools/b.js"),
    );
  });

  test("throws when pathFields is present but not an array", () => {
    assert.throws(
      () => validateToolManifest([
        { file: "tools/a.js", export: "a", pathFields: "file_path" },
      ]),
      /path_fields_undefined_for_tool/,
    );
  });

  test("empty manifest passes", () => {
    validateToolManifest([]);
  });
});
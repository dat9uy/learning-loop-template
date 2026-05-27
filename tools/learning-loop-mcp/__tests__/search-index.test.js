import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchIndex } from "#mcp/core/search-index.js";

describe("search-index", () => {
  it("filters by capability ID", () => {
    const root = mkdtempSync(join(tmpdir(), "si-test-"));
    mkdirSync(join(root, "records", "index"), { recursive: true });
    writeFileSync(
      join(root, "records", "index", "assertion-capability-fastapi-reference-rest-runtime.yaml"),
      "capability: capability-fastapi-reference-rest\ndimension: runtime\n",
      "utf8"
    );
    writeFileSync(
      join(root, "records", "index", "assertion-other-capability-static.yaml"),
      "capability: other-capability\ndimension: static\n",
      "utf8"
    );

    const result = searchIndex(root, { capability: "capability-fastapi-reference-rest" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "assertion-capability-fastapi-reference-rest-runtime");

    rmSync(root, { recursive: true });
  });

  it("filters by dimension", () => {
    const root = mkdtempSync(join(tmpdir(), "si-dim-"));
    mkdirSync(join(root, "records", "index"), { recursive: true });
    writeFileSync(
      join(root, "records", "index", "assertion-cap-runtime.yaml"),
      "capability: cap\nverification:\n  runtime:\n    status: active\n",
      "utf8"
    );
    writeFileSync(
      join(root, "records", "index", "assertion-cap-static.yaml"),
      "capability: cap\nverification:\n  static:\n    status: active\n",
      "utf8"
    );

    const result = searchIndex(root, { dimension: "runtime" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "assertion-cap-runtime");

    rmSync(root, { recursive: true });
  });

  it("filters by status", () => {
    const root = mkdtempSync(join(tmpdir(), "si-status-"));
    mkdirSync(join(root, "records", "index"), { recursive: true });
    writeFileSync(
      join(root, "records", "index", "assertion-cap-active.yaml"),
      "capability: cap\nverification:\n  runtime:\n    status: active\n",
      "utf8"
    );
    writeFileSync(
      join(root, "records", "index", "assertion-cap-rejected.yaml"),
      "capability: cap\nverification:\n  runtime:\n    status: rejected\n",
      "utf8"
    );

    const result = searchIndex(root, { dimension: "runtime", status: "active" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "assertion-cap-active");

    rmSync(root, { recursive: true });
  });

  it("returns empty array when no matches", () => {
    const root = mkdtempSync(join(tmpdir(), "si-empty-"));
    mkdirSync(join(root, "records", "index"), { recursive: true });

    const result = searchIndex(root, { capability: "nonexistent" });
    assert.deepStrictEqual(result, []);

    rmSync(root, { recursive: true });
  });
});

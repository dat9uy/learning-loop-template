import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRoot } from "./resolve-root.js";

const DEFAULT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("resolveRoot", () => {
  it("returns default root when no override", () => {
    const result = resolveRoot();
    assert.equal(result, DEFAULT_ROOT);
  });

  it("returns override when provided inside project", () => {
    const override = resolve(DEFAULT_ROOT, "tmp/test-project");
    const result = resolveRoot(override);
    assert.equal(result, override);
  });

  it("returns GATE_ROOT env when set inside project", () => {
    const original = process.env.GATE_ROOT;
    process.env.GATE_ROOT = resolve(DEFAULT_ROOT, "tmp/env-project");
    try {
      const result = resolveRoot();
      assert.equal(result, resolve(DEFAULT_ROOT, "tmp/env-project"));
    } finally {
      if (original !== undefined) process.env.GATE_ROOT = original;
      else delete process.env.GATE_ROOT;
    }
  });

  it("throws on path traversal outside project", () => {
    assert.throws(() => resolveRoot("/etc"), /Invalid root/);
  });

  it("throws on relative path outside project", () => {
    assert.throws(() => resolveRoot("../../../etc"), /Invalid root/);
  });

  it("throws on sibling directory with matching prefix", () => {
    const sibling = DEFAULT_ROOT + "-backup";
    assert.throws(() => resolveRoot(sibling), /Invalid root/);
  });
});

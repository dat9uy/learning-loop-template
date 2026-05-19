import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitFrontmatter } from "./frontmatter-splitter.js";

describe("frontmatter-splitter", () => {
  it("parses valid frontmatter", () => {
    const text = "---\nfoo: bar\n---\n# Body\n";
    const result = splitFrontmatter(text);
    assert.deepStrictEqual(result.meta, { foo: "bar" });
    assert.strictEqual(result.body, "# Body\n");
  });

  it("returns meta: null when frontmatter is absent", () => {
    const text = "# Heading\nbody\n";
    const result = splitFrontmatter(text);
    assert.strictEqual(result.meta, null);
    assert.strictEqual(result.body, text);
  });

  it("throws on unclosed delimiter", () => {
    assert.throws(() => splitFrontmatter("---\nfoo: bar\n"), /Unclosed/);
  });

  it("throws on invalid YAML", () => {
    assert.throws(() => splitFrontmatter("---\nfoo: : :\n---\n"), /YAML/);
  });

  it("ignores --- inside fenced code blocks", () => {
    const text = "---\nfoo: bar\n---\n# Body\n```\n---\n```\n";
    const result = splitFrontmatter(text);
    assert.deepStrictEqual(result.meta, { foo: "bar" });
    assert.strictEqual(result.body, "# Body\n```\n---\n```\n");
  });

  it("handles multiple --- delimiters and stops at first valid pair", () => {
    const text = "---\nfoo: 1\n---\n---\nbar: 2\n---\n";
    const result = splitFrontmatter(text);
    assert.deepStrictEqual(result.meta, { foo: 1 });
    assert.strictEqual(result.body, "---\nbar: 2\n---\n");
  });
});

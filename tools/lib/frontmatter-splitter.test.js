import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitFrontmatter } from "./frontmatter-splitter.js";

describe("splitFrontmatter", () => {
  it("returns null meta when no frontmatter", () => {
    const text = "Hello world\n";
    const result = splitFrontmatter(text);
    assert.equal(result.meta, null);
    assert.equal(result.body, text);
  });

  it("parses frontmatter and returns body", () => {
    const text = "---\ntitle: Test\n---\nBody content\n";
    const result = splitFrontmatter(text);
    assert.equal(result.meta.title, "Test");
    assert.equal(result.body, "Body content\n");
  });

  it("ignores --- inside code blocks", () => {
    const text = "---\ntitle: Test\n---\n```js\nconst x = '---';\n```\n";
    const result = splitFrontmatter(text);
    assert.equal(result.meta.title, "Test");
    assert.ok(result.body.includes("```js"));
  });

  it("throws on unclosed frontmatter", () => {
    const text = "---\ntitle: Test\nBody content\n";
    assert.throws(() => splitFrontmatter(text), /Unclosed frontmatter/);
  });

  it("handles empty frontmatter", () => {
    const text = "---\n---\nBody\n";
    const result = splitFrontmatter(text);
    assert.equal(result.meta, null);
    assert.equal(result.body, "Body\n");
  });
});

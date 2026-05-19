import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFindings } from "./findings-parser.js";

describe("findings-parser", () => {
  it("returns empty array when ## Findings is absent", () => {
    assert.deepStrictEqual(parseFindings("# Title\nbody\n"), []);
  });

  it("returns empty array when ## Findings is empty", () => {
    assert.deepStrictEqual(parseFindings("## Findings\n\n## Next\n"), []);
  });

  it("extracts single bullet with tag and assertion", () => {
    const result = parseFindings("## Findings\n- [test-tag] The assertion text.\n");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].topicTag, "test-tag");
    assert.strictEqual(result[0].assertion, "The assertion text.");
    assert.strictEqual(result[0].bulletIndex, 1);
  });

  it("extracts context and caveats", () => {
    const text = `## Findings
- [tag] Assertion.
  Context: Some context.
  Caveat: A caveat.
`;
    const result = parseFindings(text);
    assert.strictEqual(result[0].context, "Some context.");
    assert.deepStrictEqual(result[0].caveats, ["A caveat."]);
  });

  it("extracts multiple bullets", () => {
    const text = `## Findings
- [tag-a] First.
- [tag-b] Second.
`;
    const result = parseFindings(text);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].topicTag, "tag-a");
    assert.strictEqual(result[1].topicTag, "tag-b");
  });

  it("handles multi-line assertion", () => {
    const text = `## Findings
- [tag] First line
  second line
`;
    const result = parseFindings(text);
    assert.strictEqual(result[0].assertion, "First line second line");
  });

  it("handles multi-line caveat", () => {
    const text = `## Findings
- [tag] Assertion.
  Caveat: First line
    second line
`;
    const result = parseFindings(text);
    assert.deepStrictEqual(result[0].caveats, ["First line second line"]);
  });

  it("throws on bullet missing [tag]", () => {
    assert.throws(() => parseFindings("## Findings\n- No tag here\n"), /tag/);
  });

  it("throws on invalid tag with underscore", () => {
    assert.throws(() => parseFindings("## Findings\n- [bad_tag] assertion\n"), /tag/);
  });

  it("throws on invalid tag with uppercase", () => {
    assert.throws(() => parseFindings("## Findings\n- [BadTag] assertion\n"), /tag/);
  });

  it("uses first ## Findings and ignores subsequent", () => {
    const text = `## Findings
- [first] One.
## Findings
- [second] Two.
`;
    const result = parseFindings(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].topicTag, "first");
  });

  it("preserves state across blank lines", () => {
    const text = `## Findings
- [tag] Assertion.

  Context: Context text.
`;
    const result = parseFindings(text);
    assert.strictEqual(result[0].context, "Context text.");
  });

  it("ignores unknown nested bullets with warning", () => {
    const text = `## Findings
- [tag] Assertion.
  - Unknown: Something.
`;
    const result = parseFindings(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].assertion, "Assertion.");
  });
});

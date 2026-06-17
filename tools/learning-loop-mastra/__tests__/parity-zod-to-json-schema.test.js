import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { coerceParams } from "../create-loop-tool.js";

// Regression net: the byte-identical parity proof between the legacy MCP
// server and the Mastra server was established on 2026-06-17 (Plan 2).
// Post-cut-over there is only one server, so this test verifies the coerce
// layer directly instead of comparing two servers.
describe("coerce-correctness — single-server wire-format regression net", () => {
  test("coerces string 'true' / 'false' to boolean", () => {
    const schema = z.object({ flag: z.boolean() });
    assert.deepEqual(coerceParams({ flag: "true" }, schema), { flag: true });
    assert.deepEqual(coerceParams({ flag: "false" }, schema), { flag: false });
  });

  test("coerces numeric string to number and rejects empty / non-numeric", () => {
    const schema = z.object({ count: z.number() });
    assert.deepEqual(coerceParams({ count: "42" }, schema), { count: 42 });
    assert.deepEqual(coerceParams({ count: "3.14" }, schema), { count: 3.14 });
    assert.deepEqual(coerceParams({ count: "" }, schema), { count: "" });
    assert.deepEqual(coerceParams({ count: "abc" }, schema), { count: "abc" });
  });

  test("coerces JSON string to array", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    assert.deepEqual(coerceParams({ tags: '["a", "b"]' }, schema), { tags: ["a", "b"] });
  });

  test("unwraps {item: [...]} envelope to flat array", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    assert.deepEqual(
      coerceParams({ tags: { item: ["x", "y"] } }, schema),
      { tags: ["x", "y"] },
    );
  });

  test("unwraps nested {item: [...]} chain", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    assert.deepEqual(
      coerceParams({ tags: { item: { item: ["x", "y"] } } }, schema),
      { tags: ["x", "y"] },
    );
  });

  test("coerces nested object fields recursively", () => {
    const schema = z.object({
      child: z.object({ enabled: z.boolean(), count: z.number() }),
    });
    assert.deepEqual(
      coerceParams({ child: { enabled: "true", count: "7" } }, schema),
      { child: { enabled: true, count: 7 } },
    );
  });

  test("returns original args reference when no coercion happens", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const args = { tags: ["a"] };
    const result = coerceParams(args, schema);
    assert.equal(result, args);
  });
});

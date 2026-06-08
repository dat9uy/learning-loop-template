import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceParamsToSchema } from "../tool-registry.js";
import { metaStateProposeDesignTool } from "../tools/meta-state-propose-design-tool.js";

test("coerceParamsToSchema re-hydrates top-level array from JSON string", () => {
  const schema = {
    shape: {
      addresses: { _def: { typeName: "ZodArray" } },
    },
  };
  const result = coerceParamsToSchema({ addresses: '["x", "y"]' }, schema);
  assert.deepEqual(result, { addresses: ["x", "y"] });
});

test("coerceParamsToSchema re-hydrates top-level boolean from string", () => {
  const schema = {
    shape: {
      mechanism_check: { _def: { typeName: "ZodBoolean" } },
    },
  };
  const result = coerceParamsToSchema({ mechanism_check: "true" }, schema);
  assert.deepEqual(result, { mechanism_check: true });

  const resultFalse = coerceParamsToSchema({ mechanism_check: "false" }, schema);
  assert.deepEqual(resultFalse, { mechanism_check: false });
});

test("coerceParamsToSchema re-hydrates number from string and rejects empty string", () => {
  const schema = {
    shape: {
      _expected_version: { _def: { typeName: "ZodNumber" } },
    },
  };
  // Valid number string coerces
  const result = coerceParamsToSchema({ _expected_version: "3" }, schema);
  assert.deepEqual(result, { _expected_version: 3 });

  // Empty string does NOT coerce to 0 (Number("") === 0 is silent corruption)
  const resultEmpty = coerceParamsToSchema({ _expected_version: "" }, schema);
  assert.deepEqual(resultEmpty, { _expected_version: "" });

  // Non-numeric string stays as-is
  const resultNaN = coerceParamsToSchema({ _expected_version: "abc" }, schema);
  assert.deepEqual(resultNaN, { _expected_version: "abc" });
});

test("coerceParamsToSchema returns original args reference when no coercion happened", () => {
  const schema = {
    shape: {
      addresses: { _def: { typeName: "ZodArray" } },
    },
  };
  const args = { addresses: ["x"] };
  const result = coerceParamsToSchema(args, schema);
  // Identity preserved (F1 fix)
  assert.equal(result, args);
});

test("coerceParamsToSchema real-schema regression with metaStateProposeDesignTool", () => {
  // F7: use the actual tool schema, not a hand-rolled mock
  const realSchema = metaStateProposeDesignTool.schema;
  // addresses is z.array(z.string()).default([]) — wire format may arrive as JSON string
  const result = coerceParamsToSchema({ addresses: '["x", "y"]' }, realSchema);
  assert.deepEqual(result.addresses, ["x", "y"]);
});

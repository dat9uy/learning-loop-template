import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceParams } from "../create-loop-tool.js";
import { metaStateProposeDesignTool } from "../schemas.js";

test("coerceParams re-hydrates top-level array from JSON string", () => {
  const schema = {
    shape: {
      addresses: { _def: { typeName: "ZodArray" } },
    },
  };
  const result = coerceParams({ addresses: '["x", "y"]' }, schema);
  assert.deepEqual(result, { addresses: ["x", "y"] });
});

test("coerceParams re-hydrates top-level boolean from string", () => {
  const schema = {
    shape: {
      mechanism_check: { _def: { typeName: "ZodBoolean" } },
    },
  };
  const result = coerceParams({ mechanism_check: "true" }, schema);
  assert.deepEqual(result, { mechanism_check: true });

  const resultFalse = coerceParams({ mechanism_check: "false" }, schema);
  assert.deepEqual(resultFalse, { mechanism_check: false });
});

test("coerceParams re-hydrates number from string and rejects empty string", () => {
  const schema = {
    shape: {
      _expected_version: { _def: { typeName: "ZodNumber" } },
    },
  };
  const result = coerceParams({ _expected_version: "3" }, schema);
  assert.deepEqual(result, { _expected_version: 3 });

  const resultEmpty = coerceParams({ _expected_version: "" }, schema);
  assert.deepEqual(resultEmpty, { _expected_version: "" });

  const resultNaN = coerceParams({ _expected_version: "abc" }, schema);
  assert.deepEqual(resultNaN, { _expected_version: "abc" });
});

test("coerceParams returns original args reference when no coercion happened", () => {
  const schema = {
    shape: {
      addresses: { _def: { typeName: "ZodArray" } },
    },
  };
  const args = { addresses: ["x"] };
  const result = coerceParams(args, schema);
  assert.equal(result, args);
});

test("coerceParams real-schema regression with metaStateProposeDesignTool", () => {
  const realSchema = metaStateProposeDesignTool.schema;
  const result = coerceParams({ addresses: '["x", "y"]' }, realSchema);
  assert.deepEqual(result.addresses, ["x", "y"]);
});

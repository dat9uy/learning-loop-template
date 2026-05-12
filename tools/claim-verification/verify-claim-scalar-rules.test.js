import assert from "node:assert/strict";
import { test } from "node:test";
import { assertWritablePlainString } from "./verify-claim.js";

const label = "reason";

test("assertWritablePlainString accepts plain scalar text", () => {
  for (const value of ["hello world", "plain ascii", "with-dashes_and.dots", "123 numeric prefix ok"]) {
    assert.doesNotThrow(() => assertWritablePlainString(label, value));
  }
});

test("assertWritablePlainString rejects YAML-special scalar syntax with project-owned wording", () => {
  for (const value of ["&anchor", "*ref", "!!str", "[bracket]", "{brace}", "- list item"]) {
    assert.throws(
      () => assertWritablePlainString(label, value),
      (error) => {
        assert.match(error.message, /must avoid YAML-special scalar syntax/);
        assert.doesNotMatch(error.message, /Nested|compact mappings/);
        return true;
      },
    );
  }
});

test("assertWritablePlainString rejects project-owned format guard violations", () => {
  const cases = [
    ["key: value", /must avoid YAML-special scalar syntax|must not include ': '/],
    ["# comment", /must avoid YAML-special scalar syntax|must not include '#'/],
    ["  leading-whitespace", /must not start or end with whitespace/],
    ["line1\nline2", /must be single-line/],
  ];

  for (const [value, expectedMessage] of cases) {
    assert.throws(() => assertWritablePlainString(label, value), expectedMessage);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";

// D5 fixture: hardcoded TOLERANCES array with no explanatory comment.
test("dangling D5: hardcoded TOLERANCES array with no explanatory comment", () => {
  const TOLERANCES = [10, 20, 30];
  const result = 25;
  assert.ok(TOLERANCES.includes(result));
});

test("D5: vague comment 'tolerance' is NOT a suppression keyword", () => {
  const TOLERANCES = [5, 10, 15]; // drift tolerance
  assert.equal(TOLERANCES[0], 5);
});

test("D5: explanatory comment with 'expected' keyword suppresses flag", () => {
  const TOLERANCES = [1, 2, 3]; // expected drift per design
  assert.equal(TOLERANCES.length, 3);
});

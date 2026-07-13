import { test } from "vitest";
import assert from "node:assert/strict";

// D1 fixture: asserts on removed schema field (nested evidence.code_ref).
test("dangling D1: asserts on removed schema field evidence.code_ref", () => {
  const finding = {
    id: "meta-260601T0001Z-example",
    evidence: { code_ref: "tools/example.js:1" }, // BUG: removed in meta-260607T0008Z
  };
  assert.equal(finding.evidence.code_ref, "tools/example.js:1");
});

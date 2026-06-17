import { test } from "node:test";
import assert from "node:assert";
import { buildInverseIndexes } from "./loop-introspect.js";

test("buildInverseIndexes returns 6 inverse maps including consolidated_into_inverse", () => {
  const entries = [];
  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    Object.keys(inverse).sort(),
    [
      "addresses_inverse",
      "consolidated_into_inverse",
      "origin_inverse",
      "promoted_to_rule_inverse",
      "reopens_inverse",
      "supersedes_inverse",
    ]
  );
});

test("buildInverseIndexes populates consolidated_into_inverse from change-log consolidates (CSV)", () => {
  const entries = [
    {
      id: "finding-1",
      entry_kind: "finding",
      status: "superseded",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding one for consolidated_into inverse test (min 20 chars)",
      consolidated_into: "change-log-1",
      created_at: new Date().toISOString(),
    },
    {
      id: "finding-2",
      entry_kind: "finding",
      status: "superseded",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding two for consolidated_into inverse test (min 20 chars)",
      consolidated_into: "change-log-1",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-1",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: "finding-1, finding-2",
      reason: "Change log consolidating two findings (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-1"),
    ["finding-1", "finding-2"]
  );
});

test("buildInverseIndexes populates consolidated_into_inverse from change-log consolidates (array)", () => {
  const entries = [
    {
      id: "finding-array",
      entry_kind: "finding",
      status: "superseded",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for array consolidates inverse test (min 20 chars)",
      consolidated_into: "change-log-array",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-array",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: ["finding-array"],
      reason: "Change log with array consolidates field (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-array"),
    ["finding-array"]
  );
});

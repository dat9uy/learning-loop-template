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

test("buildInverseIndexes handles one finding consolidated by multiple change-logs", () => {
  const entries = [
    {
      id: "finding-shared",
      entry_kind: "finding",
      status: "superseded",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding shared by two change-logs for inverse test (min 20 chars)",
      consolidated_into: "change-log-a",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-a",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-a.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: "finding-shared",
      reason: "Change log A referencing shared finding (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-b",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-b.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: "finding-shared",
      reason: "Change log B referencing shared finding (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-a"),
    ["finding-shared"]
  );
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-b"),
    ["finding-shared"]
  );
});

test("buildInverseIndexes returns an empty array for an empty consolidates string", () => {
  const entries = [
    {
      id: "change-log-empty",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-empty.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: "",
      reason: "Change log with empty consolidates string (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-empty"),
    []
  );
});

test("buildInverseIndexes dedupes duplicate ids in a consolidates CSV", () => {
  const entries = [
    {
      id: "finding-dup",
      entry_kind: "finding",
      status: "superseded",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding with duplicate consolidates references (min 20 chars)",
      consolidated_into: "change-log-dup",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-dup",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-dup.js",
      change_diff: { added: [], removed: [], changed: [] },
      consolidates: "finding-dup, finding-dup, finding-dup",
      reason: "Change log with duplicate ids in consolidates CSV (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.consolidated_into_inverse.get("change-log-dup"),
    ["finding-dup"]
  );
});

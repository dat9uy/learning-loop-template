import { test } from "vitest";
import assert from "node:assert";
import { buildInverseIndexes } from "./loop-introspect.js";

test("buildInverseIndexes returns the named inverse maps (Phase 4 collapsed shape)", () => {
  // Phase 3+4: the named maps retained for backward compat
  // (consolidated_into_inverse, origin_inverse, supersedes_inverse,
  // promoted_to_rule_inverse) are kept empty in the named-maps shape.
  // The live edges all flow through `citations_inverse`. Final shape:
  // addresses_inverse + reopens_inverse (named, unchanged) +
  // consolidated_into_inverse (kept for backward compat) +
  // citations_inverse (generic carrier for all migrated edges).
  const entries = [];
  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    Object.keys(inverse).sort(),
    [
      "addresses_inverse",
      "citations_inverse",
      "consolidated_into_inverse",
      "origin_inverse",
      "promoted_to_rule_inverse",
      "reopens_inverse",
      "supersedes_inverse",
    ]
  );
});

// Phase 3: `consolidated_into` + `consolidates` were de-routed from
// `CROSS_REFS`. The canonical consolidated edge is now a citation row
// (`source:finding, target:change-log, rationale:"consolidated into…"`).
// `citations_inverse` populates target→sources from the citation log.
test("buildInverseIndexes populates citations_inverse from citation rows (Phase 3 consolidated edge)", () => {
  const entries = [
    {
      id: "finding-1",
      entry_kind: "finding",
      status: "resolved",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding one for citations inverse test (min 20 chars)",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    },
    {
      id: "finding-2",
      entry_kind: "finding",
      status: "resolved",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding two for citations inverse test (min 20 chars)",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-1",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log that absorbs the two findings (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "citation-1",
      entry_kind: "citation",
      source: "finding-1",
      target: "change-log-1",
      rationale: "consolidated into change-log-1",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-2",
      entry_kind: "citation",
      source: "finding-2",
      target: "change-log-1",
      rationale: "consolidated into change-log-1",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.citations_inverse.get("change-log-1"),
    ["finding-1", "finding-2"]
  );
});

test("buildInverseIndexes populates citations_inverse from a single citation (Phase 3 array form)", () => {
  const entries = [
    {
      id: "finding-array",
      entry_kind: "finding",
      status: "resolved",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for array citations inverse test (min 20 chars)",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-array",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log cited by single finding (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "citation-array",
      entry_kind: "citation",
      source: "finding-array",
      target: "change-log-array",
      rationale: "consolidated into change-log-array",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.citations_inverse.get("change-log-array"),
    ["finding-array"]
  );
});

test("buildInverseIndexes handles one finding cited by multiple change-logs (Phase 3)", () => {
  const entries = [
    {
      id: "finding-shared",
      entry_kind: "finding",
      status: "resolved",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding cited by two change-logs for inverse test (min 20 chars)",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-a",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-a.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log A citing the shared finding (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-b",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-b.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log B citing the shared finding (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "citation-a",
      entry_kind: "citation",
      source: "finding-shared",
      target: "change-log-a",
      rationale: "consolidated into change-log-a",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-b",
      entry_kind: "citation",
      source: "finding-shared",
      target: "change-log-b",
      rationale: "consolidated into change-log-b",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.citations_inverse.get("change-log-a"),
    ["finding-shared"]
  );
  assert.deepStrictEqual(
    inverse.citations_inverse.get("change-log-b"),
    ["finding-shared"]
  );
});

// Phase 3: `consolidates` was de-routed from CROSS_REFS; the legacy
// pre-population of `consolidated_into_inverse` for change-logs with
// an empty `consolidates` array is removed. Without a citation row, no
// entry is created in `citations_inverse`.
test("buildInverseIndexes returns undefined for a change-log with no citation rows", () => {
  const entries = [
    {
      id: "change-log-empty",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-empty.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log with no citations (min 20 chars)",
      created_at: new Date().toISOString(),
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.strictEqual(inverse.citations_inverse.get("change-log-empty"), undefined);
  // consolidated_into_inverse stays empty (no on-record field source).
  assert.strictEqual(inverse.consolidated_into_inverse.get("change-log-empty"), undefined);
});

// Phase 3: dedup is preserved in `citations_inverse`. A single finding
// referenced by the same change-log via multiple citations is deduped to
// one entry — `pushToIndexUnique` is the dedup primitive.
test("buildInverseIndexes dedupes duplicate citation rows from a single finding", () => {
  const entries = [
    {
      id: "finding-dup",
      entry_kind: "finding",
      status: "resolved",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding with duplicate citation references (min 20 chars)",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    },
    {
      id: "change-log-dup",
      entry_kind: "change-log",
      status: "active",
      change_dimension: "semantic",
      change_target: "tools/test-dup.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change log with duplicate citations (min 20 chars)",
      created_at: new Date().toISOString(),
    },
    {
      id: "citation-dup-1",
      entry_kind: "citation",
      source: "finding-dup",
      target: "change-log-dup",
      rationale: "consolidated into change-log-dup",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-dup-2",
      entry_kind: "citation",
      source: "finding-dup",
      target: "change-log-dup",
      rationale: "consolidated into change-log-dup",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    },
  ];

  const inverse = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    inverse.citations_inverse.get("change-log-dup"),
    ["finding-dup"]
  );
});
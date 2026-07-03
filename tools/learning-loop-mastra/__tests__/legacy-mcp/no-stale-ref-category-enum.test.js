// Regression test for plan 260704-0301-stale-findings-dispatch-handle / Phase 1
// step 3+4. After Rec 8 collapses stale-ref into a derived view, `stale-ref`
// must be removed from ALL FOUR category-enum sites:
//   - core/meta-state.js: META_STATE_FINDING_CATEGORIES (L61-65)
//   - core/meta-state.js: metaStateFindingEntrySchema z.enum (L75-79)
//   - tools/learning-loop-mastra/docs/schemas.md:35 (doc table row)
//   - schemas/meta-state.schema.json:21 (JSON Schema enum parity contract)
//
// This test fails (red) while stale-ref is still in any of the four sites
// and passes (green) after the producer cleanup in Phase 1 step 4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";
import {
  META_STATE_FINDING_CATEGORIES,
  metaStateFindingEntrySchema,
} from "../../core/meta-state.js";

const root = resolveRoot();

test("META_STATE_FINDING_CATEGORIES does not include stale-ref", () => {
  assert.ok(
    Array.isArray(META_STATE_FINDING_CATEGORIES),
    "META_STATE_FINDING_CATEGORIES should be an array"
  );
  assert.ok(
    !META_STATE_FINDING_CATEGORIES.includes("stale-ref"),
    `META_STATE_FINDING_CATEGORIES still includes stale-ref: ${META_STATE_FINDING_CATEGORIES.join(", ")}`
  );
});

test("metaStateFindingEntrySchema z.enum rejects stale-ref", () => {
  const result = metaStateFindingEntrySchema.shape.category.safeParse("stale-ref");
  assert.strictEqual(
    result.success,
    false,
    "schema should reject category='stale-ref'"
  );
});

test("metaStateFindingEntrySchema z.enum accepts surviving categories", () => {
  for (const category of ["gate-logic-bug", "loop-anti-pattern", "schema-drift", "mcp-tool-missing", "budget-check", "record-repair-gap"]) {
    const result = metaStateFindingEntrySchema.shape.category.safeParse(category);
    assert.ok(result.success, `schema should accept category='${category}'`);
  }
});

test("schemas/meta-state.schema.json enum does not include stale-ref", () => {
  const schemaPath = join(root, "schemas", "meta-state.schema.json");
  const raw = JSON.parse(readFileSync(schemaPath, "utf8"));
  const findingEnum = raw?.$defs?.finding?.properties?.category?.enum;
  assert.ok(Array.isArray(findingEnum), "JSON Schema enum should be an array");
  assert.ok(
    !findingEnum.includes("stale-ref"),
    `JSON Schema enum still includes stale-ref: ${findingEnum.join(", ")}`
  );
});

test("docs/schemas.md category row does not list stale-ref", () => {
  const docPath = new URL("../../docs/schemas.md", import.meta.url).pathname;
  const text = readFileSync(docPath, "utf8");
  // Look only at the `category` row of the finding-field table — a later
  // historical note mentioning the removal would not appear in this row.
  const categoryRowLine = text.split("\n").find((line) =>
    line.startsWith("| `category` |") && line.includes("enum")
  );
  assert.ok(categoryRowLine, "docs/schemas.md should have a `category` enum row");
  assert.ok(
    !categoryRowLine.includes("stale-ref"),
    `docs/schemas.md category row still lists stale-ref: ${categoryRowLine}`
  );
});

test("run from project root resolves schema/doc paths", () => {
  // Sanity check that the test was run with the right cwd (helps diagnose
  // wrong-path failures in CI).
  assert.ok(root.endsWith("learning-loop-template") || root.endsWith("learning-loop-template" + "/"),
    `resolveRoot() returned unexpected path: ${root}`);
});

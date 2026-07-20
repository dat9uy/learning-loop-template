// Tests for plan 260719-2201-runtime-state-record-integrity Phase 3 (D):
// metadata nested-array rejection.
//
// Coverage:
//   1. Nested-array metadata (the corrupt row shape that was struck from
//      runtime-state.jsonl on 2026-07-20 per plan 260720-1404) is rejected
//      at the Zod refine.
//   2. Flat scalar metadata is accepted (the dispatch tool's shape).
//   3. Flat arrays of scalars are accepted (legitimate shape).
//   4. All stored rows' metadata still validates under the refine — the
//      backward-compat guard now applies to every remaining row.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runtimeStateRecordTool } from "../tools/handlers/runtime-state-record-tool.js";
import { readRuntimeStateRows } from "../core/runtime-state.js";

// Walk a JSON value and return true if any Array has an Array child.
// Mirrors the helper inside runtime-state-record-tool.js — duplicated here
// so the test expresses the contract directly without depending on the
// helper's location.
function hasNestedArray(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    for (const child of value) {
      if (Array.isArray(child)) return true;
      if (child !== null && typeof child === "object" && hasNestedArray(child)) return true;
    }
    return false;
  }
  for (const v of Object.values(value)) {
    if (hasNestedArray(v)) return true;
  }
  return false;
}

const BASE_INPUT = {
  affected_system: "vnstock",
  kind: "ledger-event",
  id: "test-row",
  value: 1,
  delta: 0,
  source_ref: "local:meta-state:rule-test",
  timestamp: "2026-05-08T10:17:23Z",
};

describe("runtime_state_record metadata nested-array rejection", () => {
  test("rejects nested-array metadata (the corrupt row 23 shape)", () => {
    const corrupt = {
      ...BASE_INPUT,
      metadata: { pending_execution: [[[[[[["close .mastracode gap: real files present"]]]]]]] },
    };
    const result = runtimeStateRecordTool.schema.metadata.safeParse(corrupt.metadata);
    assert.strictEqual(result.success, false, "nested arrays in metadata must be rejected");
    assert.match(
      String(result.error?.issues?.[0]?.message ?? ""),
      /nested arrays/i,
      "error message must name the nested-array violation",
    );
  });

  test("accepts flat scalar metadata (the dispatch tool's shape)", () => {
    const ok = {
      issue_number: 5,
      issue_url: "https://x/y/issues/5",
      delegated_to: null,
      action: "x",
    };
    const result = runtimeStateRecordTool.schema.metadata.safeParse(ok);
    assert.strictEqual(result.success, true, `dispatch-shape metadata must validate; got ${JSON.stringify(result.error?.issues)}`);
    assert.strictEqual(hasNestedArray(ok), false);
  });

  test("accepts flat arrays of scalars", () => {
    const ok = { tags: ["a", "b", "c"], counts: [1, 2, 3] };
    const result = runtimeStateRecordTool.schema.metadata.safeParse(ok);
    assert.strictEqual(result.success, true, `flat-array metadata must validate; got ${JSON.stringify(result.error?.issues)}`);
    assert.strictEqual(hasNestedArray(ok), false);
  });

  test("accepts nested objects whose leaves are scalars (no array-in-array)", () => {
    const ok = { nested: { deeper: { list: ["a", "b"], num: 42 } } };
    const result = runtimeStateRecordTool.schema.metadata.safeParse(ok);
    assert.strictEqual(result.success, true, `nested-object metadata must validate; got ${JSON.stringify(result.error?.issues)}`);
    assert.strictEqual(hasNestedArray(ok), false);
  });

  test("rejects deeply nested arrays at depth 3", () => {
    const corrupt = { x: [[["y"]]] };
    const result = runtimeStateRecordTool.schema.metadata.safeParse(corrupt);
    assert.strictEqual(result.success, false, "depth-3 array-in-array must be rejected");
  });

  test("all stored rows' metadata validates under the refine (backward-compat)", () => {
    // Skip when no tracked sidecar exists (fresh CI sandbox). The test
    // asserts every stored row remains compatible with the tightened
    // schema. Plan 260720-1404 struck the two npx-skills-mastra-roundtrip
    // rows (corrupt + correction) on 2026-07-20, so the dataset no longer
    // carries a known-bad fixture; the backward-compat invariant now
    // applies to every remaining row.
    if (!existsSync(join(process.cwd(), "runtime-state.jsonl"))) {
      return;
    }
    const rows = readRuntimeStateRows(process.cwd());
    assert.ok(rows.length > 0, "expected stored rows when sidecar exists");
    let rejected = 0;
    for (const row of rows) {
      const result = runtimeStateRecordTool.schema.metadata.safeParse(row.metadata ?? {});
      if (!result.success) rejected += 1;
    }
    assert.strictEqual(rejected, 0, `all stored rows must remain compatible; ${rejected} rejected`);
  });
});

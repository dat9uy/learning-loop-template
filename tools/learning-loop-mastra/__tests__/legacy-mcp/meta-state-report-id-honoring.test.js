// Plan 260712-0724 (Implementation 3) Phase 2 step 2 — RED→GREEN regression
// for `meta-state-report-tool.js#L28` auto-generated id honoring.
//
// Before: the auto-generated id (`generateId(slugify(description))`) was
// passed to writeEntry but not asserted post-write; a future change that
// silently rewrites the id (e.g., de-duplication, slugs) would be invisible
// to the agent. Closes finding `meta-260619T2237Z`.
//
// After: the tool asserts `result.id === generated_id` post-writeEntry. If
// the id drifts, the call fails with a structured failure shape and the
// invariant fires.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";

describe("meta-state-report-tool: id honoring invariant", () => {
  let tempRoot;

  test("setup", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "report-id-honoring-"));
    process.env.GATE_ROOT = tempRoot;
  });

  test("auto-generated id is honored: result.id === writeEntry entry.id (RED→GREEN for meta-260619T2237Z)", async () => {
    const description =
      "Test report-tool id honoring assertion: result.id must equal writeEntry's id (min 20 chars)";
    const result = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description,
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.reported, true, "report must succeed");

    // Id in the wire result MUST match the persisted entry's id.
    const entries = readRegistry(tempRoot);
    const persisted = entries.find((e) => e.description === description);
    assert.ok(persisted, "entry must persist after writeEntry");
    assert.equal(
      parsed.id,
      persisted.id,
      `wire result.id (${parsed.id}) must equal persisted entry id (${persisted.id})`
    );
  });

  test("teardown", () => {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });
});
// Regression test for plan 260704-0301-stale-findings-dispatch-handle / Phase 1
// step 5+6: the derived view in `meta_state_relationships` must surface
// dangling outbound refs — refs whose target is stale, missing, or superseded.
//
// This replaces the old `stale-ref` follow-up emission in meta_state_sweep.
// The follow-up used to fire for each newly-stale entry, recording
// reopens=[<original-id>] with category=stale-ref. The follow-up is gone; the
// same informational surface is now a derived query over the relationship
// graph: a finding's outbound refs that point at stale/missing/superseded
// targets are tagged with the reason.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../../tools/legacy/meta-state-relationships-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";

describe("meta_state_relationships derived view: dangling outbound refs", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("outbound ref to a superseded target is tagged as dangling", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-dangling-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Seed: a "target" finding, then a "source" finding whose reopens points
      // at the target.
      const targetReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Target finding for dangling-ref test (will be superseded)",
      });
      const targetId = JSON.parse(targetReport.content[0].text).id;

      const sourceReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Source finding whose reopens points at the target (will become dangling)",
        reopens: [targetId],
      });
      const sourceId = JSON.parse(sourceReport.content[0].text).id;

      // Mark the target as superseded (consolidated_into a synthetic change-log
      // id). Bypass the supersede tool to avoid operator-mode in this unit test;
      // a direct updateEntry is sufficient for the assertion.
      const reg = readRegistry(tempDir);
      const target = reg.find((e) => e.id === targetId);
      const now = new Date().toISOString();
      target.status = "superseded";
      target.consolidated_into = "meta-test-changelog-for-supersede";
      target.superseded_at = now;
      target.superseded_by = "operator";
      writeFileSync(join(tempDir, "meta-state.jsonl"),
        reg.map((e) => JSON.stringify(e)).join("\n") + "\n");

      // Query the source's outbound refs.
      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      // Derived view: a dangling_refs block surfaces the stale/missing/superseded target.
      assert.ok(Array.isArray(body.dangling_refs), "dangling_refs should be an array");
      const reopens = body.dangling_refs.find((d) => d.field === "reopens" && d.target_id === targetId);
      assert.strictEqual(reopens.reason, "superseded",
        `dangling reason should be 'superseded'; got ${reopens.reason}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a missing target is tagged as dangling with reason=missing", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-missing-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const sourceReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Source finding whose reopens points at a non-existent target",
        reopens: ["meta-id-that-does-not-exist-anywhere"],
      });
      const sourceId = JSON.parse(sourceReport.content[0].text).id;

      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(body.dangling_refs), "dangling_refs should be an array");
      const reopens = body.dangling_refs.find((d) => d.field === "reopens" && d.target_id === "meta-id-that-does-not-exist-anywhere");
      assert.ok(reopens, "dangling_refs should include reopens → missing target");
      assert.strictEqual(reopens.reason, "missing",
        `dangling reason should be 'missing'; got ${reopens.reason}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a healthy (active/reported) target is NOT in dangling_refs", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-healthy-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const targetReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Healthy target finding for dangling-ref test",
      });
      const targetId = JSON.parse(targetReport.content[0].text).id;

      const sourceReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Source finding whose reopens points at the healthy target",
        reopens: [targetId],
      });
      const sourceId = JSON.parse(sourceReport.content[0].text).id;

      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      const dangling = body.dangling_refs ?? [];
      assert.deepStrictEqual(
        dangling,
        [],
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a stale target is tagged as dangling with reason=stale", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-stale-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const targetReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Stale target finding for dangling-ref test",
      });
      const targetId = JSON.parse(targetReport.content[0].text).id;

      const sourceReport = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "meta",
        description: "Source finding whose reopens points at the stale target",
        reopens: [targetId],
      });
      const sourceId = JSON.parse(sourceReport.content[0].text).id;

      // Plan 260707-0812 Phase 2: `isStaleView` derives the stale predicate from
      // age + drift. Mark the target as `status: "stale"` AND backdate its
      // `created_at` so the predicate returns true (a fresh stale entry
      // wouldn't surface under the derived view; only age-eligible ones do).
      const reg = readRegistry(tempDir);
      const target = reg.find((e) => e.id === targetId);
      target.status = "stale";
      target.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      writeFileSync(join(tempDir, "meta-state.jsonl"),
        reg.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(body.dangling_refs), "dangling_refs should be an array");
      const reopens = body.dangling_refs.find((d) => d.field === "reopens" && d.target_id === targetId);
      assert.ok(reopens, `dangling_refs should include reopens → ${targetId}`);
      assert.strictEqual(reopens.reason, "stale",
        `dangling reason should be 'stale'; got ${reopens.reason}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
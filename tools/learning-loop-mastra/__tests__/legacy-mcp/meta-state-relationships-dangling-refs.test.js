// Regression test for the derived view in `meta_state_relationships`:
// the dangling_refs block surfaces outbound refs whose target is stale,
// missing, or resolved. This replaces the old `stale-ref` follow-up
// emission in meta_state_sweep. The follow-up used to fire for each newly-
// stale entry, recording reopens=[<original-id>] with category=stale-ref.
// The follow-up is gone; the same informational surface is now a derived
// query over the relationship graph.
//
// `reopens` is no longer a `meta_state_report` arg (the writer was removed);
// the field stays schema-optional and is seeded here directly via file
// write. The `superseded` dangling reason was retired when `superseded`
// collapsed to `resolved` + a citation; the resolved branch is the canonical
// closure dangling reason.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../../tools/handlers/meta-state-relationships-tool.js";
import { readRegistry } from "../../core/meta-state.js";

// Seed a finding with an optional `reopens` array directly to meta-state.jsonl.
// `meta_state_report` no longer accepts `reopens`, so the field is seeded
// via file write to exercise the relationship graph path.
function seedFindings(tempDir, entries) {
  writeFileSync(join(tempDir, "meta-state.jsonl"),
    entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function baseFinding(overrides) {
  return {
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "meta",
    description: "Dangling-ref regression fixture finding (min 20 chars)",
    status: "open",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("meta_state_relationships derived view: dangling outbound refs", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("outbound ref to a resolved target is tagged as dangling", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-dangling-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const targetId = "meta-target-resolved";
      const sourceId = "meta-source-reopens-resolved";
      seedFindings(tempDir, [
        baseFinding({ id: targetId, status: "resolved", resolved_at: new Date().toISOString() }),
        baseFinding({ id: sourceId, reopens: [targetId] }),
      ]);

      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(body.dangling_refs), "dangling_refs should be an array");
      const reopens = body.dangling_refs.find((d) => d.field === "reopens" && d.target_id === targetId);
      assert.ok(reopens, "dangling_refs should include reopens → resolved target");
      assert.strictEqual(reopens.reason, "resolved",
        `dangling reason should be 'resolved'; got ${reopens.reason}`);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a missing target is tagged as dangling with reason=missing", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-missing-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const sourceId = "meta-source-reopens-missing";
      seedFindings(tempDir, [
        baseFinding({ id: sourceId, reopens: ["meta-id-that-does-not-exist-anywhere"] }),
      ]);

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
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a healthy (open) target is NOT in dangling_refs", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-healthy-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const targetId = "meta-target-healthy";
      const sourceId = "meta-source-reopens-healthy";
      seedFindings(tempDir, [
        baseFinding({ id: targetId }),
        baseFinding({ id: sourceId, reopens: [targetId] }),
      ]);

      const result = await metaStateRelationshipsTool.handler({
        id: sourceId,
        direction: "outbound",
      });
      const body = JSON.parse(result.content[0].text);

      const dangling = body.dangling_refs ?? [];
      assert.deepStrictEqual(dangling, [], "healthy open target must not be dangling");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("outbound ref to a stale target is tagged as dangling with reason=stale", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-rels-stale-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const targetId = "meta-target-stale";
      const sourceId = "meta-source-reopens-stale";
      // `isStaleView` derives the stale predicate from age + drift and only
      // fires for open entries. Backdate created_at so the age predicate
      // returns true (a fresh entry wouldn't surface; only age-eligible ones do).
      seedFindings(tempDir, [
        baseFinding({
          id: targetId,
          created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        baseFinding({ id: sourceId, reopens: [targetId] }),
      ]);

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
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateUnarchiveTool } from "../../tools/handlers/meta-state-unarchive-tool.js";
import { metaStateArchiveTool } from "../../tools/handlers/meta-state-archive-tool.js";
import { metaStateRelationshipsTool } from "../../tools/handlers/meta-state-relationships-tool.js";
import { readRegistry } from "../../core/meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "unarchive-test-"));
}

describe("meta_state_unarchive", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  it("roundtrips: archive → relationships (no throw) → unarchive → restored status → relationships again", async () => {
    writeFileSync(
      join(root, "meta-state.jsonl"),
      JSON.stringify({
        id: "unarchive-roundtrip",
        entry_kind: "finding",
        status: "open",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta",
        description: "Roundtrip test for meta_state_unarchive (min 20 chars)",
        created_at: new Date().toISOString(),
      }) + "\n",
      "utf8"
    );

    const archiveResult = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["unarchive-roundtrip"],
      reason: "roundtrip archive",
    });
    const archiveParsed = JSON.parse(archiveResult.content[0].text);
    assert.equal(archiveParsed.archived.length, 1);
    assert.equal(archiveParsed.archived[0].id, "unarchive-roundtrip");

    // Phase 1 fix: relationships over an archived entry must not throw.
    const relsResult = await metaStateRelationshipsTool.handler({ id: "unarchive-roundtrip" });
    const relsParsed = JSON.parse(relsResult.content[0].text);
    assert.equal(relsParsed.id, "unarchive-roundtrip");

    const unarchiveResult = await metaStateUnarchiveTool.handler({
      id: "unarchive-roundtrip",
      reason: "roundtrip restore",
    });
    const unarchiveParsed = JSON.parse(unarchiveResult.content[0].text);
    assert.equal(unarchiveParsed.restored, true);
    assert.equal(unarchiveParsed.id, "unarchive-roundtrip");
    assert.equal(unarchiveParsed.restored_status, "open");
    assert.ok(unarchiveParsed.restored_at);
    assert.ok(typeof unarchiveParsed.version === "number");

    // Projected (max-version) view now shows the restored entry
    const projected = readRegistry(root).find((e) => e.id === "unarchive-roundtrip");
    assert.equal(projected.status, "open");
    assert.equal(projected.archived_at, undefined);
    assert.equal(projected.tombstone_kind, undefined);

    // Relationships over the restored entry must still work
    const relsResult2 = await metaStateRelationshipsTool.handler({ id: "unarchive-roundtrip" });
    const relsParsed2 = JSON.parse(relsResult2.content[0].text);
    assert.equal(relsParsed2.id, "unarchive-roundtrip");
  });

  it("rejects already-active entry with not_archived", async () => {
    writeFileSync(
      join(root, "meta-state.jsonl"),
      JSON.stringify({
        id: "unarchive-already-active",
        entry_kind: "finding",
        status: "open",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta",
        description: "Already-active finding for unarchive rejection test (min 20 chars)",
        created_at: new Date().toISOString(),
      }) + "\n",
      "utf8"
    );
    const result = await metaStateUnarchiveTool.handler({ id: "unarchive-already-active" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.restored, false);
    assert.equal(parsed.reason, "not_archived");
    assert.equal(parsed.id, "unarchive-already-active");
  });

  it("rejects change-log with not_archived (no change_log_immutable branch — red-team H1)", async () => {
    writeFileSync(
      join(root, "change-log.jsonl"),
      JSON.stringify({
        id: "unarchive-changelog",
        entry_kind: "change-log",
        change_dimension: "surface",
        change_target: "test/path.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Change-log for unarchive rejection test (min 20 chars)",
        created_at: new Date().toISOString(),
      }) + "\n",
      "utf8"
    );
    const result = await metaStateUnarchiveTool.handler({ id: "unarchive-changelog" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.restored, false);
    assert.equal(parsed.reason, "not_archived");
  });

  it("rejects delete-tombstone unconditionally with delete_not_restorable (no flag — red-team M1)", async () => {
    writeFileSync(
      join(root, "meta-state.jsonl"),
      JSON.stringify({
        id: "unarchive-delete-tombstone",
        entry_kind: "finding",
        status: "open",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta",
        description: "Finding for delete-tombstone unarchive rejection test (min 20 chars)",
        created_at: new Date().toISOString(),
      }) + "\n",
      "utf8"
    );
    // archive → batch-delete → restore
    await metaStateArchiveTool.handler({
      candidates: [],
      override: ["unarchive-delete-tombstone"],
      reason: "first archive",
    });
    // delete via core directly (no public delete tool mirrors the archive tool's flow)
    const { metaStateBatch } = await import("../../core/meta-state.js");
    await metaStateBatch(root, [{ op: "delete", id: "unarchive-delete-tombstone", reason: "delete" }]);

    const result = await metaStateUnarchiveTool.handler({ id: "unarchive-delete-tombstone" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.restored, false);
    assert.equal(parsed.reason, "delete_not_restorable");
    assert.equal(parsed.tombstone_kind, "delete");
  });

  it("rejects not_found id", async () => {
    const result = await metaStateUnarchiveTool.handler({ id: "unarchive-missing-id" });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, { restored: false, reason: "not_found", id: "unarchive-missing-id" });
  });
});

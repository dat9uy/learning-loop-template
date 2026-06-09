import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateArchiveTool } from "../tools/meta-state-archive-tool.js";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { readRegistry } from "../core/meta-state.js";

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "archive-test-"));
  return tmp;
}

describe("meta_state_archive", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  it("archives by decision rule (resolved > 90d)", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();

    const lines = [
      JSON.stringify({
        id: "archive-old-1",
        entry_kind: "finding",
        status: "resolved",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Old resolved finding for archive rule test (min 20 chars)",
        created_at: oldDate,
        resolved_at: oldDate,
        resolved_by: "test",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({ candidates: [], override: [] });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.archived.length, 1, "must archive 1 old resolved finding");
    assert.equal(parsed.archived[0].id, "archive-old-1");

    const entries = readRegistry(root);
    const archived = entries.find((e) => e.id === "archive-old-1");
    assert.equal(archived.status, "archived");
    assert.ok(archived.archived_at);
    assert.ok(archived.archived_reason);
  });

  it("archives by explicit id (operator override)", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-override-1",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding for override archive test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-override-1"],
      reason: "manual override test",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.archived.length, 1, "must archive by override");
    assert.equal(parsed.archived[0].id, "archive-override-1");

    const entries = readRegistry(root);
    const archived = entries.find((e) => e.id === "archive-override-1");
    assert.equal(archived.status, "archived");
    assert.equal(archived.archived_reason, "manual override test");
  });

  it("re-archive is a no-op", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-retry-1",
        entry_kind: "finding",
        status: "archived",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Already archived finding for no-op test (min 20 chars)",
        created_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
        archived_by: "test",
        archived_reason: "previous archive",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-retry-1"],
      reason: "second pass",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.archived.length, 0, "must not re-archive");
    assert.ok(parsed.already_archived.includes("archive-retry-1"), "must report already_archived");
  });

  it("archived entries excluded from compact by default", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-active-1",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding for compact exclusion test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-archived-1",
        entry_kind: "finding",
        status: "archived",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Archived finding for compact exclusion test (min 20 chars)",
        created_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
        archived_by: "test",
        archived_reason: "test",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateListTool.handler({ compact: true, include_expired: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.entries.length, 1, "must return only 1 entry (active)");
    assert.equal(parsed.entries[0].id, "archive-active-1");
  });

  it("archived entries appear with include_archived: true", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-active-2",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding for include_archived test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-archived-2",
        entry_kind: "finding",
        status: "archived",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Archived finding for include_archived test (min 20 chars)",
        created_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
        archived_by: "test",
        archived_reason: "test",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateListTool.handler({ compact: true, include_expired: true, include_archived: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.entries.length, 2, "must return 2 entries with include_archived");
    assert.ok(parsed.entries.find((e) => e.id === "archive-active-2"));
    assert.ok(parsed.entries.find((e) => e.id === "archive-archived-2"));
  });
});

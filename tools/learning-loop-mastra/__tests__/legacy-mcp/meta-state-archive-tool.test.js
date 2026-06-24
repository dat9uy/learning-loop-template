import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateArchiveTool } from "../../tools/legacy/meta-state-archive-tool.js";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";
import { readRegistry } from "../../core/legacy/meta-state.js";

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

    const result = await metaStateListTool.handler({ compact: true });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.entries.length, 1, "must return only 1 entry (active)");
    assert.equal(parsed.entries[0].id, "archive-active-1");
  });

  it("rejects rules and change-logs via override", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-rule-1",
        entry_kind: "rule",
        origin: "meta-260602T0000Z-test-rule",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "test/**",
        description: "Test rule that must not be archived via override.",
        status: "active",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-change-log-1",
        entry_kind: "change-log",
        change_dimension: "surface",
        change_target: "test/path.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Test change-log that must not be archived via override.",
        status: "active",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-finding-ok",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding that can still be archived by override.",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-rule-1", "archive-change-log-1", "archive-finding-ok"],
      reason: "override with mixed kinds",
      confirm: true,
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.archived.length, 1, "must archive only the finding");
    assert.equal(parsed.archived[0].id, "archive-finding-ok");
    assert.equal(parsed.rejected.length, 2, "must reject rule and change-log");
    assert.ok(parsed.rejected.find((r) => r.id === "archive-rule-1" && r.reason === "not_a_finding"));
    assert.ok(parsed.rejected.find((r) => r.id === "archive-change-log-1" && r.reason === "not_a_finding"));

    const entries = readRegistry(root);
    assert.ok(entries.find((e) => e.id === "archive-rule-1" && e.status === "active"), "rule must stay active");
    assert.ok(entries.find((e) => e.id === "archive-change-log-1" && e.status === "active"), "change-log must stay active");
  });

  it("returns preview for multi-id override without confirm", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-preview-1",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "First finding for preview guard test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-preview-2",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Second finding for preview guard test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-preview-1", "archive-preview-2"],
      reason: "bulk override preview",
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.ready, false, "must require confirmation");
    assert.ok(Array.isArray(parsed.preview), "must return preview array");
    assert.equal(parsed.preview.length, 2, "must preview both overrides");
    assert.ok(parsed.preview.find((p) => p.id === "archive-preview-1"), "preview includes first id");
    assert.ok(parsed.preview.find((p) => p.id === "archive-preview-2"), "preview includes second id");

    const entries = readRegistry(root);
    assert.ok(entries.every((e) => e.status === "active"), "must not archive before confirmation");
  });

  it("archives multi-id override when confirm is true", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-confirm-1",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "First finding for confirm archive test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-confirm-2",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Second finding for confirm archive test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-confirm-1", "archive-confirm-2"],
      reason: "bulk override confirmed",
      confirm: true,
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.archived.length, 2, "must archive both confirmed overrides");
    assert.ok(parsed.archived.find((a) => a.id === "archive-confirm-1"), "must archive first id");
    assert.ok(parsed.archived.find((a) => a.id === "archive-confirm-2"), "must archive second id");
  });

  it("single-id override bypasses preview and archives directly", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-single-1",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Single override finding for bypass test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-single-1"],
      reason: "single override bypass",
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.archived.length, 1, "single override archives directly");
    assert.equal(parsed.archived[0].id, "archive-single-1");
  });

  it("preview flags non-finding entries with rejected_reason", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-preview-rule",
        entry_kind: "rule",
        origin: "meta-260602T0000Z-test-rule",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "test/**",
        description: "Test rule for preview rejection.",
        status: "active",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-preview-finding",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Finding for preview rejection test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
      JSON.stringify({
        id: "archive-preview-change-log",
        entry_kind: "change-log",
        change_dimension: "surface",
        change_target: "test/path.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Test change-log for preview rejection.",
        status: "active",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-preview-rule", "archive-preview-finding", "archive-preview-change-log"],
      reason: "mixed kinds preview",
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.ready, false, "must require confirmation for multi-id override");
    assert.equal(parsed.preview.length, 3, "must preview all overrides");

    const rulePreview = parsed.preview.find((p) => p.id === "archive-preview-rule");
    const findingPreview = parsed.preview.find((p) => p.id === "archive-preview-finding");
    const changeLogPreview = parsed.preview.find((p) => p.id === "archive-preview-change-log");

    assert.equal(rulePreview.rejected_reason, "not_a_finding", "rule must be flagged");
    assert.equal(changeLogPreview.rejected_reason, "not_a_finding", "change-log must be flagged");
    assert.equal(findingPreview.rejected_reason, undefined, "finding must not be flagged");

    const entries = readRegistry(root);
    assert.ok(entries.every((e) => e.status === "active"), "must not archive before confirmation");
  });

  it("preview handles missing and already-archived entries", async () => {
    const lines = [
      JSON.stringify({
        id: "archive-preview-already",
        entry_kind: "finding",
        status: "archived",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Already archived finding for preview test (min 20 chars)",
        created_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
        archived_by: "test",
        archived_reason: "previous",
      }),
      JSON.stringify({
        id: "archive-preview-active",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding for preview test (min 20 chars)",
        created_at: new Date().toISOString(),
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await metaStateArchiveTool.handler({
      candidates: [],
      override: ["archive-preview-missing", "archive-preview-already", "archive-preview-active"],
      reason: "mixed states preview",
    });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.ready, false, "must require confirmation");
    assert.equal(parsed.preview.length, 3, "must preview all overrides");

    const missingPreview = parsed.preview.find((p) => p.id === "archive-preview-missing");
    const alreadyPreview = parsed.preview.find((p) => p.id === "archive-preview-already");
    const activePreview = parsed.preview.find((p) => p.id === "archive-preview-active");

    assert.equal(missingPreview.status, "not_found", "missing entry flagged as not_found");
    assert.equal(missingPreview.entry_kind, null, "missing entry has null entry_kind");
    assert.equal(alreadyPreview.already_archived, true, "archived entry flagged");
    assert.equal(alreadyPreview.status, "archived", "archived entry keeps archived status");
    assert.equal(activePreview.rejected_reason, undefined, "active finding not rejected");

    const entries = readRegistry(root);
    assert.ok(entries.every((e) => e.id !== "archive-preview-active" || e.status === "active"), "must not archive before confirmation");
  });
});

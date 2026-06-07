import { describe, test } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { metaStateLogChangeTool } from "../tools/meta-state-log-change-tool.js";
import { readRegistry } from "../core/meta-state.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_log_change tool", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function getRegistryPath() {
    return join(tempDir, "meta-state.jsonl");
  }

  function getGateLogPath() {
    return join(tempDir, ".claude", "coordination", "gate-log.jsonl");
  }

  test("tool writes a valid change-log entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateLogChangeTool.handler({
        change_dimension: "semantic",
        change_target: "core/meta-state.js",
        change_diff: { added: ["entry_kind"], removed: [], changed: [] },
        reason: "SP0 introduces a discriminated union for change-log entries.",
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.logged, true);
      assert.strictEqual(text.entry_kind, "change-log");

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].entry_kind, "change-log");
      assert.strictEqual(entries[0].change_dimension, "semantic");
      assert.strictEqual(entries[0].status, "active");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tool returns the generated id and entry_kind", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "tools/manifest.json",
        change_diff: { added: ["meta_state_log_change"], removed: [], changed: [] },
        reason: "New tool for logging system changes is added.",
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.logged, true);
      assert.ok(text.id.startsWith("meta-"));
      assert.strictEqual(text.entry_kind, "change-log");
      assert.strictEqual(text.change_dimension, "surface");
      assert.ok(text.created_at);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tool writes one line to gate log", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateLogChangeTool.handler({
        change_dimension: "mechanical",
        change_target: "gate-logic.js",
        change_diff: { added: [], removed: [], changed: ["applyPromotedRules"] },
        reason: "Gate logic updated to handle new entry kinds.",
      });
      const gateLogRaw = readFileSync(getGateLogPath(), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.strictEqual(entry.tool, "meta_state_log_change");
      assert.ok(entry.id);
      assert.strictEqual(entry.change_dimension, "mechanical");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tool schema rejects invalid change_dimension", () => {
    const schema = metaStateLogChangeTool.schema;
    const result = z.object(schema).safeParse({
      change_dimension: "unknown",
      change_target: "x",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "This should fail because change_dimension is invalid.",
    });
    assert.strictEqual(result.success, false);
  });

  test("tool schema rejects too-short reason", () => {
    const schema = metaStateLogChangeTool.schema;
    const result = z.object(schema).safeParse({
      change_dimension: "semantic",
      change_target: "x",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "too short",
    });
    assert.strictEqual(result.success, false);
  });

  test("tool accepts applies_to with all optional sub-fields", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "tools/meta-state-log-change-tool.js",
        change_diff: { added: ["meta_state_log_change"], removed: [], changed: [] },
        reason: "New tool for logging system changes is added to the MCP surface.",
        applies_to: {
          tools: ["meta_state_log_change", "meta_state_list"],
          surfaces: ["meta"],
          rules: ["rule-no-new-artifact-types"],
          statuses: ["active"],
          schemas: ["core/meta-state.js"],
        },
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.logged, true);

      const entries = readRegistry(tempDir);
      assert.deepStrictEqual(entries[0].applies_to.tools, ["meta_state_log_change", "meta_state_list"]);
      assert.deepStrictEqual(entries[0].applies_to.surfaces, ["meta"]);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tool accepts supersedes id of prior change entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateLogChangeTool.handler({
        change_dimension: "semantic",
        change_target: "core/meta-state.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "This change supersedes an earlier design decision about entry kinds.",
        supersedes: "meta-260601T0000Z-old-design",
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.logged, true);

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries[0].supersedes, "meta-260601T0000Z-old-design");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("round-trip: write via tool, read via registry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "tools/meta-state-list-tool.js",
        change_diff: { added: ["entry_kind filter"], removed: [], changed: [] },
        reason: "The list tool now supports filtering by entry_kind to show only change-log entries.",
      });
      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].entry_kind, "change-log");
      assert.strictEqual(entries[0].change_target, "tools/meta-state-list-tool.js");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("writes top-level evidence_code_ref, not nested evidence.code_ref", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateLogChangeTool.handler({
        change_dimension: "semantic",
        change_target: "core/meta-state.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Change-log tool now writes top-level evidence fields only.",
        evidence_code_ref: "test.js",
        evidence_journal: "journal.md",
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.logged, true);

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries[0].evidence_code_ref, "test.js");
      assert.strictEqual(entries[0].evidence_journal, "journal.md");
      assert.strictEqual(entries[0].evidence, undefined, "log-change tool must NOT write nested evidence block");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

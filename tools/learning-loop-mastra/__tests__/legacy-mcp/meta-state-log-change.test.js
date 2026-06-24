import { describe, test } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import {
  metaStateLogChangeTool,
  _clearIdempotencyCacheForTests,
  _backdateIdempotencyCacheForTests,
} from "../../tools/legacy/meta-state-log-change-tool.js";
import { readRegistry } from "../../core/meta-state.js";
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

  // Idempotency cache tests
  test("duplicate call within 60s returns cached result with cache_hit: true and does not write a second entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-cache-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const params = {
        change_dimension: "surface",
        change_target: "tools/meta-state-log-change-tool.js",
        change_diff: { added: ["idempotency cache"], removed: [], changed: [] },
        reason: "Adding a 60s idempotency cache to prevent duplicate change-log entries from agent retry loops.",
      };

      const call1 = await metaStateLogChangeTool.handler(params);
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);
      assert.strictEqual(parsed1.logged, true);

      const call2 = await metaStateLogChangeTool.handler(params);
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, true);
      assert.strictEqual(parsed2.logged, true);
      assert.strictEqual(parsed2.id, parsed1.id);
      assert.strictEqual(parsed2.created_at, parsed1.created_at);

      // Only one entry should be written to the registry
      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1, `expected 1 entry, got ${entries.length}`);
      assert.strictEqual(entries[0].id, parsed1.id);
    } finally {
      _clearIdempotencyCacheForTests();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("different reason is a cache miss and writes a new entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-cache-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const params1 = {
        change_dimension: "surface",
        change_target: "tools/meta-state-log-change-tool.js",
        change_diff: { added: ["idempotency cache"], removed: [], changed: [] },
        reason: "Adding a 60s idempotency cache to prevent duplicate change-log entries from agent retry loops.",
      };
      const params2 = {
        change_dimension: "surface",
        change_target: "tools/meta-state-log-change-tool.js",
        change_diff: { added: ["idempotency cache"], removed: [], changed: [] },
        reason: "A different reason for the same change target should produce a separate change-log entry.",
      };

      const call1 = await metaStateLogChangeTool.handler(params1);
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);

      const call2 = await metaStateLogChangeTool.handler(params2);
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, false);

      // Both calls should write because different reasons = different cache keys
      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 2);
    } finally {
      _clearIdempotencyCacheForTests();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("TTL expiry re-runs the handler (cache miss after 60s)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-cache-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const params = {
        change_dimension: "mechanical",
        change_target: "gate-logic.js",
        change_diff: { added: [], removed: [], changed: ["applyPromotedRules"] },
        reason: "Testing TTL expiry for the idempotency cache on meta_state_log_change.",
      };

      const call1 = await metaStateLogChangeTool.handler(params);
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);

      // Backdate the cached entry past the 60s TTL
      const cacheKey = `${tempDir}::${params.change_dimension}::${params.change_target}::${params.reason}`;
      _backdateIdempotencyCacheForTests(cacheKey, 61_000);

      const call2 = await metaStateLogChangeTool.handler(params);
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, false);

      // After TTL expiry, a second write should occur
      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 2);
    } finally {
      _clearIdempotencyCacheForTests();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("100 identical calls collapse to 1 miss + 99 hits", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-log-change-cache-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const params = {
        change_dimension: "semantic",
        change_target: "core/meta-state.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Stress test for idempotency cache: 100 identical calls should produce only 1 registry entry.",
      };

      const results = [];
      for (let i = 0; i < 100; i++) {
        const r = await metaStateLogChangeTool.handler(params);
        results.push(JSON.parse(r.content[0].text));
      }

      const misses = results.filter((r) => r.cache_hit === false);
      const hits = results.filter((r) => r.cache_hit === true);

      assert.strictEqual(misses.length, 1, `expected 1 miss, got ${misses.length}`);
      assert.strictEqual(hits.length, 99, `expected 99 hits, got ${hits.length}`);

      for (const r of results) {
        assert.strictEqual(r.logged, true);
      }

      for (const r of hits) {
        assert.strictEqual(r.id, misses[0].id);
        assert.strictEqual(r.created_at, misses[0].created_at);
      }

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1);
    } finally {
      _clearIdempotencyCacheForTests();
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

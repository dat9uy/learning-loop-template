import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateRefreshFingerprintTool,
  _clearIdempotencyCacheForTests,
  _backdateIdempotencyCacheForTests,
} from "../tools/meta-state-refresh-fingerprint-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";

describe("meta_state_refresh_fingerprint tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T-existing-1: updates code_fingerprint to current hash and returns status: "refreshed"
  test("updates code_fingerprint to current hash and returns status: 'refreshed'", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-tool-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Refresh fingerprint happy path test.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
      assert.strictEqual(parsed.id, id);
      assert.ok(parsed.code_fingerprint?.startsWith("sha256:"));
      assert.ok(parsed.refreshed_at);
      // Verify entry was updated
      const rawAfter = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entryAfter = JSON.parse(rawAfter.trim().split("\n")[0]);
      assert.strictEqual(entryAfter.code_fingerprint, parsed.code_fingerprint);
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-existing-2: returns error when mechanism_check is not true
  test("returns error when mechanism_check is not true (cannot refresh non-grounded entry)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-tool-2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Refresh should fail when not grounded.",
        // No mechanism_check
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "not_grounded");
      assert.strictEqual(parsed.id, id);
      assert.ok(parsed.reason);

      // Verify entry is NOT mutated
      const rawAfter = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entryAfter = JSON.parse(rawAfter.trim().split("\n")[0]);
      assert.strictEqual(entryAfter.code_fingerprint, undefined);
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-existing-3: strips :line and #anchor suffixes before computing the hash
  test("strips :line and #anchor suffixes from evidence_code_ref", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-tool-3-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code with line suffix");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Refresh with line suffix.",
        evidence_code_ref: "src.js:18",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
      assert.strictEqual(parsed.id, id);
      assert.ok(parsed.code_fingerprint?.startsWith("sha256:"));

      // Verify entry was updated
      const rawAfter = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entryAfter = JSON.parse(rawAfter.trim().split("\n")[0]);
      assert.strictEqual(entryAfter.code_fingerprint, parsed.code_fingerprint);
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T1: same (id, previous_fingerprint) within 60s returns cached result with cache_hit: true
  test("same (id, previous_fingerprint) within 60s returns cached result with cache_hit: true", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-cache-t1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Cache T1 test for refresh fingerprint idempotency.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      // Pre-seed the entry with a code_fingerprint so the cache key stays stable.
      // First call computes the real hash and stores it; the cache key uses the
      // pre-call fingerprint. With a pre-seeded fingerprint matching the file,
      // call 2 uses the same key and hits the cache.
      const { computeFileHash } = await import("../core/check-grounding.js");
      const { updateEntry } = await import("../core/meta-state.js");
      const hash = computeFileHash(join(tempDir, "src.js"));
      await updateEntry(tempDir, id, { code_fingerprint: hash });

      _clearIdempotencyCacheForTests();

      const call1 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);
      assert.strictEqual(parsed1.status, "refreshed");

      const call2 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, true);
      assert.strictEqual(parsed2.status, parsed1.status);
      assert.strictEqual(parsed2.id, parsed1.id);
      assert.strictEqual(parsed2.code_fingerprint, parsed1.code_fingerprint);
      assert.strictEqual(parsed2.refreshed_at, parsed1.refreshed_at);
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T2: same id with different previous_code_fingerprint is a cache miss
  test("same id with different previous_code_fingerprint is a cache miss", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-cache-t2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Cache T2 test for different fingerprint cache miss.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      _clearIdempotencyCacheForTests();

      const call1 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);

      // Mutate the entry's code_fingerprint directly to simulate a file change
      const { readRegistry, updateEntry } = await import("../core/meta-state.js");
      const root = tempDir;
      const fakeHash = "sha256:" + "0".repeat(64);
      await updateEntry(root, id, { code_fingerprint: fakeHash });

      const call2 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, false);
      assert.strictEqual(parsed2.status, "refreshed");
      assert.notStrictEqual(parsed2.code_fingerprint, fakeHash);
      assert.ok(parsed2.code_fingerprint?.startsWith("sha256:"));
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T3: TTL expiry re-runs the handler (cache miss after 60s)
  test("TTL expiry re-runs the handler (cache miss after 60s)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-cache-t3-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // File a finding WITHOUT mechanism_check: true so the handler returns
      // not_grounded. This path does NOT mutate code_fingerprint, so the cache
      // key stays stable across calls and we can test TTL expiry in isolation.
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Cache T3 test for TTL expiry on idempotency cache.",
        // No mechanism_check — the entry will be not_grounded
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      _clearIdempotencyCacheForTests();

      const call1 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed1 = JSON.parse(call1.content[0].text);
      assert.strictEqual(parsed1.cache_hit, false);
      assert.strictEqual(parsed1.error, "not_grounded");

      // Backdate the cached entry past the 60s TTL.
      // The cache key is `${id}::null` because entry.code_fingerprint is null.
      _backdateIdempotencyCacheForTests(`${id}::null`, 61_000);

      const call2 = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed2 = JSON.parse(call2.content[0].text);
      assert.strictEqual(parsed2.cache_hit, false);
      assert.strictEqual(parsed2.error, "not_grounded");
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T4: 100 identical not_grounded calls collapse to 1 miss + 99 hits
  test("100 identical not_grounded calls collapse to 1 miss + 99 hits", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-cache-t4-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // File a finding WITHOUT mechanism_check: true (the droid-session scenario)
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Cache T4 test for not grounded storm collapse behavior.",
        // No mechanism_check — the entry will be not_grounded
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      _clearIdempotencyCacheForTests();

      const results = [];
      for (let i = 0; i < 100; i++) {
        const r = await metaStateRefreshFingerprintTool.handler({ id });
        results.push(JSON.parse(r.content[0].text));
      }

      const misses = results.filter((r) => r.cache_hit === false);
      const hits = results.filter((r) => r.cache_hit === true);

      assert.strictEqual(misses.length, 1, `expected 1 miss, got ${misses.length}`);
      assert.strictEqual(hits.length, 99, `expected 99 hits, got ${hits.length}`);

      for (const r of results) {
        assert.strictEqual(r.error, "not_grounded");
      }

      for (const r of hits) {
        assert.strictEqual(r.id, misses[0].id);
        assert.strictEqual(r.mechanism_check, misses[0].mechanism_check);
        assert.strictEqual(r.reason, misses[0].reason);
      }
    } finally {
      _clearIdempotencyCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});

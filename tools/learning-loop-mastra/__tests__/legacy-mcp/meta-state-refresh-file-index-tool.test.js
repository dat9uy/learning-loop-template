import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateRefreshFileIndexTool,
  _clearRefreshHashCacheForTests,
} from "../../tools/handlers/meta-state-refresh-file-index-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readFileIndex, getFileIndexPath } from "../../core/meta-state.js";

function gateLog(tempDir) {
  return join(tempDir, ".claude", "coordination", "gate-log.jsonl");
}

function readGateLog(tempDir) {
  const p = gateLog(tempDir);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("meta_state_refresh_file_index tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("upserts the path's current hash at the canonical key and returns status: 'refreshed'", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");

      const result = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
      assert.strictEqual(parsed.path, "src.js");
      assert.ok(parsed.code_fingerprint?.startsWith("sha256:"));
      assert.ok(parsed.refreshed_at);
      assert.strictEqual(typeof parsed.findings_regrounded, "number");
      // The sidecar holds the hash at the canonical (stripped) key.
      const map = readFileIndex(tempDir);
      assert.strictEqual(map.get("src.js"), parsed.code_fingerprint);
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("canonicalizes the path: :line and #anchor collapse to the bare file key (F3)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-canonical-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      const result = await metaStateRefreshFileIndexTool.handler({ path: "src.js:42#fn" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
      assert.strictEqual(parsed.path, "src.js", "exposed path is the canonical bare file");
      const map = readFileIndex(tempDir);
      assert.strictEqual(map.get("src.js"), parsed.code_fingerprint);
      assert.strictEqual(map.has("src.js:42#fn"), false);
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("K count matches the number of anchored mechanism_check:true findings", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-k-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      // Two findings anchored to the same path (one via :line, one via #anchor).
      await metaStateReportTool.handler({
        category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools",
        description: "Anchored finding one for refresh_file_index K-count.",
        evidence_code_ref: "src.js:10", mechanism_check: true,
      });
      await metaStateReportTool.handler({
        category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools",
        description: "Anchored finding two for refresh_file_index K-count.",
        evidence_code_ref: "src.js#sym", mechanism_check: true,
      });
      // A third finding anchored to a different path (must NOT count).
      writeFileSync(join(tempDir, "other.js"), "// other");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools",
        description: "Anchored finding three for refresh_file_index K-count, other path.",
        evidence_code_ref: "other.js", mechanism_check: true,
      });

      const result = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.findings_regrounded, 2, "both src.js findings count; other.js does not");
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("missing path -> code_missing error (no throw)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-missing-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateRefreshFileIndexTool.handler({ path: "does-not-exist.js" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "code_missing");
      assert.strictEqual(parsed.path, "does-not-exist.js");
      assert.strictEqual(existsSync(getFileIndexPath(tempDir)), false, "no sidecar write on missing file");
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // Plan 260711-0030 Phase 2: in-process cache removed. With no cache, every call
  // performs the work — there is no cache-hit short-circuit. The persisted
  // fingerprint still distinguishes "same content" from "mutated content".
  test("no cache: refresh, mutate file, refresh -> different fingerprint", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-idem-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// first");
      const r1 = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const p1 = JSON.parse(r1.content[0].text);
      assert.strictEqual(p1.cache_hit, false);
      assert.strictEqual(p1.status, "refreshed");

      const r2 = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const p2 = JSON.parse(r2.content[0].text);
      assert.strictEqual(p2.cache_hit, false, "no cache: every call is a miss now");
      assert.strictEqual(p2.code_fingerprint, p1.code_fingerprint, "same file -> same fingerprint");

      // Mutate the file (new content/hash) -> re-hash + re-upsert.
      writeFileSync(join(tempDir, "src.js"), "// second — different content");
      const r3 = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const p3 = JSON.parse(r3.content[0].text);
      assert.strictEqual(p3.cache_hit, false);
      assert.notStrictEqual(p3.code_fingerprint, p1.code_fingerprint);
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // Red-team F10: caller identity + optional reason recorded in the gate log.
  test("gate log records the tool name + findings_regrounded (F10 caller identity)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-gate-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const log = readGateLog(tempDir).filter((e) => e.tool === "meta_state_refresh_file_index");
      assert.ok(log.length >= 1, "a refresh_file_index gate-log line was appended");
      const entry = log[log.length - 1];
      assert.strictEqual(entry.tool, "meta_state_refresh_file_index");
      assert.strictEqual(entry.path, "src.js");
      assert.ok(entry.code_fingerprint?.startsWith("sha256:"));
      assert.strictEqual(typeof entry.findings_regrounded, "number");
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("optional reason is recorded in the gate log when provided (F10)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-reason-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      const reason = "legitimate refactor: extracted canonicalIndexKey";
      const result = await metaStateRefreshFileIndexTool.handler({ path: "src.js", reason });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.reason, reason, "reason echoed in the response");
      const log = readGateLog(tempDir).filter((e) => e.tool === "meta_state_refresh_file_index");
      assert.strictEqual(log[log.length - 1].reason, reason, "reason recorded in the gate log");
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("omitting reason omits the field entirely (reason is optional, not mandatory)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "refresh-fidx-noreason-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      const result = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.reason, undefined, "no reason field when omitted");
      const log = readGateLog(tempDir).filter((e) => e.tool === "meta_state_refresh_file_index");
      assert.strictEqual(log[log.length - 1].reason, undefined, "no reason field in the gate log when omitted");
    } finally {
      _clearRefreshHashCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});

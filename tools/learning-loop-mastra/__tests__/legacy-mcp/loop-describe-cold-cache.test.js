import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../../tools/legacy/loop-describe-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { writeColdTierCache, readColdTierCache } from "../../core/loop-introspect-cache.js";
import { writeEntry } from "../../core/meta-state.js";

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "cold-cache-test-"));
  return tmp;
}

describe("loop_describe cold tier sidecar cache", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  it("first call builds cache file", async () => {
    // Seed with minimal findings so loop_describe has data
    const lines = [
      JSON.stringify({ id: "cold-test-1", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for cold cache test 1 (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "cold-test-2", entry_kind: "finding", status: "reported", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for cold cache test 2 (min 20 chars)", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.all_findings, "must return findings");

    const cachePath = join(root, "records", "meta", ".cache", "loop-describe-cold.json");
    assert.ok(existsSync(cachePath), "cache file must be created");

    const cacheRaw = readFileSync(cachePath, "utf8");
    const cache = JSON.parse(cacheRaw);
    assert.ok(cache.built_at, "cache must have built_at");
    assert.ok(cache.registry_sha256, "cache must have registry_sha256");
    assert.ok(cache.payload, "cache must have payload");
  });

  it("second call reads cache (no readAllEntriesForLineage re-parse)", async () => {
    const lines = [
      JSON.stringify({ id: "cold-test-3", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for cold cache hit test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    // First call builds cache
    await loopDescribeTool.handler({ tier: "cold" });

    // Spy on readRegistry to verify it's not called (or called minimally)
    let readRegistryCallCount = 0;
    const originalReadRegistry = readRegistry;
    // Note: we can't easily intercept the internal readAllEntriesForLineage call,
    // but we can verify the cache exists and is fresh, and that the response
    // includes a cache_hit indicator.

    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.cache_hit, "second call must indicate cache_hit");
  });

  it("writeEntry invalidates and rebuilds cache", async () => {
    const lines = [
      JSON.stringify({ id: "cold-test-4", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for cache invalidation test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    // Build cache
    const firstResult = await loopDescribeTool.handler({ tier: "cold" });
    const firstParsed = JSON.parse(firstResult.content[0].text);
    const firstBuiltAt = firstParsed.built_at;

    // Add a new entry
    await writeEntry(root, {
      id: "cold-test-new",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "New finding after cache build (min 20 chars)",
      status: "reported",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Next call should rebuild
    const secondResult = await loopDescribeTool.handler({ tier: "cold" });
    const secondParsed = JSON.parse(secondResult.content[0].text);
    assert.ok(secondParsed.all_findings.find((f) => f.id === "cold-test-new"), "must include the new finding");
    assert.ok(!secondParsed.cache_hit || secondParsed.built_at !== firstBuiltAt, "cache must be rebuilt (different built_at or cache miss)");
  });

  it("mtime/sha mismatch triggers rebuild", async () => {
    const lines = [
      JSON.stringify({ id: "cold-test-5", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for sha mismatch test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    // Build cache
    await loopDescribeTool.handler({ tier: "cold" });

    // Manually edit the registry (simulate external writer)
    const newLines = [
      JSON.stringify({ id: "cold-test-5", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for sha mismatch test (min 20 chars)", created_at: new Date().toISOString() }),
      JSON.stringify({ id: "cold-test-external", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Externally added finding (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), newLines, "utf8");

    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.all_findings.find((f) => f.id === "cold-test-external"), "must detect external edit and rebuild");
  });

  it("description_mode=summary projects from cache", async () => {
    const lines = [
      JSON.stringify({ id: "cold-test-6", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "A".repeat(500), created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    // Build cache with full descriptions
    await loopDescribeTool.handler({ tier: "cold", description_mode: "full" });

    // Request summary — should use cache and project summaries
    const result = await loopDescribeTool.handler({ tier: "cold", description_mode: "summary" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.cache_hit, "summary mode should reuse cache");

    const finding = parsed.all_findings.find((f) => f.id === "cold-test-6");
    assert.ok(finding, "must include the finding");
    assert.ok(finding.description_preview, "summary mode must include description_preview");
    assert.ok(finding.description_preview.length <= 250, "description_preview must be truncated (~200 chars + '...')");
  });

  it("cache miss falls back to old path and writes new cache", async () => {
    const lines = [
      JSON.stringify({ id: "cold-test-7", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "Finding for cache miss fallback test (min 20 chars)", created_at: new Date().toISOString() }),
    ].join("\n") + "\n";
    writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");

    // Ensure no cache file exists
    const cachePath = join(root, "records", "meta", ".cache", "loop-describe-cold.json");
    if (existsSync(cachePath)) {
      rmSync(cachePath, { force: true });
    }

    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.all_findings, "must return findings on cache miss");
    assert.ok(existsSync(cachePath), "must write cache on miss");
  });
});
